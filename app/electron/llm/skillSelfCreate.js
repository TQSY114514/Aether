// ───────────────────────────────────────────────────────────────────────────
// Skill Self-Creation — detect repeated agent behavior patterns and auto-draft
// SKILL.md files so the agent learns reusable workflows over time.
//
// Inspired by OpenClaw's skill self-creation and Hermes' long-term skill
// acquisition. Unlike habitLearner (which detects user preferences), this
// module detects *agent tool-use patterns* — sequences of tool calls the
// agent repeats across sessions — and drafts reusable SKILL.md recipes.
//
// Task 4.2 enhancement: patterns now also capture *argument templates*. Instead
// of recording a bare tool-name sequence, each tool call's arguments are
// generalized into a reusable template (e.g. `read_file({path: "<project>/src/**/*.ts"})`)
// so the auto-drafted SKILL.md is a parameterized recipe, not just a fixed
// sequence. Repeated calls with the same tool sequence accumulate the most
// common argument template per step.
//
// Flow:
//   1. recordPattern() — after each tool-loop round, record the tool sequence
//      plus per-tool argument templates
//   2. detectPatterns() — on cron:skill-scan, find repeated sequences
//   3. autoDraftSkill() — when a pattern repeats ≥ threshold times, draft a
//      parameterized SKILL.md into <workspace>/.aetherai/skills/auto/ for review
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { getWorkspaceRoot } = require('../tools/sandbox')
const log = require('../logger')

const PATTERN_THRESHOLD = 3    // seen 3 times → auto-draft
const MIN_SEQUENCE_LEN = 2     // at least 2 consecutive tool calls
const MAX_PATTERNS = 20        // keep at most 20 patterns in memory
const MAX_ARGS_KEPT = 8        // max number of distinct arg templates kept per step

// In-memory pattern store: sequence signature → { count, lastSeen, tools, params }
// `tools` is the array of tool names; `params` is an array aligned with `tools`,
// where each element is `{ templates: [{ template, count }] }` — the distinct
// argument templates seen for that step, most common first.
let _patterns = new Map()

// Path-ish argument keys that should be generalized to workspace-relative form.
const PATHISH_KEYS = new Set([
  'path', 'file_path', 'filePath', 'dir', 'directory', 'root', 'glob', 'pattern',
  'filename', 'src', 'dest', 'target', 'from', 'to', 'folder', 'cwd', 'file',
])

// Record a tool-call sequence (with arguments) from one agent round.
// `toolCalls` is an array of `{ name, args }` called in this round.
function recordPattern(toolCalls) {
  if (!toolCalls || toolCalls.length < MIN_SEQUENCE_LEN) return
  const names = toolCalls.map(tc => tc.name).filter(Boolean)
  if (names.length < MIN_SEQUENCE_LEN) return
  const sig = names.join('→')
  const templates = toolCalls.map(tc => extractArgTemplate(tc.name, tc.args || {}))
  const existing = _patterns.get(sig)
  if (existing) {
    existing.count++
    existing.lastSeen = Date.now()
    mergeTemplates(existing.params, templates)
  } else {
    if (_patterns.size >= MAX_PATTERNS) {
      // Evict the oldest pattern
      let oldest = null
      for (const [k, v] of _patterns) {
        if (!oldest || v.lastSeen < oldest.lastSeen) oldest = { k, ...v }
      }
      if (oldest) _patterns.delete(oldest.k)
    }
    _patterns.set(sig, {
      count: 1,
      lastSeen: Date.now(),
      tools: names,
      params: templates.map(t => ({ templates: [{ template: t, count: 1 }] })),
    })
  }
}

// Merge the argument templates from a new observation into the existing per-step
// template tally. Keeps at most MAX_ARGS_KEPT distinct templates per step so
// memory doesn't grow unbounded.
function mergeTemplates(existingParams, newTemplates) {
  if (!existingParams) return
  for (let i = 0; i < newTemplates.length; i++) {
    const bucket = existingParams[i] || (existingParams[i] = { templates: [] })
    const t = newTemplates[i]
    const entry = bucket.templates.find(x => x.template === t)
    if (entry) {
      entry.count++
    } else if (bucket.templates.length < MAX_ARGS_KEPT) {
      bucket.templates.push({ template: t, count: 1 })
    }
    bucket.templates.sort((a, b) => b.count - a.count)
  }
}

// ─── Argument template extraction ──────────────────────────────────────────
// Generalize a raw tool call into a reusable, parameterized template string,
// e.g. `read_file({path: "<project>/src/**/*.ts"})`. Path-ish values are made
// workspace-relative; literal short values are kept so the template stays useful.

