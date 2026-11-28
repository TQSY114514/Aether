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

function normalizeSessionIds(sessionIds) {
  if (!Array.isArray(sessionIds) || sessionIds.length === 0) return null
  const out = []
  const seen = new Set()
  for (const raw of sessionIds) {
    const num = Number(raw)
    if (Number.isFinite(num) && num > 0) {
      if (!seen.has(num)) {
        seen.add(num)
        out.push(num)
      }
    } else if (typeof raw === 'string' && raw.trim()) {
      const s = raw.trim()
      if (!seen.has(s)) {
        seen.add(s)
        out.push(s)
      }
    }
  }
  return out.length > 0 ? out : null
}

function parsePersistedValue(rawValue) {
  if (RULE_DECISIONS.includes(rawValue)) {
    return { decision: rawValue, sessionIds: null }
  }
  if (typeof rawValue === 'string' && rawValue.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawValue)
      if (parsed && RULE_DECISIONS.includes(parsed.decision)) {
        return {
          decision: parsed.decision,
          sessionIds: normalizeSessionIds(parsed.sessionIds),
        }
      }
    } catch {}
  }
  return null
}

function serializePersistedValue(dec, sessionIds) {
  const cleanDec = RULE_DECISIONS.includes(dec) ? dec : 'allow'
  const cleanIds = normalizeSessionIds(sessionIds)
  if (cleanIds && cleanIds.length > 0) {
    return JSON.stringify({ decision: cleanDec, sessionIds: cleanIds })
  }
  return cleanDec
}

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
      const parsed = parsePersistedValue(r.value)
      if (rKey && parsed) {
        out.set(`${tool}:${rKey}`, parsed)
      }
    }
  } catch {}
  return out
}

function entryAppliesToSession(entry, sessionId) {
  if (!entry) return false
  if (typeof entry === 'string') return true
  if (!Array.isArray(entry.sessionIds) || entry.sessionIds.length === 0) return true
  if (sessionId == null) return false
  const targetNum = Number(sessionId)
  return entry.sessionIds.some((id) => id === sessionId || (Number.isFinite(targetNum) && Number(id) === targetNum))
}

function readEntryDecision(entry, sessionId) {
  if (!entryAppliesToSession(entry, sessionId)) return null
  return typeof entry === 'string' ? entry : entry.decision
}

/**
 * Create a session-scoped & persisted allow-rules store.
 * Multi-layer lookup: Session rules (in-memory) > Persisted rules (settings table, global or session-scoped).
 * Granularity:
 *   run_command  → multi-token subcommand prefix (e.g. 'git status', 'npm test')
 *                  or first binary token, or wildcard '*'
 *   write/edit   → directory of path, or exact path, or wildcard '*'
 *   others       → exact tool name, or wildcard '*'
 */
