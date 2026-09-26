// ───────────────────────────────────────────────────────────────────────────
// MEMORY.md Projector — bidirectional workspace memory file synchronization.
//
// Projects SQLite long-term memories into a human-readable, Git-trackable
// <workspace>/MEMORY.md, and parses user edits back into SQLite.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { getWorkspaceRoot } = require('../tools/sandbox')
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
      // Guard: truncate runaway lines to 500 characters
      if (content.length > 500) content = content.slice(0, 500).trim()

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

  try {
    const rows = db.allRows(
      'SELECT id, content, type, origin FROM memory WHERE workspace = ? ORDER BY type ASC, created_at ASC',
      [ws]
    ) || []

    const content = formatMemoriesToMarkdown(rows)
    const targetFile = path.join(ws, 'MEMORY.md')

    // Avoid unnecessary disk writes if content is unchanged
    const prevHash = _lastProjectedHash.get(ws)
    if (prevHash === content && fs.existsSync(targetFile)) {
      return { success: true, path: targetFile, count: rows.length, updated: false }
    }

    // Never overwrite a file changed since our last projection.
    if (fs.existsSync(targetFile) && _lastProjectedHash.has(ws)) {
      const current = fs.readFileSync(targetFile, 'utf-8')
      if (current !== _lastProjectedHash.get(ws)) {
        return { success: false, path: targetFile, count: rows.length, updated: false, error: 'MEMORY.md changed externally; refusing to overwrite' }
      }
    }
    _isWritingFile.add(ws)
    try {
      fs.mkdirSync(ws, { recursive: true })
      const tempFile = `${targetFile}.aether-${process.pid}-${Date.now()}.tmp`
      fs.writeFileSync(tempFile, content, 'utf-8')
      fs.renameSync(tempFile, targetFile)
      _lastProjectedHash.set(ws, content)
    } finally {
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
 * @returns {{ success: boolean, added: number, removed: number, total: number, error?: string }}
 */
function syncMemoryFileToDb(db, workspaceRoot) {
  const ws = workspaceRoot ? path.resolve(workspaceRoot) : getWorkspaceRoot()
  if (!ws) return { success: false, added: 0, removed: 0, total: 0, error: 'No workspace root' }

  if (_isWritingFile.has(ws)) {
    return { success: true, added: 0, removed: 0, total: 0 } // skip self-write echo
  }

  const targetFile = path.join(ws, 'MEMORY.md')
  if (!fs.existsSync(targetFile)) {
    return { success: true, added: 0, removed: 0, total: 0 }
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
    const existing = db.allRows(
      'SELECT id, content, content_norm, type, origin FROM memory WHERE workspace = ?',
      [ws]
    ) || []

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
        const result = db.addMemoryWithProvenance(entry.content, entry.type, null, 'user', null, ws)
        if (result && !result.duplicate && result.lastInsertRowid != null) added++
      }
    }

    // Remove items that were deleted from file (only user or assistant memories)
    for (const [norm, row] of dbNormMap) {
      if (!fileNormMap.has(norm)) {
        if (row.origin === 'user' || row.origin === 'assistant') {
          db.deleteMemory(row.id)
          removed++
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
  const targetFile = ws ? path.join(ws, 'MEMORY.md') : ''
  if (!ws || !fs.existsSync(targetFile)) {
    return { exists: false, path: targetFile, mtime: null, lineCount: 0 }
  }

  try {
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

module.exports = {
  projectWorkspaceMemory,
  syncMemoryFileToDb,
  getMemoryFileStatus,
  debounceProjectWorkspaceMemory,
  formatMemoriesToMarkdown,
  parseMarkdownToMemories,
}
