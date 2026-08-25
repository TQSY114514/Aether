// ───────────────────────────────────────────────────────────────────────────
// External-config import handler (channel: 'config:import-external').
//
// One-click onboarding import: auto-discovers provider configs that the user
// already has on disk from Claude Code and OpenCode, maps them into Aether's
// provider/model shape, and merges them into the local DB (dedupe by name).
//
// Sources (all optional — missing files are skipped, never an error):
//   - Claude Code: ~/.claude.json        (primaryApiKey / apiKeyHelper / env)
//                  ~/.claude/settings.json (env.ANTHROPIC_API_KEY / BASE_URL)
//   - OpenCode:    ~/.config/opencode/opencode.json (provider entries with
//                  api/key/baseURL/npm fields + models)
//                  ~/.config/opencode/auth.json     ({"<providerId>": {"api_key"|"key"}})
//
// The pure parsers below take file CONTENT (strings) and return mapped
// providers/models — they are deliberately free of electron/fs so they can be
// unit-tested with plain node (see the wizardrep replica test). The handler
// only reads files and merges into the DB.
//
// Keys are stored via db.addProvider, which encrypts through safeStorage inside
// the db layer — this handler never touches encryption itself.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const os = require('os')
const path = require('path')

// ── Pure parsers (no electron, no fs) ─────────────────────────────────────

// Map an OpenCode SDK npm package to an Aether api_format. Unknown → 'openai'
// (the de-facto common protocol most proxies speak, matching providerAdapter).
function mapNpmToFormat(npm) {
  if (!npm) return 'openai'
  const n = String(npm).toLowerCase()
  if (n.includes('anthropic')) return 'anthropic'
  if (n.includes('responses')) return 'responses'
  return 'openai'
}

