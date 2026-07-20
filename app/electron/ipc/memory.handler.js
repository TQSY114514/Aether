function registerMemoryHandlers(ipcMain, db) {
  ipcMain.handle('memory:list', () => db.getMemories())
  ipcMain.handle('memory:create', (_e, data) => db.addMemory(data))
  ipcMain.handle('memory:update', (_e, id, data) => db.updateMemory(id, data))
  ipcMain.handle('memory:delete', (_e, id) => db.deleteMemory(id))
}

module.exports = { registerMemoryHandlers }
