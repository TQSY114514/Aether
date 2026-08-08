// ─────────────────────────────────────────────────────────────────────────────
// backgroundTasks.js  — Feature A TaskManager
//
// Runs user-initiated tasks in isolated child sessions via runToolLoop,
// detached from any chat turn. Progress is streamed via emit callbacks
// (which task.handler routes to task:progress IPC events).
//
// Statuses: 'pending' | 'running' | 'done' | 'cancelled' | 'error'
//
// Two modes (driven by the `scheduler.queue` feature flag):
//   - queue OFF (default):  tasks run immediately, capped at MAX_CONCURRENT
//     running tasks (startTask throws when the cap is hit — legacy behavior).
//   - queue ON: tasks are enqueued with a priority (higher first), a retry
//     budget (maxRetry), and are persisted to the agent_task table so they
//     survive app restarts. restorePendingTasks() resumes pending/running
//     tasks on boot.
//
// Every task also writes a row to agent_task (status/result/attempts) so the
// task history panel can list past tasks after a restart.
// ─────────────────────────────────────────────────────────────────────────────

const { runToolLoop: defaultRunToolLoop } = require('./toolLoop')
const { createAllowRulesStore, buildToolLoopCallbacks } = require('../ipc/toolLoopCallbacks')
const featureFlags = require('../featureFlags')
const log = require('../logger')

const MAX_CONCURRENT_TASKS = 3
const tasks = new Map()  // taskId (number, = agent_task row id) → record
let _db = null            // injected lazily by startTask/restorePendingTasks

// Module-level allow-rules store shared by all background tasks.
// Rules are keyed per child-sessionId so each task is isolated.
const taskAllowRules = createAllowRulesStore()

// Injected by initBackgroundTasks — provides access to the main BrowserWindow
// webContents so permission/question dialog events reach the global renderer.
let _getWebContents = () => null

// Dependency injection point: tests override runToolLoop; production keeps
// the real toolLoop (same shape as the ExecutionBackend plugin contract).
let _runToolLoop = defaultRunToolLoop

function initBackgroundTasks({ getWebContents, db, runToolLoop }) {
  _getWebContents = getWebContents
  if (db) _db = db
  if (typeof runToolLoop === 'function') _runToolLoop = runToolLoop
}

// ─── Internal helpers ─────────────────────────────────────────────────────

function queueModeEnabled() {
  try { return !!_db && featureFlags.isEnabled(_db, 'scheduler.queue') } catch { return false }
}

function stripRecord(record) {
  // Remove internal-only fields before sending to renderer.
  const { controller, emit, ...rest } = record
  return rest
}

function persist(record) {
  if (!_db || !record?.rowId) return
  try {
    _db.updateAgentTask(record.rowId, {
      status: record.status,
      error: record.error ?? null,
      result: record.finalContent ?? null,
      attempts: record.attempts,
      max_retry: record.maxRetry,
    })
  } catch (err) { log.warn(`backgroundTasks: persist failed: ${err.message}`) }
}

// Channel → task:progress `type` mapping for progress events.
const CHANNEL_TO_TYPE = {
  'chat:tool-call':   'tool-call',
  'chat:plan-step':   'plan-step',
  'chat:status':      'status',
  'chat:todo-update': 'todo-update',
  'chat:tool-stream': 'chunk',
}
// Dialog/thinking channels that must reach the renderer directly.
const DIALOG_CHANNELS = new Set([
  'chat:permission-request',
  'chat:question',
  'chat:permission-expired',
  'chat:question-expired',
  'chat:thinking-start',
  'chat:thinking-end',
])

const noopEmit = () => {}

// Build the send adapter that maps toolLoop channels to task:progress events.
function buildSendAdapter(record) {
  return function sendAdapter(channel, payload) {
    const type = CHANNEL_TO_TYPE[channel]
    if (type) {
      let mappedPayload
      switch (channel) {
        case 'chat:tool-call':   mappedPayload = payload.tool;                               break
        case 'chat:plan-step':   mappedPayload = payload.step;                               break
        case 'chat:status':      mappedPayload = { text: payload.text, kind: payload.kind }; break
        case 'chat:todo-update': mappedPayload = payload.todos;                              break
        case 'chat:tool-stream': mappedPayload = { text: payload.text, done: payload.done }; break
        default:                 mappedPayload = payload
      }
      try { record.emit(record.id, { type, payload: mappedPayload }) } catch {}
    } else if (DIALOG_CHANNELS.has(channel)) {
      // Permission/question dialogs must reach the global renderer so the user
      // can approve from any screen. Augment with the child sessionId so the
      // UI can label it as a background task.
      try {
        const wc = _getWebContents()
        if (wc && !wc.isDestroyed()) wc.send(channel, { ...payload, sessionId: record.sessionId })
      } catch {}
    }
  }
}

/** running count (used by both queue and legacy paths). */
function runningCount() {
  let n = 0
  for (const t of tasks.values()) if (t.status === 'running') n++
  return n
}

// ─── Scheduler (queue mode) ───────────────────────────────────────────────

let _dispatching = false

