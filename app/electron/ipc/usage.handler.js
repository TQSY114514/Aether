// Usage-stats IPC: exposes the usage_log aggregates + raw log + breakdowns to
// the TokenPage. All calls accept an optional { since, until } ISO range so the
// page can offer a time-range picker (today / 7d / 30d / all).
function registerUsageHandlers(ipcMain, db) {
  ipcMain.handle('usage:stats', (_e, range) => db.getUsageStats(range || {}))
  ipcMain.handle('usage:by-provider', (_e, range) => db.getUsageByProvider(range || {}))
  ipcMain.handle('usage:by-model', (_e, range) => db.getUsageByModel(range || {}))
  ipcMain.handle('usage:daily', (_e, range) => db.getUsageDaily(range || {}))
  ipcMain.handle('usage:log', (_e, range) => db.getUsageLog(range || {}))
}

module.exports = { registerUsageHandlers }
