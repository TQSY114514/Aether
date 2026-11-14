'use strict'

// ─────────────────────────────────────────────────────────────────────────────
// subagentSupervisor.js — Subagent Live Ring Buffer, Supervised Spawning,
// Non-Blocking Stream Peeking & State-Inheriting Hot-Swap Control
// (Milestone 3: Features 20–23)
//
// Electron-Free Boundary: Plain CommonJS module. Zero 'electron' imports.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto')
const { buildRolePrompt, buildToolFilter, getRoleDefaultMode, SUBAGENT_SYSTEM_PROMPT } = require('./agentRoles')
const steering = require('./steering')

/**
 * Resolves full provider and model objects using db, custom overrides, or standard fallback.
 */
function resolveProviderAndModel(db, providerId, modelId, customProvider = null, customModel = null) {
  let provider = customProvider || null
  let model = customModel || null

  if (db && (!provider || !model)) {
    if (!provider) {
      try {
        provider = typeof db.getProviderDecrypted === 'function'
          ? db.getProviderDecrypted(providerId)
          : db.getProvider?.(providerId)
      } catch {}
    }
    if (!model) {
      try {
        model = typeof db.getModel === 'function' ? db.getModel(modelId) : null
      } catch {}
    }
  }

  if (!provider) {
    if (db && providerId && providerId !== 'default') {
      throw new Error(`Provider "${providerId}" not found in database`)
    }
    provider = {
      id: providerId,
      name: `Provider ${providerId}`,
      baseUrl: 'https://api.openai.com/v1',
      protocol: 'openai',
    }
  }

  if (!model) {
    model = {
      id: modelId,
      model_name: String(modelId),
      display_name: String(modelId),
    }
  }

  return { provider, model }
}

/**
 * Resolves filtered tool payload based on role allowlist.
 * @param {string} role
 * @param {string} cwd
 * @param {string} [agentMode]
 * @param {object} [db]
 * @returns {Array<object>|boolean}
 */
function resolveSubagentTools(role, cwd, agentMode, db) {
  const allowed = buildToolFilter(role, cwd)
  if (!allowed) {
    // null means all tools allowed for role
    return true
  }
  const mode = agentMode || getRoleDefaultMode(role, cwd) || 'plan'
  let fullPayload = []
  try {
    const mcp = require('../mcp/manager')
    if (typeof mcp.getMergedToolsPayload === 'function') {
      fullPayload = mcp.getMergedToolsPayload(mode, { cacheStable: true, db })
    }
  } catch {}
  if (!fullPayload || fullPayload.length === 0) {
    try {
      const registry = require('../tools/registry')
      fullPayload = registry.toolsPayload(mode, { cacheStable: true, db })
    } catch {}
  }
  if (!Array.isArray(fullPayload)) return true
  return fullPayload.filter((t) => allowed.includes(t?.function?.name))
}

/**
 * Ring buffer tracking live streaming tokens, tool events, and health metrics
 * with 600-character delta coalescing.
 */
class SubagentLiveBuffer {
  /**
   * @param {number} [capacity=300] - Maximum retained discrete events.
   */
  constructor(capacity = 300) {
    this.capacity = capacity
    this.events = []
    this.seq = 0
    this.startedAt = Date.now()
    this.lastActivityAt = Date.now()
    this.firstTokenAt = null
    this.ttftMs = null
    this.accumulatedThinking = ''
    this.accumulatedText = ''
    this.currentTool = null
    this.completedTurnCount = 0
    this.estimatedTokens = 0
  }

  recordFirstTokenIfNeeded() {
    const now = Date.now()
    this.lastActivityAt = now
    if (!this.firstTokenAt) {
      this.firstTokenAt = now
      this.ttftMs = Math.max(0, now - this.startedAt)
    }
  }

  resetActivity() {
    this.lastActivityAt = Date.now()
  }

