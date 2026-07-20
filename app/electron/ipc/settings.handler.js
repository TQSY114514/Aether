function registerSettingsHandlers(ipcMain, db) {
  ipcMain.handle('settings:get', (_e, key) => db.getSetting(key))
  ipcMain.handle('settings:set', (_e, key, value) => {
    db.setSetting(key, value)
    return { success: true }
  })
  ipcMain.handle('settings:getAll', () => db.getAllSettings())
}

module.exports = { registerSettingsHandlers }
