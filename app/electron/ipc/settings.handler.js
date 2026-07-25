function registerSettingsHandlers(ipcMain, db) {
  ipcMain.handle('settings:get', (_e, key) => db.getSetting(key))
  ipcMain.handle('settings:set', async (_e, key, value) => {
    await db.setSetting(key, value)
    // Invalidate in-process caches (e.g., chat handler's _s) — emits on ipcMain
    // so any listener in the same main process picks it up.
    ipcMain.emit('settings:changed', key, value)
    return { success: true }
  })
  ipcMain.handle('settings:getAll', () => db.getAllSettings())
}

module.exports = { registerSettingsHandlers }
