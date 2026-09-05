// ─────────────────────────────────────────────────────────────────────────────
// toolLoopCallbacks.js
// Shared tool-loop callback factory extracted from chat.handler.js so both
// chat turns and background tasks reuse identical logic for onToolCall,
// onAskUser, requestPermission, etc.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a session-scoped allow-rules store.
 * Rules are keyed by `${name}:${ruleKey}` within a session Set.
 * Identical granularity to the original inline logic in chat.handler.js:
 *   run_command  → first whitespace token (the binary)
 *   write/edit   → directory of the path
 *   others       → '*' (exact tool name match)
 */
function createAllowRulesStore() {
  const allowRules = new Map() // sessionId -> Set<string>

  function ruleKey(name, args) {
    if (name === 'run_command') {
      const cmd = String(args?.command || '').trim()
      const firstTok = cmd.split(/\s+/)[0] || cmd
      return firstTok
    }
    if (name === 'write_file' || name === 'edit_file') {
      const p = String(args?.path || '')
      const dir = p.includes('/') || p.includes('\\') ? p.replace(/[\\/][^\\/]*$/, '') : p
      return dir || p
    }
    return '*'
  }

  return {
    match(sessionId, name, args) {
      const set = allowRules.get(sessionId)
      if (!set) return false
      return set.has(`${name}:${ruleKey(name, args)}`) || set.has(`${name}:*`)
    },
    add(sessionId, name, args) {
      if (!allowRules.has(sessionId)) allowRules.set(sessionId, new Set())
      allowRules.get(sessionId).add(`${name}:${ruleKey(name, args)}`)
    },
    clear(sessionId) {
      allowRules.delete(sessionId)
    },
  }
}

/**
 * Build the callbacks object for runToolLoop.
 *
 * @param {object}       opts
 * @param {object}       opts.db               database handle
 * @param {function}     opts.send             (channel, payload) → void  outgoing events
 * @param {function}     [opts.getWc]          () → WebContents|null  for reply listeners
 * @param {string|number} opts.sessionId
 * @param {number}       opts.msgId
 * @param {AbortController} opts.controller
 * @param {string}       opts.source           'chat' | 'task'
 * @param {object}       opts.allowRules       createAllowRulesStore() instance
 * @param {object}       [opts.model]          resolved model (for price columns)
 * @returns {object} callbacks bag — spread directly into runToolLoop options
 */