function extractArgTemplate(toolName, args) {
  const parts = []
  for (const [key, value] of Object.entries(args || {})) {
    const g = generalizeArgValue(key, value)
    if (g === undefined) continue
    parts.push(`${key}: ${g}`)
  }
  return `${toolName}({${parts.join(', ')}})`
}

function generalizeArgValue(key, value) {
  if (value == null) return undefined
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    const v = value.trim()
    if (!v) return undefined
    if (PATHISH_KEYS.has(key) || isPathLike(v)) return generalizePath(v)
    if (v.length > 40) return '<string>'
    return JSON.stringify(v)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.slice(0, 3).map(x => generalizeArgValue(key, x))
    return `[${items.join(', ')}${value.length > 3 ? ', …' : ''}]`
  }
  if (typeof value === 'object') return '{…}'
  return '<string>'
}

function isPathLike(v) {
  return /[\\/]/.test(v) || /^\.{1,2}[\\/]/.test(v) || /^[A-Za-z]:[\\/]/.test(v)
}

// Rewrite a path to a workspace-relative template: replace the workspace root
// prefix with `<project>/`, and collapse the rest. Keeps glob patterns intact.
function generalizePath(v) {
  const ws = getWorkspaceRoot()
  let rel = v
  if (ws) {
    const wsn = ws.replace(/[\\/]+$/, '')
    const sep = wsn.includes('\\') ? '\\' : '/'
    if (v === wsn) rel = '<project>'
    else if (v.startsWith(wsn + sep)) rel = '<project>' + '/' + v.slice(wsn.length + sep.length).replace(/\\/g, '/')
  }
  // Normalize absolute Windows paths too (e.g. when no workspace root is set).
  if (/^[A-Za-z]:/i.test(rel)) {
    const m = /^[A-Za-z]:[\\/](.*)$/.exec(rel)
    if (m) rel = m[1].replace(/\\/g, '/')
  }
  if (rel.startsWith('./')) rel = rel.slice(2)
  return JSON.stringify(rel.replace(/\\/g, '/'))
}

// Persist patterns to disk so they survive restarts.
function savePatterns(db) {
  try {
    for (const [sig, p] of _patterns) {
      db.run(
        'INSERT OR REPLACE INTO skill_patterns (signature, tools, params_json, count, last_seen) VALUES (?, ?, ?, ?, ?)',
        [sig, JSON.stringify(p.tools), JSON.stringify(p.params), p.count, new Date(p.lastSeen).toISOString()]
      )
    }
    try { db.saveDatabase() } catch {}
  } catch (e) {
    log.warn('skillSelfCreate: savePatterns failed:', e.message)
  }
}

// Load patterns from database on startup.
function loadPatterns(db) {
  try {
    const rows = db.allRows('SELECT signature, tools, params_json, count, last_seen FROM skill_patterns') || []
    for (const row of rows) {
      let tools
      try { tools = JSON.parse(row.tools) } catch { tools = [row.signature] }
      let params = null
      try { params = JSON.parse(row.params_json || 'null') } catch { params = null }
      _patterns.set(row.signature, {
        count: row.count || 1,
        lastSeen: new Date(row.last_seen || Date.now()).getTime(),
        tools,
        params: Array.isArray(params) ? params : null,
      })
    }
  } catch (e) {
    log.warn('skillSelfCreate: loadPatterns failed:', e.message)
  }
}

// Detect patterns that crossed the threshold and auto-draft SKILL.md files.
// Returns the list of newly drafted skill names.
function detectAndDraft(db) {
  // skills.selfEvolution 门控:关闭时只记录、不产出 skill 草稿。
  if (!featureFlags.isEnabled(db, 'skills.selfEvolution')) return []
  const drafted = []
  for (const [sig, p] of _patterns) {
    if (p.count < PATTERN_THRESHOLD) continue
    // Check if already drafted
    try {
      const existing = db.allRows('SELECT name FROM skill_drafts WHERE signature = ?', [sig]) || []
      if (existing.length > 0) continue
    } catch {}

    const skillName = 'auto-' + sig.replace(/[^a-z0-9_-]/gi, '-').toLowerCase().slice(0, 50)
    const description = `Auto-drafted workflow: ${p.tools.join(' → ')}`
    const body = generateSkillBody(skillName, p.tools, p.params)

    // Write SKILL.md to auto-drafts directory
    const ws = getWorkspaceRoot()
    if (!ws) continue
    const draftsDir = path.join(ws, '.aetherai', 'skills', 'auto')
    const skillDir = path.join(draftsDir, skillName)
    try {
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), body, 'utf8')
      // Record that we drafted it
      db.run('INSERT INTO skill_drafts (signature, name, drafted_at) VALUES (?, ?, ?)',
        [sig, skillName, new Date().toISOString()])
      drafted.push({ name: skillName, tools: p.tools, count: p.count })
      log.info(`skillSelfCreate: auto-drafted "${skillName}" (${p.tools.join(' → ')}, seen ${p.count}x)`)
    } catch (e) {
      log.warn(`skillSelfCreate: failed to draft "${skillName}":`, e.message)
    }
  }
  return drafted
}

