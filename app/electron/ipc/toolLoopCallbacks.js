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
 * @param {boolean}      opts.thinkingSupported gates onThinkingStart/End
 * @returns {object} callbacks bag — spread directly into runToolLoop options
 */
function buildToolLoopCallbacks({ db, send, getWc, sessionId, msgId, controller, source, allowRules, thinkingSupported }) {
  // Wrap every outgoing send in try/catch so a dead renderer never throws.
  const safeSend = (c, p) => { try { send(c, p) } catch {} }

  const callbacks = {}

  // Thinking start/end — only when the model supports extended thinking.
  if (thinkingSupported) {
    callbacks.onThinkingStart = () => safeSend('chat:thinking-start', { messageId: msgId, sessionId })
    callbacks.onThinkingEnd   = () => safeSend('chat:thinking-end',   { messageId: msgId, sessionId })
    callbacks.onThinkingDelta = (text) => safeSend('chat:thinking-chunk', { messageId: msgId, sessionId, delta: text, done: false })
  }

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
        if ((queued.count >= reflect.REFLECT_EVERY_N_TRACES || overCapacity) && now - _lastReflectTry >= REFLECT_TRY_MIN_MS) {
          _lastReflectTry = now
          reflect.reflectNow(db).catch(() => {})
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
  // whether this is a 'chat' turn or a 'task' background run.
  callbacks.requestPermission = ({ name, args, risk }) => {
    if (allowRules.match(sessionId, name, args)) return Promise.resolve(true)
    let impactPreview = null
    try { impactPreview = require('../tools/toolImpact').toolImpact(name, args) } catch {}
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
        if (r.allowed && r.remember) allowRules.add(sessionId, name, args)
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
      safeSend('chat:permission-request', { reqId, messageId: msgId, sessionId, name, args, risk, impact: impactPreview, source })
    })
  }

  return callbacks
}

module.exports = { createAllowRulesStore, buildToolLoopCallbacks }
