const { setWorkspaceRoot, getWorkspaceRoot } = require('../tools/sandbox')

function registerAgentHandlers(ipcMain, db) {
  // Get the current agent workspace root (the directory the agent is allowed
  // to write files / edit within). Defaults to <userData>/workspace.
  ipcMain.handle('agent:workspace:get', () => {
    const saved = db.getSetting('agent_workspace_root')
    if (saved) setWorkspaceRoot(saved)
    return getWorkspaceRoot()
  })

  // Set the agent workspace root. Pass null/empty to reset to default.
  ipcMain.handle('agent:workspace:set', (_e, dir) => {
    const v = dir ? String(dir) : null
    if (v) db.setSetting('agent_workspace_root', v)
    else db.setSetting('agent_workspace_root', '')
    setWorkspaceRoot(v || null)
    return { success: true, root: getWorkspaceRoot() }
  })
}

module.exports = { registerAgentHandlers }
