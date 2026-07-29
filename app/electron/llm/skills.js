// ───────────────────────────────────────────────────────────────────────────
// Skills loader (Claude-Code-compatible SKILL.md format).
//
// A skill is a directory whose name matches the frontmatter `name`, containing
// a required SKILL.md with YAML frontmatter (required: name, description;
// optional: disabled). The body is markdown instructions. Bundled scripts/,
// references/, assets/ are read on demand via the existing read_file tool —
// zero new infrastructure for progressive-disclosure level 3.
//
// Scan roots (precedence: first match wins by name):
//   <workspace>/.claude/skills   ← Claude-Code compat (public skill corpus)
//   <workspace>/.aetherai/skills ← app-native
//   <userData>/skills            ← user-global, ships a few built-ins here
//
// Only name + description + filePath enter the system prompt (as an
// <available_skills> XML block, ~100 tokens/skill). The SKILL.md body is
// loaded ONLY when the model calls the use_skill tool — progressive disclosure.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const { getWorkspaceRoot } = require('../tools/sandbox')

// In-memory index: name → skill metadata. Refreshed on demand.
let _skills = new Map()

// Usage tracking: skill name → { count, lastUsedAt }.
// Persisted to disk via the database on each invocation.
let _usage = {}
let _usageTimer = null

// Minimal YAML frontmatter parser — we only need name / description / disabled,
// so no js-yaml dependency. Handles `---\nkey: value\n---` blocks.
function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return { meta: {}, body: text }
  const meta = {}
  for (const line of m[1].split('\n')) {
    const mm = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (mm) meta[mm[1].trim().toLowerCase()] = mm[2].trim().replace(/^["']|["']$/g, '')
  }
  return { meta, body: text.slice(m[0].length).replace(/^\r?\n/, '') }
}

function loadSkillsFromDir(dir) {
  const found = []
  if (!dir) return found
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return found }
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name === 'node_modules') continue
    const skillPath = path.join(dir, ent.name, 'SKILL.md')
    let text
    try { text = fs.readFileSync(skillPath, 'utf-8') } catch { continue }
    const { meta, body } = parseFrontmatter(text)
    // Validate: name + description required, and name should match dir name
    // (Claude-Code convention; we warn but don't hard-fail on mismatch).
    if (!meta.name || !meta.description) continue
    if (meta.disabled === 'true' || meta.disabled === true) continue
    // Collect optional metadata fields from frontmatter — unrecognized keys
    // are silently dropped so users can add tags/category/version etc.
    const extra = {}
    const KNOWN_KEYS = new Set(['name', 'description', 'disabled'])
    for (const [k, v] of Object.entries(meta)) {
      if (!KNOWN_KEYS.has(k)) extra[k] = v
    }
    found.push({
      name: meta.name,
      description: meta.description,
      filePath: skillPath,
      baseDir: path.join(dir, ent.name),
      body,
      metadata: Object.keys(extra).length > 0 ? extra : undefined,
    })
  }
  return found
}

// Scan all roots and build the index. Idempotent — safe to call on startup
// and on a manual rescan. Returns the count of skills indexed.
function scanSkills() {
  const roots = []
  const ws = getWorkspaceRoot()
  if (ws) {
    roots.push(path.join(ws, '.claude', 'skills'))
    roots.push(path.join(ws, '.aetherai', 'skills'))
  }
  roots.push(path.join(app.getPath('userData'), 'skills'))
  // Built-in skills shipped with the app (lowest precedence — user copies override).
  roots.push(path.join(__dirname, '..', '..', 'skills'))
  const byName = new Map()
  for (const root of roots) {
    for (const s of loadSkillsFromDir(root)) {
      // First match wins (precedence: workspace .claude > .aetherai > userData > built-in).
      if (!byName.has(s.name)) byName.set(s.name, s)
    }
  }
  _skills = byName
  loadSkillUsage()
  return _skills.size
}

function getSkills() { return Array.from(_skills.values()) }
function getSkillBody(name) { return _skills.get(name)?.body || null }
function getSkill(name) { return _skills.get(name) || null }

// Add or replace a single skill in the in-memory index without a disk rescan.
// Used by habitLearner.promoteToSkill to refresh the user-habits entry in O(1).
function upsertSkill(name, skill) { _skills.set(name, skill) }

// ─── Usage Tracking ─────────────────────────────────────────────────────────
// Track when each skill is invoked so the UI can show usage counts and
// last-used timestamps. Debounced disk write to avoid I/O on every call.

