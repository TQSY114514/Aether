const path = require('path')
const soulManager = require('../llm/soulManager')
const { isAuthorizedWorkspace, getWorkspaceRoot } = require('../tools/sandbox')

function registerPersonaHandlers(ipcMain, db) {
  ipcMain.handle('persona:list', () => db.getPersonas())
  ipcMain.handle('persona:create', (_e, data) => db.addPersona(data))
  ipcMain.handle('persona:update', (_e, id, data) => db.updatePersona(id, data))
  ipcMain.handle('persona:delete', (_e, id) => db.deletePersona(id))

  ipcMain.handle('persona:import', (_e, data) => {
    if (data.type === 'soul-md' || (typeof data.text === 'string' && !data.type)) {
      const parsed = soulManager.parseSoulContent(data.text || '')
      if (!parsed || !parsed.prompt.trim()) {
        return { success: false, error: '无效的 SOUL.md 文件：内容为空' }
      }
      const result = db.addPersona({ name: parsed.name, prompt: parsed.prompt, avatar: parsed.avatar })
      return { success: true, personId: result.lastInsertRowid, name: parsed.name }
    }
    if (data.type !== 'aetherai-persona') {
      return { success: false, error: '无效的人设文件：类型不匹配' }
    }
    const result = db.addPersona({ name: data.name, prompt: data.prompt })
    return { success: true, personId: result.lastInsertRowid, name: data.name }
  })

  ipcMain.handle('persona:export', (_e, id) => {
    const p = db.getPersona(id)
    if (!p) return null
    return { version: '1.0', type: 'aetherai-persona', name: p.name, prompt: p.prompt, avatar: p.avatar }
  })

  ipcMain.handle('persona:get-workspace-soul', (_e, workspaceRoot) => {
    const ws = workspaceRoot ? path.resolve(workspaceRoot) : getWorkspaceRoot()
    if (ws && !isAuthorizedWorkspace(db, ws)) return null
    return soulManager.getWorkspaceSoul(ws)
  })

  ipcMain.handle('persona:write-workspace-soul', (_e, workspaceRoot, data) => {
    const ws = workspaceRoot ? path.resolve(workspaceRoot) : getWorkspaceRoot()
    if (!ws || !isAuthorizedWorkspace(db, ws)) {
      return { success: false, error: 'Unauthorized workspace: path does not match any configured session workspace' }
    }
    return soulManager.writeWorkspaceSoul(ws, data)
  })

  ipcMain.handle('persona:export-soul-md', (_e, id) => {
    const p = db.getPersona(id)
    if (!p) return null
    return {
      name: p.name,
      fileName: 'SOUL.md',
      content: soulManager.formatSoulContent({ name: p.name, prompt: p.prompt, avatar: p.avatar }),
    }
  })
}

module.exports = { registerPersonaHandlers }