function buildToolLoopCallbacks({ db, send, getWc, sessionId, msgId, controller, source, allowRules, model }) {
  // Wrap every outgoing send in try/catch so a dead renderer never throws.
  const safeSend = (c, p) => { try { send(c, p) } catch {} }

  const callbacks = {}

  // Always hook up thinking start/end/delta for all models so any model with reasoning or <think> tags streams live
  callbacks.onThinkingStart = () => safeSend('chat:thinking-start', { messageId: msgId, sessionId })
  callbacks.onThinkingEnd   = () => safeSend('chat:thinking-end',   { messageId: msgId, sessionId })
  callbacks.onThinkingDelta = (text) => safeSend('chat:thinking-chunk', { messageId: msgId, sessionId, delta: text, done: false })
  callbacks.onStreamDelta = (delta) => safeSend('chat:stream-chunk', { messageId: msgId, sessionId, delta, done: false })

  callbacks.onToolCall = (entry) =>
    safeSend('chat:tool-call', { messageId: msgId, sessionId, tool: entry })

  callbacks.onPlanStep = (step) =>
    safeSend('chat:plan-step', { messageId: msgId, sessionId, step })

  callbacks.onStatus = (s) => {
    if (s.kind === 'budget_exhausted') {
      safeSend('chat:status', { messageId: msgId, sessionId, text: s.text, kind: 'budget_exhausted' })
    } else {
      safeSend('chat:status', { messageId: msgId, sessionId, text: s.text, kind: s.kind || 'step' })
    }
  }

  callbacks.onTodoUpdate = (todos) =>
    safeSend('chat:todo-update', { messageId: msgId, sessionId, todos })

  callbacks.onPlanSnapshot = (plan) =>
    safeSend('chat:plan-snapshot', { messageId: msgId, sessionId, plan })

  callbacks.onSubagentEvent = (event) =>
    safeSend('chat:subagent-event', { messageId: msgId, sessionId, event })

  // Live token/cost reporting: toolLoop calls onUsage({input, output}) after
  // each model round with the loop-accumulated totals. Compute the USD cost
  // from the resolved model's price columns (0 when unpriced) and emit a
  // chat:usage event so the renderer can show per-turn + cumulative cost live.
  callbacks.onUsage = (usage) => {
    const inputTokens = Number(usage?.input) || 0
    const outputTokens = Number(usage?.output) || 0
    let costUsd = 0
    try {
      const { computeCost } = require('../utils/cost')
      costUsd = computeCost(model, { prompt_tokens: inputTokens, completion_tokens: outputTokens })
    } catch {}
    safeSend('chat:usage', { sessionId, messageId: msgId, inputTokens, outputTokens, costUsd })
  }

  // Stream tool output (run_command stdout, etc.) in real-time.
  callbacks.onStream = (chunk) => {
    if (chunk?.text) safeSend('chat:tool-stream', { messageId: msgId, sessionId, text: chunk.text, done: chunk.type === 'done' })
  }

  // Audit log — persists the agent turn trace. Also feeds the real audit
  // trail into the GEP evolution engine (previously invoked with `[]` from
  // the evolution:run-cycle IPC, so signals never fired from real runs).
  // Throttled: at most one evolution cycle per 10 minutes, only when the
  // turn actually used tools. Never throws — evolution is best-effort.
  // The cycle's <evolution_guidance> prompt is stored per-session so
  // toolLoop.js can inject it into subsequent turns — closing the loop
  // between "learned strategies" and "applied strategies".
  let _lastGepFeed = 0
  const GEP_FEED_MIN_MS = 10 * 60 * 1000
  // 反思触发的节流：即使条件持续满足也最多 10 分钟尝试一次。
  let _lastReflectTry = 0
  const REFLECT_TRY_MIN_MS = 10 * 60 * 1000
  // in-flight 防重入：上一次反思还在跑（LLM 往返可能数秒）时不重复触发。
  let _reflectInFlight = false
  callbacks.onAudit = (trace) => {
    try { db.addAuditLog({ sessionId, turnId: msgId, payload: trace }) } catch {}
    // 策略反思：采集轨迹摘要进环形缓冲；攒够条数或策略库超容时触发一次
    // LLM 反思（异步、绝不阻塞当前回合；无 provider 时静默跳过）。
    try {
      const reflect = require('../evolution/reflect')
      const queued = reflect.noteTrace(trace)
      if (queued.queued) {
        const overCapacity = require('../evolution/strategyStore').stats().needsMerge
        const now = Date.now()
        if ((queued.count >= reflect.REFLECT_EVERY_N_TRACES || overCapacity) && now - _lastReflectTry >= REFLECT_TRY_MIN_MS && !_reflectInFlight) {
          _lastReflectTry = now
          _reflectInFlight = true
          reflect.reflectNow(db).catch(() => {}).finally(() => { _reflectInFlight = false })
        }
      }
    } catch {}
    try {
      const toolCalls = Array.isArray(trace?.toolCalls) ? trace.toolCalls : []
      if (toolCalls.length === 0) return
      const now = Date.now()
      if (now - _lastGepFeed < GEP_FEED_MIN_MS) return
      _lastGepFeed = now
      const gep = require('../evolution/gep')
      const result = gep.runEvolutionCycle(db, toolCalls, 'balanced', [], [])
      if (result && result.prompt) {
        try { gep.storeGuidance(sessionId, result.prompt, result.capsule) } catch {}
      }
    } catch {}
  }

  // AskUserQuestion: surface a structured question dialog and await the user's
  // choice. Returns a JSON string of answers as the tool result.
  callbacks.onAskUser = (questions) => new Promise((resolve) => {
    const reqId = `${msgId}:q:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
    const safeWc = getWc ? getWc() : null
    let settled = false
    const finish = (val) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      controller.signal.removeEventListener('abort', onAbort)
      safeWc?.removeListener('chat:question-reply', onReply)
      resolve(val)
    }
    const onReply  = (_e, r) => { if (r && r.reqId === reqId) finish(JSON.stringify(r.answers || [])) }
    const onAbort  = () => finish(JSON.stringify([{ question: questions[0]?.question, answer: '(aborted)' }]))
    const onTimeout = () => {
      safeSend('chat:question-expired', { reqId })
      finish(JSON.stringify([{ answer: '(no response)' }]))
    }
    const timer = setTimeout(onTimeout, 300000) // 5 min
    controller.signal.addEventListener('abort', onAbort)
    if (!safeWc) { finish(JSON.stringify([{ answer: '(no window)' }])); return }
    safeWc.on('chat:question-reply', onReply)
    safeSend('chat:question', { reqId, messageId: msgId, sessionId, questions })
  })

  // requestPermission: check allow-rules first; otherwise prompt the user via
  // the permission dialog. 60s timeout. `source` field tells the renderer
  // whether this is a 'chat' turn or a 'task' background run. `reason` (when
  // present) carries the policy attribution, e.g. capability axis ask.
  callbacks.requestPermission = ({ name, args, risk, reason, diff, isTainted, taintReason }) => {
    // If not tainted, check allow-rules. If tainted by external untrusted input, require explicit confirmation!
    if (!isTainted && allowRules.match(sessionId, name, args)) return Promise.resolve(true)
    let impactPreview = null
    try { impactPreview = require('../tools/toolImpact').toolImpact(name, args) } catch {}
    let diffPreview = diff || null
    if (!diffPreview && ['write_file', 'edit_file', 'apply_patch'].includes(name)) {
      try { diffPreview = require('../tools/toolImpact').generateDiff(name, args)?.diff } catch {}
    }
    return new Promise((resolve) => {
      const reqId = `${msgId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
      const safeWc = getWc ? getWc() : null
      let settled = false
      const finish = (val) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        controller.signal.removeEventListener('abort', onAbort)
        safeWc?.removeListener('chat:permission-reply', onReply)
        resolve(val)
      }
      const onReply = (_e, r) => {
        if (!r || r.reqId !== reqId) return
        if (r.allowed && r.remember && !isTainted) allowRules.add(sessionId, name, args)
        finish(!!r.allowed)
      }
      const onAbort   = () => finish(false)
      const onTimeout = () => {
        safeSend('chat:permission-expired', { reqId })
        finish(false)
      }
      const timer = setTimeout(onTimeout, 60000)
      controller.signal.addEventListener('abort', onAbort)
      if (!safeWc) { finish(false); return }
      safeWc.on('chat:permission-reply', onReply)
      safeSend('chat:permission-request', {
        reqId, messageId: msgId, sessionId, name, args, risk,
        impact: impactPreview,
        diff: diffPreview,
        isTainted: !!isTainted,
        taintReason: taintReason || undefined,
        source,
        reason: reason || undefined,
      })
    })
  }

  return callbacks
}

module.exports = { createAllowRulesStore, buildToolLoopCallbacks }
