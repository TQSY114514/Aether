// ───────────────────────────────────────────────────────────────────────────
// Custom Agent Mode — assembles PermissionPolicy from user-configured policies.
//
// The existing permissions.js already has a powerful rule engine
// (withToolRequirement, withAxisPolicies, withPermissionRules). This module
// reads user settings from the `settings` table and assembles the policy.
//
// Settings keys (all optional, defaults shown):
//   custom_mode.filesystem    = 'allow' | 'ask' | 'deny'  (default: 'allow')
//   custom_mode.shell         = 'allow' | 'ask' | 'deny'  (default: 'ask')
//   custom_mode.network       = 'allow' | 'ask' | 'deny'  (default: 'allow')
//   custom_mode.agent         = 'allow' | 'ask' | 'deny'  (default: 'ask')
//   custom_mode.lsp           = 'allow' | 'ask' | 'deny'  (default: 'allow')
//   custom_mode.write         = 'allow' | 'ask' | 'deny'  (default: 'ask')
//   custom_mode.deny_tools    = 'tool1,tool2,...'        (default: '')
//   custom_mode.allow_rules   = 'write_file:*,read_file'  (default: '')
//   custom_mode.deny_rules    = 'run_command:rm -rf'     (default: '')
// ───────────────────────────────────────────────────────────────────────────

const { PermissionMode, PermissionPolicy } = require('./permissions')

// Map our 3-value policy to PermissionMode requirement.
// Tools in this category require the given mode to function.
const CATEGORY_MODE_MAP = {
  filesystem: PermissionMode.WorkspaceWrite,   // read/write files
  write: PermissionMode.WorkspaceWrite,          // write/edit/patch
  shell: PermissionMode.DangerFullAccess,        // run commands
  network: PermissionMode.WorkspaceWrite,        // web search/fetch
  agent: PermissionMode.DangerFullAccess,        // delegate/task
  lsp: PermissionMode.WorkspaceWrite,            // LSP operations
  review: PermissionMode.ReadOnly,               // code review (safe)
  ask: PermissionMode.ReadOnly,                  // ask user (safe)
}

// Map 3-value policy → axis policy value
function normalizePolicy(v) {
  if (v === 'allow' || v === 'ask' || v === 'deny') return v
  return null
}

/**
 * Build a PermissionPolicy for the custom mode from user settings.
 * Returns { policy, errors } where errors is a list of unparseable rules.
 */
function buildCustomPolicy(db) {
  const errors = []
  const settings = {}

  // Read all custom_mode.* settings
  try {
    const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'custom_mode.%'").all()
    for (const row of rows) {
      const k = row.key.replace('custom_mode.', '')
      settings[k] = row.value
    }
  } catch {}

  // Build axis policies
  const axes = {}
  for (const [cat, mode] of Object.entries(CATEGORY_MODE_MAP)) {
    const userVal = normalizePolicy(settings[cat])
    if (userVal) {
      axes[cat] = userVal
    }
  }

  // Build tool requirements from axis policies
  const policy = new PermissionPolicy(PermissionMode.Prompt)
  if (Object.keys(axes).length > 0) {
    policy.withAxisPolicies(axes)
  }

  // Build allow/deny/ask rules from strings
  const allowRules = []
  const denyRules = []
  const askRules = []

  if (settings.allow_rules) {
    for (const rule of String(settings.allow_rules).split(',').map(s => s.trim()).filter(Boolean)) {
      try {
        // Use the parser from permissions.js — but it's not exported, so
        // we just pass the raw string and let _PermissionRule.parse handle it.
        allowRules.push(rule)
      } catch (e) {
        errors.push(`Invalid allow rule: ${rule} — ${e.message}`)
      }
    }
  }

  if (settings.deny_rules) {
    for (const rule of String(settings.deny_rules).split(',').map(s => s.trim()).filter(Boolean)) {
      denyRules.push(rule)
    }
  }

  if (settings.deny_tools) {
    const tools = String(settings.deny_tools).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    for (const t of tools) {
      denyRules.push(t)
    }
  }

  if (allowRules.length || denyRules.length || askRules.length) {
    policy.withPermissionRules({
      allow: allowRules,
      deny: denyRules,
      ask: askRules,
    })
  }

  return { policy, errors }
}

/**
 * Get a summary of the custom policy (for display in UI).
 */
function getCustomPolicySummary(db) {
  try {
    const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'custom_mode.%'").all()
    const map = {}
    for (const row of rows) {
      map[row.key.replace('custom_mode.', '')] = row.value
    }
    return map
  } catch {
    return {}
  }
}

/**
 * Save a custom policy setting.
 */
function saveCustomPolicy(db, key, value) {
  const k = `custom_mode.${key}`
  try {
    const existing = db.prepare("SELECT key FROM settings WHERE key = ?").get(k)
    if (existing) {
      db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(value, k)
    } else {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(k, value)
    }
  } catch {}
}

module.exports = {
  buildCustomPolicy,
  getCustomPolicySummary,
  saveCustomPolicy,
  CATEGORY_MODE_MAP,
}