// Generate a SKILL.md body for an auto-drafted workflow. When arg templates are
// available, renders a parameterized recipe instead of a bare tool sequence.
function generateSkillBody(name, tools, params) {
  const hasParams = Array.isArray(params) && params.length === tools.length
  const steps = tools.map((t, i) => {
    const tmpl = hasParams ? pickBestTemplate(params[i]) : null
    if (tmpl) return `${i + 1}. Call \`${tmpl}\``
    return `${i + 1}. Call \`${t}\` with appropriate arguments`
  })
  const paramSection = hasParams
    ? `## Parameter template

The following argument template was learned from repeated usage. Substitute the placeholders
(\`<project>\`, literal values, globs) with the specifics of the current task:

${tools.map((t, i) => `- \`${pickBestTemplate(params[i])}\``).join('\n')}`
    : ''
  return `---
name: ${name}
description: Auto-drafted workflow: ${tools.join(' → ')} (learned from repeated usage)
---

# ${name}

This workflow was automatically detected from repeated agent behavior.

## Steps
${steps.join('\n')}
${paramSection}

## Note
This is an auto-drafted skill. Review and edit before regular use.
Delete this file if the workflow is not useful.
`
}

// Pick the most frequently seen argument template for a step.
function pickBestTemplate(bucket) {
  if (!bucket || !Array.isArray(bucket.templates) || bucket.templates.length === 0) return null
  return bucket.templates[0].template
}

// ─── habitLearner integration ──────────────────────────────────────────────
// Promote an auto-drafted skill to the *live* skills dir so it is loaded and
// applied automatically (the "auto-apply" step of the self-evolution loop),
// instead of sitting in the review drafts dir. Registers it with the skills
// loader in O(1) so it's live immediately.
function promoteToLive(db, signature) {
  const p = _patterns.get(signature)
  if (!p) return null
  const skillName = 'auto-' + signature.replace(/[^a-z0-9_-]/gi, '-').toLowerCase().slice(0, 50)
  const description = `Auto-drafted workflow: ${p.tools.join(' → ')}`
  const body = generateSkillBody(skillName, p.tools, p.params)
  const ws = getWorkspaceRoot()
  if (!ws) return null
  const liveDir = path.join(ws, '.aetherai', 'skills', skillName)
  try {
    fs.mkdirSync(liveDir, { recursive: true })
    const fp = path.join(liveDir, 'SKILL.md')
    fs.writeFileSync(fp, body, 'utf8')
    try {
      require('./skills').upsertSkill(skillName, { name: skillName, description, filePath: fp, baseDir: liveDir, body })
    } catch {}
    // Mark drafted so it isn't re-drafted to the review dir later.
    try {
      db.run('INSERT OR IGNORE INTO skill_drafts (signature, name, drafted_at) VALUES (?, ?, ?)',
        [signature, skillName, new Date().toISOString()])
    } catch {}
    log.info(`skillSelfCreate: promoted "${skillName}" to live skills (auto-applied)`)
    return skillName
  } catch (e) {
    log.warn('skillSelfCreate: promoteToLive failed:', e.message)
    return null
  }
}

// Called by habitLearner when a user habit is confirmed. Promotes any
// auto-drafted tool-pattern skill whose tool names/signature relate to the
// habit's imperative, so the user's standing preference becomes an applied
// agent skill. Safe no-op when nothing matches.
function promoteToLiveFromHabit(db, imperative) {
  const tokens = String(imperative || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const promoted = []
  for (const [sig, p] of _patterns) {
    const haystack = (sig + ' ' + p.tools.join(' ')).toLowerCase()
    if (tokens.some(tok => tok.length > 2 && haystack.includes(tok))) {
      const name = promoteToLive(db, sig)
      if (name) promoted.push(name)
    }
  }
  return promoted
}

// Get all detected patterns (for UI/debugging).
function getPatterns() {
  return Array.from(_patterns.entries()).map(([sig, p]) => ({
    signature: sig,
    tools: p.tools,
    params: p.params,
    count: p.count,
    lastSeen: new Date(p.lastSeen).toISOString()
  }))
}

// Reset patterns (for testing).
function resetPatterns() { _patterns.clear() }

module.exports = {
  recordPattern, detectAndDraft, savePatterns, loadPatterns,
  getPatterns, resetPatterns, PATTERN_THRESHOLD, promoteToLive, promoteToLiveFromHabit,
  // Pure helpers exposed for testing.
  extractArgTemplate, generalizeArgValue, generateSkillBody, pickBestTemplate,
}