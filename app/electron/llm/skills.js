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

// In-memory index: name → skill metadata. Refreshed on demand (no file watcher
// — desktop app reloads on session start or explicit rescan IPC).
let _skills = new Map()

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
    found.push({
      name: meta.name,
      description: meta.description,
      filePath: skillPath,
      baseDir: path.join(dir, ent.name),
      body,
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
  return _skills.size
}

function getSkills() { return Array.from(_skills.values()) }
function getSkillBody(name) { return _skills.get(name)?.body || null }
function getSkill(name) { return _skills.get(name) || null }

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

module.exports = { scanSkills, getSkills, getSkill, getSkillBody, formatSkillsForPrompt, parseFrontmatter }
