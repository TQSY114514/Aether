const { setWorkspaceRoot, setWorkspaceRootForSession, getWorkspaceRoot } = require('../tools/sandbox')

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
  ipcMain.handle('agent:workspace:set', (_e, opts) => {
    const dir = typeof opts === 'string' ? opts : opts?.dir
    const sessionId = typeof opts === 'object' ? opts?.sessionId : undefined
    const v = dir ? String(dir) : null
    if (sessionId) {
      // Per-session workspace: store in session config.
      const cfg = db.getSessionConfig(sessionId) || {}
      cfg.workspace = v
      db.setSessionConfig(sessionId, cfg)
      setWorkspaceRootForSession(sessionId, v || null)
      return { success: true, root: v || getWorkspaceRoot() }
    }
    // Global workspace.
    if (v) db.setSetting('agent_workspace_root', v)
    else db.setSetting('agent_workspace_root', '')
    setWorkspaceRoot(v || null)
    return { success: true, root: getWorkspaceRoot() }
  })
}

module.exports = { registerAgentHandlers }
