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
const RULE_DECISIONS = ['allow', 'deny', 'ask']
const SETTINGS_PREFIX = 'permission_rule.'

function loadPersistedRules(db) {
  const out = new Map()
  if (!db || typeof db.prepare !== 'function') return out
  try {
    const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'permission_rule.%'").all()
    for (const r of rows) {
      const rest = String(r.key).slice(SETTINGS_PREFIX.length)
      const idx = rest.indexOf('.')
      if (idx <= 0) continue
      const tool = rest.slice(0, idx)
      const rKey = rest.slice(idx + 1)
      if (rKey && RULE_DECISIONS.includes(r.value)) {
        out.set(`${tool}:${rKey}`, r.value)
      }
    }
  } catch {}
  return out
}

/**
 * Create a session-scoped & persisted allow-rules store.
 * Multi-layer lookup: Session rules (in-memory) > Persisted rules (settings table).
 * Granularity:
 *   run_command  → multi-token subcommand prefix (e.g. 'git status', 'npm test')
 *                  or first binary token, or wildcard '*'
 *   write/edit   → directory of path, or exact path, or wildcard '*'
 *   others       → exact tool name, or wildcard '*'
 */
function createAllowRulesStore(initialDb = null) {
  let dbRef = initialDb
  const sessionRules = new Map()   // sessionId -> Map<string, string>
  const persistedRules = new Map() // `${tool}:${ruleKey}` -> decision
  if (dbRef) {
    for (const [k, d] of loadPersistedRules(dbRef)) persistedRules.set(k, d)
  }

  function setDb(db) {
    dbRef = db
    if (dbRef) {
      persistedRules.clear()
      for (const [k, d] of loadPersistedRules(dbRef)) persistedRules.set(k, d)
    }
  }

  function ruleKey(name, args) {
    if (name === 'run_command') {
      const cmd = String(args?.command || '').trim()
      if (/(?:&&|\|\||[;&|\n])/.test(cmd) || cmd.includes('$(') || cmd.includes('`')) {
        return cmd
      }
      const parts = cmd.split(/\s+/)
      const first = parts[0] || ''
      const second = parts[1] || ''
      if (['git', 'npm', 'pnpm', 'yarn', 'cargo', 'go', 'docker', 'python', 'pytest', 'npx', 'vitest'].includes(first.toLowerCase()) && second && !second.startsWith('-')) {
        return `${first} ${second}`
      }
      return first || '*'
    }
    if (name === 'write_file' || name === 'edit_file') {
      const p = String(args?.path || '')
      const dir = p.includes('/') || p.includes('\\') ? p.replace(/[\\/][^\\/]*$/, '') : p
      return dir || p || '*'
    }
    return '*'
  }

  function checkDecision(layer, name, args) {
    if (!layer || layer.size === 0) return null

    let cmd = ''
    if (name === 'run_command') {
      cmd = String(args?.command || '').trim()
      // Command substitutions (e.g. $(...), `...`) must never be auto-approved
      if (cmd.includes('$(') || cmd.includes('`')) {
        return null
      }

      // Check for compound command chaining (&&, ||, ;, |, newline)
      if (/(?:&&|\|\||[;&|\n])/.test(cmd)) {
        const subcmds = cmd.split(/(?:&&|\|\||[;&|\n])/).map(s => s.trim()).filter(Boolean)
        if (subcmds.length > 1) {
          let allAllowed = true
          for (const sub of subcmds) {
            const subDec = checkDecision(layer, name, { command: sub })
            if (subDec === 'deny') return 'deny'
            if (subDec !== 'allow') {
              allAllowed = false
              break
            }
          }
          if (allAllowed) return 'allow'
          return null // Compound command not fully covered by allow rules: require explicit confirmation
        }
      }
    }

    const rk = ruleKey(name, args)
    const exactKey = `${name}:${rk}`
    if (layer.has(exactKey)) return layer.get(exactKey)

    if (name === 'run_command') {
      const firstTok = cmd.split(/\s+/)[0] || cmd
      if (layer.has(`${name}:${firstTok}`)) return layer.get(`${name}:${firstTok}`)
      if (layer.has(`${name}:${firstTok}:*`)) return layer.get(`${name}:${firstTok}:*`)

      for (const [storedKey, dec] of layer.entries()) {
        if (!storedKey.startsWith(`${name}:`)) continue
        const pattern = storedKey.slice(name.length + 1)
        if (pattern === '*') return dec
        if (pattern.endsWith(':*')) {
          const prefix = pattern.slice(0, -2)
          if (cmd === prefix || cmd.startsWith(prefix + ' ') || cmd.startsWith(prefix + '\t')) return dec
        } else if (cmd === pattern || cmd.startsWith(pattern + ' ') || cmd.startsWith(pattern + '\t')) {
          return dec
        }
      }
    }

    if (layer.has(`${name}:*`)) return layer.get(`${name}:*`)
    if (layer.has(`${name}:`)) return layer.get(`${name}:`)

    return null
  }

  function decision(sessionId, name, args) {
    const sLayer = sessionRules.get(sessionId)
    const sDec = checkDecision(sLayer, name, args)
    if (sDec != null) return sDec

    const pDec = checkDecision(persistedRules, name, args)
    if (pDec != null) return pDec

    return null
  }

  return {
    setDb,
    ruleKey,
    decision,
    match(sessionId, name, args) {
      return decision(sessionId, name, args) === 'allow'
    },
    add(sessionId, name, args, dec = 'allow') {
      if (!sessionRules.has(sessionId)) sessionRules.set(sessionId, new Map())
      sessionRules.get(sessionId).set(`${name}:${ruleKey(name, args)}`, dec)
    },
    clear(sessionId) {
      sessionRules.delete(sessionId)
    },
    persist(db, name, rKey, dec = 'allow') {
      const targetDb = db || dbRef
      if (!RULE_DECISIONS.includes(dec)) dec = 'allow'
      if (targetDb && typeof targetDb.prepare === 'function') {
        try {
          targetDb.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
            .run(`${SETTINGS_PREFIX}${name}.${rKey}`, dec)
        } catch (e) {
          console.error('[allowRules] failed to persist rule:', e)
          return false
        }
      }
      persistedRules.set(`${name}:${rKey}`, dec)
      return true
    },
    removePersisted(db, name, rKey) {
      const targetDb = db || dbRef
      if (targetDb && typeof targetDb.prepare === 'function') {
        try {
          targetDb.prepare('DELETE FROM settings WHERE key = ?').run(`${SETTINGS_PREFIX}${name}.${rKey}`)
        } catch (e) {
          console.error('[allowRules] failed to delete persisted rule:', e)
        }
      }
      persistedRules.delete(`${name}:${rKey}`)
    },
    listAll(sessionId) {
      const session = []
      const sMap = sessionRules.get(sessionId)
      if (sMap) {
        for (const [k, d] of sMap.entries()) session.push({ key: k, decision: d })
      }
      const persisted = []
      for (const [k, d] of persistedRules.entries()) {
        const idx = k.indexOf(':')
        const tool = idx > -1 ? k.slice(0, idx) : k
        const rk = idx > -1 ? k.slice(idx + 1) : '*'
        persisted.push({ tool, ruleKey: rk, decision: d, key: k })
      }
      return { session, persisted }
    },
    applyPreset(db, preset) {
      const targetDb = db || dbRef
      let rules = []
      if (preset === 'safe_git') {
        rules = [
          { name: 'run_command', ruleKey: 'git status' },
          { name: 'run_command', ruleKey: 'git diff' },
          { name: 'run_command', ruleKey: 'git log' },
          { name: 'run_command', ruleKey: 'git branch' },
          { name: 'run_command', ruleKey: 'git show' },
          { name: 'run_command', ruleKey: 'git rev-parse' },
        ]
      } else if (preset === 'test_runners') {
        rules = [
          { name: 'run_command', ruleKey: 'npm test' },
          { name: 'run_command', ruleKey: 'npm run test' },
          { name: 'run_command', ruleKey: 'pnpm test' },
          { name: 'run_command', ruleKey: 'yarn test' },
          { name: 'run_command', ruleKey: 'cargo test' },
          { name: 'run_command', ruleKey: 'pytest' },
          { name: 'run_command', ruleKey: 'vitest' },
        ]
      } else if (preset === 'read_tools') {
        rules = [
          { name: 'read_file', ruleKey: '*' },
          { name: 'list_dir', ruleKey: '*' },
          { name: 'glob_find', ruleKey: '*' },
          { name: 'grep_search', ruleKey: '*' },
        ]
      }
      let added = 0
      for (const r of rules) {
        this.persist(targetDb, r.name, r.ruleKey, 'allow')
        added++
      }
      return { ok: true, added }
    }
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
  // Always forward, including the done signal (which carries empty text) so
  // the renderer can stop the live cursor.
  callbacks.onStream = (chunk) => {
    if (chunk?.text || chunk?.type === 'done') {
      safeSend('chat:tool-stream', { messageId: msgId, sessionId, text: chunk.text || '', done: chunk.type === 'done' })
    }
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
        if (r.allowed && r.remember && !isTainted) {
          const isPermanent = r.remember === 'remember' || r.remember === 'permanent' || r.remember === true
          const rKey = allowRules.ruleKey(name, args)
          if (isPermanent && typeof allowRules.persist === 'function') {
            try {
              allowRules.persist(db, name, rKey, 'allow')
            } finally {
              finish('allow')
            }
          }
          allowRules.add(sessionId, name, args)
        }
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
