// ───────────────────────────────────────────────────────────────────────────
// Config export/import handler.
//
// Exports a ConfigBundle (providers + models + personas + sessions + messages +
// memory + settings + arena votes + model scores + optional background image)
// as JSON for backup or full migration between machines.
//
// Import modes:
//   - merge (default): additive. Providers/models/personas are matched by name
//     and skipped if present; sessions/messages/memory/settings/votes/scores are
//     appended without touching existing rows. Safe to re-import.
//   - overwrite: for full restore. Clears rebuildable runtime data
//     (sessions, messages, memory, arena votes, model scores, settings) first,
//     then rebuilds from the bundle. Providers/models/personas still match by
//     name to preserve model routing.
//
// API keys: export carries them only if includeSecrets (default false since
// the 2026-08 security audit — H2); import re-encrypts every key through the
// current machine's safeStorage, so a bundle exported on one OS can be
// imported on another.
//
// Sensitive settings (M10): gateway_token / gateway_* / agent_workspace_root
// are machine-local secrets/paths. They are stripped from every export and
// never applied on import, regardless of includeSecrets.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const CONFIG_BUNDLE_VERSION = 2

function isSensitiveSettingKey(key) {
  return typeof key === 'string' && (key.startsWith('gateway_') || key === 'agent_workspace_root')
}

function bgPath() { return path.join(app.getPath('userData'), 'background.img') }
function bgMetaPath() { return bgPath() + '.meta' }

// Clear only the runtime data that an overwrite import will rebuild. Providers,
// models and personas are left intact (they are merged by name separately).
function clearRuntimeData(db) {
  for (const sql of ['DELETE FROM message', 'DELETE FROM session', 'DELETE FROM memory', 'DELETE FROM arena_vote', 'DELETE FROM model_score', 'DELETE FROM settings']) {
    try { db.exec(sql) } catch {}
  }
  for (const t of ['messages_fts', 'memories_fts']) {
    try { db.exec(`DELETE FROM ${t}`) } catch {}
  }
}

