function registerPersonaHandlers(ipcMain, db) {
  ipcMain.handle('persona:list', () => db.getPersonas())
  ipcMain.handle('persona:create', (_e, data) => db.addPersona(data))
  ipcMain.handle('persona:update', (_e, id, data) => db.updatePersona(id, data))
  ipcMain.handle('persona:delete', (_e, id) => db.deletePersona(id))

  ipcMain.handle('persona:import', (_e, data) => {
    if (data.type !== 'aetherai-persona') {
      return { success: false, error: '无效的人设文件：类型不匹配' }
    }
    const result = db.addPersona({ name: data.name, prompt: data.prompt })
    return { success: true, personId: result.lastInsertRowid }
  })

  ipcMain.handle('persona:export', (_e, id) => {
    const p = db.getPersona(id)
    if (!p) return null
    return { version: '1.0', type: 'aetherai-persona', name: p.name, prompt: p.prompt, avatar: p.avatar }
  })
}

module.exports = { registerPersonaHandlers }