  recordTurnComplete() {
    this.completedTurnCount += 1
    this.lastActivityAt = Date.now()
  }

  /**
   * Appends streaming token chunks with coalescing to prevent buffer explosion.
   * @param {'thinking' | 'text'} type
   * @param {string} deltaText
   */
  appendStreamDelta(type, deltaText) {
    if (!deltaText) return
    this.recordFirstTokenIfNeeded()
    this.estimatedTokens += Math.max(1, Math.ceil(deltaText.length / 4))

    if (type === 'thinking') {
      this.accumulatedThinking += deltaText
    } else if (type === 'text') {
      this.accumulatedText += deltaText
    }

    // Delta Coalescing: merge with last event if same type and under 600 chars
    const last = this.events[this.events.length - 1]
    if (
      last &&
      last.type === type &&
      (type === 'thinking' || type === 'text') &&
      typeof last.content === 'string' &&
      last.content.length + deltaText.length <= 600
    ) {
      last.content += deltaText
      last.timestamp = this.lastActivityAt
      last.elapsedMs = this.lastActivityAt - this.startedAt
      return
    }

    this._pushEvent(type, deltaText)
  }

  /**
   * Appends tool execution lifecycle events.
   * @param {string} type
   * @param {*} payload
   */
  appendToolEvent(type, payload = {}) {
    this.lastActivityAt = Date.now()
    if (type === 'tool_call_start' || type === 'tool_start') {
      this.currentTool = payload?.toolName || payload?.name || (typeof payload === 'string' ? payload : 'unknown')
    } else if (type === 'tool_result' || type === 'tool_end' || type === 'tool_error') {
      this.currentTool = null
      this.completedTurnCount += 1
    }

    let content = ''
    if (typeof payload === 'string') {
      content = payload
    } else {
      try {
        content = JSON.stringify(payload)
      } catch {
        content = String(payload)
      }
    }
    // Truncate individual tool event content to 2000 chars
    if (content.length > 2000) {
      content = content.slice(0, 2000)
    }

    this._pushEvent(type, content)
  }

  _pushEvent(type, content) {
    if (this.capacity <= 0) return

    const event = {
      seq: ++this.seq,
      timestamp: Date.now(),
      elapsedMs: Date.now() - this.startedAt,
      type,
      content,
    }

    if (this.events.length >= this.capacity) {
      this.events.shift()
    }
    this.events.push(event)
  }

  /**
   * Extracts snapshot for UI peeking or parent decision-making.
   * @param {object} [opts]
   * @param {number} [opts.fromSeq=0] - If > 0, returns only events with seq > fromSeq
   * @param {number} [opts.tailCount=40] - Default event count when fromSeq is 0
   */
  snapshot({ fromSeq = 0, tailCount = 40 } = {}) {
    const now = Date.now()
    const filtered = fromSeq > 0
      ? this.events.filter((e) => e.seq > fromSeq)
      : (tailCount <= 0 ? [] : this.events.slice(-tailCount))

    return {
      latestSeq: this.seq,
      totalEvents: this.seq,
      startedAt: this.startedAt,
      elapsedMs: now - this.startedAt,
      idleSinceLastActivityMs: now - this.lastActivityAt,
      ttftMs: this.ttftMs,
      estimatedTokens: this.estimatedTokens,
      completedTurnCount: this.completedTurnCount,
      currentTool: this.currentTool,
      recentThinkingTail: this.accumulatedThinking.slice(-1500),
      recentTextTail: this.accumulatedText.slice(-1500),
      thinkingTail: this.accumulatedThinking.slice(-1500),
      textTail: this.accumulatedText.slice(-1500),
      streamEvents: filtered,
      events: filtered,
      bufferedCount: this.events.length,
    }
  }
}

// In-memory active subagents registry
const activeSubagents = new Map()

/**
 * Formats subagent execution record into a comprehensive report.
 */
