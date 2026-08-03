// ─────────────────────────────────────────────────────────────────────────────
// backgroundTasks.js  — Feature A TaskManager
//
// Runs user-initiated tasks in isolated child sessions via runToolLoop,
// detached from any chat turn. Progress is streamed via emit callbacks
// (which task.handler routes to task:progress IPC events). Capped at
// MAX_CONCURRENT_TASKS = 3. Memory-only; tasks do NOT persist across restarts.
// ─────────────────────────────────────────────────────────────────────────────

const { runToolLoop } = require('./toolLoop')
const { createAllowRulesStore, buildToolLoopCallbacks } = require('../ipc/toolLoopCallbacks')
const log = require('../logger')

const MAX_CONCURRENT_TASKS = 3
const tasks = new Map()  // taskId (number) → record
let nextTaskId = 1

// Module-level allow-rules store shared by all background tasks.
// Rules are keyed per child-sessionId so each task is isolated.
const taskAllowRules = createAllowRulesStore()

// Injected by initBackgroundTasks — provides access to the main BrowserWindow
// webContents so permission/question dialog events reach the global renderer.
let _getWebContents = () => null

function initBackgroundTasks({ getWebContents }) {
  _getWebContents = getWebContents
}

// ─── Internal helpers ─────────────────────────────────────────────────────

function stripRecord(record) {
  // Remove internal-only fields before sending to renderer.
  const { controller, emit, ...rest } = record
  return rest
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
 * @param {function} opts.emit            (taskId, { type, payload }) → void
 * @returns {Promise<{ taskId: number, sessionId: number }>}
 */
async function startTask({ db, parentSessionId, content, modelId, agentMode = 'ask', emit }) {
  // ── Concurrent-tasks guard ───────────────────────────────────────────────
  const running = Array.from(tasks.values()).filter(t => t.status === 'running').length
  if (running >= MAX_CONCURRENT_TASKS) {
    throw new Error('已达最大并发任务数')
  }

  const id        = nextTaskId++
  const createdAt = Date.now()
  const title     = `任务: ${content.slice(0, 30)}`

  // ── Create child session ─────────────────────────────────────────────────
  let childSessionId
  try {
    const result = db.createSession({ title, persona_id: null })
    childSessionId = result?.lastInsertRowid || result
  } catch (e) {
    throw new Error(`startTask: failed to create child session: ${e.message}`)
  }

  // Add the user request as a message in the child session.
  db.addMessage({ session_id: childSessionId, role: 'user', content })

  // ── Resolve model / provider ─────────────────────────────────────────────
  const model    = db.getModel(modelId)
  const provider = model ? db.getProvider(model.provider_id) : null

  if (!model || !provider) {
    const errMsg = !model ? '模型未找到' : '供应商未找到'
    const record = {
      id, sessionId: childSessionId, status: 'error', title, createdAt,
      finalContent: null, error: errMsg, controller: null, emit,
    }
    tasks.set(id, record)
    emit(id, { type: 'error', payload: { taskId: id, error: errMsg } })
    return { taskId: id, sessionId: childSessionId }
  }

  // ── Create the initial (empty) assistant message row ─────────────────────
  const asstMsg = db.addMessage({ session_id: childSessionId, role: 'assistant', content: '', status: 'success' })
  const msgId   = Number(asstMsg?.lastInsertRowid ?? asstMsg)

  const controller = new AbortController()

  const record = {
    id, sessionId: childSessionId, status: 'running', title, createdAt,
    finalContent: null, error: null, controller, emit,
  }
  tasks.set(id, record)

  // ── Build the send adapter ────────────────────────────────────────────────
  // Progress channels  → emit(taskId, { type, payload })
  // Dialog channels    → forward to renderer with augmented sessionId
  function sendAdapter(channel, payload) {
    const type = CHANNEL_TO_TYPE[channel]
    if (type) {
      // Map the channel payload to the task:progress payload shape.
      let mappedPayload
      switch (channel) {
        case 'chat:tool-call':   mappedPayload = payload.tool;                               break
        case 'chat:plan-step':   mappedPayload = payload.step;                               break
        case 'chat:status':      mappedPayload = { text: payload.text, kind: payload.kind }; break
        case 'chat:todo-update': mappedPayload = payload.todos;                              break
        case 'chat:tool-stream': mappedPayload = { text: payload.text, done: payload.done }; break
        default:                 mappedPayload = payload
      }
      try { emit(id, { type, payload: mappedPayload }) } catch {}
    } else if (DIALOG_CHANNELS.has(channel)) {
      // Permission/question dialogs must reach the global renderer so the user
      // can approve from any screen. Augment with the child sessionId so the
      // UI can label it as a background task.
      try {
        const wc = _getWebContents()
        if (wc && !wc.isDestroyed()) wc.send(channel, { ...payload, sessionId: childSessionId })
      } catch {}
    }
  }

  // ── Run the tool loop asynchronously ─────────────────────────────────────
  ;(async () => {
    let finalContent = ''
    try {
      const cb = buildToolLoopCallbacks({
        db,
        send: sendAdapter,
        getWc: () => { const w = _getWebContents(); return w && !w.isDestroyed() ? w : null },
        sessionId: childSessionId,
        msgId,
        controller,
        source: 'task',
        allowRules: taskAllowRules,
        thinkingSupported: false,
      })

      finalContent = await runToolLoop({
        provider,
        model,
        messages: [{ role: 'user', content }],
        tools: true,
        signal: controller.signal,
        agentMode,
        maxIterations: 25,
        sessionId: childSessionId,
        messageId: msgId,
        db,
        autoCommit: false,
        ...cb,
      })

      // ── Success ──────────────────────────────────────────────────────────
      try { db.updateMessage(msgId, { content: finalContent, status: 'success' }) } catch {}
      record.status       = 'done'
      record.finalContent = finalContent
      emit(id, { type: 'done', payload: { taskId: id, sessionId: childSessionId, finalContent } })

    } catch (err) {
      if (err.name === 'AbortError') {
        // ── Cancelled ────────────────────────────────────────────────────
        try { db.updateMessage(msgId, { content: finalContent ?? '', status: 'aborted' }) } catch {}
        record.status = 'cancelled'
        emit(id, { type: 'cancelled', payload: { taskId: id } })
      } else {
        // ── Error ────────────────────────────────────────────────────────
        const errMsg = err.message || String(err)
        record.status = 'error'
        record.error  = errMsg
        try { db.updateMessage(msgId, { content: finalContent ?? '', status: 'error', error_message: errMsg }) } catch {}
        emit(id, { type: 'error', payload: { taskId: id, error: errMsg } })
      }
    }
  })()

  return { taskId: id, sessionId: childSessionId }
}

/**
 * Abort a running task. The async IIFE's catch block handles status update
 * and the 'cancelled' emit.
 */
function cancelTask(taskId) {
  const t = tasks.get(taskId)
  if (t && t.status === 'running' && t.controller) {
    try { t.controller.abort() } catch {}
  }
}

/**
 * List all tasks, newest first, with internal-only fields stripped.
 */
function listTasks() {
  return Array.from(tasks.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(stripRecord)
}

/**
 * Get a single task record (raw, includes controller/emit — for internal use).
 */
function getTask(taskId) {
  return tasks.get(taskId) || null
}

module.exports = {
  startTask,
  cancelTask,
  listTasks,
  getTask,
  MAX_CONCURRENT_TASKS,
  initBackgroundTasks,
}