/**
 * Pick the highest-priority pending task and start it while the concurrency
 * cap allows. Called after every state change that frees a slot.
 */
async function maybeDispatch() {
  if (_dispatching) return
  _dispatching = true
  try {
    while (runningCount() < MAX_CONCURRENT_TASKS) {
      const pending = Array.from(tasks.values()).filter(t => t.status === 'pending')
      if (!pending.length) break
      // Higher priority first; ties go to the older task.
      pending.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
      const t = pending[0]
      t.status = 'running'
      persist(t)
      runTask(t)
    }
  } finally {
    _dispatching = false
  }
}

// ─── Task execution ───────────────────────────────────────────────────────

/**
 * Actually run the tool loop for a task record. Called from maybeDispatch
 * (queue mode) or directly from startTask (legacy mode). Resolves when the
 * run finishes; status + DB are updated and the next queued task is released.
 */
async function runTask(record) {
  const db = record.db || _db
  const { id, sessionId, content, agentMode, emit } = record

  const sendAdapter = buildSendAdapter(record)

  if (record._reentry) return // defensive: no double-run
  record._reentry = true

  // ── Resolve model / provider each run (may have been deleted meanwhile) ──
  const model    = db.getModel(record.modelId)
  const provider = model ? db.getProvider(model.provider_id) : null
  if (!model || !provider) {
    const errMsg = !model ? '模型未找到' : '供应商未找到'
    record.status = 'error'
    record.error = errMsg
    persist(record)
    emit(id, { type: 'error', payload: { taskId: id, error: errMsg } })
    maybeDispatch()
    return
  }

  // ── Create the initial (empty) assistant message row ─────────────────────
  let msgId
  try {
    const asstMsg = db.addMessage({ session_id: sessionId, role: 'assistant', content: '', status: 'success' })
    msgId = Number(asstMsg?.lastInsertRowid ?? asstMsg)
  } catch (e) {
    record.status = 'error'
    record.error = `failed to create assistant message: ${e.message}`
    persist(record)
    emit(id, { type: 'error', payload: { taskId: id, error: record.error } })
    maybeDispatch()
    return
  }

  const controller = new AbortController()
  record.controller = controller

  let finalContent = ''
  try {
    const cb = buildToolLoopCallbacks({
      db,
      send: sendAdapter,
      getWc: () => { const w = _getWebContents(); return w && !w.isDestroyed() ? w : null },
      sessionId,
      msgId,
      controller,
      source: 'task',
      allowRules: taskAllowRules,
      thinkingSupported: false,
    })

    finalContent = await _runToolLoop({
      provider,
      model,
      messages: [{ role: 'user', content }],
      tools: true,
      signal: controller.signal,
      agentMode: record.agentMode,
      maxIterations: 25,
      sessionId,
      messageId: msgId,
      db,
      autoCommit: false,
      ...cb,
    })

    // ── Success ──────────────────────────────────────────────────────────
    try { db.updateMessage(msgId, { content: finalContent, status: 'success' }) } catch {}
    record.status       = 'done'
    record.finalContent = finalContent
    record.controller   = null
    persist(record)
    emit(id, { type: 'done', payload: { taskId: id, sessionId, finalContent } })

  } catch (err) {
    record.controller = null
    if (err.name === 'AbortError') {
      // ── Cancelled ────────────────────────────────────────────────────
      try { db.updateMessage(msgId, { content: finalContent ?? '', status: 'aborted' }) } catch {}
      record.status = 'cancelled'
      persist(record)
      emit(id, { type: 'cancelled', payload: { taskId: id } })
    } else {
      // ── Error — retryable while the budget remains ────────────────────
      const errMsg = err.message || String(err)
      record.attempts += 1
      if (record.attempts < record.maxRetry) {
        record.status = 'pending'
        record.error = errMsg
        record._reentry = false // allow the retry runTask to enter
        persist(record)
        emit(id, { type: 'status', payload: { text: `自动重试 (${record.attempts}/${record.maxRetry})`, kind: 'info' } })
        maybeDispatch()
        return
      }
      record.error = errMsg
      record.status = 'error'
      persist(record)
      try { db.updateMessage(msgId, { content: finalContent ?? '', status: 'error', error_message: errMsg }) } catch {}
      emit(id, { type: 'error', payload: { taskId: id, error: errMsg } })
    }
  }

  maybeDispatch()
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Start a new background task in an isolated child session.
 *
 * @param {object}   opts
 * @param {object}   opts.db              database handle
 * @param {number}   [opts.parentSessionId] (informational, not used in child)
 * @param {string}   opts.content         user request text
 * @param {number}   opts.modelId         model to run
 * @param {string}   [opts.agentMode]     'ask'|'auto'|'yolo' etc. (default 'ask')
 * @param {number}   [opts.priority]      queue priority, higher runs first (default 0)
 * @param {number}   [opts.maxRetry]      retry budget (default 2)
 * @param {function} opts.emit            (taskId, { type, payload }) → void
 * @returns {Promise<{ taskId: number, sessionId: number }>}
 */
async function startTask({ db, parentSessionId, content, modelId, agentMode = 'ask', priority = 0, maxRetry = 2, emit }) {
  _db = db

  const queueOn = queueModeEnabled()

  // ── Concurrency guard (legacy mode only; queue mode enqueues instead) ──
  if (!queueOn && runningCount() >= MAX_CONCURRENT_TASKS) {
    throw new Error('已达最大并发任务数')
  }

  const title     = `任务: ${content.slice(0, 30)}`

  // ── Create child session + task row (row id becomes the task id) ────────
  let childSessionId
  try {
    const result = db.createSession({ title, persona_id: null })
    childSessionId = result?.lastInsertRowid || result
  } catch (e) {
    throw new Error(`startTask: failed to create child session: ${e.message}`)
  }
  db.addMessage({ session_id: childSessionId, role: 'user', content })

  const rowId = db.createAgentTask({
    session_id: childSessionId,
    title,
    content,
    model_id: modelId,
    agent_mode: agentMode,
    priority,
    max_retry: maxRetry,
  })

  const record = {
    id: rowId,
    rowId,
    db,
    sessionId: childSessionId,
    status: queueOn ? 'pending' : 'running',
    title,
    content,
    modelId,
    agentMode,
    priority,
    maxRetry,
    attempts: 0,
    createdAt: Date.now(),
    finalContent: null,
    error: null,
    controller: null,
    emit,
  }
  tasks.set(rowId, record)
  persist(record) // row starts as 'pending' in DB — reflect the true state

  if (queueOn) {
    maybeDispatch()
  } else {
    runTask(record)
  }

  return { taskId: rowId, sessionId: childSessionId }
}

/**
 * Abort a running task (or a pending one — it is cancelled directly).
 * The running task's catch block handles status update and the
 * 'cancelled' emit.
 */
function cancelTask(taskId) {
  const t = tasks.get(taskId)
  if (!t) return
  if (t.status === 'running' && t.controller) {
    try { t.controller.abort() } catch {}
  } else if (t.status === 'pending') {
    t.status = 'cancelled'
    persist(t)
    try { t.emit(taskId, { type: 'cancelled', payload: { taskId } }) } catch {}
  }
}

/**
 * List all tasks, newest first, with internal-only fields stripped.
 * Merges the in-memory map with persisted rows (for history across restarts).
 */
function listTasks(db) {
  const out = Array.from(tasks.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(stripRecord)

  const seen = new Set(out.map(t => t.id))
  const rows = (db && typeof db.listAgentTasks === 'function') ? (db.listAgentTasks(200) || []) : []
  for (const r of rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push({
      id: r.id,
      sessionId: r.session_id,
      status: r.status,
      title: r.title,
      content: r.content,
      priority: r.priority,
      attempts: r.attempts,
      maxRetry: r.max_retry,
      createdAt: new Date(r.created_at).getTime(),
      finalContent: r.result,
      error: r.error,
    })
  }
  return out
}

/**
 * Get a single task record (raw, includes controller/emit — for internal use),
 * falling back to the persisted row after a restart.
 */
function getTask(taskId, db) {
  const t = tasks.get(taskId)
  if (t) return t
  if (db && typeof db.getAgentTask === 'function') {
    const r = db.getAgentTask(taskId)
    if (r) return {
      id: r.id, sessionId: r.session_id, status: r.status, title: r.title,
      content: r.content, modelId: r.model_id, agentMode: r.agent_mode,
      priority: r.priority, attempts: r.attempts, maxRetry: r.max_retry,
      createdAt: new Date(r.created_at).getTime(),
      finalContent: r.result, error: r.error, controller: null, emit: noopEmit,
    }
  }
  return null
}

/**
 * Rehydrate pending/running tasks from the agent_task table (crash-safe):
 * anything not finished is reset to pending and re-scheduled if the queue
 * flag is on. Call after the DB is open, before the first list.
 */
function restorePendingTasks(db) {
  if (!db || typeof db.listAgentTasks !== 'function') return
  _db = db
  let resumed = 0
  for (const r of (db.listAgentTasks(200) || [])) {
    if (r.status !== 'pending' && r.status !== 'running') continue
    if (tasks.has(r.id)) continue
    tasks.set(r.id, {
      id: r.id,
      rowId: r.id,
      db,
      sessionId: r.session_id,
      status: 'pending',
      title: r.title,
      content: r.content,
      modelId: r.model_id,
      agentMode: r.agent_mode || 'ask',
      priority: r.priority,
      maxRetry: Math.max(r.max_retry, 1),
      attempts: r.attempts,
      createdAt: new Date(r.created_at).getTime(),
      finalContent: r.result,
      error: r.error,
      controller: null,
      emit: noopEmit,
    })
    resumed++
  }
  if (resumed) log.info(`backgroundTasks: resumed ${resumed} task(s) from persistence`)
  if (queueModeEnabled()) maybeDispatch()
}

module.exports = {
  startTask,
  cancelTask,
  listTasks,
  getTask,
  restorePendingTasks,
  MAX_CONCURRENT_TASKS,
  initBackgroundTasks,
}