function formatSubagentReport(record, systemNotice = '', snapshotOpts = {}) {
  const snap = record.liveBuffer.snapshot(snapshotOpts)
  return {
    subagentId: record.subagentId,
    status: record.status,
    role: record.role,
    providerId: record.providerId,
    modelId: record.modelId,
    cwd: record.cwd,
    elapsedMs: snap.elapsedMs,
    idleSinceLastActivityMs: snap.idleSinceLastActivityMs,
    ttftMs: snap.ttftMs,
    estimatedTokens: snap.estimatedTokens,
    completedTurnCount: snap.completedTurnCount,
    currentTool: snap.currentTool,
    recentThinkingTail: snap.recentThinkingTail,
    recentTextTail: snap.recentTextTail,
    liveThinkingTail: snap.recentThinkingTail,
    liveOutputTail: snap.recentTextTail,
    streamEvents: snap.streamEvents,
    events: snap.events,
    swapHistory: record.swapHistory || [],
    systemNotice,
    output: record.finalOutput,
    finalOutput: record.finalOutput,
    error: record.error,
  }
}

const MAX_COMPLETED_RECORDS = 50
const COMPLETED_RECORD_TTL_MS = 30 * 60 * 1000

/**
 * Prunes terminal subagent records to prevent unbounded memory growth.
 */
function pruneCompletedSubagents() {
  const now = Date.now()
  const terminal = []
  for (const [id, rec] of activeSubagents.entries()) {
    if (rec.status === 'completed' || rec.status === 'failed' || rec.status === 'cancelled') {
      const doneAt = rec.completedAt || rec.startedAt || now
      if (now - doneAt > COMPLETED_RECORD_TTL_MS) {
        activeSubagents.delete(id)
      } else {
        terminal.push({ id, doneAt })
      }
    }
  }
  if (terminal.length > MAX_COMPLETED_RECORDS) {
    terminal.sort((a, b) => a.doneAt - b.doneAt)
    const excess = terminal.length - MAX_COMPLETED_RECORDS
    for (let i = 0; i < excess; i++) {
      activeSubagents.delete(terminal[i].id)
    }
  }
}

/**
 * Spawns a supervised subagent with explicit provider/model and non-blocking waitMode.
 * @param {object} opts
 * @param {string} [opts.taskPrompt] - Task prompt for the subagent.
 * @param {string} [opts.role='executor'] - Agent role.
 * @param {number|string} [opts.providerId] - Provider ID.
 * @param {string} [opts.modelId] - Model ID.
 * @param {string} [opts.cwd] - Working directory.
 * @param {'smart_window'|'async_immediate'|'wait_until_done_or_stalled'} [opts.waitMode='smart_window']
 * @param {number} [opts.initialWaitMs=8000]
 * @param {number} [opts.stallTimeoutMs=15000]
 * @param {object} [deps={}]
 * @returns {Promise<object>}
 */
