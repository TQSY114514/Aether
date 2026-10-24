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
        replace: cleanReplaceLines(currentReplace),
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

/**
 * Compute a compact 4-character hex FNV-1a content hash for a line.
 * Resilient to leading/trailing whitespace changes.
 * @param {string} line
 * @returns {string} 4-char hex hash
 */
function computeLineHash(line) {
  const trimmed = String(line ?? '').trim()
  if (!trimmed) return '0000'
  let hash = 0x811c9dc5
  for (let i = 0; i < trimmed.length; i++) {
    hash ^= trimmed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return ((hash >>> 0) & 0xffff).toString(16).padStart(4, '0')
}

/**
 * Annotate each line with its stable [#hash] tag for model inspection.
 * @param {string} content
 * @returns {string}
 */
function formatWithHashlines(content) {
  const lines = normalizeLineEndings(content).split('\n')
  return lines.map((line) => `[#${computeLineHash(line)}] ${line}`).join('\n')
}

/**
 * Parse oh-my-pi/omp-inspired hashline edit blocks.
 * Formats:
 *   <<<<<<< HASH startHash..endHash
 *   replacement lines
 *   >>>>>>>
 *   or:
 *   @@ #startHash..#endHash @@
 *   replacement lines
 *
 * @param {string} text
 * @returns {Array<{ startHash: string, endHash: string, replace: string }>}
 */
function cleanReplaceLines(lines) {
  const copy = [...lines]
  while (copy.length > 0 && copy[copy.length - 1] === '') {
    copy.pop()
  }
  return copy.join('\n')
}

function parseHashlineBlocks(text) {
  const norm = normalizeLineEndings(text)
  const lines = norm.split('\n')
  const blocks = []
  let state = 'outside'
  let currentStartHash = null
  let currentEndHash = null
  let currentReplace = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Pattern 1: <<<<<<< HASH [start] (optional ..[end])
    const blockMatch = trimmed.match(/^<{7}\s*HASH\s+([0-9a-fA-F]{4,8})(?:\.\.([0-9a-fA-F]{4,8}))?/i)
    if (blockMatch) {
      if (state === 'replace') {
        blocks.push({
          startHash: currentStartHash.toLowerCase(),
          endHash: (currentEndHash || currentStartHash).toLowerCase(),
          replace: cleanReplaceLines(currentReplace),
        })
      }
      currentStartHash = blockMatch[1]
      currentEndHash = blockMatch[2] || null
      currentReplace = []
      state = 'replace'
      continue
    }

    // Pattern 2: @@ #[start]..#[end] @@ or @@ #[start] @@
    const hunkMatch = trimmed.match(/^@@\s*#([0-9a-fA-F]{4,8})(?:\.\.#?([0-9a-fA-F]{4,8}))?\s*@@/i)
    if (hunkMatch) {
      if (state === 'replace') {
        blocks.push({
          startHash: currentStartHash.toLowerCase(),
          endHash: (currentEndHash || currentStartHash).toLowerCase(),
          replace: cleanReplaceLines(currentReplace),
        })
      }
      currentStartHash = hunkMatch[1]
      currentEndHash = hunkMatch[2] || null
      currentReplace = []
      state = 'replace'
      continue
    }

    if (state === 'replace') {
      if (trimmed === '=======') {
        currentReplace = []
        continue
      }
      if (trimmed.startsWith('>>>>>>>')) {
        blocks.push({
          startHash: currentStartHash.toLowerCase(),
          endHash: (currentEndHash || currentStartHash).toLowerCase(),
          replace: cleanReplaceLines(currentReplace),
        })
        state = 'outside'
        currentStartHash = null
        currentEndHash = null
        currentReplace = []
        continue
      }

      if (line.startsWith('+')) {
        currentReplace.push(line.slice(1))
      } else if (line.startsWith('-')) {
        // deleted line in unified-style hashline; omit from replace
      } else {
        currentReplace.push(line)
      }
    }
  }

  if (state === 'replace' && currentStartHash) {
    blocks.push({
      startHash: currentStartHash.toLowerCase(),
      endHash: (currentEndHash || currentStartHash).toLowerCase(),
      replace: cleanReplaceLines(currentReplace),
    })
  }

  return blocks
}

/**
 * Apply hashline edit blocks to file content.
 * @param {string} content
 * @param {Array<{ startHash: string, endHash: string, replace: string }>} blocks
 * @returns {{ content: string, applied: number, conflicts: string[] }}
 */
function applyHashlinePatch(content, blocks) {
  const norm = normalizeLineEndings(content)
  let lines = norm.split('\n')
  let applied = 0
  const conflicts = []

  for (const block of blocks) {
    const sHash = block.startHash.toLowerCase()
    const eHash = block.endHash ? block.endHash.toLowerCase() : sHash

    let startIdx = -1
    for (let i = 0; i < lines.length; i++) {
      if (computeLineHash(lines[i]) === sHash) {
        startIdx = i
        break
      }
    }

    if (startIdx === -1) {
      conflicts.push(`Hashline start anchor [#${sHash}] not found in file.`)
      continue
    }

    let endIdx = -1
    for (let j = startIdx; j < lines.length; j++) {
      if (computeLineHash(lines[j]) === eHash) {
        endIdx = j
        break
      }
    }

    if (endIdx === -1) {
      conflicts.push(`Hashline end anchor [#${eHash}] not found after start anchor [#${sHash}].`)
      continue
    }

    const replacementLines = block.replace ? block.replace.split('\n') : []
    lines.splice(startIdx, endIdx - startIdx + 1, ...replacementLines)
    applied++
  }

  return { content: lines.join('\n'), applied, conflicts }
}

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

  if (normPatch.includes('<<<<<<< HASH') || /@@\s*#[0-9a-fA-F]+/i.test(normPatch)) {
    const blocks = parseHashlineBlocks(normPatch)
    if (blocks.length > 0) {
      const res = applyHashlinePatch(originalContent, blocks)
      return { ...res, format: 'hashline' }
    }
  }

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
  computeLineHash,
  formatWithHashlines,
  parseHashlineBlocks,
  applyHashlinePatch,
  parseUnifiedDiff,
  parseSearchReplaceBlocks,
  applyHunks,
  applySearchReplace,
  applyAnyPatch,
  normalizeLineEndings,
}
