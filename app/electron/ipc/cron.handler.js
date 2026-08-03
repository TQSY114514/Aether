// ─────────────────────────────────────────────────────────────────────────────
// Cron IPC handlers — expose scheduler status and manual triggers to the UI.
// ─────────────────────────────────────────────────────────────────────────────

const scheduler = require('../cron/scheduler')

function registerCronHandlers(ipcMain) {
  ipcMain.handle('cron:list', () => {
    return scheduler.listTasks()
  })

  ipcMain.handle('cron:run-now', (_e, name) => {
    return scheduler.runNow(name)
  })
}

module.exports = { registerCronHandlers }