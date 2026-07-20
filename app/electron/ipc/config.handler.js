// ───────────────────────────────────────────────────────────────────────────
// Config export/import handler.
//
// Exports a ConfigBundle (providers + models + personas) as JSON for backup or
// migration. Import is additive: it creates providers/models/personas that
// don't already exist (matched by name) and skips duplicates, so re-importing
// the same bundle is a no-op rather than creating dupes.
// ───────────────────────────────────────────────────────────────────────────

const CONFIG_BUNDLE_VERSION = 1

function registerConfigHandlers(ipcMain, db) {
  // Export the full configuration as a JSON-serializable bundle.
  // `includeSecrets` defaults to true; pass false to strip API keys.
  ipcMain.handle('config:export', (_e, { includeSecrets = true } = {}) => {
    const providers = db.getProviders()
    const models = db.getAllModels()
    const personas = db.getPersonas()
    const bundle = {
      version: CONFIG_BUNDLE_VERSION,
      exported_at: new Date().toISOString(),
      providers: providers.map(p => ({
        name: p.name,
        api_url: p.api_url,
        api_key: includeSecrets ? p.api_key : '',
        api_format: p.api_format || 'openai',
        enabled: p.enabled,
      })),
      models: models.map(m => ({
        provider_name: m.provider_name || (providers.find(p => p.id === m.provider_id) || {}).name || '',
        model_name: m.model_name,
        display_name: m.display_name,
        is_primary: m.is_primary,
        fallback_order: m.fallback_order,
        context_window: m.context_window,
        input_price_per_1k: m.input_price_per_1k,
        output_price_per_1k: m.output_price_per_1k,
      })),
      personas: personas.map(p => ({ name: p.name, prompt: p.prompt, avatar: p.avatar })),
    }
    return { success: true, bundle }
  })

  // Import a bundle additively. Returns counts of what was created/skipped.
  // Never throws — malformed input yields { success: false, error }.
  ipcMain.handle('config:import', async (_e, bundle) => {
    try {
      if (!bundle || typeof bundle !== 'object') return { success: false, error: 'invalid bundle' }
      const { providers = [], models = [], personas = [] } = bundle
      const existingProviders = db.getProviders()
      const existingPersonas = db.getPersonas()
      let created = { providers: 0, models: 0, personas: 0 }
      let skipped = { providers: 0, models: 0, personas: 0 }

      // Providers: create by name if missing. Track name→id for model linking.
      const nameToId = {}
      for (const p of existingProviders) nameToId[p.name] = p.id
      for (const p of providers) {
        if (nameToId[p.name]) { skipped.providers++; continue }
        const res = db.addProvider({
          name: p.name, api_url: p.api_url, api_key: p.api_key || '',
          api_format: p.api_format || 'openai', enabled: p.enabled ?? 1,
        })
        nameToId[p.name] = res.lastInsertRowid
        created.providers++
      }

      // Models: link to provider by name; create if (provider, model_name) missing.
      const existingModels = db.getAllModels()
      const modelKey = new Set(existingModels.map(m => `${m.provider_name || ''}|${m.model_name}`))
      for (const m of models) {
        const pid = nameToId[m.provider_name]
        if (!pid) { skipped.models++; continue }
        const key = `${m.provider_name}|${m.model_name}`
        if (modelKey.has(key)) { skipped.models++; continue }
        db.addModel({
          provider_id: pid, model_name: m.model_name, display_name: m.display_name,
          is_primary: m.is_primary ?? 0, fallback_order: m.fallback_order ?? null,
          context_window: m.context_window ?? null,
          input_price_per_1k: m.input_price_per_1k ?? null,
          output_price_per_1k: m.output_price_per_1k ?? null,
        })
        modelKey.add(key)
        created.models++
      }

      // Personas: create by name if missing.
      const personaNames = new Set(existingPersonas.map(p => p.name))
      for (const p of personas) {
        if (personaNames.has(p.name)) { skipped.personas++; continue }
        db.addPersona({ name: p.name, prompt: p.prompt, avatar: p.avatar ?? null })
        personaNames.add(p.name)
        created.personas++
      }

      db.flushDatabase ? db.flushDatabase().catch(() => {}) : db.saveDatabase()
      return { success: true, created, skipped }
    } catch (e) {
      return { success: false, error: String(e.message || e) }
    }
  })
}

module.exports = { registerConfigHandlers }