function registerConfigHandlers(ipcMain, db) {
  // Export the full configuration + runtime data as a JSON-serializable bundle.
  // H2: includeSecrets defaults to FALSE — a bundle must not leak keys unless
  // the user explicitly opts in.
  ipcMain.handle('config:export', (_e, { includeSecrets = false, includeBackground = false } = {}) => {
    // Masked list for display parity; decrypted list only when secrets are
    // explicitly requested (getProviders() alone now returns masked keys).
    const providers = includeSecrets ? db.getProvidersDecrypted() : db.getProviders()
    const models = db.getAllModels()
    const personas = db.getPersonas()
    const sessions = db.allRows('SELECT id, title, persona_id, pinned, config, created_at, updated_at FROM session ORDER BY id')
    const messages = db.allRows('SELECT session_id, role, content, model_used, provider_used, token_count, latency_ms, status, error_message, arena_model, created_at FROM message ORDER BY id')
    const memories = db.allRows('SELECT * FROM memory ORDER BY id')
    const settings = (() => {
      const all = db.getAllSettings() || {}
      const out = {}
      for (const [k, v] of Object.entries(all)) {
        if (!isSensitiveSettingKey(k)) out[k] = v
      }
      return out
    })()
    const arenaVotes = db.allRows('SELECT prompt, intent, winner_model_id, winner_model_name, loser_model_ids, loser_model_names, created_at FROM arena_vote ORDER BY id')
    const modelScores = db.allRows('SELECT ms.intent, ms.score, ms.win_count, ms.total_count, m.model_name, p.name AS provider_name FROM model_score ms JOIN model m ON ms.model_id = m.id JOIN provider p ON m.provider_id = p.id')

    let backgroundImg = null
    if (includeBackground) {
      try {
        const p = bgPath()
        if (fs.existsSync(p)) {
          let mime = 'image/png'
          if (fs.existsSync(bgMetaPath())) mime = fs.readFileSync(bgMetaPath(), 'utf8')
          backgroundImg = `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`
        }
      } catch {}
    }

    const bundle = {
      version: CONFIG_BUNDLE_VERSION,
      exported_at: new Date().toISOString(),
      providers: providers.map(p => ({
        name: p.name, api_url: p.api_url,
        api_key: includeSecrets ? p.api_key : '',
        api_format: p.api_format || 'openai', enabled: p.enabled,
      })),
      models: models.map(m => ({
        provider_name: m.provider_name || (providers.find(x => x.id === m.provider_id) || {}).name || '',
        model_name: m.model_name, display_name: m.display_name, is_primary: m.is_primary,
        fallback_order: m.fallback_order, context_window: m.context_window,
        input_price_per_1k: m.input_price_per_1k, output_price_per_1k: m.output_price_per_1k,
      })),
      personas: personas.map(p => ({ name: p.name, prompt: p.prompt, avatar: p.avatar })),
      sessions, messages, memories, settings, arenaVotes, modelScores, backgroundImg,
    }
    return { success: true, bundle }
  })

  // Import a bundle. `opts.mode` is 'merge' (default) or 'overwrite'.
  ipcMain.handle('config:import', async (_e, bundle, opts = {}) => {
    try {
      if (!bundle || typeof bundle !== 'object') return { success: false, error: 'invalid bundle' }
      const mode = opts.mode || 'merge'
      const {
        providers = [], models = [], personas = [], sessions = [], messages = [],
        memories = [], settings = {}, arenaVotes = [], modelScores = [], backgroundImg = null,
      } = bundle

      if (mode === 'overwrite') clearRuntimeData(db)

      const existingProviders = db.getProviders()
      const existingPersonas = db.getPersonas()
      const nameToId = {}
      for (const p of existingProviders) nameToId[p.name] = p.id

      const created = { providers: 0, models: 0, personas: 0, sessions: 0, messages: 0, memories: 0 }
      const skipped = { providers: 0, models: 0, personas: 0, sessions: 0, messages: 0, memories: 0 }

      // Providers: create by name if missing; track name→id for model linking.
      for (const p of providers) {
        if (nameToId[p.name]) { skipped.providers++; continue }
        const res = db.addProvider({
          name: p.name, api_url: p.api_url, api_key: p.api_key || '',
          api_format: p.api_format || 'openai', enabled: p.enabled ?? 1,
        })
        nameToId[p.name] = res.lastInsertRowid
        created.providers++
      }

      // Models: link to provider by name; track (provider|model) → id.
      const existingModels = db.getAllModels()
      const modelKey = new Set(existingModels.map(m => `${m.provider_name || ''}|${m.model_name}`))
      const modelIdByName = {} // `${provider_name}|${model_name}` -> model_id
      for (const m of existingModels) modelIdByName[`${m.provider_name}|${m.model_name}`] = m.id
      for (const m of models) {
        const pid = nameToId[m.provider_name]
        if (!pid) { skipped.models++; continue }
        const key = `${m.provider_name}|${m.model_name}`
        if (modelKey.has(key)) { skipped.models++; continue }
        const result = db.addModel({
          provider_id: pid, model_name: m.model_name, display_name: m.display_name,
          is_primary: m.is_primary ?? 0, fallback_order: m.fallback_order ?? null,
          context_window: m.context_window ?? null,
          input_price_per_1k: m.input_price_per_1k ?? null,
          output_price_per_1k: m.output_price_per_1k ?? null,
        })
        db.initModelScores(result.lastInsertRowid)
        modelKey.add(key)
        modelIdByName[key] = result.lastInsertRowid
        created.models++
      }

      // Sessions: always create (overwrite) or append (merge). Map old id → new.
      const sessionIdMap = {}
      for (const s of sessions) {
        const res = db.createSession({ title: s.title || '新会话', persona_id: null })
        const newId = res.lastInsertRowid
        sessionIdMap[s.id] = newId
        try {
          db.run('UPDATE session SET pinned = ?, config = ?, is_placeholder = 0 WHERE id = ?',
            s.pinned ? 1 : 0, s.config ?? null, newId)
        } catch {}
        created.sessions++
      }

      // Messages: link to the mapped session id.
      for (const m of messages) {
        const sid = sessionIdMap[m.session_id]
        if (sid == null) { skipped.messages++; continue }
        db.addMessage({
          session_id: sid, role: m.role, content: m.content,
          model_used: m.model_used ?? null, provider_used: m.provider_used ?? null,
          token_count: m.token_count ?? null, latency_ms: m.latency_ms ?? null,
          status: m.status ?? 'success', error_message: m.error_message ?? null,
          arena_model: m.arena_model ?? null,
        })
        created.messages++
      }

      // Memories.
      if (Array.isArray(memories) && memories.length) {
        db.addMemoriesBatch(memories.map(x => ({ content: x.content, type: x.type ?? 'fact', sourceSessionId: x.source_session_id ?? null })))
        created.memories += memories.length
      }

      // Settings — M10: machine-local secrets (gateway_token / gateway_* /
      // agent_workspace_root) are never applied from a bundle. A malicious or
      // stale bundle must not be able to rewrite the local gateway auth token.
      for (const [k, v] of Object.entries(settings)) {
        if (isSensitiveSettingKey(k)) continue
        try { db.setSetting(k, String(v)) } catch {}
      }

      // Model scores: resolve (provider|model) back to local model ids.
      for (const sc of modelScores) {
        const mid = modelIdByName[`${sc.provider_name}|${sc.model_name}`]
        if (mid == null) continue
        try {
          db.run('INSERT INTO model_score (model_id, intent, score, win_count, total_count) VALUES (?, ?, ?, ?, ?) ON CONFLICT(model_id, intent) DO UPDATE SET score = excluded.score, win_count = excluded.win_count, total_count = excluded.total_count',
            mid, sc.intent, sc.score ?? 1000, sc.win_count ?? 0, sc.total_count ?? 0)
        } catch {}
      }

      // Arena votes: resolve model ids by name (first match across providers).
      const modelIdByBareName = {}
      for (const [key, mid] of Object.entries(modelIdByName)) {
        const bare = key.split('|')[1]
        if (modelIdByBareName[bare] == null) modelIdByBareName[bare] = mid
      }
      for (const v of arenaVotes) {
        try {
          const loserNames = (() => { try { return JSON.parse(v.loser_model_names || '[]') } catch { return [] } })()
          const resolvedLoserIds = loserNames.map(n => modelIdByBareName[n]).filter(x => x != null)
          db.run('INSERT INTO arena_vote (prompt, intent, winner_model_id, winner_model_name, loser_model_ids, loser_model_names) VALUES (?, ?, ?, ?, ?, ?)',
            v.prompt, v.intent, modelIdByBareName[v.winner_model_name] ?? v.winner_model_id ?? null,
            v.winner_model_name, JSON.stringify(resolvedLoserIds), v.loser_model_names)
        } catch {}
      }

      // Background image (file on disk).
      if (backgroundImg) {
        try {
          const m = /^data:([^;]+);base64,(.*)$/s.exec(backgroundImg)
          if (m) {
            fs.writeFileSync(bgPath(), Buffer.from(m[2], 'base64'))
            fs.writeFileSync(bgMetaPath(), m[1])
          }
        } catch {}
      }

      db.saveDatabase()
      return { success: true, created, skipped }
    } catch (e) {
      return { success: false, error: String(e.message || e) }
    }
  })
}

module.exports = { registerConfigHandlers }