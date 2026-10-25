// ───────────────────────────────────────────────────────────────────────────
// Aether Agent Browser IPC Handler
// Exposes agent browser status and session lifecycle to the renderer process.
// ───────────────────────────────────────────────────────────────────────────

const { getBrowserStatus, closeBrowserSession, executeBrowserAction } = require('../browser/agentBrowser')
const featureFlags = require('../featureFlags')

function registerBrowserHandlers(ipcMain, db) {
  ipcMain.handle('browser:status', (_e, sessionId) => {
    if (db && !featureFlags.isEnabled(db, 'agent.browser')) {
      return { active: false, disabled: true }
    }
    return getBrowserStatus(sessionId || 'default')
  })

  ipcMain.handle('browser:close', (_e, sessionId) => {
    return { success: closeBrowserSession(sessionId || 'default') }
  })

  ipcMain.handle('browser:action', async (_e, payload = {}) => {
    const sessionId = payload.sessionId || 'default'
    const args = payload.args || {}
    if (db && !featureFlags.isEnabled(db, 'agent.browser')) {
      return { success: false, error: 'agent.browser feature is disabled in settings' }
    }
    try {
      const result = await executeBrowserAction(sessionId, args, { db })
      return { success: true, result }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}

module.exports = { registerBrowserHandlers }
