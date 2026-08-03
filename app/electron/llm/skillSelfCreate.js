// ───────────────────────────────────────────────────────────────────────────
// Skill Self-Creation — detect repeated agent behavior patterns and auto-draft
// SKILL.md files so the agent learns reusable workflows over time.
//
// Inspired by OpenClaw's skill self-creation and Hermes' long-term skill
// acquisition. Unlike habitLearner (which detects user preferences), this
// module detects *agent tool-use patterns* — sequences of tool calls the
// agent repeats across sessions — and drafts reusable SKILL.md recipes.
//
// Flow:
//   1. recordPattern() — after each tool-loop round, record the tool sequence
//   2. detectPatterns() — on cron:skill-scan, find repeated sequences
//   3. autoDraftSkill() — when a pattern repeats ≥ threshold times, draft a
//      SKILL.md into <workspace>/.aetherai/skills/auto/ for user review
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { getWorkspaceRoot } = require('../tools/sandbox')
const log = require('../logger')

const PATTERN_THRESHOLD = 3    // seen 3 times → auto-draft
const MIN_SEQUENCE_LEN = 2     // at least 2 consecutive tool calls
const MAX_PATTERNS = 20        // keep at most 20 patterns in memory

// In-memory pattern store: sequence signature → { count, lastSeen, tools }
let _patterns = new Map()

// Record a tool-call sequence from one agent round.
// `toolNames` is an array of tool names called in this round.
function recordPattern(toolNames) {
  if (!toolNames || toolNames.length < MIN_SEQUENCE_LEN) return
  const sig = toolNames.join('→')
  const existing = _patterns.get(sig)
  if (existing) {
    existing.count++
    existing.lastSeen = Date.now()
  } else {
    if (_patterns.size >= MAX_PATTERNS) {
      // Evict the oldest pattern
      let oldest = null
      for (const [k, v] of _patterns) {
        if (!oldest || v.lastSeen < oldest.lastSeen) oldest = { k, ...v }
      }
      if (oldest) _patterns.delete(oldest.k)
    }
    _patterns.set(sig, { count: 1, lastSeen: Date.now(), tools: [...toolNames] })
  }
}

// Persist patterns to disk so they survive restarts.
function savePatterns(db) {
  try {
    for (const [sig, p] of _patterns) {
      db.run(
        'INSERT OR REPLACE INTO skill_patterns (signature, tools, count, last_seen) VALUES (?, ?, ?, ?)',
        [sig, JSON.stringify(p.tools), p.count, new Date(p.lastSeen).toISOString()]
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
    const rows = db.allRows('SELECT signature, tools, count, last_seen FROM skill_patterns') || []
    for (const row of rows) {
      let tools
      try { tools = JSON.parse(row.tools) } catch { tools = [row.signature] }
      _patterns.set(row.signature, {
        count: row.count || 1,
        lastSeen: new Date(row.last_seen || Date.now()).getTime(),
        tools
      })
    }
  } catch (e) {
    log.warn('skillSelfCreate: loadPatterns failed:', e.message)
  }
}

// Detect patterns that crossed the threshold and auto-draft SKILL.md files.
// Returns the list of newly drafted skill names.
function detectAndDraft(db) {
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
    const body = generateSkillBody(skillName, p.tools)

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

// Generate a SKILL.md body for an auto-drafted workflow.
function generateSkillBody(name, tools) {
  const steps = tools.map((t, i) => `${i + 1}. Call \`${t}\` with appropriate arguments`)
  return `---
name: ${name}
description: Auto-drafted workflow: ${tools.join(' → ')} (learned from repeated usage)
---

# ${name}

This workflow was automatically detected from repeated agent behavior.

## Steps
${steps.join('\n')}

## Note
This is an auto-drafted skill. Review and edit before regular use.
Delete this file if the workflow is not useful.
`
}

// Get all detected patterns (for UI/debugging).
function getPatterns() {
  return Array.from(_patterns.entries()).map(([sig, p]) => ({
    signature: sig,
    tools: p.tools,
    count: p.count,
    lastSeen: new Date(p.lastSeen).toISOString()
  }))
}

// Reset patterns (for testing).
function resetPatterns() { _patterns.clear() }

module.exports = {
  recordPattern, detectAndDraft, savePatterns, loadPatterns,
  getPatterns, resetPatterns, PATTERN_THRESHOLD
}