async function spawnSupervisedSubagent(opts = {}, deps = {}) {
  const {
    parentSessionId,
    taskPrompt = 'delegated task',
    role = 'explore',
    providerId = 'default',
    modelId = 'default',
    cwd = process.cwd(),
    waitMode = 'smart_window',
    initialWaitMs = 8000,
    stallTimeoutMs = 15000,
    extraContext,
    agentMode,
    tools,
  } = opts

  const db = deps.db
  const runToolLoop = deps.runToolLoop || (() => {
    try {
      return require('./toolLoop').runToolLoop
    } catch {
      return async () => ({ finalText: '' })
    }
  })()
  const notifyRenderer = deps.notifyRenderer || deps.onSubagentEvent

  const subagentId = `sub_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`
  const liveBuffer = new SubagentLiveBuffer(300)

  // Resolve Provider & Model
  const { provider, model } = resolveProviderAndModel(db, providerId, modelId, opts.provider, opts.model)

  // Resolve effective agentMode, role prompt, and tools
  const effectiveAgentMode = agentMode || getRoleDefaultMode(role, cwd) || 'auto'
  const roleSystemPrompt = buildRolePrompt(role, taskPrompt, cwd) ||
    `${SUBAGENT_SYSTEM_PROMPT}\n\n─── YOUR TASK ───\n${taskPrompt}`

  let resolvedTools = tools
  if (resolvedTools === undefined) {
    resolvedTools = resolveSubagentTools(role, cwd, effectiveAgentMode, db)
  } else if (Array.isArray(resolvedTools) && resolvedTools.length > 0 && typeof resolvedTools[0] === 'string') {
    try {
      const registry = require('../tools/registry')
      const full = registry.toolsPayload(effectiveAgentMode, { cacheStable: true, db })
      resolvedTools = full.filter((t) => resolvedTools.includes(t?.function?.name))
    } catch {
      resolvedTools = true
    }
  }

  const initialMessages = Array.isArray(opts.messages) && opts.messages.length > 0
    ? [...opts.messages]
    : [
        { role: 'system', content: roleSystemPrompt },
        { role: 'user', content: taskPrompt },
      ]

  // Create isolated child session if supported
  let childSessionId = null
  if (db && typeof db.createSession === 'function') {
    try {
      const res = db.createSession({
        title: `subagent: ${String(taskPrompt).slice(0, 50)}`,
        parentSessionId: parentSessionId || null,
        session_kind: 'subagent',
        cwd,
      })
      childSessionId = res?.lastInsertRowid || res
    } catch {}
  }

  const record = {
    subagentId,
    db: db || null,
    parentSessionId: parentSessionId || null,
    childSessionId,
    taskPrompt,
    role,
    providerId,
    modelId,
    provider,
    model,
    cwd,
    status: 'running',
    stallTimeoutMs,
    liveBuffer,
    abortController: new AbortController(),
    completedMessages: initialMessages,
    tools: resolvedTools,
    steeringQueue: [],
    swapHistory: [{ providerId, modelId, assignedAt: new Date().toISOString(), reason: 'initial_spawn' }],
    finalOutput: null,
    error: null,
    startedAt: Date.now(),
    completedAt: null,
    _executeLoop: null,
    _restartLoop: null,
  }

  pruneCompletedSubagents()
  activeSubagents.set(subagentId, record)

  const emitRenderer = (channel, payload) => {
    if (typeof notifyRenderer !== 'function') return
    try {
      if (notifyRenderer.length >= 2) {
        notifyRenderer(channel, payload)
      } else {
        notifyRenderer({ channel, ...payload })
      }
    } catch {}
  }

  const parentSignal = opts.parentSignal || deps.signal
  const requestPermission = opts.requestPermission || deps.requestPermission

  const startLoop = () => {
    const currentController = new AbortController()
    record.abortController = currentController
    record.status = 'running'
    record.liveBuffer.lastActivityAt = Date.now()

    let onParentAbort = null
    if (parentSignal) {
      if (parentSignal.aborted) {
        currentController.abort('USER_CANCELLED')
      } else {
        onParentAbort = () => {
          try { currentController.abort('USER_CANCELLED') } catch {}
        }
        parentSignal.addEventListener('abort', onParentAbort, { once: true })
      }
    }

    record.completionPromise = (async () => {
      try {
        const targetSessionId = childSessionId || subagentId
        const result = await runToolLoop({
          sessionId: targetSessionId,
          role: record.role,
          providerId: record.providerId,
          modelId: record.modelId,
          provider: record.provider,
          model: record.model,
          cwd: record.cwd,
          db: record.db,
          requestPermission,
          agentMode: effectiveAgentMode,
          signal: currentController.signal,
          messages: record.completedMessages,
          tools: record.tools,
          getPendingInjections: () => {
            try {
              const pending = steering.getPendingInjections(targetSessionId)
              if (pending && pending.length > 0) return pending
            } catch {}
            return record.steeringQueue.map((m) => m.content)
          },
          clearPendingInjections: () => {
            record.steeringQueue = []
            try {
              steering.getPendingInjections(targetSessionId)
            } catch {}
          },
          onThinkingDelta: (delta) => {
            if (delta) liveBuffer.appendStreamDelta('thinking', delta)
            emitRenderer('subagent:stream', { subagentId, type: 'thinking', delta })
          },
          onStreamDelta: (delta) => {
            if (delta) liveBuffer.appendStreamDelta('text', delta)
            emitRenderer('subagent:stream', { subagentId, type: 'text', delta })
          },
          onToolCall: (entry) => {
            if (entry && !entry.result && !entry.error) {
              liveBuffer.appendToolEvent('tool_call_start', entry)
            } else {
              liveBuffer.appendToolEvent('tool_result', entry)
            }
            emitRenderer('subagent:tool', { subagentId, tool: entry })
          },
          onTurnComplete: (msgs) => {
            record.completedMessages = Array.isArray(msgs) ? [...msgs] : record.completedMessages
            liveBuffer.recordTurnComplete()
          },
          onSubagentEvent: (evt) => {
            if (!evt) return
            if (evt.type === 'thinking_delta' || evt.type === 'thinking') {
              liveBuffer.appendStreamDelta('thinking', evt.delta || evt.content || '')
            } else if (evt.type === 'text_delta' || evt.type === 'text') {
              liveBuffer.appendStreamDelta('text', evt.delta || evt.content || '')
            } else if (evt.type === 'tool_call' || evt.type === 'tool_start') {
              liveBuffer.appendToolEvent('tool_call_start', evt)
            } else if (evt.type === 'tool_result' || evt.type === 'tool_end') {
              liveBuffer.appendToolEvent('tool_result', evt)
            }
            emitRenderer('agent:subagent-progress', { subagentId, ...evt })
          },
        })

        if (
          currentController.signal.aborted &&
          (currentController.signal.reason === 'HOT_SWAP_MODEL' ||
            currentController.signal.reason === 'HOT_SWAP_REQUESTED' ||
            (currentController.signal.reason && currentController.signal.reason.message === 'HOT_SWAP_REQUESTED'))
        ) {
          return // Hot swap in progress, managed by controlSubagent
        }

        record.status = 'completed'
        record.completedAt = Date.now()
        record.finalOutput = typeof result === 'string'
          ? result
          : (result?.finalText || result?.output || liveBuffer.accumulatedText)
        liveBuffer.recordTurnComplete()
      } catch (err) {
        if (
          currentController.signal.aborted &&
          (currentController.signal.reason === 'HOT_SWAP_MODEL' ||
            currentController.signal.reason === 'HOT_SWAP_REQUESTED' ||
            (currentController.signal.reason && currentController.signal.reason.message === 'HOT_SWAP_REQUESTED'))
        ) {
          return
        }

        if (
          currentController.signal.aborted &&
          (currentController.signal.reason === 'USER_CANCELLED' ||
            (currentController.signal.reason && currentController.signal.reason.message === 'USER_CANCELLED'))
        ) {
          record.status = 'cancelled'
          record.completedAt = Date.now()
          return
        }

        record.status = 'failed'
        record.completedAt = Date.now()
        record.error = String(err?.message || err)
      } finally {
        if (parentSignal && onParentAbort) {
          try { parentSignal.removeEventListener('abort', onParentAbort) } catch {}
        }
      }
    })()
    return record.completionPromise
  }

  record._restartLoop = startLoop
  startLoop()

  // Handle Wait Modes
  if (waitMode === 'async_immediate') {
    return formatSubagentReport(record, 'Launched asynchronously in background.')
  }

  const pollInterval = Math.min(25, Math.max(5, Math.floor(stallTimeoutMs / 4)))
  const maxWait = waitMode === 'smart_window'
    ? (opts.initialWaitMs || initialWaitMs || 8000)
    : (opts.maxWaitMs || opts.timeoutMs || 300000)
  const waitStart = Date.now()

  while (Date.now() - waitStart < maxWait) {
    if (record.status === 'completed' || record.status === 'failed' || record.status === 'cancelled') {
      return formatSubagentReport(record, `Finished with status: ${record.status}`)
    }
    const idleMs = Date.now() - record.liveBuffer.lastActivityAt
    if (idleMs >= stallTimeoutMs && !record.liveBuffer.currentTool) {
      record.status = 'stalled_suspected'
      return formatSubagentReport(record, `WARNING: Subagent has produced no tokens for ${idleMs}ms.`)
    }
    await new Promise((r) => setTimeout(r, pollInterval))
  }

  if (waitMode === 'wait_until_done_or_stalled') {
    record.status = 'stalled_suspected'
    return formatSubagentReport(record, `WARNING: Subagent wait timeout exceeded (${maxWait}ms).`)
  }

  return formatSubagentReport(record, 'Subagent actively streaming. Returning non-blockingly.')
}

