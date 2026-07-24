const { setWorkspaceRoot, setWorkspaceRootForSession, getWorkspaceRoot } = require('../tools/sandbox')
const checkpointMgr = require('../llm/checkpointManager')

function registerAgentHandlers(ipcMain, db) {
  // Get the current agent workspace root.
  ipcMain.handle('agent:workspace:get', (_e, sessionId) => {
    const saved = db.getSetting('agent_workspace_root')
    if (saved) setWorkspaceRoot(saved)
    // If a sessionId is provided, check for per-session override.
    if (sessionId) {
      const cfg = db.getSessionConfig(sessionId)
      if (cfg?.workspace) return cfg.workspace
    }
    return getWorkspaceRoot()
  })

  // Set the agent workspace root. Pass null/empty to reset to default.
  // Optionally accepts { dir, sessionId } for per-session workspace.
  ipcMain.handle('agent:workspace:set', async (_e, opts) => {
    const dir = typeof opts === 'string' ? opts : opts?.dir
    const sessionId = typeof opts === 'object' ? opts?.sessionId : undefined
    const v = dir ? String(dir) : null
    if (sessionId) {
      const cfg = db.getSessionConfig(sessionId) || {}
      cfg.workspace = v
      db.setSessionConfig(sessionId, cfg)
      setWorkspaceRootForSession(sessionId, v || null)
      return { success: true, root: v || getWorkspaceRoot() }
    }
    if (v) await db.setSetting('agent_workspace_root', v)
    else await db.setSetting('agent_workspace_root', '')
    setWorkspaceRoot(v || null)
    // Invalidate the project context graph cache for the new workspace.
    try { require('../context').projectIndexer.invalidateCache(v || null) } catch {}
    return { success: true, root: getWorkspaceRoot() }
  })

  // Manually re-index the project context graph.
  ipcMain.handle('agent:project:reindex', async () => {
    const root = getWorkspaceRoot()
    if (!root) return { ok: false, error: 'no workspace configured' }
    try {
      const { projectIndexer, dependencyGraph } = require('../context')
      projectIndexer.invalidateCache(root)
      const graph = await projectIndexer.indexWorkspace(root)
      const stats = dependencyGraph.getStats(graph)
      return { ok: true, stats }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // ─── Agent Checkpoint IPC ────────────────────────────────────────────────
  // List checkpoints for a session (for the "restore" UI).
  ipcMain.handle('agent:checkpoint:list', (_e, sessionId) => {
    try { return db.getCheckpoints(sessionId) } catch { return [] }
  })

  // Load a specific checkpoint's messages for inspection.
  ipcMain.handle('agent:checkpoint:get', (_e, id) => {
    try {
      const r = db.exec('SELECT * FROM agent_checkpoint WHERE id = ? LIMIT 1', [id])
      if (!r[0]?.values?.[0]) return null
      const row = r[0].values[0]
      return {
        id: row[0], sessionId: row[1], turnId: row[2], stepIndex: row[3],
        messages: JSON.parse(row[4] || '[]'),
        toolTrace: JSON.parse(row[5] || '[]'),
        meta: JSON.parse(row[6] || '{}'),
        createdAt: row[7],
      }
    } catch { return null }
  })

  // Delete a single checkpoint.
  ipcMain.handle('agent:checkpoint:delete', (_e, id) => {
    db.deleteCheckpoint(id)
    return { ok: true }
  })

  // Delete all checkpoints for a session (cleanup).
  ipcMain.handle('agent:checkpoint:cleanup', (_e, sessionId) => {
    db.deleteCheckpoints(sessionId)
    return { ok: true }
  })
}

module.exports = { registerAgentHandlers }
