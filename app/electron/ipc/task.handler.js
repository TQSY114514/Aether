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



const { TASK_PROGRESS_TYPES } = require('../llm/eventTypes')

const PROGRESS_TYPES = new Set(TASK_PROGRESS_TYPES)

function stripRecord(record) {
  const { controller, emit, ...rest } = record
  return rest
}

function registerTaskHandlers(ipcMain, db, getWebContents) {
  const { startTask, cancelTask, pauseTask, resumeTask, listTasks, getTask, initBackgroundTasks, restorePendingTasks } = require('../llm/backgroundTasks');
  // Wire getWebContents into the TaskManager so dialog events (permission,
  // question) can reach the renderer even from detached task sessions.
  initBackgroundTasks({ getWebContents, db })

  // Resume tasks that were pending/running when the app last exited
  // (agent_task persistence; only re-dispatches when scheduler.queue is on).
  restorePendingTasks(db)

  // ── task:start ──────────────────────────────────────────────────────────
  ipcMain.handle('task:start', async (_e, { content, modelId, agentMode = 'ask', priority = 0, maxRetry = 2 }) => {
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
            // 后台任务完成 → 系统通知（仅当窗口不可见/最小化时, 不打扰前台用户）
            try {
              const { Notification } = require('electron')
              if (Notification.isSupported() && !wc.isFocused()) {
                const content = evt.payload && evt.payload.finalContent ? String(evt.payload.finalContent).slice(0, 80) : ''
                new Notification({
                  title: 'Aether 任务完成',
                  body: content || '后台任务已完成',
                  silent: true,
                }).show()
              }
            } catch {}
          } else if (evt.type === 'cancelled') {
            wc.send('task:cancelled', evt.payload)
          } else if (evt.type === 'error') {
            wc.send('task:error', evt.payload)
            try {
              const { Notification } = require('electron')
              if (Notification.isSupported() && !wc.isFocused()) {
                const errMsg = evt.payload && evt.payload.errorMsg ? String(evt.payload.errorMsg).slice(0, 80) : '任务失败'
                new Notification({
                  title: 'Aether 任务失败',
                  body: errMsg,
                  silent: true,
                }).show()
              }
            } catch {}
          }
        } catch {}
      }

      const result = await startTask({ db, parentSessionId: null, content, modelId, agentMode, priority, maxRetry, emit })

      // Notify the renderer immediately that a new task has been registered.
      const record = getTask(result.taskId, db)
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
    return listTasks(db)
  })

  // ── task:cancel ─────────────────────────────────────────────────────────
  ipcMain.handle('task:cancel', (_e, taskId) => {
    cancelTask(taskId)
    return { ok: true }
  })

  // ── task:pause ──────────────────────────────────────────────────────────
  // 暂停运行中的任务（下一迭代边界生效）。
  ipcMain.handle('task:pause', (_e, taskId) => {
    const ok = pauseTask(taskId)
    return { ok }
  })

  // ── task:resume ─────────────────────────────────────────────────────────
  // 恢复暂停的任务；也用于批准 plan 模式任务（plan → 执行）。
  ipcMain.handle('task:resume', (_e, taskId) => {
    const ok = resumeTask(taskId)
    return { ok }
  })

  // ── task:derive ─────────────────────────────────────────────────────────
  // CLI / 脚本从外部派生任务：不经窗口直接进 TaskEngine（同 task:start 语义，
  // 但来源标注为 'cli'，供权限弹窗/审计区分）。
  ipcMain.handle('task:derive', async (_e, { content, modelId, agentMode = 'ask', priority = 0, maxRetry = 2 }) => {
    try {
      const result = await startTask({
        db,
        parentSessionId: null,
        content,
        modelId,
        agentMode,
        priority,
        maxRetry,
        emit: () => {}, // CLI 自身从 NDJSON 流获取进度，桌面无需重推
      })
      return { taskId: result.taskId, sessionId: result.sessionId }
    } catch (e) {
      return { error: e.message || String(e) }
    }
  })

  // ── task:get-result ─────────────────────────────────────────────────────
  ipcMain.handle('task:get-result', (_e, taskId) => {
    const t = getTask(taskId, db)
    return t ? { status: t.status, finalContent: t.finalContent ?? null } : null
  })
}

module.exports = { registerTaskHandlers }
