// Usage-stats IPC: exposes the usage_log aggregates + raw log + breakdowns to
// the TokenPage. All calls accept an optional { since, until } ISO range so the
// page can offer a time-range picker (today / 7d / 30d / all).
const auditLog = require('../llm/auditLog')

function registerUsageHandlers(ipcMain, db) {
  auditLog.setDb(db)
  ipcMain.handle('usage:stats', (_e, range) => db.getUsageStats(range || {}))
  ipcMain.handle('usage:by-provider', (_e, range) => db.getUsageByProvider(range || {}))
  ipcMain.handle('usage:by-model', (_e, range) => db.getUsageByModel(range || {}))
  ipcMain.handle('usage:daily', (_e, range) => db.getUsageDaily(range || {}))
  ipcMain.handle('usage:log', (_e, range) => db.getUsageLog(range || {}))

  // Tool-loop observability (see llm/toolLoopMetrics.js). Lazy-required and
  // DB-guarded so these never throw for an empty/unavailable table.
  ipcMain.handle('usage:tool-loop-summary', (_e, limit) => {
    try { return require('../llm/toolLoopMetrics').summary(limit || 50) } catch { return null }
  })
  ipcMain.handle('usage:tool-loop-recent', (_e, limit) => {
    try { return require('../llm/toolLoopMetrics').recentRuns(limit || 20) } catch { return [] }
  })
  ipcMain.handle('usage:tool-loop-by-tool', (_e, limit) => {
    try { return require('../llm/toolLoopMetrics').byTool(limit || 50) } catch { return [] }
  })

  // Agent audit log (see llm/auditLog.js). Non-throwing — the sidebar's Agent
  // History view degrades to an empty state when the table is unavailable.
  ipcMain.handle('usage:agent-history', (_e, sessionId, limit) => {
    try { return auditLog.getRecent(sessionId, limit || 50) } catch { return [] }
  })
  ipcMain.handle('usage:agent-stats', (_e, sessionId) => {
    try { return auditLog.getStats(sessionId) } catch { return { turns: 0, totalToolCalls: 0, avgLatencyMs: 0 } }
  })
}

module.exports = { registerUsageHandlers }
