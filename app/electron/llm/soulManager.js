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
const { getWorkspaceRoot, hasUnsafeWindowsPrefix, isSensitivePath } = require('../tools/sandbox')

const electron = (() => { try { return require('electron') } catch { return null } })()
const app = (electron && typeof electron === 'object' && electron.app) ? electron.app : null

const CACHE_TTL_MS = 15_000
const _cachedMap = new Map() // targetKey -> { data, time }

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
  _cachedMap.clear()
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
  if (ws) {
    let realWs = ws
    try { if (fs.existsSync(ws)) realWs = fs.realpathSync(ws) } catch { return null }
    if (hasUnsafeWindowsPrefix(ws) || hasUnsafeWindowsPrefix(realWs) || isSensitivePath(ws) || isSensitivePath(realWs)) {
      return null
    }
  }
  const targetKey = `${ws || ''}`

  const cached = _cachedMap.get(targetKey)
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return cached.data
  }

  const candidates = []
  if (ws) {
    // Only search within the workspace root, unless the workspace is part of a
    // Git repository monorepo. In that case, traverse upwards stopping strictly
    // at the Git repository root (never beyond it into arbitrary parent paths).
    let gitRoot = null
    let probe = ws
    for (let depth = 0; depth < 5; depth++) {
      if (fs.existsSync(path.join(probe, '.git'))) {
        gitRoot = probe
        break
      }
      const parent = path.dirname(probe)
      if (!parent || parent === probe) break
      probe = parent
    }

    let curr = ws
    for (let depth = 0; depth < 5; depth++) {
      candidates.push({ path: path.join(curr, 'SOUL.md'), isWorkspace: true })
      candidates.push({ path: path.join(curr, '.aether', 'SOUL.md'), isWorkspace: true })

      if (!gitRoot || curr === gitRoot) break
      if (fs.existsSync(path.join(curr, '.git'))) break

      const parent = path.dirname(curr)
      if (!parent || parent === curr) break
      if (hasUnsafeWindowsPrefix(parent) || isSensitivePath(parent)) break
      curr = parent
    }
  }
  candidates.push({ path: getGlobalSoulPath(), isWorkspace: false })

  for (const cand of candidates) {
    try {
      if (fs.existsSync(cand.path)) {
        if (fs.lstatSync(cand.path).isSymbolicLink()) continue
        let realCand = cand.path
        try { realCand = fs.realpathSync(cand.path) } catch { continue }
        if (hasUnsafeWindowsPrefix(realCand) || isSensitivePath(realCand)) continue
        const raw = fs.readFileSync(cand.path, 'utf-8')
        const parsed = parseSoulContent(raw)
        if (parsed && parsed.prompt.length > 0) {
          const result = {
            path: cand.path,
            fileName: path.basename(cand.path),
            ...parsed,
            isWorkspace: cand.isWorkspace,
          }
          _cachedMap.set(targetKey, { data: result, time: Date.now() })
          return result
        }
      }
    } catch {}
  }

  _cachedMap.set(targetKey, { data: null, time: Date.now() })
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


  let realWs = ws
  try { if (fs.existsSync(ws)) realWs = fs.realpathSync(ws) } catch {}
  if (hasUnsafeWindowsPrefix(ws) || hasUnsafeWindowsPrefix(realWs) || isSensitivePath(ws) || isSensitivePath(realWs)) {
    return { success: false, error: 'Access to sensitive or unsafe path is forbidden' }
  }

  let tempFile = null
  try {
    const targetFile = path.resolve(ws, 'SOUL.md')
    const rel = path.relative(ws, targetFile)
    if (rel.startsWith('..') || path.isAbsolute(rel) || rel !== 'SOUL.md') {
      return { success: false, error: 'Path traversal detected' }
    }
    if (fs.existsSync(targetFile)) {
      if (fs.lstatSync(targetFile).isSymbolicLink()) {
        return { success: false, error: 'Target file is a symbolic link' }
      }
      try {
        const realTarget = fs.realpathSync(targetFile)
        if (hasUnsafeWindowsPrefix(realTarget) || isSensitivePath(realTarget)) {
          return { success: false, error: 'Access to sensitive or unsafe path is forbidden' }
        }
        if (path.relative(realWs, realTarget) !== 'SOUL.md') {
          return { success: false, error: 'Path traversal or symlink detected' }
        }
      } catch (err) {
        if (err && err.message && err.message.includes('forbidden')) throw err
      }
    }

    fs.mkdirSync(ws, { recursive: true })
    const content = formatSoulContent(data)
    tempFile = `${targetFile}.aether-${process.pid}-${Date.now()}.tmp`
    fs.writeFileSync(tempFile, content, 'utf-8')
    fs.renameSync(tempFile, targetFile)
    invalidateSoulCache()
    return { success: true, path: targetFile }
  } catch (err) {
    return { success: false, error: err?.message || String(err) }
  } finally {
    if (tempFile && fs.existsSync(tempFile)) {
      try { fs.rmSync(tempFile, { force: true }) } catch {}
    }
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
