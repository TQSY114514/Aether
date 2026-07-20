function registerModelHandlers(ipcMain, db) {
  ipcMain.handle('model:list', (_e, providerId) => db.getModels(providerId))
  ipcMain.handle('model:list-all', () => db.getAllModels())
  ipcMain.handle('model:primary', () => db.getPrimaryModel())
  ipcMain.handle('model:create', (_e, data) => {
    const result = db.addModel(data)
    db.initModelScores(result.lastInsertRowid)
    return result
  })
  ipcMain.handle('model:update', (_e, id, data) => db.updateModel(id, data))
  ipcMain.handle('model:delete', (_e, id) => db.deleteModel(id))
  ipcMain.handle('model:fallback-chain', (_e, providerId) => db.getFallbackChain(providerId))
}

module.exports = { registerModelHandlers }