/**
 * Non-blockingly inspects live stream buffers for one or more subagents.
 * Pure in-memory read, O(1), zero locks, zero disk I/O.
 * @param {object} opts
 * @param {string|string[]} [opts.subagentIds]
 * @param {number} [opts.fromSeq=0]
 * @param {number} [opts.tailCount=40]
 * @returns {Array<object>}
 */
function peekSubagentStream({ subagentIds, fromSeq = 0, tailCount = 40 } = {}) {
  let targetIds = []
  if (!subagentIds || subagentIds === '*') {
    targetIds = Array.from(activeSubagents.keys())
  } else if (Array.isArray(subagentIds)) {
    targetIds = subagentIds
  } else if (typeof subagentIds === 'string') {
    targetIds = [subagentIds]
  }

  return targetIds.map((id) => {
    const record = activeSubagents.get(id)
    if (!record) {
      return {
        subagentId: id,
        status: 'not_found',
        error: `No subagent found with id ${id}`,
      }
    }

    const idleMs = Date.now() - record.liveBuffer.lastActivityAt
    if (record.status === 'running' && idleMs >= record.stallTimeoutMs && !record.liveBuffer.currentTool) {
      record.status = 'stalled_suspected'
    }

    return formatSubagentReport(record, 'Live stream snapshot retrieved.', { fromSeq, tailCount })
  })
}

