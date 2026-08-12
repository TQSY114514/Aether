// ───────────────────────────────────────────────────────────────────────────
// AetherAI centralized feature-flag registry (Phase 0 infrastructure).
//
// One source of truth for every capability gate in the app, so large features
// (cloud execution, worktree isolation, LSP full mode, plugin SDK, ...) can
// ship behind a flag and be toggled without touching their call sites.
//
// Design rules:
//   - FLAG_DEFS is the ONLY place a flag is declared (key + default + category
//     + description). Adding a feature = adding one entry here.
//   - Persistence lives in the `settings` table under the key `feature_flag.<key>`
//     (a string '1'/'0'). No new table, no migration.
//   - Missing key in DB → the declared default applies. Old DBs keep working
//     (backward compatibility by construction).
//   - Unknown keys → default `false` / `null`, NEVER throws. A typo'd flag
//     must be a no-op, not a crash.
//   - All functions tolerate a null/absent db (headless agentCore, unit tests).
// ───────────────────────────────────────────────────────────────────────────

const PREFIX = 'feature_flag.'

// ─── Registry ───────────────────────────────────────────────────────────────

// Each entry: { key, default, category, description }
// `default` is a boolean. Categories mirror the roadmap phases so the
// Settings UI can group them later.
const FLAG_DEFS = [
  // Phase 0 — debug / observability
  { key: 'debug.fileLog',        default: true,  category: 'debug',       description: 'Persist main-process logs to aetherai.log' },
  { key: 'debug.logForward',     default: false, category: 'debug',       description: 'Forward main-process logs to the renderer (logs panel)' },
  // Phase 0/2 — code intelligence (already-shipped capabilities, now gated)
  { key: 'repoMap.enabled',      default: true,  category: 'code-intel',  description: 'Inject the repo map into the agent tool loop' },
  { key: 'lsp.full',             default: false, category: 'code-intel',  description: 'Full LSP feature set (definition / references / rename / code actions)' },
  // Phase 1 — cloud execution + parallel tasks
  { key: 'exec.docker',          default: false, category: 'exec',        description: 'Docker sandbox execution backend' },
  { key: 'exec.ssh',             default: false, category: 'exec',        description: 'SSH remote execution backend' },
  { key: 'exec.cloud',           default: false, category: 'exec',        description: 'Cloud sandbox execution backend' },
  { key: 'scheduler.queue',      default: false, category: 'exec',        description: 'Task queue with priority / retry / resume' },
  { key: 'agent.worktreeIsolation', default: false, category: 'agent',    description: 'Per-agent git worktree isolation' },
  // Phase 2 — background code intelligence
  { key: 'agent.backgroundReview', default: false, category: 'agent',     description: 'Background code review after file-touching tools' },
  // Phase 2 — agent quality (external review P0-1)
  { key: 'agent.toolRouter',     default: true,  category: 'agent',      description: 'Inject only task-relevant tools per turn (core always, github/lsp/agent/memory/git on keyword match)' },
  // Phase 3 — code understanding + orchestration
  { key: 'memory.codeUnderstanding', default: false, category: 'code-intel', description: 'Persist repo structure into the knowledge graph (kg_nodes/kg_edges)' },
  { key: 'agent.orchestrator',    default: false, category: 'agent',      description: 'Manager orchestration: plan → parallel sub-agents → summary' },
  // Phase 3 — network safety
  { key: 'network.policy',        default: false, category: 'agent',      description: 'Network allowlist policy for agent web tools (web_fetch/web_search)' },
  // Phase 4 — self-evolving memory
  { key: 'memory.experienceReplay', default: false, category: 'learning', description: 'Trajectory experience replay into the loop' },
  { key: 'skills.selfEvolution', default: false, category: 'learning',    description: 'Agent-created skill drafts (skill evolution)' },
  // Phase 6 — ecosystem
  { key: 'plugin.sdk',           default: false, category: 'ecosystem',   description: 'Third-party plugin SDK (registerTool/Skill/Agent/Provider)' },
  // Phase 6 — UX / onboarding
  { key: 'ux.firstRunWizard',   default: true,  category: 'ux',          description: 'First-run onboarding wizard (provider setup + permission recommendation)' },
]

const DEFS = Object.freeze(FLAG_DEFS.map(d => Object.freeze({ ...d })))

