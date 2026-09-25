// ───────────────────────────────────────────────────────────────────────────
// Patch Engine — resilient unified diff and SEARCH/REPLACE patch applicator.
// Supports both standard unified diffs and Aider-style search/replace blocks.
// Handles CRLF/LF normalization, offset drift tolerance, and fuzzy matching.
// ───────────────────────────────────────────────────────────────────────────

const { fuzzyFind } = require('./fuzzyMatch')

/**
 * Normalize line endings to \n and trim trailing whitespace from lines for matching.
 * @param {string} text
 * @returns {string}
 */
function normalizeLineEndings(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * Parse unified diff format into structured hunks.
 * @param {string} text
 * @returns {Array<{ oldStart: number, oldCount: number, newStart: number, newCount: number, lines: Array<{ type: string, content: string }> }>}
 */
function parseUnifiedDiff(text) {
  const norm = normalizeLineEndings(text)
  const lines = norm.split('\n')
  const hunks = []
  let current = null
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('@@')) {
      const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (m) {
        if (current && current.lines.length > 0) hunks.push(current)
        current = {
          oldStart: parseInt(m[1], 10),
          oldCount: parseInt(m[2] !== undefined ? m[2] : 1, 10),
          newStart: parseInt(m[3], 10),
          newCount: parseInt(m[4] !== undefined ? m[4] : 1, 10),
          lines: [],
        }
      }
    } else if (current) {
      if (line.startsWith(' ')) {
        current.lines.push({ type: 'context', content: line.slice(1) })
      } else if (line.startsWith('+')) {
        current.lines.push({ type: 'add', content: line.slice(1) })
      } else if (line.startsWith('-')) {
        current.lines.push({ type: 'remove', content: line.slice(1) })
      }
    }
    i++
  }
  if (current && current.lines.length > 0) hunks.push(current)
  return hunks
}

/**
 * Parse Aider-style <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE blocks.
 * @param {string} text
 * @returns {Array<{ search: string, replace: string }>}
 */
function parseSearchReplaceBlocks(text) {
  const norm = normalizeLineEndings(text)
  const lines = norm.split('\n')
  const blocks = []
  let state = 'outside'
  let currentSearch = []
  let currentReplace = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '<<<<<<< SEARCH') {
      state = 'search'
      currentSearch = []
      currentReplace = []
    } else if (trimmed === '=======' && state === 'search') {
      state = 'replace'
    } else if (trimmed === '>>>>>>> REPLACE' && state === 'replace') {
      blocks.push({
        search: currentSearch.join('\n'),
        replace: currentReplace.join('\n'),
      })
      state = 'outside'
      currentSearch = []
      currentReplace = []
    } else if (state === 'search') {
      currentSearch.push(line)
    } else if (state === 'replace') {
      currentReplace.push(line)
    }
  }

  return blocks
}

/**
 * Apply unified diff hunks with offset search and global fallback.
 * @param {string[]|string} original
 * @param {Array<object>} hunks
 * @returns {{ content: string, applied: number, conflicts: string[] }}
 */