/**
 * Intervenes on an active subagent: hot_swap_model, steer, or cancel.
 * @param {object} opts
 * @param {string} opts.subagentId
 * @param {'hot_swap_model'|'steer'|'cancel'} opts.action
 * @param {number|string} [opts.newProviderId]
 * @param {string} [opts.newModelId]
 * @param {string} [opts.steeringMessage]
 * @param {boolean} [opts.preservePartialDraft=true]
 * @returns {Promise<object>}
 */
async function controlSubagent(opts = {}) {
  const {
    subagentId,
    action,
    newProviderId,
    newModelId,
    steeringMessage,
    preservePartialDraft = true,
  } = opts

  if (!subagentId) {
    return { ok: false, error: 'subagentId is required' }
  }

  const record = activeSubagents.get(subagentId)
  if (!record) {
    return { ok: false, error: `Subagent ${subagentId} not found.` }
  }

  if (action === 'cancel') {
    record.abortController.abort('USER_CANCELLED')
    record.status = 'cancelled'
    const report = formatSubagentReport(record, 'Subagent cancelled by parent agent.')
    return {
      ok: true,
      action: 'cancel',
      subagentId,
      status: 'cancelled',
      message: 'Subagent cancelled successfully.',
      ...report,
    }
  }

  if (action === 'steer') {
    if (!steeringMessage) {
      return { ok: false, error: 'steeringMessage is required when action="steer"' }
    }
    const steerContent = `[Parent Agent Live Steering Instruction]: ${steeringMessage}`
    record.steeringQueue.push({
      role: 'user',
      content: steerContent,
    })
    const targetSessionId = record.childSessionId || record.subagentId
    try {
      steering.steer(targetSessionId, steerContent, 'high')
    } catch {}
    record.liveBuffer.appendToolEvent('parent_steer', steeringMessage)
    const report = formatSubagentReport(record, 'Live steering instruction injected into subagent stream.')
    return {
      ok: true,
      action: 'steer',
      subagentId,
      status: record.status,
      message: 'Live steering instruction injected into subagent stream.',
      ...report,
    }
  }

  if (action === 'hot_swap_model') {
    if (!newProviderId || !newModelId) {
      return { ok: false, error: 'newProviderId and newModelId are required for hot_swap_model' }
    }

    const oldProvider = record.providerId
    const oldModel = record.modelId
    record.status = 'swapping_model'

    const prevPromise = record.completionPromise
    record.abortController.abort('HOT_SWAP_MODEL')
    if (prevPromise && typeof prevPromise.then === 'function') {
      await Promise.race([
        prevPromise.catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 50)),
      ])
    }

    const partialThinking = (record.liveBuffer.accumulatedThinking || '').slice(-3000)
    const partialText = (record.liveBuffer.accumulatedText || '').slice(-3000)

    const recoveryLines = [
      `[System Hot-Swap Recovery]: Swapped from (${oldProvider}/${oldModel}) to (${newProviderId}/${newModelId}).`,
      (preservePartialDraft && partialThinking) ? `Partial thinking:\n${partialThinking}` : '',
      (preservePartialDraft && partialText) ? `Partial text:\n${partialText}` : '',
      steeringMessage ? `Guidance: ${steeringMessage}` : '',
    ].filter(Boolean)

    if (recoveryLines.length > 1 || (preservePartialDraft && (partialThinking || partialText))) {
      record.completedMessages.push({
        role: 'user',
        content: recoveryLines.join('\n\n'),
      })
    }

    record.providerId = newProviderId
    record.modelId = newModelId

    // Re-resolve provider and model objects using database or fallback
    const targetDb = opts.db || record.db
    const resolved = resolveProviderAndModel(
      targetDb,
      newProviderId,
      newModelId,
      opts.newProvider,
      opts.newModel
    )
    record.provider = resolved.provider
    record.model = resolved.model

    record.swapHistory.push({
      from: `${oldProvider}/${oldModel}`,
      to: `${newProviderId}/${newModelId}`,
      fromProviderId: oldProvider,
      fromModelId: oldModel,
      toProviderId: newProviderId,
      toModelId: newModelId,
      swappedAt: new Date().toISOString(),
      reason: steeringMessage || 'parent_initiated_hot_swap',
    })
    record.liveBuffer.appendToolEvent('model_hot_swap', `Swapped to ${newProviderId}/${newModelId}`)

    if (typeof record._restartLoop === 'function') {
      record._restartLoop()
    }

    const report = formatSubagentReport(record, `Subagent successfully hot-swapped to ${newProviderId}/${newModelId}.`)
    return {
      ok: true,
      action: 'hot_swap_model',
      subagentId,
      status: record.status,
      providerId: newProviderId,
      modelId: newModelId,
      provider: record.provider,
      model: record.model,
      message: `Subagent successfully hot-swapped to ${newProviderId}/${newModelId}.`,
      ...report,
    }
  }

  return { ok: false, error: `Unknown action: ${action}` }
}

module.exports = {
  SubagentLiveBuffer,
  activeSubagents,
  formatSubagentReport,
  spawnSupervisedSubagent,
  peekSubagentStream,
  controlSubagent,
  resolveProviderAndModel,
  resolveSubagentTools,
}
