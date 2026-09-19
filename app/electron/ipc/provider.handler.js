const { testConnection, listModels } = require('../llm/providerAdapter')

/** Register provider CRUD, connectivity, latency, and model-sync IPC handlers. */
function registerProviderHandlers(ipcMain, db) {
  // H2: renderer-facing list/get return a MASKED api_key (sk-1***efgh).
  // Decrypted keys never cross the IPC boundary; internal request paths
  // (test-connection / fetch-models below) read via db.getProvider directly.
  ipcMain.handle('provider:list', () => db.getProviders())
  ipcMain.handle('provider:get', (_e, id) => {
    const p = db.getProvider(id)
    return p ? { ...p, api_key: db.maskKey(p.api_key) } : null
  })
  ipcMain.handle('provider:create', (_e, data) => db.addProvider(data))
  ipcMain.handle('provider:update', (_e, id, data) => db.updateProvider(id, data))
  ipcMain.handle('provider:delete', (_e, id) => db.deleteProvider(id))

  // Connectivity probe — delegated to the provider adapter (which owns the
  // /models-then-ping fallback and auth-error mapping).
  ipcMain.handle('provider:test-connection', async (_e, id) => {
    const provider = db.getProvider(id)
    if (!provider) return { success: false, errorMessage: '供应商未找到' }
    try { return await testConnection({ provider }) }
    catch (e) { return { success: false, errorMessage: e?.message || String(e) } }
  })

  // Measure latency (RTT in ms) to the provider endpoint or specific model
  ipcMain.handle('provider:test-latency', async (_e, id, modelName) => {
    const provider = db.getProvider(id)
    if (!provider) return { success: false, latencyMs: -1, errorMessage: '供应商未找到' }
    try {
      return await testConnection({ provider, model: modelName })
    } catch (e) {
      return { success: false, latencyMs: -1, errorMessage: e?.message || String(e) }
    }
  })

  // Fetch the provider's model list and sync it into the DB: add newly
  // reported models, remove ones the provider no longer exposes, and skip
  // duplicates. Returns the (deduplicated) model names and a sync summary.
  ipcMain.handle('provider:fetch-models', async (_e, id) => {
    const provider = db.getProvider(id)
    if (!provider) return { names: [], added: [], removed: [] }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    try {
      const names = await listModels({ provider, signal: controller.signal })
      const { added, removed } = db.syncModels(id, names)
      return { names, added, removed }
    } catch {
      return { names: [], added: [], removed: [] }
    } finally {
      clearTimeout(timeout)
    }
  })

  // One-click local Ollama detection (student-budget win): probe the default
  // Ollama endpoint, create the provider row if missing, fetch its models, and
  // return the smallest model to select. No API key needed.
  ipcMain.handle('provider:detect-ollama', async () => {
    const URL = 'http://127.0.0.1:11434'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const res = await fetch(`${URL}/api/tags`, { signal: controller.signal })
      if (!res.ok) return { ok: false, error: 'Ollama 未运行或端口不可达' }
      const data = await res.json()
      const models = (data && data.models ? data.models : []).map(m => m.name)
      if (!models.length) return { ok: false, error: 'Ollama 运行中但无模型(先 ollama pull 一个)' }

      // Upsert provider by name (no UNIQUE constraint — select-then-insert).
      let prov = db.getProviders().find(p => p.name === 'Ollama')
      if (!prov) {
        prov = { id: Number(db.addProvider({ name: 'Ollama', api_url: URL, api_key: '', api_format: 'openai', enabled: 1 }).lastInsertRowid) }
      } else {
        db.updateProvider(prov.id, { name: 'Ollama', api_url: URL, api_key: '', api_format: 'openai', enabled: 1 })
      }
      // Fetch model list via the OpenAI-compatible /v1/models endpoint.
      let fetched = []
      try {
        fetched = await listModels({ provider: { id: prov.id, api_url: URL, api_key: '', api_format: 'openai' } })
      } catch {}
      // Smallest model heuristic: prefer qwen/tiny/phi/llama3.2:1b-style small tags.
      const all = fetched.length ? fetched : models.map(n => ({ model_name: n }))
      const sorted = [...all].sort((a, b) => String(a.model_name).length - String(b.model_name).length)
      const recommended = sorted[0]
      // Sync model rows into the DB (add missing, remove stale).
      try {
        db.syncModels(prov.id, all.map(m => m.model_name))
      } catch {}
      return {
        ok: true,
        providerId: prov.id,
        models: all.map(m => m.model_name),
        recommended: recommended ? recommended.model_name : null,
      }
    } catch (e) {
      return { ok: false, error: e && e.name === 'AbortError' ? 'Ollama 检测超时(5s)' : (e && e.message ? e.message : String(e)) }
    } finally {
      clearTimeout(timeout)
    }
  })
}

module.exports = { registerProviderHandlers }
