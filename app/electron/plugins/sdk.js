// ───────────────────────────────────────────────────────────────────────────
// Plugin SDK — lightweight third-party extension surface.
//
// A factory (`createPluginSDK()`) returns an isolated SDK instance with
// registration APIs for the four plugin kinds this app supports:
//   registerTool(name, def)      — mutating tool → merged into the tool registry
//   registerSkill(name, def)     — SKILL.md-style capability
//   registerAgent(name, def)     — a persona-like agent preset
//   registerProvider(name, def)  — a provider config fragment
//
// Plus plugin manifest loading from a directory: every `<dir>/*/plugin.js`
// exports a function that receives the SDK instance, so plugins self-register.
//
// Gated by the `plugin.sdk` feature flag (default off): when disabled the
// factory still works (module is testable) but directory loading no-ops.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const log = require('../logger')

const FLAG_KEY = 'plugin.sdk'

// ─── SDK factory ────────────────────────────────────────────────────────────

/**
 * Create an isolated plugin SDK instance.
 * Each instance keeps its own registries so multiple plugin dirs / tests
 * never collide.
 *
 * @param {object} [opts]  { log: fn } — override logger (for tests)
 */
function createPluginSDK(opts = {}) {
  const tools = new Map()     // name → { name, description, parameters, run, risk }
  const skills = new Map()    // name → { name, description, path? }
  const agents = new Map()    // name → { name, description, systemPrompt? }
  const providers = new Map() // name → { name, apiFormat, apiUrl?, key? }
  const enabled = () => {
    const db = opts.db
    if (!db || typeof db.getSetting !== 'function') return true // default on for SDK surface
    try { return String(db.getSetting(`feature_flag.${FLAG_KEY}`) ?? '1') !== '0' } catch { return true }
  }

  function registerTool(name, def) {
    if (!name || typeof name !== 'string') throw new Error('registerTool: name is required')
    if (!def || (typeof def.run !== 'function' && typeof def.handler !== 'function')) {
      throw new Error(`registerTool('${name}'): a run/handler function is required`)
    }
    const normalized = {
      name,
      description: String(def.description || `Plugin tool: ${name}`),
      risk: def.risk || 'safe',
      parameters: def.parameters || { type: 'object', properties: {} },
      run: def.run || def.handler,
      plugin: true,
    }
    tools.set(name, normalized)
    return normalized
  }

  function registerSkill(name, def = {}) {
    if (!name) throw new Error('registerSkill: name is required')
const normalized = {
      name,
      description: String(def.description || ''),
      path: def.path || null,
      body: def.body || '',
    }
    skills.set(name, normalized)
    return normalized
  }

  function registerAgent(name, def = {}) {
    if (!name) throw new Error('registerAgent: name is required')
    const normalized = {
      name,
      description: String(def.description || ''),
      systemPrompt: def.systemPrompt || '',
    }
    agents.set(name, normalized)
    return normalized
  }

  function registerProvider(name, def = {}) {
    if (!name) throw new Error('registerProvider: name is required')
    const normalized = {
      name,
      apiFormat: def.apiFormat || 'openai',
      apiUrl: def.apiUrl || null,
      key: def.key || null,
      models: Array.isArray(def.models) ? def.models : [],
    }
    providers.set(name, normalized)
    return normalized
  }

  function list(kind) {
    const map = kind === 'tools' ? tools : kind === 'skills' ? skills : kind === 'agents' ? agents : kind === 'providers' ? providers : null
    if (!map) throw new Error(`list: unknown kind "${kind}"`)
    return [...map.values()]
  }

  /**
   * Load every plugin in `rootDir`: each immediate subdirectory with a
   * plugin.js is required and invoked with a *new* child SDK (self-contained
   * registries). Returns the number of plugins loaded.
   */
  function loadPluginDir(rootDir) {
    if (!enabled()) return 0
    if (!rootDir || !fs.existsSync(rootDir)) return 0
    let entries
    try { entries = fs.readdirSync(rootDir, { withFileTypes: true }) } catch (e) { log.warn('pluginSDK: read dir failed:', e.message); return 0 }
let loaded = 0
    const mergeFrom = (child) => {
      for (const t of child.registry.tools.values()) tools.set(t.name, t)
      for (const s of child.registry.skills.values()) skills.set(s.name, s)
      for (const a of child.registry.agents.values()) agents.set(a.name, a)
      for (const p of child.registry.providers.values()) providers.set(p.name, p)
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const pluginFile = path.join(rootDir, entry.name, 'plugin.js')
      if (!fs.existsSync(pluginFile)) continue
      const child = createPluginSDK(opts)
      try {
        const mod = require(pluginFile)
        const fn = mod && typeof mod.default === 'function' ? mod.default : mod
        if (typeof fn !== 'function') {
          log.warn(`plugin-sdk: plugin "${entry.name}" plugin.js does not export a function`)
          continue
        }
        const result = fn(child)
        if (result && typeof result.then === 'function') {
          result.then(() => { mergeFrom(child) }).catch(e => log.warn(`plugin-sdk: ${entry.name} rejected:`, e.message))
        } else {
          mergeFrom(child)
        }
        loaded++
      } catch (e) {
        log.warn(`plugin-sdk: failed to load plugin "${entry.name}":`, e && e.message)
      }
    }
    return loaded
  }

  return {
    FLAG_KEY,
    registerTool,
    registerSkill,
    registerAgent,
    registerProvider,
    listTools: () => list('tools'),
    listSkills: () => list('skills'),
    listAgents: () => list('agents'),
    listProviders: () => list('providers'),
    get tools() { return [...tools.values()] },
    get skills() { return [...skills.values()] },
    get agents() { return [...agents.values()] },
    get providers() { return [...providers.values()] },
    registry: { tools, skills, agents, providers },
    loadPluginDir,
    isEnabled: enabled,
  }
}

module.exports = {
  FLAG_KEY,
  createPluginSDK,
}