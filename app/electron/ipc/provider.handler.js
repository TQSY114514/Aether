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
    try { return await testConnection({ provider }) }
    catch (e) { return { success: false, errorMessage: e?.message || String(e) } }
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
      // Sync model rows into the DB (create missing ones).
      try {
        const existing = new Set(db.getAllModels().filter(m => m.provider_id === prov.id).map(m => m.model_name))
        for (const m of all) {
          if (!existing.has(m.model_name)) {
            db.addModel({ provider_id: prov.id, model_name: m.model_name, is_primary: 0, display_name: null, fallback_order: null, context_window: null, input_price_per_1k: null, output_price_per_1k: null })
          }
        }
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
