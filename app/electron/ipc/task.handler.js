// ─────────────────────────────────────────────────────────────────────────────
// task.handler.js  — IPC bridge for Feature A background task system
//
// Channels (FROZEN — sibling UI agent depends on exact names + payloads):
//   Invoke:  task:start  task:list  task:cancel  task:get-result
//   Push:    task:started  task:progress  task:done  task:cancelled  task:error
//
// Payload shapes:
//   task:started  →  TaskInfo { id, sessionId, status, title, createdAt, finalContent?, error? }
//   task:progress →  { taskId, type: 'tool-call'|'plan-step'|'status'|'todo-update'|'chunk', payload: any }
//   task:done     →  { taskId, sessionId, finalContent }
//   task:cancelled→  { taskId }
//   task:error    →  { taskId, error }
// ─────────────────────────────────────────────────────────────────────────────

const {
  startTask,
  cancelTask,
  listTasks,
  getTask,
  initBackgroundTasks,
} = require('../llm/backgroundTasks')

const PROGRESS_TYPES = new Set(['tool-call', 'plan-step', 'status', 'todo-update', 'chunk'])

function stripRecord(record) {
  const { controller, emit, ...rest } = record
  return rest
}

function registerTaskHandlers(ipcMain, db, getWebContents) {
  // Wire getWebContents into the TaskManager so dialog events (permission,
  // question) can reach the renderer even from detached task sessions.
  initBackgroundTasks({ getWebContents })

  // ── task:start ──────────────────────────────────────────────────────────
  ipcMain.handle('task:start', async (_e, { content, modelId, agentMode = 'ask' }) => {
    try {
      if (!content || typeof content !== 'string' || !content.trim()) {
        return { error: '无效的任务内容' }
      }
      if (!modelId) {
        return { error: '未指定模型' }
      }

      // Per-task emit: routes events to the renderer via task:progress / terminal channels.
      const emit = (taskId, evt) => {
        try {
          const wc = getWebContents()
          if (!wc || wc.isDestroyed()) return
          if (PROGRESS_TYPES.has(evt.type)) {
            wc.send('task:progress', { taskId, type: evt.type, payload: evt.payload })
          } else if (evt.type === 'done') {
            wc.send('task:done', evt.payload)
          } else if (evt.type === 'cancelled') {
            wc.send('task:cancelled', evt.payload)
          } else if (evt.type === 'error') {
            wc.send('task:error', evt.payload)
          }
        } catch {}
      }

      const result = await startTask({ db, parentSessionId: null, content, modelId, agentMode, emit })

      // Notify the renderer immediately that a new task has been registered.
      const record = getTask(result.taskId)
      if (record) {
        try {
          const wc = getWebContents()
          if (wc && !wc.isDestroyed()) wc.send('task:started', stripRecord(record))
        } catch {}
      }

      return { taskId: result.taskId, sessionId: result.sessionId }
    } catch (e) {
      return { error: e.message || String(e) }
    }
  })

  // ── task:list ───────────────────────────────────────────────────────────
  ipcMain.handle('task:list', () => {
    return listTasks()
  })

  // ── task:cancel ─────────────────────────────────────────────────────────
  ipcMain.handle('task:cancel', (_e, taskId) => {
    cancelTask(taskId)
    return { ok: true }
  })

  // ── task:get-result ─────────────────────────────────────────────────────
  ipcMain.handle('task:get-result', (_e, taskId) => {
    const t = getTask(taskId)
    return t ? { status: t.status, finalContent: t.finalContent ?? null } : null
  })
}

module.exports = { registerTaskHandlers }
