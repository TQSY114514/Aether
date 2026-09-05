const { setWorkspaceRoot, setWorkspaceRootForSession, getWorkspaceRoot } = require('../tools/sandbox')
const checkpointMgr = require('../llm/checkpointManager')
const { invalidateCache, hasProjectInstructions, loadProjectInstructions } = require('../llm/projectInstructions')

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
      invalidateCache()
      return { success: true, root: v || getWorkspaceRoot() }
    }
    if (v) await db.setSetting('agent_workspace_root', v)
    else await db.setSetting('agent_workspace_root', '')
    setWorkspaceRoot(v || null)
    invalidateCache()
    // Invalidate the project context graph cache for the new workspace.
    try {
      const ctx = require('../context')
      ctx.projectIndexer.invalidateCache(v || null)
      ctx.repoMap.invalidateCache(v || null)
    } catch {}
    return { success: true, root: getWorkspaceRoot() }
  })

  // Check whether the current workspace has project instructions (CLAUDE.md etc.).
  ipcMain.handle('agent:has-project-instructions', () => {
    const has = hasProjectInstructions()
    const info = loadProjectInstructions()
    return { has, fileName: info?.fileName || null }
  })

  // Manually re-index the project context graph and repo map.
  ipcMain.handle('agent:project:reindex', async () => {
    const root = getWorkspaceRoot()
    if (!root) return { ok: false, error: 'no workspace configured' }
    try {
      const { projectIndexer, dependencyGraph, repoMap } = require('../context')
      projectIndexer.invalidateCache(root)
      repoMap.invalidateCache(root)
      const graph = await projectIndexer.indexWorkspace(root)
      const graphStats = dependencyGraph.getStats(graph)
      const map = await repoMap.generateRepoMap(root, { force: true })
      return { ok: true, stats: graphStats, repoMap: { totalFiles: map.stats.totalFiles, indexedFiles: map.stats.indexedFiles } }
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
      // better-sqlite3: db.exec() takes no bound parameters — use the facade's
      // allRows (prepare().all(?)) instead of interpolating/exec-ing `?`.
      const rows = db.allRows('SELECT * FROM agent_checkpoint WHERE id = ? LIMIT 1', [id])
      const row = rows && rows[0]
      if (!row) return null
      return {
        id: row.id, sessionId: row.session_id, turnId: row.turn_id, stepIndex: row.step_index,
        messages: JSON.parse(row.messages || '[]'),
        toolTrace: JSON.parse(row.tool_trace || '[]'),
        meta: JSON.parse(row.checkpoint_meta || '{}'),
        createdAt: row.created_at,
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

  // ─── Agent Execution Audit / Trajectory IPC ─────────────────────────────
  ipcMain.handle('agent:audit:list', (_e, { sessionId, limit = 50 } = {}) => {
    try {
      if (!sessionId) return []
      return db.getAuditLog(sessionId, limit)
    } catch {
      return []
    }
  })
}

module.exports = { registerAgentHandlers }
