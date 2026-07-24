function registerMemoryHandlers(ipcMain, db) {
  ipcMain.handle('memory:list', () => db.getMemories())
  ipcMain.handle('memory:create', (_e, data) => db.addMemory(data))
  ipcMain.handle('memory:update', (_e, id, data) => db.updateMemory(id, data))
  ipcMain.handle('memory:delete', (_e, id) => db.deleteMemory(id))
  ipcMain.handle('memory:conflicts', () => db.getMemoryConflicts())
  ipcMain.handle('memory:conflict:resolve', (_e, keepId, removeId) => { db.resolveMemoryConflict(keepId, removeId); return { ok: true } })
  // Increment access count (called when memory is injected into context).
  ipcMain.handle('memory:access', (_e, id) => { db.incrementMemoryAccess(id) })
}

module.exports = { registerMemoryHandlers }