// Map key → def for O(1) lookup.
const DEF_BY_KEY = new Map(DEFS.map(d => [d.key, d]))

// ─── Normalization ──────────────────────────────────────────────────────────

// Accept any of the app's truthy/falsy storage spellings.
function normalizeValue(value) {
  if (value === true || value === 1 || value === '1' || value === 'true' || value === 'on' || value === 'yes') return '1'
  if (value === false || value === 0 || value === '0' || value === 'false' || value === 'off' || value === 'no' || value === null || value === undefined || value === '') return '0'
  return null // unparseable → caller decides (treat as unset)
}

// ─── Core API ───────────────────────────────────────────────────────────────

// Registered flag definitions (read-only copy).
function defs() {
  return DEFS
}

// True if `key` is a registered flag.
function has(key) {
  return DEF_BY_KEY.has(key)
}

// Raw stored value for a flag: '1' | '0' | null (null = not stored → default).
// Never throws, even with a broken db or an unknown key.
function getRaw(db, key) {
  const def = DEF_BY_KEY.get(key)
  if (!def) return null
  try {
    if (!db || typeof db.getSetting !== 'function') return null
    const v = db.getSetting(PREFIX + key)
    return v === null || v === undefined ? null : String(v)
  } catch {
    return null
  }
}

// Effective boolean for a flag: stored value if present, else the declared
// default. A stored-but-unparseable value also falls back to the default (a
// corrupt row must behave like an unset one). Unknown keys are false.
// Never throws.
function isEnabled(db, key) {
  const def = DEF_BY_KEY.get(key)
  if (!def) return false
  const raw = getRaw(db, key)
  if (raw === null) return def.default
  const normalized = normalizeValue(raw)
  if (normalized === null) return def.default
  return normalized === '1'
}

// Set a flag. Returns { ok: true, key, value } on success or
// { ok: false, key, error } when the key is unknown / value unparseable /
// persistence fails. `value` accepts the same spellings as normalizeValue.
// Persisting the same state as the current one is a no-op (returns ok:true).
function set(db, key, value) {
  const def = DEF_BY_KEY.get(key)
  if (!def) return { ok: false, key, error: `unknown feature flag: ${key}` }
  const normalized = normalizeValue(value)
  if (normalized === null) return { ok: false, key, error: `invalid feature flag value: ${String(value)}` }
  if (!db || typeof db.setSetting !== 'function') {
    return { ok: false, key, error: 'db unavailable (headless mode)' }
  }
  try {
    db.setSetting(PREFIX + key, normalized)
    return { ok: true, key, value: normalized }
  } catch (e) {
    return { ok: false, key, error: e && e.message ? e.message : String(e) }
  }
}

// Full listing for the Settings UI / debug tools.
// Returns [{ key, default, value, enabled, category, description }].
function list(db) {
  return DEFS.map(d => {
    const raw = getRaw(db, d.key)
    const enabled = isEnabled(db, d.key)
    return {
      key: d.key,
      default: d.default,
      value: raw,               // '1' | '0' | null (null = default applies)
      enabled,
      category: d.category,
      description: d.description,
    }
  })
}

// ─── Safe-mode (one-click conservative defaults) ────────────────────────────
// "一键安全默认": 把所有 Experimental / Beta 能力强制关闭并持久化, 只保留
// debug 观测与已发布的稳定能力(repoMap / firstRunWizard)。
// 返回 [{ key, value }] 实际写入的清单; 无 db 时返回空数组(不抛错)。
// category 约定: 'debug' 与 'ux' 视为稳定; 其余(exec/agent/code-intel/
// learning/ecosystem 下的实验项)全部关。
function applySafeMode(db) {
  const written = []
  if (!db || typeof db.setSetting !== 'function') return written
  for (const d of DEFS) {
    // 稳定保留: debug 观测 + 首次运行向导(已发布 UX)
    if (d.category === 'debug' || d.key === 'ux.firstRunWizard') continue
    try {
      const cur = isEnabled(db, d.key)
      if (cur !== false) {
        db.setSetting(PREFIX + d.key, '0')
        written.push({ key: d.key, value: '0' })
      }
    } catch {}
  }
  return written
}

module.exports = {
  PREFIX,
  FLAG_DEFS: DEFS,
  defs,
  has,
  getRaw,
  isEnabled,
  set,
  list,
  applySafeMode,
  normalizeValue,
}