function createAllowRulesStore(initialDb = null) {
  let dbRef = initialDb
  const sessionRules = new Map()   // sessionId -> Map<string, string>
  const persistedRules = new Map() // `${tool}:${ruleKey}` -> { decision, sessionIds: number[] | null }
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

const DESTRUCTIVE_GIT_PATTERN = /(?:^|\s)(?:clean|push|rebase|merge|reset|rm|restore|revert|cherry-pick)(?:\s|$)|(?:^|\s)(?:-[a-zA-Z]*[dDmMfF][a-zA-Z]*|--delete|--force|--hard|--amend|--prune)(?:\s|$)/i

  function ruleKey(name, args) {
    if (name === 'run_command') {
      const cmd = String(args?.command || '').trim()
      if (/(?:&&|\|\||[;&|\n])/.test(cmd) || cmd.includes('$(') || cmd.includes('`') || /(^|[^&])&([^&]|$)/.test(cmd) || /[<>]/.test(cmd)) {
        return cmd
      }
      // Destructive git commands must never collapse to benign prefix rules
      if ((cmd.startsWith('git ') || cmd === 'git') && DESTRUCTIVE_GIT_PATTERN.test(cmd)) {
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

  function checkDecision(layer, name, args, sessionId) {
    if (!layer || layer.size === 0) return null

    let cmd = ''
    if (name === 'run_command') {
      cmd = String(args?.command || '').trim()
      // Command substitutions (e.g. $(...), `...`), background operators, and redirects must never be auto-approved
      if (cmd.includes('$(') || cmd.includes('`') || /(^|[^&])&([^&]|$)/.test(cmd) || /[<>]/.test(cmd)) {
        return null
      }

      // Check for compound command chaining (&&, ||, ;, |, newline)
      if (/(?:&&|\|\||[;&|\n])/.test(cmd)) {
        const subcmds = cmd.split(/(?:&&|\|\||[;&|\n])/).map(s => s.trim()).filter(Boolean)
        if (subcmds.length === 0) return null
        let allAllowed = true
        for (const sub of subcmds) {
          const subDec = checkDecision(layer, name, { command: sub }, sessionId)
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

    const rk = ruleKey(name, args)
    const exactKey = `${name}:${rk}`
    const exactDec = readEntryDecision(layer.get(exactKey), sessionId)
    if (exactDec != null) return exactDec

    if (name === 'run_command') {
      const firstTok = cmd.split(/\s+/)[0] || cmd
      const firstTokDec = readEntryDecision(layer.get(`${name}:${firstTok}`), sessionId)
      if (firstTokDec != null) return firstTokDec
      const firstWildDec = readEntryDecision(layer.get(`${name}:${firstTok}:*`), sessionId)
      if (firstWildDec != null) return firstWildDec

      for (const [storedKey, entry] of layer.entries()) {
        if (!storedKey.startsWith(`${name}:`)) continue
        const dec = readEntryDecision(entry, sessionId)
        if (dec == null) continue
        const pattern = storedKey.slice(name.length + 1)
        if (pattern === '*') return dec
        if (pattern.endsWith(':*')) {
          const prefix = pattern.slice(0, -2)
          if (cmd === prefix || cmd.startsWith(prefix + ' ') || cmd.startsWith(prefix + '\t')) {
            if (dec === 'allow' && (pattern.startsWith('git ') || pattern === 'git') && DESTRUCTIVE_GIT_PATTERN.test(cmd)) {
              continue
            }
            return dec
          }
        } else if (cmd === pattern || cmd.startsWith(pattern + ' ') || cmd.startsWith(pattern + '\t')) {
          if (dec === 'allow' && (pattern.startsWith('git ') || pattern === 'git') && DESTRUCTIVE_GIT_PATTERN.test(cmd)) {
            continue
          }
          return dec
        }
      }
    }

    const starDec = readEntryDecision(layer.get(`${name}:*`), sessionId)
    if (starDec != null) return starDec
    const emptyDec = readEntryDecision(layer.get(`${name}:`), sessionId)
    if (emptyDec != null) return emptyDec

    return null
  }

  function decision(sessionId, name, args) {
    const sLayer = sessionRules.get(sessionId)
    const sDec = checkDecision(sLayer, name, args, sessionId)
    if (sDec != null) return sDec

    const pDec = checkDecision(persistedRules, name, args, sessionId)
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
    removeSessionRule(sessionId, nameOrKey, rKey) {
      const sMap = sessionRules.get(sessionId)
      if (!sMap) return false
      const fullKey = rKey != null ? `${nameOrKey}:${rKey}` : String(nameOrKey)
      const deleted = sMap.delete(fullKey)
      if (sMap.size === 0) sessionRules.delete(sessionId)
      return deleted
    },
    clear(sessionId) {
      sessionRules.delete(sessionId)
    },
    persist(db, name, rKey, dec = 'allow', sessionIds = null) {
      const targetDb = db || dbRef
      if (!targetDb || typeof targetDb.prepare !== 'function') {
        console.error('[allowRules] Cannot persist rule: no valid db instance available')
        return false
      }
      if (!RULE_DECISIONS.includes(dec)) dec = 'allow'
      const cleanIds = normalizeSessionIds(sessionIds)
      const serialized = serializePersistedValue(dec, cleanIds)
      try {
        targetDb.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
          .run(`${SETTINGS_PREFIX}${name}.${rKey}`, serialized)
      } catch (e) {
        console.error('[allowRules] failed to persist rule:', e)
        return false
      }
      persistedRules.set(`${name}:${rKey}`, { decision: dec, sessionIds: cleanIds })
      return true
    },
    removePersisted(db, name, rKey) {
      const targetDb = db || dbRef
      if (!targetDb || typeof targetDb.prepare !== 'function') {
        console.error('[allowRules] Cannot remove persisted rule: no valid db instance available')
        return false
      }
      try {
        targetDb.prepare('DELETE FROM settings WHERE key = ?').run(`${SETTINGS_PREFIX}${name}.${rKey}`)
      } catch (e) {
        console.error('[allowRules] failed to delete persisted rule:', e)
        return false
      }
      persistedRules.delete(`${name}:${rKey}`)
      return true
    },
    listAll(sessionId) {
      const session = []
      const formatSessionEntry = (sid, k, d) => {
        const idx = k.indexOf(':')
        const tool = idx > -1 ? k.slice(0, idx) : k
        const rk = idx > -1 ? k.slice(idx + 1) : '*'
        return { sessionId: sid, key: k, tool, ruleKey: rk, decision: d }
      }
      if (sessionId != null) {
        const sMap = sessionRules.get(sessionId) || sessionRules.get(Number(sessionId))
        if (sMap) {
          for (const [k, d] of sMap.entries()) session.push(formatSessionEntry(sessionId, k, d))
        }
      } else {
        for (const [sid, sMap] of sessionRules.entries()) {
          for (const [k, d] of sMap.entries()) session.push(formatSessionEntry(sid, k, d))
        }
      }
      const persisted = []
      for (const [k, entry] of persistedRules.entries()) {
        const idx = k.indexOf(':')
        const tool = idx > -1 ? k.slice(0, idx) : k
        const rk = idx > -1 ? k.slice(idx + 1) : '*'
        persisted.push({
          tool,
          ruleKey: rk,
          decision: entry.decision,
          sessionIds: entry.sessionIds || null,
          key: k,
        })
      }
      return { session, persisted }
    },
    applyPreset(db, preset) {
      const validPresets = ['safe_git', 'test_runners', 'read_tools']
      if (!validPresets.includes(preset)) {
        return { ok: false, error: `unsupported preset: ${preset}`, added: 0 }
      }
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
function createLeadingBatcher(flushFn, delayMs = 16) {
  let pending = ''
  let timer = null
  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!pending) return
    const chunk = pending
    pending = ''
    flushFn(chunk)
  }
  const push = (delta) => {
    if (!delta) return
    if (!timer) {
      flushFn(delta)
      timer = setTimeout(() => {
        timer = null
        if (pending) flush()
      }, delayMs)
      if (typeof timer.unref === 'function') timer.unref()
    } else {
      pending += delta
    }
  }
  return { push, flush }
}

function buildToolLoopCallbacks({ db, send, getWc, sessionId, msgId, controller, source, allowRules, model }) {
  // Wrap every outgoing send in try/catch so a dead renderer never throws.
  const safeSend = (c, p) => { try { send(c, p) } catch {} }

  const callbacks = {}

  let thinkingStartedAt = null
  let accumulatedThinking = ''
  let thinkingDurationMs = 0

  const thinkingBatcher = createLeadingBatcher((delta) => {
    safeSend('chat:thinking-chunk', { messageId: msgId, sessionId, delta, done: false })
  })
  const streamBatcher = createLeadingBatcher((delta) => {
    safeSend('chat:stream-chunk', { messageId: msgId, sessionId, delta, done: false })
  })

  callbacks.flushStreams = () => {
    thinkingBatcher.flush()
    streamBatcher.flush()
  }
  if (controller?.signal) {
    controller.signal.addEventListener('abort', () => callbacks.flushStreams(), { once: true })
  }

  // Always hook up thinking start/end/delta for all models so any model with reasoning or <think> tags streams live
  callbacks.onThinkingStart = () => {
    thinkingStartedAt = Date.now()
    safeSend('chat:thinking-start', { messageId: msgId, sessionId, startedAt: thinkingStartedAt })
  }
  callbacks.onThinkingEnd   = () => {
    thinkingBatcher.flush()
    const durationMs = thinkingStartedAt ? Date.now() - thinkingStartedAt : 0; thinkingDurationMs += durationMs
    thinkingStartedAt = null
    safeSend('chat:thinking-end',   { messageId: msgId, sessionId, durationMs })
  }
  callbacks.onThinkingDelta = (text) => { if (text) accumulatedThinking += text; thinkingBatcher.push(text) }
  callbacks.getThinkingData = () => ({
    content: accumulatedThinking,
    durationMs: thinkingDurationMs + (thinkingStartedAt ? Date.now() - thinkingStartedAt : 0),
  })
  callbacks.onStreamDelta = (delta) => streamBatcher.push(delta)

  callbacks.onToolCall = (entry) => {
    callbacks.flushStreams()
    safeSend('chat:tool-call', { messageId: msgId, sessionId, tool: entry })
  }

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

  // Audit log + learning observation sink. There is intentionally one learning
  // curator now: strategy reflection. The older GEP cycle used to run beside it,
  // producing a second, opaque guidance path with different semantics.
  callbacks.onAudit = (trace) => {
    try { db.addAuditLog({ sessionId, turnId: msgId, payload: trace }) } catch {}
    // The Evolution page toggles this single flag. When paused, do not collect
    // or run automatic learning work; manual reflection remains available.
    try {
      const featureFlags = require('../featureFlags')
      if (!featureFlags.isEnabled(db, 'skills.selfEvolution')) return
    } catch {
      return
    }
    try {
      const reflect = require('../evolution/reflect')
      const queued = reflect.noteTrace(trace)
      if (!queued.queued) return

      const overCapacity = require('../evolution/strategyStore').stats().needsMerge
      const highSignalFailure = String(trace?.finalStatus || '') !== 'success'
      if (
        (queued.count >= reflect.REFLECT_EVERY_N_TRACES || overCapacity || highSignalFailure) &&
        reflect.canAutoReflect(db)
      ) {
        const scheduler = require('../cron/scheduler')
        scheduler.nudgeIdleTask?.('strategy-reflect', db)
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
    const onAbort  = () => {
      safeSend('chat:question-expired', { reqId })
      finish(JSON.stringify([{ question: questions[0]?.question, answer: '(aborted)' }]))
    }
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

  callbacks.checkSavedRule = (name, args) => {
    if (!allowRules) return null
    return typeof allowRules.decision === 'function'
      ? allowRules.decision(sessionId, name, args)
      : (allowRules.match(sessionId, name, args) ? 'allow' : null)
  }

  // requestPermission: check allow-rules first; otherwise prompt the user via
  // the permission dialog. 60s timeout. `source` field tells the renderer
  // whether this is a 'chat' turn or a 'task' background run. `reason` (when
  // present) carries the policy attribution, e.g. capability axis ask.
  callbacks.requestPermission = ({ name, args, risk, reason, diff, isTainted, taintReason }) => {
    const ruleDec = allowRules
      ? (typeof allowRules.decision === 'function'
          ? allowRules.decision(sessionId, name, args)
          : (allowRules.match(sessionId, name, args) ? 'allow' : null))
      : null
    if (ruleDec === 'deny') return Promise.resolve(false)
    // If not tainted, respect persisted/session allow-rules. If tainted by external untrusted input, require explicit confirmation!
    if (!isTainted && ruleDec === 'allow') return Promise.resolve(true)
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
          let persisted = false
          if (isPermanent && typeof allowRules.persist === 'function') {
            try {
              persisted = !!allowRules.persist(db, name, rKey, 'allow')
            } catch (e) {
              console.error('[permission-reply] failed to persist rule:', e)
            }
          }
          if (!isPermanent || !persisted) {
            allowRules.add(sessionId, name, args)
          }
        }
        finish(!!r.allowed)
      }
      const onAbort   = () => {
        safeSend('chat:permission-expired', { reqId })
        finish(false)
      }
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

module.exports = { createAllowRulesStore, buildToolLoopCallbacks, createLeadingBatcher }
