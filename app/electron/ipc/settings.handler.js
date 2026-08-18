// H2: machine-local secrets never cross to the renderer. gateway_token is
// the local gateway's auth bearer — leaking it to the renderer (XSS #2)
// would let a compromised page call the gateway directly. Main-process
// consumers (localGateway) read via db.getSetting, unaffected.
function isSensitiveSettingKey(key) {
  return typeof key === 'string' && (key.startsWith('gateway_') || key === 'agent_workspace_root')
}

function registerSettingsHandlers(ipcMain, db) {
  ipcMain.handle('settings:get', (_e, key) => (isSensitiveSettingKey(key) ? null : db.getSetting(key)))
  ipcMain.handle('settings:set', async (_e, key, value) => {
    await db.setSetting(key, value)
    // Invalidate in-process caches (e.g., chat handler's _s) — emits on ipcMain
    // so any listener in the same main process picks it up.
    ipcMain.emit('settings:changed', key, value)
    return { success: true }
  })
  ipcMain.handle('settings:getAll', () => {
    const all = db.getAllSettings()
    for (const k of Object.keys(all)) {
      if (isSensitiveSettingKey(k)) delete all[k]
    }
    return all
  })
}

module.exports = { registerSettingsHandlers }
