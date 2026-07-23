const { clearAllowRules } = require('./chat.handler')

function registerSessionHandlers(ipcMain, db) {
  // Simple mutex to serialize prune+create and prevent a concurrent
  // session:list from pruning a session that was just created.
  let _sessionMutex = Promise.resolve()

  ipcMain.handle('session:list', () => db.getSessions())
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

  ipcMain.handle('session:create-and-select', async (_e, { providerId, modelId, personaId } = {}) => {
    const work = async () => {
      db.pruneEmptySessions()
      const sessionRow = db.createSession({ persona_id: personaId || null })
      const sid = sessionRow.lastInsertRowid || sessionRow.id
      const cfg = { providerId: providerId || null, modelId: modelId || null, personaId: personaId || null }
      db.setSessionConfig(sid, cfg)
      return { session: { ...sessionRow, id: sid }, config: cfg }
    }
    const result = await _sessionMutex.catch(() => {}).then(work)
    const sid = result.session.id
    const cfg = result.config
    const messages = db.getMessages(sid)
    return { session: result.session, config: cfg, messages }
  })
}

module.exports = { registerSessionHandlers }
