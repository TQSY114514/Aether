const fs = require('fs')
const { getWorkspaceRoot, setWorkspaceRootForSession, isDangerousRoot, isSystemCriticalDir, hasUnsafeWindowsPrefix, isSensitivePath, resolveRoamingPath, _isShadowActive } = require('../tools/sandbox')
const checkpointMgr = require('../llm/checkpointManager')
const { invalidateCache, hasProjectInstructions, loadProjectInstructions, loadModularRules } = require('../llm/projectInstructions')

function registerAgentHandlers(ipcMain, db) {
  // Get the current session CWD / fallback default directory without locking sandbox containment.
  ipcMain.handle('agent:workspace:get', (_e, sessionId) => {
    if (sessionId) {
      try {
        const sess = typeof db.getSession === 'function' ? db.getSession(sessionId) : null
        if (sess?.cwd) return sess.cwd
      } catch {}
      const cfg = db.getSessionConfig(sessionId)
      if (cfg?.workspace) return cfg.workspace
    }
    const saved = db.getSetting('agent_workspace_root')
    if (saved) return saved
    return getWorkspaceRoot(sessionId)
  })

  // Set the active directory (CWD) for a session or global default.
  // Terminal-style CWD roaming: updates session.cwd / config without locking sandbox containment.
  ipcMain.handle('agent:workspace:set', async (_e, opts) => {
    const dir = typeof opts === 'string' ? opts : opts?.dir
    const sessionId = typeof opts === 'object' ? opts?.sessionId : undefined
    const raw = dir ? String(dir).trim() : null
    let v = null
    if (raw) {
      const base = (sessionId ? getWorkspaceRoot(sessionId) : null) || db.getSetting('agent_workspace_root') || getWorkspaceRoot() || process.cwd()
      const resolved = resolveRoamingPath(raw, base)
      if (!resolved || hasUnsafeWindowsPrefix(resolved) || isDangerousRoot(resolved) || isSensitivePath(resolved) || isSystemCriticalDir(resolved)) {
        throw new Error(`Forbidden directory: ${resolved || raw} is a system-critical path`)
      }
      let st = null
      try { st = fs.statSync(resolved) } catch {}
      if (!st || !st.isDirectory()) {
        throw new Error(`Directory does not exist: ${resolved}`)
      }
      let canonical = resolved
      try { canonical = fs.realpathSync(resolved) } catch {}
      if (isDangerousRoot(canonical) || isSensitivePath(canonical) || isSystemCriticalDir(canonical)) {
        throw new Error(`Forbidden directory: ${canonical} is a system-critical path`)
      }
      v = canonical
    }
    if (sessionId) {
      if (_isShadowActive?.(sessionId)) {
        throw new Error('Cannot change working directory while a shadow workspace run is active')
      }
      const cfg = db.getSessionConfig(sessionId) || {}
      cfg.workspace = v
      db.setSessionConfig(sessionId, cfg)
      if (typeof db.setSessionCwd === 'function') {
        db.setSessionCwd(sessionId, v)
      }
      // Clear any residual session sandbox pin so CWD roaming stays unconstrained
      setWorkspaceRootForSession(sessionId, null)
      invalidateCache()
      return { success: true, root: v || getWorkspaceRoot(sessionId) }
    }
    if (v) await db.setSetting('agent_workspace_root', v)
    else await db.setSetting('agent_workspace_root', '')
    invalidateCache()
    // Invalidate the project context graph cache for the new directory.
    try {
      const ctx = require('../context')
      ctx.projectIndexer.invalidateCache(v || null)
      ctx.repoMap.invalidateCache(v || null)
    } catch {}
    return { success: true, root: v || getWorkspaceRoot() }
  })

  // Check whether the current workspace has project instructions (CLAUDE.md etc.) and modular rules (.aether/rules).
  ipcMain.handle('agent:has-project-instructions', (_e, sessionId) => {
    const has = hasProjectInstructions(sessionId)
    const info = loadProjectInstructions(sessionId)
    const ws = getWorkspaceRoot(sessionId)
    const rules = loadModularRules(ws) || []
    return {
      has,
      fileName: info?.fileName || null,
      rulesCount: rules.length,
      rules: rules.map(r => r.name),
    }
  })

  // Manually re-index the project context graph and repo map.
  ipcMain.handle('agent:project:reindex', async () => {
    const root = getWorkspaceRoot()
    if (!root) return { ok: false, error: 'no workspace configured' }
    try {
      const { projectIndexer, dependencyGraph, repoMap } = require('../context')
      repoMap.setMemorySeeder((digest, rootDir) => {
        if (!digest || typeof db.addMemoryWithProvenance !== 'function') return
        try { db.addMemoryWithProvenance(digest, 'project', null, 'system', { kind: 'repo_map' }, rootDir) } catch {}
      })
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
      const rows = db.allRows('SELECT * FROM agent_turn_checkpoint WHERE id = ? LIMIT 1', [id])
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