// Defensive key extraction from an object that may use api_key / key / apiKey /
// api. Returns '' when nothing usable is present.
function extractKey(obj) {
  if (!obj || typeof obj !== 'object') return ''
  for (const k of ['api_key', 'key', 'apiKey', 'api']) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

// Sensible default base URL when a source doesn't provide one.
function defaultBaseUrl(apiFormat) {
  if (apiFormat === 'anthropic') return 'https://api.anthropic.com'
  return 'https://api.openai.com/v1'
}

// Parse OpenCode opencode.json content -> { providers, models, errors }.
// providers: [{ name, api_format, base_url, api_key }]
// models:    [{ provider_name, model_name }]
function parseOpenCodeConfig(content) {
  const providers = []
  const models = []
  let data
  try {
    data = JSON.parse(content)
  } catch (e) {
    return { providers, models, errors: [`opencode.json: invalid JSON (${e.message})`] }
  }
  const entries = (data && typeof data === 'object' && data.provider) || {}
  for (const [name, entry] of Object.entries(entries)) {
    if (!entry || typeof entry !== 'object') continue
    const api_format = mapNpmToFormat(entry.npm)
    const base_url = (entry.baseURL || entry.baseUrl || '').trim() || defaultBaseUrl(api_format)
    const api_key = extractKey(entry)
    providers.push({ name, api_format, base_url, api_key })
    const modelEntries = (entry.models && typeof entry.models === 'object') ? entry.models : {}
    for (const modelName of Object.keys(modelEntries)) {
      models.push({ provider_name: name, model_name: modelName })
    }
  }
  return { providers, models, errors: [] }
}

// Parse OpenCode auth.json content -> { keys: {providerId: apiKey}, errors }.
// Structures vary ({"<id>": {"api_key"|"key": ...}}) — parse defensively.
function parseOpenCodeAuth(content) {
  const keys = {}
  let data
  try {
    data = JSON.parse(content)
  } catch (e) {
    return { keys, errors: [`auth.json: invalid JSON (${e.message})`] }
  }
  if (!data || typeof data !== 'object') return { keys, errors: [] }
  for (const [providerId, entry] of Object.entries(data)) {
    const key = extractKey(entry)
    if (key) keys[providerId] = key
  }
  return { keys, errors: [] }
}

// Parse Claude Code ~/.claude.json content -> { providers, models, errors }.
// Best-effort: primaryApiKey / apiKeyHelper / env.ANTHROPIC_API_KEY.
function parseClaudeJson(content) {
  const providers = []
  let data
  try {
    data = JSON.parse(content)
  } catch (e) {
    return { providers, models: [], errors: [`~/.claude.json: invalid JSON (${e.message})`] }
  }
  if (!data || typeof data !== 'object') return { providers, models: [], errors: [] }
  const env = (data.env && typeof data.env === 'object') ? data.env : {}
  const key = (typeof data.primaryApiKey === 'string' && data.primaryApiKey.trim())
    ? data.primaryApiKey.trim()
    : (typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY.trim() : '')
  const base_url = (typeof env.ANTHROPIC_BASE_URL === 'string' && env.ANTHROPIC_BASE_URL.trim())
    ? env.ANTHROPIC_BASE_URL.trim() : defaultBaseUrl('anthropic')
  // Only surface a provider when there is something usable (a key or a helper).
  if (key || data.apiKeyHelper) {
    providers.push({ name: 'Anthropic', api_format: 'anthropic', base_url, api_key: key })
  }
  return { providers, models: [], errors: [] }
}

// Parse Claude Code ~/.claude/settings.json content -> { providers, models, errors }.
function parseClaudeSettings(content) {
  const providers = []
  let data
  try {
    data = JSON.parse(content)
  } catch (e) {
    return { providers, models: [], errors: [`~/.claude/settings.json: invalid JSON (${e.message})`] }
  }
  if (!data || typeof data !== 'object') return { providers, models: [], errors: [] }
  const env = (data.env && typeof data.env === 'object') ? data.env : {}
  const key = (typeof env.ANTHROPIC_API_KEY === 'string' && env.ANTHROPIC_API_KEY.trim())
    ? env.ANTHROPIC_API_KEY.trim() : ''
  const base_url = (typeof env.ANTHROPIC_BASE_URL === 'string' && env.ANTHROPIC_BASE_URL.trim())
    ? env.ANTHROPIC_BASE_URL.trim() : defaultBaseUrl('anthropic')
  if (key) {
    providers.push({ name: 'Anthropic', api_format: 'anthropic', base_url, api_key: key })
  }
  return { providers, models: [], errors: [] }
}

// ── Disk + DB layer ────────────────────────────────────────────────────────

function readJsonFile(filePath) {
  try {
    // All call sites below pass constant paths under os.homedir(); the guard
    // exists purely defensively (scanner finding) — it rejects traversal
    // segments without rejecting legitimate absolute paths.
    if (String(filePath).split(/[\\/]+/).includes('..')) return { ok: false, reason: 'invalid path' }
    if (!fs.existsSync(filePath)) return { ok: false, reason: 'missing' }
    return { ok: true, content: fs.readFileSync(filePath, 'utf8') }
  } catch (e) {
    return { ok: false, reason: `read failed: ${e.message}` }
  }
}

function registerConfigImportHandler(ipcMain, db) {
  ipcMain.handle('config:import-external', async () => {
    const errors = []
    const skipped = []
    const found = { providers: [], models: [] }
    const home = os.homedir()

    // ── Claude Code ────────────────────────────────────────────────────────
    const claudeJson = readJsonFile(path.join(home, '.claude.json'))
    if (claudeJson.ok) {
      const r = parseClaudeJson(claudeJson.content)
      found.providers.push(...r.providers)
      found.models.push(...r.models)
      errors.push(...r.errors)
    } else if (claudeJson.reason !== 'missing') {
      errors.push(`~/.claude.json: ${claudeJson.reason}`)
    }
    const claudeSettings = readJsonFile(path.join(home, '.claude', 'settings.json'))
    if (claudeSettings.ok) {
      const r = parseClaudeSettings(claudeSettings.content)
      found.providers.push(...r.providers)
      found.models.push(...r.models)
      errors.push(...r.errors)
    } else if (claudeSettings.reason !== 'missing') {
      errors.push(`~/.claude/settings.json: ${claudeSettings.reason}`)
    }

    // ── OpenCode ───────────────────────────────────────────────────────────
    const opencodeJson = readJsonFile(path.join(home, '.config', 'opencode', 'opencode.json'))
    if (opencodeJson.ok) {
      const r = parseOpenCodeConfig(opencodeJson.content)
      found.providers.push(...r.providers)
      found.models.push(...r.models)
      errors.push(...r.errors)
    } else if (opencodeJson.reason !== 'missing') {
      errors.push(`opencode.json: ${opencodeJson.reason}`)
    }
    const opencodeAuth = readJsonFile(path.join(home, '.config', 'opencode', 'auth.json'))
    if (opencodeAuth.ok) {
      const r = parseOpenCodeAuth(opencodeAuth.content)
      // Attach auth.json keys to matching providers that didn't carry their own.
      for (const p of found.providers) {
        if (!p.api_key && r.keys[p.name]) p.api_key = r.keys[p.name]
      }
      errors.push(...r.errors)
    } else if (opencodeAuth.reason !== 'missing') {
      errors.push(`auth.json: ${opencodeAuth.reason}`)
    }

    // ── Merge into DB (dedupe by name, mirroring config.handler.js) ────────
    const created = { providers: 0, models: 0 }
    try {
      const existingProviders = db.getProviders()
      const nameToId = {}
      for (const p of existingProviders) nameToId[p.name] = p.id

      for (const p of found.providers) {
        if (!p.name) continue
        if (nameToId[p.name]) { skipped.push(`provider "${p.name}" already exists`); continue }
        const res = db.addProvider({
          name: p.name,
          api_url: p.base_url || defaultBaseUrl(p.api_format),
          api_key: p.api_key || '',
          api_format: p.api_format || 'openai',
          enabled: 1,
        })
        nameToId[p.name] = res.lastInsertRowid
        created.providers++
      }

      const existingModels = db.getAllModels()
      const modelKey = new Set(existingModels.map((m) => `${m.provider_name || ''}|${m.model_name}`))
      for (const m of found.models) {
        const pid = nameToId[m.provider_name]
        if (!pid) { skipped.push(`model "${m.model_name}" has no provider "${m.provider_name}"`); continue }
        const key = `${m.provider_name}|${m.model_name}`
        if (modelKey.has(key)) { skipped.push(`model "${m.model_name}" already exists`); continue }
        const result = db.addModel({
          provider_id: pid, model_name: m.model_name, display_name: null,
          is_primary: 0, fallback_order: null, context_window: null,
          input_price_per_1k: null, output_price_per_1k: null,
        })
        db.initModelScores(result.lastInsertRowid)
        modelKey.add(key)
        created.models++
      }

      db.saveDatabase()
    } catch (e) {
      errors.push(`merge failed: ${e.message}`)
    }

    return { created, skipped, errors }
  })
}

module.exports = {
  registerConfigImportHandler,
  // Pure parsers exported for the node --test replica (no electron required).
  parseClaudeJson,
  parseClaudeSettings,
  parseOpenCodeConfig,
  parseOpenCodeAuth,
  mapNpmToFormat,
  extractKey,
  defaultBaseUrl,
}
