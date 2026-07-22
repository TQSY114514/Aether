const { clearAllowRules } = require('./chat.handler')

function registerSessionHandlers(ipcMain, db) {
  ipcMain.handle('session:list', () => {
    // Prune before returning so the sidebar never sees empty sessions,
    // regardless of startup race between pruneEmptySessions and loadSessions.
    try { db.pruneEmptySessions() } catch {}
    return db.getSessions()
  })
  ipcMain.handle('session:create', (_e, data) => db.createSession(data))
  ipcMain.handle('session:rename', (_e, id, title) => db.renameSession(id, title))
  ipcMain.handle('session:pin', (_e, id, pinned) => db.pinSession(id, pinned))
  ipcMain.handle('session:delete', (_e, id) => {
    db.deleteSession(id)
    try { clearAllowRules(id) } catch {}
  })
  ipcMain.handle('session:touch', (_e, id) => db.touchSession(id))
  ipcMain.handle('session:get-config', (_e, id) => db.getSessionConfig(id))
  ipcMain.handle('session:set-config', (_e, id, config) => db.setSessionConfig(id, config))
  ipcMain.handle('message:list', (_e, sessionId) => db.getMessages(sessionId))
  ipcMain.handle('message:update', (_e, id, data) => db.updateMessage(id, data))
  ipcMain.handle('message:delete-after', (_e, sessionId, afterId) => db.deleteMessagesAfter(sessionId, afterId))

  // Combined create+select: creates a session, sets its config, and returns
  // the new session row + messages + config in one IPC round-trip.
  // This replaces the old 7+ sequential calls in the renderer.
  ipcMain.handle('session:create-and-select', async (_e, { providerId, modelId, personaId } = {}) => {
    // Prune empty placeholder sessions before creating a new one so the sidebar
    // doesn't accumulate "新会话" entries (ChatGPT-style: unsent new chats don't persist).
    db.pruneEmptySessions()
    const sessionRow = db.createSession({ persona_id: personaId || null })
    const sid = sessionRow.lastInsertRowid || sessionRow.id
    const cfg = { providerId: providerId || null, modelId: modelId || null, personaId: personaId || null }
    db.setSessionConfig(sid, cfg)
    const messages = db.getMessages(sid)
    return { session: { ...sessionRow, id: sid }, config: cfg, messages }
  })
}

module.exports = { registerSessionHandlers }
