const { clearAllowRules, cleanupSessionControllers } = require('./chat.handler')
const log = require('../logger')

/** Register session and message lifecycle IPC handlers. */
function registerSessionHandlers(ipcMain, db) {
  // Simple mutex to serialize prune+create and prevent a concurrent
  // session:list from pruning a session that was just created.
  let _sessionMutex = Promise.resolve()

  ipcMain.handle('session:list', () => db.getSessions())
  ipcMain.handle('session:create', (_e, data) => db.createSession(data))
  ipcMain.handle('session:rename', (_e, id, title) => db.renameSession(id, title))
  ipcMain.handle('session:pin', (_e, id, pinned) => db.pinSession(id, pinned))
  ipcMain.handle('session:fork', (_e, { sessionId, title }) => {
    try { require('../llm/backgroundTasks').bumpBranchGeneration(sessionId) } catch {}
    return db.forkSession(sessionId, title)
  })
  ipcMain.handle('session:delete', (_e, id) => {
    const sid = Number(id)
    if (!Number.isInteger(sid) || sid <= 0) return { ok: false, error: 'invalid session id' }
    // The DB delete is the authoritative step: if it fails the session and its
    // checkpoint rows survive, so deleting the Shadow Git repo here would drop
    // live snapshots while the session they belong to is still listed.
    try {
      db.deleteSession(sid)
    } catch (e) {
      log.warn('session:delete db error:', e)
      return { ok: false, error: e?.message || 'delete failed' }
    }
    try { require('../llm/backgroundTasks').bumpBranchGeneration(sid) } catch {}
    try { clearAllowRules(sid) } catch {}
    try { cleanupSessionControllers(sid) } catch {}
    // deleteShadowRepo returns false when the removal itself failed (locked or
    // unreadable path) — surface it instead of reporting a clean delete.
    let shadowRemoved = true
    try { shadowRemoved = require('../llm/shadowGit').deleteShadowRepo(sid) !== false } catch {}
    return { ok: true, shadowRemoved }
  })
  ipcMain.handle('session:touch', (_e, id) => db.touchSession(id))
  ipcMain.handle('session:get-config', (_e, id) => db.getSessionConfig(id))
  ipcMain.handle('session:set-config', (_e, id, config) => db.setSessionConfig(id, config))
  ipcMain.handle('message:list', (_e, sessionId) => db.getMessages(sessionId))
  ipcMain.handle('message:update', (_e, id, data) => db.updateMessage(id, data))
  ipcMain.handle('message:delete-after', (_e, sessionId, afterId) => {
    try { require('../llm/backgroundTasks').bumpBranchGeneration(sessionId) } catch {}
    return db.deleteMessagesAfter(sessionId, afterId)
  })
  ipcMain.handle('message:delete-arena', (_e, sessionId) => db.deleteArenaAssistantMessages(sessionId))
  ipcMain.handle('message:add-normal', (_e, msg) => db.addNormalMessage(msg))

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