function recordSkillUse(name) {
  _usage[name] = { count: (_usage[name]?.count || 0) + 1, lastUsedAt: new Date().toISOString() }
  if (!_usageTimer) {
    _usageTimer = setTimeout(() => {
      _usageTimer = null
      try {
        const dbi = require('../database')
        if (!dbi.run) return
        for (const [name, u] of Object.entries(_usage)) {
          try {
            dbi.run('INSERT OR REPLACE INTO skill_usage (name, use_count, last_used_at) VALUES (?, ?, ?)',
              [name, u.count, u.lastUsedAt])
          } catch {}
        }
        try { dbi.saveDatabase() } catch {}
      } catch {}
    }, 2000)
  }
}

function getSkillUsage() { return _usage }
function resetSkillUsage() { _usage = {} }

// Load usage data from the database (called on startup).
function loadSkillUsage() {
  try {
    const dbi = require('../database')
    if (!dbi.allRows) return
    const rows = dbi.allRows('SELECT name, use_count, last_used_at FROM skill_usage') || []
    for (const row of rows) {
      _usage[row.name] = { count: row.use_count || 0, lastUsedAt: row.last_used_at || null }
    }
  } catch {}
}

// Build the <available_skills> system-prompt block. Only name + description
// appear (progressive-disclosure level 1). The use_skill tool loads the body.
// Compact the home-dir prefix to ~ to save tokens (from OpenClaw's
// compactSkillPaths idea).
function formatSkillsForPrompt() {
  const skills = getSkills()
  if (skills.length === 0) return ''
  const home = app.getPath('home')
  const compact = (p) => {
    try { return p.replace(home, '~') } catch { return p }
  }
  const items = skills.map(s => `  - name: ${s.name}\n    description: ${s.description}\n    path: ${compact(s.filePath)}`).join('\n')
  return `<available_skills>\nThe following skills are available. When the user's request matches a skill's description, call the use_skill tool with the skill name to load its full instructions, then follow them. Only load a skill when it is relevant to the task.\n${items}\n</available_skills>`
}

// ───────────────────────────────────────────────────────────────────────────
// Slash command loader (Claude-Code-compatible .claude/commands/ format).
//
// A command is a directory under a `commands/` folder containing a CMD.md with
// YAML frontmatter (required: name, description, prompt; optional: disabled).
// Scan roots mirror the skills scan roots but under `commands/` sub-dirs:
//   <workspace>/.claude/commands   ← Claude-Code compat
//   <workspace>/.aetherai/commands ← app-native
//   <userData>/commands            ← user-global
//   <app>/commands                 ← built-in (lowest precedence)
// ───────────────────────────────────────────────────────────────────────────

let _commands = new Map()

function loadCommandsFromDir(dir) {
  const found = []
  if (!dir) return found
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return found }
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name === 'node_modules') continue
    const cmdFile = path.join(dir, ent.name, 'CMD.md')
    let text
    try { text = fs.readFileSync(cmdFile, 'utf-8') } catch { continue }
    const { meta, body } = parseFrontmatter(text)
    if (!meta.name || !meta.prompt) continue
    if (meta.disabled === 'true' || meta.disabled === true) continue
    found.push({
      id: ent.name,
      name: meta.name,
      description: meta.description || '',
      prompt: meta.prompt,
    })
  }
  return found
}

function scanCommands() {
  const roots = []
  const ws = getWorkspaceRoot()
  if (ws) {
    roots.push(path.join(ws, '.claude', 'commands'))
    roots.push(path.join(ws, '.aetherai', 'commands'))
  }
  roots.push(path.join(app.getPath('userData'), 'commands'))
  roots.push(path.join(__dirname, '..', '..', 'commands'))
  const byId = new Map()
  for (const root of roots) {
    for (const c of loadCommandsFromDir(root)) {
      if (!byId.has(c.id)) byId.set(c.id, c)
    }
  }
  _commands = byId
  return _commands.size
}

function getCommands() { return Array.from(_commands.values()) }
function getCommand(id) { return _commands.get(id) || null }

// Re-scan skills AND commands together (convenience for callers).
function rescan() { scanSkills(); scanCommands() }

module.exports = {
  scanSkills, getSkills, getSkill, getSkillBody, formatSkillsForPrompt, parseFrontmatter, upsertSkill,
  scanCommands, getCommands, getCommand, rescan,
  recordSkillUse, getSkillUsage, resetSkillUsage, loadSkillUsage,
}