function applyHunks(original, hunks) {
  const rawText = Array.isArray(original) ? original.join('\n') : String(original || '')
  const norm = normalizeLineEndings(rawText)
  const fileLines = norm.split('\n')

  const conflicts = []
  let result = [...fileLines]
  let applied = 0
  let lineDelta = 0

  for (const hunk of hunks) {
    const idx = hunk.oldStart - 1 + lineDelta
    const ctxLines = hunk.lines.filter(l => l.type === 'context' || l.type === 'remove').map(l => l.content)
    let matchOffset = -1

    if (ctxLines.length === 0) {
      const replacement = hunk.lines.filter(l => l.type === 'add').map(l => l.content)
      if (norm === '' && (hunk.oldStart === 0 || hunk.oldStart === 1)) {
        result = [...replacement]
        lineDelta += replacement.length
        applied++
        continue
      }
      const hasTrailingNewline = result.length > 0 && result[result.length - 1] === ''
      const effectiveLen = hasTrailingNewline ? result.length - 1 : result.length
      const insertPos = hunk.oldStart + lineDelta
      if (insertPos < 0 || insertPos > effectiveLen) {
        conflicts.push(`hunk at line ${hunk.oldStart}: pure insertion out of bounds (0..${effectiveLen})`)
        continue
      }
      result = [...result.slice(0, insertPos), ...replacement, ...result.slice(insertPos)]
      lineDelta += replacement.length
      applied++
      continue
    }

    // 1. Try local window search around target line index
    const localStart = Math.max(0, idx - 3)
    const localEnd = Math.min(result.length - ctxLines.length, idx + 5)
    for (let start = localStart; start <= localEnd; start++) {
      let ok = true
      for (let ci = 0; ci < ctxLines.length; ci++) {
        if (start + ci >= result.length || result[start + ci] !== ctxLines[ci]) {
          ok = false
          break
        }
      }
      if (ok) {
        matchOffset = start
        break
      }
    }

    // 2. Fallback: Search globally across the whole file
    if (matchOffset < 0 && ctxLines.length > 0) {
      for (let start = 0; start <= result.length - ctxLines.length; start++) {
        let ok = true
        for (let ci = 0; ci < ctxLines.length; ci++) {
          if (result[start + ci] !== ctxLines[ci]) {
            ok = false
            break
          }
        }
        if (ok) {
          matchOffset = start
          break
        }
      }
    }

    // 3. Fallback: Whitespace-tolerant search (trimming line endings/trailing spaces)
    if (matchOffset < 0 && ctxLines.length > 0) {
      for (let start = 0; start <= result.length - ctxLines.length; start++) {
        let ok = true
        for (let ci = 0; ci < ctxLines.length; ci++) {
          if (result[start + ci].trim() !== ctxLines[ci].trim()) {
            ok = false
            break
          }
        }
        if (ok) {
          matchOffset = start
          break
        }
      }
    }

    if (matchOffset < 0) {
      conflicts.push(`hunk at line ${hunk.oldStart}: context did not match (${ctxLines[0] || 'empty'})`)
      continue
    }

    // Apply replacement
    const replacement = hunk.lines.filter(l => l.type === 'context' || l.type === 'add').map(l => l.content)
    const oldSpan = ctxLines.length
    result = [...result.slice(0, matchOffset), ...replacement, ...result.slice(matchOffset + oldSpan)]
    lineDelta += replacement.length - oldSpan
    applied++
  }

  return { content: result.join('\n'), applied, conflicts }
}

/**
 * Apply Aider-style SEARCH/REPLACE blocks to file content.
 * @param {string} content
 * @param {Array<{ search: string, replace: string }>} blocks
 * @returns {{ content: string, applied: number, conflicts: string[] }}
 */
function applySearchReplace(content, blocks) {
  let cur = normalizeLineEndings(content)
  let applied = 0
  const conflicts = []

  for (const block of blocks) {
    const s = normalizeLineEndings(block.search)
    const r = normalizeLineEndings(block.replace)

    const idx = cur.indexOf(s)
    if (idx !== -1) {
      cur = cur.slice(0, idx) + r + cur.slice(idx + s.length)
      applied++
      continue
    }

    // Fall back to fuzzy find
    const fuzzy = fuzzyFind(cur, s)
    if (fuzzy && fuzzy.found) {
      cur = cur.slice(0, fuzzy.index) + r + cur.slice(fuzzy.index + fuzzy.matchedText.length)
      applied++
    } else {
      conflicts.push(`SEARCH block not found in file:\n---\n${s.slice(0, 100)}...\n---`)
    }
  }

  return { content: cur, applied, conflicts }
}

/**
 * High-level patch dispatcher: automatically detects unified diff vs SEARCH/REPLACE blocks.
 * @param {string} originalContent
 * @param {string} patchText
 * @returns {{ content: string, applied: number, conflicts: string[], format: 'search_replace'|'unified' }}
 */
function applyAnyPatch(originalContent, patchText) {
  const normPatch = normalizeLineEndings(patchText)

  if (normPatch.includes('<<<<<<< SEARCH')) {
    const blocks = parseSearchReplaceBlocks(normPatch)
    if (blocks.length > 0) {
      const res = applySearchReplace(originalContent, blocks)
      return { ...res, format: 'search_replace' }
    }
  }

  const hunks = parseUnifiedDiff(normPatch)
  const res = applyHunks(originalContent, hunks)
  return { ...res, format: 'unified' }
}

module.exports = {
  parseUnifiedDiff,
  parseSearchReplaceBlocks,
  applyHunks,
  applySearchReplace,
  applyAnyPatch,
  normalizeLineEndings,
}
