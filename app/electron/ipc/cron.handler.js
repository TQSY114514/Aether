// ─────────────────────────────────────────────────────────────────────────────
// Cron IPC handlers — expose scheduler status and manual triggers to the UI.
//
// Namespaces:
//   cron:list / cron:run-now        → built-in scheduler tasks
//   cron:tasks:list/add/remove/runNow → user-configurable scheduled tasks
//                        (Task 4.3: daily code review, dependency check, backup)
// ─────────────────────────────────────────────────────────────────────────────

function registerCronHandlers(ipcMain, db) {
  // ── Built-in tasks ──
  ipcMain.handle('cron:list', () => {
    return require('../cron/scheduler').listTasks()
  })

  ipcMain.handle('cron:run-now', (_e, name) => {
    return require('../cron/scheduler').runNow(name)
  })

  // ── User-configurable scheduled tasks ──
  ipcMain.handle('cron:tasks:list', () => {
    const tasks = db.getScheduledTasks()
    const running = new Map(require('../cron/scheduler').listUserTasks().map(t => [Number(t.id), t.running]))
    return tasks.map(t => ({ ...t, running: !!running.get(Number(t.id)) }))
  })

  ipcMain.handle('cron:tasks:add', (_e, data) => {
    const { name, type, intervalMs, enabled = true, config = {} } = data || {}
    if (!name || !type || !intervalMs || intervalMs < 60000) {
      return { ok: false, error: 'name, type and intervalMs (>= 60000ms) are required' }
    }
    if (!require('../cron/scheduler').USER_TASK_TYPES[type]) {
      return { ok: false, error: `unknown task type: ${type}` }
    }
    const info = db.addScheduledTask({ name, type, interval_ms: intervalMs, enabled, config })
    const id = info.lastInsertRowid
    if (enabled) {
      const task = db.getScheduledTask(id)
      require('../cron/scheduler').registerUserTask(task)
    }
    return { ok: true, id }
  })

  ipcMain.handle('cron:tasks:remove', (_e, id) => {
    const task = db.getScheduledTask(id)
    if (!task) return { ok: false, error: 'task not found' }
    require('../cron/scheduler').removeUserTask(id)
    db.deleteScheduledTask(id)
    return { ok: true }
  })

  ipcMain.handle('cron:tasks:runNow', (_e, id) => {
    const task = db.getScheduledTask(id)
    if (!task) return { ok: false, error: 'task not found' }
    // Ensure it's registered so the manual trigger works even if disabled.
    if (!task.enabled) require('../cron/scheduler').registerUserTask(task)
    const started = require('../cron/scheduler').runUserTaskNow(id)
    return { ok: started }
  })
}

module.exports = { registerCronHandlers }