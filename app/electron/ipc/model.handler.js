function registerModelHandlers(ipcMain, db) {
  ipcMain.handle('model:list', (_e, providerId) => db.getModels(providerId))
  ipcMain.handle('model:list-all', () => {
    // Strip provider api_key before sending to the renderer. The renderer only
    // needs model metadata for dropdowns/lists; all LLM requests go through the
    // main process. Leaking keys to the renderer means an XSS (#2) could steal
    // every provider key, so we never forward them.
    const models = db.getAllModels()
    return models.map(m => { const { api_key, ...rest } = m; return rest })
  })
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
