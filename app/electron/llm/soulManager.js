// ───────────────────────────────────────────────────────────────────────────
// SOUL.md Manager — file-first persona and behavioral contract.
//
// Allows agents to derive their persona, tone, and reasoning mindset from
// a trackable, Git-friendly Markdown file (SOUL.md) in the workspace or global dir.
//
// Scan order:
//   1. <workspace>/SOUL.md           ← Project-native soul
//   2. <workspace>/.aether/SOUL.md   ← Project-hidden soul
//   3. <userData>/SOUL.md            ← Global fallback soul
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { getWorkspaceRoot } = require('../tools/sandbox')

const electron = (() => { try { return require('electron') } catch { return null } })()
const app = (electron && typeof electron === 'object' && electron.app) ? electron.app : null

const CACHE_TTL_MS = 15_000
let _cached = null
let _cacheTime = 0
let _cachedTarget = null

/**
 * Parse Markdown with optional YAML Frontmatter into persona fields.
 *
 * Example:
 * ---
 * name: "Architect"
 * avatar: "🏛️"
 * description: "Clean code & architecture review"
 * ---
 * # Principles
 * Be concise...
 *
 * @param {string} raw
 * @returns {{ name: string, prompt: string, avatar: string|null, description: string }}
 */
function parseSoulContent(raw) {
  if (!raw || typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text) return null

  let name = ''
  let avatar = ''
  let description = ''
  let prompt = text

  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (fmMatch) {
    const yamlBlock = fmMatch[1]
    prompt = fmMatch[2].trim()

    const lines = yamlBlock.split(/\r?\n/)
    for (const line of lines) {
      const m = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/)
      if (m) {
        const key = m[1].toLowerCase().trim()
        let val = m[2].trim()
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        if (key === 'name') name = val
        else if (key === 'avatar') avatar = val
        else if (key === 'description' || key === 'desc') description = val
      }
    }
  }

  if (!name) {
    const h1Match = prompt.match(/^#\s+(.+)$/m)
    if (h1Match) {
      name = h1Match[1].replace(/[*_`]/g, '').trim()
    } else {
      name = 'SOUL'
    }
  }

  return {
    name: name.slice(0, 50),
    avatar: avatar || null,
    description: description || '',
    prompt,
  }
}

/**
 * Format persona fields into Markdown with Frontmatter.
 *
 * @param {{ name?: string, prompt?: string, avatar?: string|null, description?: string }} data
 * @returns {string}
 */
function formatSoulContent({ name, prompt, avatar, description }) {
  const metaLines = []
  if (name && name.trim()) metaLines.push(`name: ${JSON.stringify(name.trim())}`)
  if (avatar && avatar.trim()) metaLines.push(`avatar: ${JSON.stringify(avatar.trim())}`)
  if (description && description.trim()) metaLines.push(`description: ${JSON.stringify(description.trim())}`)

  let out = ''
  if (metaLines.length > 0) {
    out += `---\n${metaLines.join('\n')}\n---\n\n`
  }
  out += (prompt || '').trim() + '\n'
  return out
}

function getGlobalSoulPath() {
  const base = app && typeof app.getPath === 'function'
    ? app.getPath('userData')
    : path.join(process.cwd(), '.aetherai')
  return path.join(base, 'SOUL.md')
}

/**
 * Invalidate the cached soul data.
 */
function invalidateSoulCache() {
  _cached = null
  _cacheTime = 0
  _cachedTarget = null
}

/**
 * Retrieve the active SOUL file for the given workspace or session.
 *
 * @param {string} [workspaceRoot]
 * @param {number|string} [sessionId]
 * @returns {{ path: string, fileName: string, name: string, prompt: string, avatar: string|null, description: string, isWorkspace: boolean } | null}
 */
function getWorkspaceSoul(workspaceRoot, sessionId) {
  const ws = workspaceRoot ? path.resolve(workspaceRoot) : getWorkspaceRoot(sessionId)
  const targetKey = `${ws || ''}`

  if (_cached && _cachedTarget === targetKey && Date.now() - _cacheTime < CACHE_TTL_MS) {
    return _cached
  }

  const candidates = []
  if (ws) {
    let curr = ws
    for (let depth = 0; depth < 5; depth++) {
      candidates.push({ path: path.join(curr, 'SOUL.md'), isWorkspace: true })
      candidates.push({ path: path.join(curr, '.aether', 'SOUL.md'), isWorkspace: true })
      if (fs.existsSync(path.join(curr, '.git'))) break
      const parent = path.dirname(curr)
      if (!parent || parent === curr) break
      curr = parent
    }
  }
  candidates.push({ path: getGlobalSoulPath(), isWorkspace: false })

  for (const cand of candidates) {
    try {
      if (fs.existsSync(cand.path)) {
        if (fs.lstatSync(cand.path).isSymbolicLink()) continue
        const raw = fs.readFileSync(cand.path, 'utf-8')
        const parsed = parseSoulContent(raw)
        if (parsed && parsed.prompt.length > 0) {
          _cached = {
            path: cand.path,
            fileName: path.basename(cand.path),
            ...parsed,
            isWorkspace: cand.isWorkspace,
          }
          _cachedTarget = targetKey
          _cacheTime = Date.now()
          return _cached
        }
      }
    } catch {}
  }

  _cached = null
  _cacheTime = 0
  _cachedTarget = targetKey
  return null
}

/**
 * Write a SOUL.md file to the given workspace.
 *
 * @param {string} workspaceRoot
 * @param {{ name?: string, prompt?: string, avatar?: string|null, description?: string }} data
 * @returns {{ success: boolean, path?: string, error?: string }}
 */
function writeWorkspaceSoul(workspaceRoot, data) {
  const ws = workspaceRoot ? path.resolve(workspaceRoot) : getWorkspaceRoot()
  if (!ws) return { success: false, error: 'No workspace root found' }

  try {
    const targetFile = path.resolve(ws, 'SOUL.md')
    const rel = path.relative(ws, targetFile)
    if (rel.startsWith('..') || path.isAbsolute(rel) || rel !== 'SOUL.md') {
      return { success: false, error: 'Path traversal detected' }
    }
    if (fs.existsSync(targetFile) && fs.lstatSync(targetFile).isSymbolicLink()) {
      return { success: false, error: 'Target file is a symbolic link' }
    }

    fs.mkdirSync(ws, { recursive: true })
    const content = formatSoulContent(data)
    fs.writeFileSync(targetFile, content, 'utf-8')
    invalidateSoulCache()
    return { success: true, path: targetFile }
  } catch (err) {
    return { success: false, error: err?.message || String(err) }
  }
}

module.exports = {
  parseSoulContent,
  parseSoulMarkdown: parseSoulContent,
  formatSoulContent,
  getWorkspaceSoul,
  writeWorkspaceSoul,
  invalidateSoulCache,
}
