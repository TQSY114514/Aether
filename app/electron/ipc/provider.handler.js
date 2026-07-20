const { testConnection, listModels } = require('../llm/providerAdapter')

function registerProviderHandlers(ipcMain, db) {
  ipcMain.handle('provider:list', () => db.getProviders())
  ipcMain.handle('provider:get', (_e, id) => db.getProvider(id))
  ipcMain.handle('provider:create', (_e, data) => db.addProvider(data))
  ipcMain.handle('provider:update', (_e, id, data) => db.updateProvider(id, data))
  ipcMain.handle('provider:delete', (_e, id) => db.deleteProvider(id))

  // Connectivity probe — delegated to the provider adapter (which owns the
  // /models-then-ping fallback and auth-error mapping).
  ipcMain.handle('provider:test-connection', async (_e, id) => {
    const provider = db.getProvider(id)
    if (!provider) return { success: false, errorMessage: '供应商未找到' }
    return testConnection({ provider })
  })

  // Fetch the provider's model list — also delegated to the adapter.
  ipcMain.handle('provider:fetch-models', async (_e, id) => {
    const provider = db.getProvider(id)
    if (!provider) return []
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    try {
      return await listModels({ provider, signal: controller.signal })
    } catch {
      return []
    } finally {
      clearTimeout(timeout)
    }
  })
}

module.exports = { registerProviderHandlers }
