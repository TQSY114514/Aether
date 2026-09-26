// ───────────────────────────────────────────────────────────────────────────
// MEMORY.md Projector — bidirectional workspace memory file synchronization.
//
// Projects SQLite long-term memories into a human-readable, Git-trackable
// <workspace>/MEMORY.md, and parses user edits back into SQLite.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { getWorkspaceRoot, hasUnsafeWindowsPrefix, isSensitivePath } = require('../tools/sandbox')
const { normalizeContent, keywords } = require('../memoryText')
const log = require('../logger')

const MAX_MEMORY_FILE_BYTES = 1024 * 1024

let _lastProjectedHash = new Map() // workspace -> md5/content
let _isWritingFile = new Set()     // lock to prevent self-trigger loop

/**
 * Format database memories for a workspace into clean Markdown.
 *
 * @param {Array<Object>} rows
 * @returns {string}
 */
function formatMemoriesToMarkdown(rows) {
  const groups = {
    project: [],
    preference: [],
    fact: [],
    other: [],
  }

  for (const r of rows) {
    if (r.origin === 'external') continue // don't pollute workspace with untrusted web snippets
    const text = String(r.content || '').replace(/\s+/g, ' ').trim()
    if (!text) continue

    const t = String(r.type || 'fact').toLowerCase()
    if (t === 'project') groups.project.push(text)
    else if (t === 'preference') groups.preference.push(text)
    else if (t === 'fact') groups.fact.push(text)
    else groups.other.push(text)
  }

  const lines = [
    '# Project Memory',
    '',
    '> This file is automatically projected by Aether from its local memory store.',
    '> You can edit, add, or delete bullet points directly; changes sync bidirectionally with Aether.',
    '',
  ]

  if (groups.project.length > 0) {
    lines.push('## Architecture & Decisions')
    for (const item of groups.project) lines.push(`- ${item}`)
    lines.push('')
  }

  if (groups.preference.length > 0) {
    lines.push('## Preferences & Guidelines')
    for (const item of groups.preference) lines.push(`- ${item}`)
    lines.push('')
  }

  if (groups.fact.length > 0) {
    lines.push('## Facts & Domain Knowledge')
    for (const item of groups.fact) lines.push(`- ${item}`)
    lines.push('')
  }

  if (groups.other.length > 0) {
    lines.push('## Additional Context')
    for (const item of groups.other) lines.push(`- ${item}`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Parse a MEMORY.md content string into typed bullet points.
 *
 * @param {string} text
 * @returns {Array<{ content: string, type: string }>}
 */
function parseMarkdownToMemories(text) {
  if (!text || typeof text !== 'string') return []

  const lines = text.split(/\r?\n/)
  const result = []
  let currentType = 'fact'

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    // Battle-hardened protection: ignore Git merge conflict markers
    if (line.startsWith('<<<<') || line.startsWith('====') || line.startsWith('>>>>')) continue

    if (line.startsWith('#')) {
      const heading = line.replace(/^#+\s*/, '').toLowerCase()
      if (/arch|decision|设计|架构|决策|约定|规范/.test(heading)) {
        currentType = 'project'
      } else if (/pref|guideline|偏好|风格|习惯/.test(heading)) {
        currentType = 'preference'
      } else if (/fact|domain|事实|知识|业务/.test(heading)) {
        currentType = 'fact'
      } else {
        currentType = 'fact'
      }
      continue
    }

    // Bullet points: - item, * item, 1. item
    const bulletMatch = line.match(/^[-*]\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/)
    if (bulletMatch) {
      let content = bulletMatch[1].trim()

      // Optional type prefix in bullet: [project] Content
      const prefixMatch = content.match(/^\[([a-zA-Z]+)\]\s*(.+)$/)
      let type = currentType
      if (prefixMatch) {
        const pt = prefixMatch[1].toLowerCase()
        if (['project', 'fact', 'preference', 'context'].includes(pt)) {
          type = pt
          content = prefixMatch[2].trim()
        }
      }
      if (content.length > 0) {
        result.push({ content, type })
      }
    }
  }

  return result
}

/**
 * Project current workspace memories from SQLite into <workspace>/MEMORY.md.
 *
 * @param {Object} db - database instance
 * @param {string} [workspaceRoot]
 * @returns {{ success: boolean, path?: string, count: number, updated: boolean, error?: string }}
 */
function projectWorkspaceMemory(db, workspaceRoot) {
  const ws = workspaceRoot ? path.resolve(workspaceRoot) : getWorkspaceRoot()
  if (!ws) return { success: false, count: 0, updated: false, error: 'No workspace root' }

  let realWs = ws
  try { if (fs.existsSync(ws)) realWs = fs.realpathSync(ws) } catch {}
  if (hasUnsafeWindowsPrefix(ws) || hasUnsafeWindowsPrefix(realWs) || isSensitivePath(ws) || isSensitivePath(realWs)) {
    return { success: false, count: 0, updated: false, error: 'Access to sensitive or unsafe path is forbidden' }
  }

  try {
    const targetFile = path.resolve(ws, 'MEMORY.md')
    const rel = path.relative(ws, targetFile)
    if (rel.startsWith('..') || path.isAbsolute(rel) || rel !== 'MEMORY.md') {
      return { success: false, count: 0, updated: false, error: 'Path traversal detected' }
    }
    if (fs.existsSync(targetFile)) {
      if (fs.lstatSync(targetFile).isSymbolicLink()) {
        return { success: false, count: 0, updated: false, error: 'Target file is a symbolic link' }
      }
      try {
        const realTarget = fs.realpathSync(targetFile)
        if (hasUnsafeWindowsPrefix(realTarget) || isSensitivePath(realTarget)) {
          return { success: false, count: 0, updated: false, error: 'Access to sensitive or unsafe path is forbidden' }
        }
        if (path.relative(realWs, realTarget) !== 'MEMORY.md') {
          return { success: false, count: 0, updated: false, error: 'Path traversal or symlink detected' }
        }
      } catch (err) {
        if (err && err.message && err.message.includes('forbidden')) throw err
      }
    }

    // Preserve external edits / Git updates: if MEMORY.md exists on disk and either
    // this is our first projection or the file differs from our last projection,
    // reconcile changes using 3-way merge against the baseline.
    if (fs.existsSync(targetFile)) {
      const stat = fs.statSync(targetFile)
      if (stat.size > MAX_MEMORY_FILE_BYTES) {
        return { success: false, count: 0, updated: false, error: `MEMORY.md exceeds ${MAX_MEMORY_FILE_BYTES} byte limit` }
      }
      const prevHash = _lastProjectedHash.get(ws)
      const current = fs.readFileSync(targetFile, 'utf-8')
      if (prevHash !== current) {
        syncMemoryFileToDb(db, ws, {
          deleteMissing: false,
          baselineContent: prevHash || null,
        })
      }
    }

    const rows = db.prepare(
      'SELECT id, content, type, origin FROM memory WHERE workspace = ? ORDER BY type ASC, created_at ASC'
    ).all(ws) || []

    const content = formatMemoriesToMarkdown(rows)

    // Avoid unnecessary disk writes if content is unchanged
    const prevHash = _lastProjectedHash.get(ws)
    if (prevHash === content && fs.existsSync(targetFile)) {
      return { success: true, path: targetFile, count: rows.length, updated: false }
    }

    let tempFile = null
    _isWritingFile.add(ws)
    try {
      fs.mkdirSync(ws, { recursive: true })
      tempFile = `${targetFile}.aether-${process.pid}-${Date.now()}.tmp`
      fs.writeFileSync(tempFile, content, 'utf-8')
      fs.renameSync(tempFile, targetFile)
      _lastProjectedHash.set(ws, content)
    } finally {
      if (tempFile && fs.existsSync(tempFile)) {
        try { fs.rmSync(tempFile, { force: true }) } catch {}
      }
      _isWritingFile.delete(ws)
    }

    return { success: true, path: targetFile, count: rows.length, updated: true }
  } catch (err) {
    log.warn('projectWorkspaceMemory failed:', err?.message)
    return { success: false, count: 0, updated: false, error: err?.message || String(err) }
  }
}

/**
 * Sync edits from <workspace>/MEMORY.md into SQLite database.
 *
 * @param {Object} db - database instance
 * @param {string} [workspaceRoot]
 * @param {{ deleteMissing?: boolean, baselineContent?: string|null, origin?: string }} [options]
 * @returns {{ success: boolean, added: number, removed: number, total: number, error?: string }}
 */
function syncMemoryFileToDb(db, workspaceRoot, { deleteMissing = true, baselineContent = null, origin = 'user' } = {}) {
  const ws = workspaceRoot ? path.resolve(workspaceRoot) : getWorkspaceRoot()
  if (!ws) return { success: false, added: 0, removed: 0, total: 0, error: 'No workspace root' }

  let realWs = ws
  try { if (fs.existsSync(ws)) realWs = fs.realpathSync(ws) } catch {}
  if (hasUnsafeWindowsPrefix(ws) || hasUnsafeWindowsPrefix(realWs) || isSensitivePath(ws) || isSensitivePath(realWs)) {
    return { success: false, added: 0, removed: 0, total: 0, error: 'Access to sensitive or unsafe path is forbidden' }
  }

  if (_isWritingFile.has(ws)) {
    return { success: true, added: 0, removed: 0, total: 0 } // skip self-write echo
  }

  const targetFile = path.resolve(ws, 'MEMORY.md')
  const rel = path.relative(ws, targetFile)
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel !== 'MEMORY.md') {
    return { success: false, added: 0, removed: 0, total: 0, error: 'Path traversal detected' }
  }
  if (!fs.existsSync(targetFile)) {
    return { success: true, added: 0, removed: 0, total: 0 }
  }
  if (fs.lstatSync(targetFile).isSymbolicLink()) {
    return { success: false, added: 0, removed: 0, total: 0, error: 'Target file is a symbolic link' }
  }
  try {
    const realTarget = fs.realpathSync(targetFile)
    if (hasUnsafeWindowsPrefix(realTarget) || isSensitivePath(realTarget)) {
      return { success: false, added: 0, removed: 0, total: 0, error: 'Access to sensitive or unsafe path is forbidden' }
    }
    if (path.relative(realWs, realTarget) !== 'MEMORY.md') {
      return { success: false, added: 0, removed: 0, total: 0, error: 'Path traversal or symlink detected' }
    }
  } catch (err) {
    if (err && err.message && err.message.includes('forbidden')) throw err
  }

  try {
    const stat = fs.statSync(targetFile)
    if (stat.size > MAX_MEMORY_FILE_BYTES) {
      return { success: false, added: 0, removed: 0, total: 0, error: `MEMORY.md exceeds ${MAX_MEMORY_FILE_BYTES} byte limit` }
    }
    const raw = fs.readFileSync(targetFile, 'utf-8')
    if (_lastProjectedHash.get(ws) === raw) {
      return { success: true, added: 0, removed: 0, total: 0 }
    }
    const fileEntries = parseMarkdownToMemories(raw)
    const fileNormMap = new Map()
    for (const e of fileEntries) {
      const norm = normalizeContent(e.content)
      if (norm) fileNormMap.set(norm, e)
    }

    // Existing memories for this workspace
    const existing = db.prepare(
      'SELECT id, content, content_norm, type, origin FROM memory WHERE workspace = ?'
    ).all(ws) || []

    const dbNormMap = new Map()
    for (const row of existing) {
      const norm = row.content_norm || normalizeContent(row.content)
      dbNormMap.set(norm, row)
    }

    let added = 0
    let removed = 0

    // Add items that exist in file but not in DB
    for (const [norm, entry] of fileNormMap) {
      if (!dbNormMap.has(norm)) {
        const itemOrigin = entry.origin || origin || 'user'
        const result = db.addMemoryWithProvenance(entry.content, entry.type, null, itemOrigin, null, ws)
        if (result && !result.duplicate && result.lastInsertRowid != null) added++
      }
    }

    if (baselineContent != null) {
      // 3-way reconciliation: Only delete memories that existed in baseline but were removed by user from file
      const baseEntries = parseMarkdownToMemories(baselineContent)
      const baseNormSet = new Set(baseEntries.map(e => normalizeContent(e.content)).filter(Boolean))
      for (const [norm, row] of dbNormMap) {
        if (baseNormSet.has(norm) && !fileNormMap.has(norm)) {
          if (row.origin === 'user' || row.origin === 'assistant' || row.origin === 'external') {
            db.deleteMemory(row.id)
            removed++
          }
        }
      }
    } else if (deleteMissing) {
      // Explicit file sync: delete any user/assistant memories missing from file
      // Safety guard: if file is completely empty and existing > 2, refuse bulk delete
      if (fileEntries.length === 0 && existing.length > 2) {
        return { success: false, added, removed: 0, total: 0, error: 'Refusing to wipe memories from empty file' }
      }
      for (const [norm, row] of dbNormMap) {
        if (!fileNormMap.has(norm)) {
          if (row.origin === 'user' || row.origin === 'assistant' || row.origin === 'external') {
            db.deleteMemory(row.id)
            removed++
          }
        }
      }
    }

    _lastProjectedHash.set(ws, raw)
    return { success: true, added, removed, total: fileEntries.length }
  } catch (err) {
    log.warn('syncMemoryFileToDb failed:', err?.message)
    return { success: false, added: 0, removed: 0, total: 0, error: err?.message || String(err) }
  }
}

/**
 * Get status of MEMORY.md in the given workspace.
 *
 * @param {string} [workspaceRoot]
 * @returns {{ exists: boolean, path: string, mtime: number|null, lineCount: number }}
 */
function getMemoryFileStatus(workspaceRoot) {
  const ws = workspaceRoot ? path.resolve(workspaceRoot) : getWorkspaceRoot()
  const targetFile = ws ? path.resolve(ws, 'MEMORY.md') : ''
  if (!ws) return { exists: false, path: targetFile, mtime: null, lineCount: 0 }

  let realWs = ws
  try { if (fs.existsSync(ws)) realWs = fs.realpathSync(ws) } catch {}
  if (hasUnsafeWindowsPrefix(ws) || hasUnsafeWindowsPrefix(realWs) || isSensitivePath(ws) || isSensitivePath(realWs) || !fs.existsSync(targetFile)) {
    return { exists: false, path: targetFile, mtime: null, lineCount: 0 }
  }

  try {
    if (fs.lstatSync(targetFile).isSymbolicLink()) {
      return { exists: false, path: targetFile, mtime: null, lineCount: 0 }
    }
    let realTarget = targetFile
    try { realTarget = fs.realpathSync(targetFile) } catch {}
    if (hasUnsafeWindowsPrefix(realTarget) || isSensitivePath(realTarget) || path.relative(realWs, realTarget) !== 'MEMORY.md') {
      return { exists: false, path: targetFile, mtime: null, lineCount: 0 }
    }
    const stat = fs.statSync(targetFile)
    const text = fs.readFileSync(targetFile, 'utf-8')
    const count = text.split(/\r?\n/).filter(l => /^[-*]\s+/.test(l.trim())).length
    return { exists: true, path: targetFile, mtime: stat.mtimeMs, lineCount: count }
  } catch {
    return { exists: false, path: targetFile, mtime: null, lineCount: 0 }
  }
}

// Debounce helper for automatic projection after conversation turns
const _debounceTimers = new Map()
function debounceProjectWorkspaceMemory(db, workspaceRoot, delayMs = 2500) {
  const ws = workspaceRoot ? path.resolve(workspaceRoot) : getWorkspaceRoot()
  if (!ws) return

  if (_debounceTimers.has(ws)) {
    clearTimeout(_debounceTimers.get(ws))
  }

  const timer = setTimeout(() => {
    _debounceTimers.delete(ws)
    projectWorkspaceMemory(db, ws)
  }, delayMs)

  _debounceTimers.set(ws, timer)
}

function getLastProjectedContent(workspaceRoot) {
  const ws = workspaceRoot ? path.resolve(workspaceRoot) : getWorkspaceRoot()
  return ws ? _lastProjectedHash.get(ws) || null : null
}

module.exports = {
  projectWorkspaceMemory,
  syncMemoryFileToDb,
  getMemoryFileStatus,
  getLastProjectedContent,
  debounceProjectWorkspaceMemory,
  formatMemoriesToMarkdown,
  parseMarkdownToMemories,
}
