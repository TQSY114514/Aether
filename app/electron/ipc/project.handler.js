// ─────────────────────────────────────────────────────────────────────────────
// electron/ipc/project.handler.js
//
// Project Lifecycle IPC Handlers (Aether v2.0 R1: Multi-Workspace Architecture)
// Channels: project:list, project:create, project:open, project:update,
//           project:delete, project:current
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path')
const fs = require('fs')
const { dialog } = require('electron')
const log = require('../logger')
const { isDangerousRoot, setWorkspaceRoot, setActiveProjectRoot, hasUnsafeWindowsPrefix } = require('../tools/sandbox')

/**
 * Register project lifecycle IPC handlers.
 * @param {import('electron').IpcMain} ipcMain
 * @param {any} db
 * @param {() => import('electron').WebContents | null} [getWebContents]
 */
function registerProjectHandlers(ipcMain, db, getWebContents) {
  // 1. project:list — Return all projects ordered by favorite then last_opened_at
  ipcMain.handle('project:list', () => {
    if (typeof db.listProjects === 'function') {
      return db.listProjects()
    }
    return db.prepare(`
      SELECT * FROM project 
      ORDER BY is_favorite DESC, last_opened_at DESC, created_at DESC
    `).all()
  })

  // 2. project:create — Create a new workspace project
  ipcMain.handle('project:create', (_e, data) => {
    if (!data || !data.root_path || !data.name) {
      throw new Error('Project name and root_path are required')
    }
    const rawPath = String(data.root_path)
    if (hasUnsafeWindowsPrefix(rawPath) || isDangerousRoot(rawPath)) {
      throw new Error(`Forbidden workspace root: ${rawPath} is a system-critical directory`)
    }
    const resolvedPath = path.resolve(rawPath)
    if (hasUnsafeWindowsPrefix(resolvedPath) || isDangerousRoot(resolvedPath)) {
      throw new Error(`Forbidden workspace root: ${resolvedPath} is a system-critical directory`)
    }
    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true })
    }
    return db.createProject({
      name: data.name,
      root_path: resolvedPath,
      icon: data.icon,
      color: data.color,
      default_model_id: data.default_model_id,
      default_agent_mode: data.default_agent_mode,
      is_favorite: data.is_favorite,
    })
  })

  // 3. project:open — Activate a project, update last_opened_at, set active_project_id setting, and set sandbox root
  ipcMain.handle('project:open', async (_e, id) => {
    const numId = Number(id)
    const proj = typeof db.getProject === 'function'
      ? db.getProject(numId)
      : db.prepare('SELECT * FROM project WHERE id = ?').get(numId)
    if (!proj) throw new Error(`Project ${id} not found`)
    if (hasUnsafeWindowsPrefix(proj.root_path) || isDangerousRoot(proj.root_path)) {
      throw new Error(`Forbidden workspace root: ${proj.root_path}`)
    }

    if (typeof db.setActiveProject === 'function') {
      db.setActiveProject(numId)
    } else {
      db.prepare('UPDATE project SET last_opened_at = CURRENT_TIMESTAMP WHERE id = ?').run(numId)
      if (typeof db.setSetting === 'function') {
        db.setSetting('active_project_id', String(numId))
      }
    }

    setWorkspaceRoot(proj.root_path)
    setActiveProjectRoot(proj.root_path)

    // Invalidate project config & instructions cache
    try {
      require('../config/projectConfig').invalidateProjectConfigCache(proj.root_path)
      require('../llm/projectInstructions').invalidateCache()
    } catch {}

    const updated = typeof db.getProject === 'function'
      ? db.getProject(numId)
      : db.prepare('SELECT * FROM project WHERE id = ?').get(numId)

    const wc = getWebContents?.()
    if (wc && !wc.isDestroyed()) {
      wc.send('project:opened', updated)
    }
    return updated
  })

  // 4. project:update — Update project details
  ipcMain.handle('project:update', (_e, id, data) => {
    const numId = Number(id)
    if (data && data.root_path) {
      const rawPath = String(data.root_path)
      if (hasUnsafeWindowsPrefix(rawPath) || isDangerousRoot(rawPath)) {
        throw new Error(`Forbidden workspace root: ${rawPath}`)
      }
      const resolvedPath = path.resolve(rawPath)
      if (hasUnsafeWindowsPrefix(resolvedPath) || isDangerousRoot(resolvedPath)) {
        throw new Error(`Forbidden workspace root: ${resolvedPath}`)
      }
    }
    const updated = db.updateProject(numId, data)
    if (updated) {
      const activeId = db.getSetting('active_project_id')
      if (activeId === String(numId) && data?.root_path) {
        const newRoot = path.resolve(String(data.root_path))
        setWorkspaceRoot(newRoot)
        setActiveProjectRoot(newRoot)
        try {
          require('../config/projectConfig').invalidateProjectConfigCache(newRoot)
          require('../llm/projectInstructions').invalidateCache()
        } catch {}
      }
    }
    return updated
  })

  // 5. project:delete — Delete a project (unlink associated sessions by default)
  ipcMain.handle('project:delete', (_e, id) => {
    const numId = Number(id)
    const wasActive = db.getSetting('active_project_id') === String(numId)
    const res = db.deleteProject(numId)
    if (res?.ok && wasActive) {
      setWorkspaceRoot(null)
      setActiveProjectRoot(null)
      try { require('../llm/projectInstructions').invalidateCache() } catch {}
    }
    return res
  })

  // 6. project:current — Return the currently active project or null
  ipcMain.handle('project:current', () => {
    if (typeof db.getActiveProject === 'function') {
      return db.getActiveProject()
    }
    if (typeof db.getSetting === 'function') {
      const activeId = db.getSetting('active_project_id')
      if (!activeId) return null
      return db.prepare('SELECT * FROM project WHERE id = ?').get(Number(activeId)) || null
    }
    return null
  })

  // 7. project:pickDirectory — Native folder picker dialog
  ipcMain.handle('project:pickDirectory', async () => {
    try {
      const res = await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择本地项目工作区' })
      if (res.canceled || !res.filePaths || res.filePaths.length === 0) return null
      return res.filePaths[0]
    } catch (err) {
      log.warn('project:pickDirectory error:', err?.message)
      return null
    }
  })
}

module.exports = { registerProjectHandlers }
