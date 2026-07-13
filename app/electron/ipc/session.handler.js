const { clearAllowRules } = require('./chat.handler')

function registerSessionHandlers(ipcMain, db) {
  ipcMain.handle('session:list', () => db.getSessions())
  ipcMain.handle('session:create', (_e, data) => db.createSession(data))
  ipcMain.handle('session:rename', (_e, id, title) => db.renameSession(id, title))
  ipcMain.handle('session:pin', (_e, id, pinned) => db.pinSession(id, pinned))
  ipcMain.handle('session:delete', (_e, id) => {
    db.deleteSession(id)
    // Drop the session's permission allow-rules so they don't leak.
    try { clearAllowRules(id) } catch {}
  })
  ipcMain.handle('session:touch', (_e, id) => db.touchSession(id))
  ipcMain.handle('session:get-config', (_e, id) => db.getSessionConfig(id))
  ipcMain.handle('session:set-config', (_e, id, config) => db.setSessionConfig(id, config))
  ipcMain.handle('message:list', (_e, sessionId) => db.getMessages(sessionId))
}

module.exports = { registerSessionHandlers }
