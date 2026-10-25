// ───────────────────────────────────────────────────────────────────────────
// Aether Agent Browser IPC Handler
// Exposes agent browser status and session lifecycle to the renderer process.
// ───────────────────────────────────────────────────────────────────────────

const { getBrowserStatus, closeBrowserSession, executeBrowserAction } = require('../browser/agentBrowser')

function registerBrowserHandlers(ipcMain) {
  ipcMain.handle('browser:status', (_e, sessionId) => {
    return getBrowserStatus(sessionId || 'default')
  })

  ipcMain.handle('browser:close', (_e, sessionId) => {
    return { success: closeBrowserSession(sessionId || 'default') }
  })

  ipcMain.handle('browser:action', async (_e, payload = {}) => {
    const sessionId = payload.sessionId || 'default'
    const args = payload.args || {}
    try {
      const result = await executeBrowserAction(sessionId, args)
      return { success: true, result }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}

module.exports = { registerBrowserHandlers }
