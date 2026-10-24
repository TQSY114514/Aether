// ───────────────────────────────────────────────────────────────────────────
// Project Instruction Loader — Claude Code-style .aetherai.md / CLAUDE.md.
//
// Loads project-level instructions from the workspace root so the agent
// understands project conventions, coding standards, and constraints.
//
// Scan order (first match wins):
//   1. <workspace>/.aetherai.md        ← Aether-native
//   2. <workspace>/CLAUDE.md           ← Claude Code compat
//   3. <workspace>/AGENT.md            ← OpenClaw compat
//   4. <workspace>/GEMINI.md           ← Gemini CLI compat
//
// Also scans modular rules from <workspace>/.aether/rules/*.md and *.mdc.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { getWorkspaceRoot } = require('../tools/sandbox')

const INSTRUCTION_FILES = ['.aetherai.md', 'AETHER.md', 'AGENTS.md', 'CLAUDE.md', 'AGENT.md', 'GEMINI.md']
const CACHE_TTL_MS = 30_000 // re-read from disk every 30s to pick up edits
let _cached = null
let _cacheTime = 0
let _cachedWs = null

let _cachedRules = null
let _cacheRulesTime = 0
let _cachedRulesWs = null

const MAX_RULE_SIZE = 65536 // 64KB per rule
const MAX_RULES_COUNT = 30  // Cap max rules loaded to 30

/**
 * Scan <workspace>/.aether/rules/ for modular rule files (*.md and *.mdc).
 * @param {string} [workspaceRoot]
 * @returns {Array<{ name: string, path: string, content: string }>}
 */
function loadModularRules(workspaceRoot) {
  const ws = workspaceRoot || getWorkspaceRoot()
  if (!ws) return []

  // Return cached copy if still fresh (avoids synchronous disk I/O on every turn).
  if (_cachedRules && _cachedRulesWs === ws && Date.now() - _cacheRulesTime < CACHE_TTL_MS) {
    return _cachedRules
  }

  const rulesDir = path.join(ws, '.aether', 'rules')
  try {
    if (!fs.existsSync(rulesDir)) {
      _cachedRules = []
      _cachedRulesWs = ws
      _cacheRulesTime = Date.now()
      return []
    }
    const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md') || f.endsWith('.mdc'))
    const rules = []
    for (const f of files) {
      if (rules.length >= MAX_RULES_COUNT) break
      try {
        const fp = path.join(rulesDir, f)
        const lstat = fs.lstatSync(fp)
        if (lstat.isSymbolicLink()) continue
        const raw = fs.readFileSync(fp, 'utf-8')
        const content = raw.slice(0, MAX_RULE_SIZE).trim()
        if (content.length > 0) {
          rules.push({ name: f, path: fp, content })
        }
      } catch {}
    }
    _cachedRules = rules
    _cachedRulesWs = ws
    _cacheRulesTime = Date.now()
    return rules
  } catch {
    return []
  }
}

/**
 * Find and load the first matching instruction file from the workspace.
 * @param {string|number} [sessionId]
 * @returns {{ path: string, content: string, fileName: string } | null}
 */
function loadProjectInstructions(sessionId) {
  const ws = getWorkspaceRoot(sessionId)
  if (!ws) return null

  // Return cached copy if still fresh (avoids disk I/O on every turn).
  if (_cached && _cachedWs === ws && Date.now() - _cacheTime < CACHE_TTL_MS) return _cached

  for (const fname of INSTRUCTION_FILES) {
    const fp = path.join(ws, fname)
    try {
      const content = fs.readFileSync(fp, 'utf-8')
      if (content.trim().length > 0) {
        _cached = { path: fp, content: content.trim(), fileName: fname }
        _cachedWs = ws
        _cacheTime = Date.now()
        return _cached
      }
    } catch {}
  }
  if (_cached) { _cached = null; _cacheTime = 0; _cachedWs = null }
  return null
}

/**
 * Invalidate the cache. Call after writing/editing an instruction file.
 */
function invalidateCache() {
  _cached = null
  _cacheTime = 0
  _cachedWs = null
  _cachedRules = null
  _cacheRulesTime = 0
  _cachedRulesWs = null
}

/**
 * Build a system-message block from the loaded instructions.
 * Returns an object suitable for pushing into the conversation array, or null.
 * @param {string|number} [sessionId]
 */
function buildProjectContextMessage(sessionId) {
  const inst = loadProjectInstructions(sessionId)
  const ws = getWorkspaceRoot(sessionId)
  const modularRules = loadModularRules(ws)

  if (!inst && modularRules.length === 0) return null

  const parts = []
  if (inst) {
    parts.push(`## Project Instructions (${inst.fileName})\n\nThe following instructions are from the project root. Follow them unless the user explicitly overrides:\n\n${inst.content}`)
  }
  if (modularRules.length > 0) {
    const rulesFormatted = modularRules.map(r => `### Rule: ${r.name}\n${r.content}`).join('\n\n')
    parts.push(`## Workspace Rules (.aether/rules)\n\n${rulesFormatted}`)
  }

  return {
    role: 'system',
    content: parts.join('\n\n'),
  }
}

/**
 * Check if a project instruction file exists (without reading it).
 * @param {string|number} [sessionId]
 */
function hasProjectInstructions(sessionId) {
  const ws = getWorkspaceRoot(sessionId)
  if (!ws) return false
  for (const fname of INSTRUCTION_FILES) {
    try { if (fs.statSync(path.join(ws, fname)).isFile()) return true } catch {}
  }
  const rules = loadModularRules(ws)
  return rules.length > 0
}

module.exports = {
  loadProjectInstructions,
  loadModularRules,
  buildProjectContextMessage,
  invalidateCache,
  hasProjectInstructions,
}
