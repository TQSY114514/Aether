// ─────────────────────────────────────────────────────────────────────────────
// editMatchers.js — ZCode-inspired 8-tier cascading edit matcher + curly quote
// preservation + readFileState mtime tracking (with latest-slice readAt semantics).
// Pure CommonJS, Electron-free.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path')

const LEFT_SINGLE_CURLY_QUOTE = '\u2018'
const RIGHT_SINGLE_CURLY_QUOTE = '\u2019'
const LEFT_DOUBLE_CURLY_QUOTE = '\u201C'
const RIGHT_DOUBLE_CURLY_QUOTE = '\u201D'

const BROAD_MATCHERS = new Set([
  'line_trimmed',
  'indentation_flexible',
  'block_anchor',
])
const BLOCK_ANCHOR_MIN_SIMILARITY = 0.8

const STRATEGIES = [
  'quote_normalized',
  'line_number_prefix_stripped',
  'escape_normalized',
  'unicode_escape_normalized',
  'indentation_flexible',
  'line_trimmed',
  'block_anchor',
]

/**
 * Find a match for `search` inside `content` using an 8-tier cascading strategy:
 *   1. exact
 *   2. quote_normalized
 *   3. line_number_prefix_stripped
 *   4. escape_normalized
 *   5. unicode_escape_normalized
 *   6. line_trimmed
 *   7. indentation_flexible
 *   8. block_anchor
 *
 * @param {{ content: string, search: string, replaceAll?: boolean }} input
 * @returns {{ status: 'matched', actualString: string, index: number, strategy: string, candidateCount: number }
 *         | { status: 'ambiguous', strategy: string, candidateCount: number }
 *         | { status: 'not_found' }}
 */
function findEditMatch(input) {
  const content = String(input?.content ?? '')
  const search = String(input?.search ?? '')
  const replaceAll = Boolean(input?.replaceAll)
  if (!search) return { status: 'not_found' }

  const exact = collectExactCandidates(content, search)
  if (exact.length > 0) {
    return toMatchResult('exact', exact, replaceAll)
  }

  for (const strategy of STRATEGIES) {
    if (replaceAll && BROAD_MATCHERS.has(strategy)) continue
    const candidates = collectCandidates(strategy, content, search)
    if (candidates.length === 0) continue
    return toMatchResult(strategy, candidates, replaceAll)
  }

  return { status: 'not_found' }
}

function toMatchResult(strategy, candidates, replaceAll) {
  if (!replaceAll && candidates.length > 1) {
    return { status: 'ambiguous', strategy, candidateCount: candidates.length }
  }
  const uniqueValues = [...new Set(candidates.map((c) => c.value))]
  if (uniqueValues.length !== 1) {
    return { status: 'ambiguous', strategy, candidateCount: candidates.length }
  }
  return {
    status: 'matched',
    actualString: uniqueValues[0] || '',
    index: candidates[0].index,
    strategy,
    candidateCount: candidates.length,
  }
}

function normalizeLineEndings(content) {
  return String(content || '').replace(/\r\n/g, '\n')
}

function normalizeReplacementForMatch(strategy, newString) {
  const s = String(newString ?? '')
  if (strategy === 'escape_normalized') return unescapeVisibleCharacters(s)
  if (strategy === 'unicode_escape_normalized') return unescapeUnicodeCharacters(s)
  if (strategy === 'line_number_prefix_stripped') {
    const stripped = stripReadLineNumberPrefixes(s)
    return stripped !== null ? stripped : s
  }
  return s
}

function preserveQuoteStyle(oldString, actualOldString, newString) {
  if (oldString === actualOldString) return newString
  let result = String(newString ?? '')
  if (
    actualOldString.includes(LEFT_DOUBLE_CURLY_QUOTE) ||
    actualOldString.includes(RIGHT_DOUBLE_CURLY_QUOTE)
  ) {
    result = applyCurlyDoubleQuotes(result)
  }
  if (
    actualOldString.includes(LEFT_SINGLE_CURLY_QUOTE) ||
    actualOldString.includes(RIGHT_SINGLE_CURLY_QUOTE)
  ) {
    result = applyCurlySingleQuotes(result)
  }
  return result
}

function collectCandidates(strategy, content, search) {
  switch (strategy) {
    case 'exact':
      return collectExactCandidates(content, search)
    case 'quote_normalized':
      return collectNormalizedCandidates(content, search, normalizeQuotes)
    case 'line_number_prefix_stripped':
      return collectLineNumberPrefixCandidates(content, search)
    case 'escape_normalized':
      return collectEscapeNormalizedCandidates(content, search)
    case 'unicode_escape_normalized':
      return collectUnicodeEscapeNormalizedCandidates(content, search)
    case 'line_trimmed':
      return collectLineTrimmedCandidates(content, search)
    case 'indentation_flexible':
      return collectIndentationFlexibleCandidates(content, search)
    case 'block_anchor':
      return collectBlockAnchorCandidates(content, search)
    default:
      return []
  }
}

function collectExactCandidates(content, search) {
  return collectSubstringCandidates(content, search)
}

function collectSubstringCandidates(content, search) {
  if (!search) return []
  const candidates = []
  let pos = 0
  while (pos <= content.length) {
    const index = content.indexOf(search, pos)
    if (index === -1) break
    candidates.push({ value: search, index })
    pos = index + Math.max(search.length, 1)
  }
  return candidates
}

function collectNormalizedCandidates(content, search, normalize) {
  const normContent = normalize(content)
  const normSearch = normalize(search)
  if (!normSearch || normSearch === search && normContent === content) return []
  const candidates = []
  let pos = 0
  while (pos <= normContent.length) {
    const index = normContent.indexOf(normSearch, pos)
    if (index === -1) break
    candidates.push({ value: content.slice(index, index + search.length), index })
    pos = index + Math.max(normSearch.length, 1)
  }
  return candidates
}

function collectLineNumberPrefixCandidates(content, search) {
  const stripped = stripReadLineNumberPrefixes(search)
  if (stripped === null || stripped === search) return []
  return collectSubstringCandidates(content, stripped)
}

function collectEscapeNormalizedCandidates(content, search) {
  const unescaped = unescapeVisibleCharacters(search)
  if (unescaped === search) return []
  return collectSubstringCandidates(content, unescaped)
}

function collectUnicodeEscapeNormalizedCandidates(content, search) {
  const unescaped = unescapeUnicodeCharacters(search)
  if (unescaped === search) return []
  return collectSubstringCandidates(content, unescaped)
}

function collectLineTrimmedCandidates(content, search) {
  const contentLines = content.split('\n')
  const searchLines = trimTrailingEmptyLine(search.split('\n'))
  if (searchLines.length === 0) return []

  const candidates = []
  for (let i = 0; i <= contentLines.length - searchLines.length; i += 1) {
    const block = contentLines.slice(i, i + searchLines.length)
    if (!block.every((line, offset) => line.trim() === searchLines[offset].trim())) continue
    candidates.push(blockCandidate(contentLines, i, searchLines.length))
  }
  return candidates
}

function collectIndentationFlexibleCandidates(content, search) {
  const contentLines = content.split('\n')
  const searchLines = trimTrailingEmptyLine(search.split('\n'))
  if (searchLines.length < 2) return []

  const normalizedSearch = removeCommonIndent(searchLines)
  const candidates = []
  for (let i = 0; i <= contentLines.length - searchLines.length; i += 1) {
    const block = contentLines.slice(i, i + searchLines.length)
    if (removeCommonIndent(block) !== normalizedSearch) continue
    candidates.push(blockCandidate(contentLines, i, searchLines.length))
  }
  return candidates
}

function collectBlockAnchorCandidates(content, search) {
  const contentLines = content.split('\n')
  const searchLines = trimTrailingEmptyLine(search.split('\n'))
  if (searchLines.length < 3) return []

  const first = searchLines[0].trim()
  const last = searchLines[searchLines.length - 1].trim()
  if (!first || !last) return []

  const candidates = []
  for (let i = 0; i <= contentLines.length - searchLines.length; i += 1) {
    const block = contentLines.slice(i, i + searchLines.length)
    if (block[0].trim() !== first) continue
    if (block[block.length - 1].trim() !== last) continue
    if (averageMiddleSimilarity(block, searchLines) < BLOCK_ANCHOR_MIN_SIMILARITY) continue
    candidates.push(blockCandidate(contentLines, i, searchLines.length))
  }
  return candidates
}

function stripReadLineNumberPrefixes(search) {
  const lines = String(search || '').split('\n')
  if (lines.length === 0) return null
  let strippedAny = false
  const stripped = lines.map((line) => {
    if (line.trim() === '') return line
    const colonMatch = line.match(/^\s*\d+:\s?(.*)$/)
    if (colonMatch) {
      strippedAny = true
      return colonMatch[1] ?? ''
    }
    const tabMatch = line.match(/^\s*\d+\t(.*)$/)
    if (tabMatch) {
      strippedAny = true
      return tabMatch[1] ?? ''
    }
    return null
  })
  if (!strippedAny || !stripped.every((line) => line !== null)) return null
  return stripped.join('\n')
}

function unescapeVisibleCharacters(search) {
  return String(search || '').replace(/\\([ntr"'`\\$])/g, (match, token) => {
    switch (token) {
      case 'n': return '\n'
      case 't': return '\t'
      case 'r': return '\r'
      case '"':
      case "'":
      case '`':
      case '\\':
      case '$':
        return token
      default:
        return match
    }
  })
}

function unescapeUnicodeCharacters(search) {
  return String(search || '').replace(/(\\\\)|\\u([0-9a-fA-F]{4})/g, (match, escapedBackslash, hex) => {
    if (escapedBackslash !== undefined) return match
    return String.fromCharCode(Number.parseInt(hex, 16))
  })
}

function blockCandidate(lines, startLine, lineCount) {
  let offset = 0
  for (let i = 0; i < startLine; i += 1) {
    offset += lines[i].length + 1
  }
  return {
    value: lines.slice(startLine, startLine + lineCount).join('\n'),
    index: offset,
  }
}

function trimTrailingEmptyLine(lines) {
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    return lines.slice(0, -1)
  }
  return lines
}

function removeCommonIndent(lines) {
  const nonEmpty = lines.filter((line) => line.trim().length > 0)
  if (nonEmpty.length === 0) return lines.join('\n')
  const minIndent = Math.min(...nonEmpty.map((line) => (line.match(/^[\t ]*/)?.[0] || '').length))
  return lines.map((line) => (line.trim().length === 0 ? line : line.slice(minIndent))).join('\n')
}

function averageMiddleSimilarity(actual, expected) {
  if (actual.length <= 2) return 1
  let total = 0
  let count = 0
  for (let i = 1; i < actual.length - 1; i += 1) {
    total += lineSimilarity(actual[i].trim(), expected[i].trim())
    count += 1
  }
  return count === 0 ? 1 : total / count
}

function lineSimilarity(left, right) {
  if (left === right) return 1
  const maxLength = Math.max(left.length, right.length)
  if (maxLength === 0) return 1
  return 1 - levenshtein(left, right) / maxLength
}

function levenshtein(left, right) {
  const prev = Array.from({ length: right.length + 1 }, (_, idx) => idx)
  for (let i = 1; i <= left.length; i += 1) {
    const curr = [i]
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    prev.splice(0, prev.length, ...curr)
  }
  return prev[right.length] ?? 0
}

function normalizeQuotes(value) {
  return String(value || '')
    .replaceAll(LEFT_SINGLE_CURLY_QUOTE, "'")
    .replaceAll(RIGHT_SINGLE_CURLY_QUOTE, "'")
    .replaceAll(LEFT_DOUBLE_CURLY_QUOTE, '"')
    .replaceAll(RIGHT_DOUBLE_CURLY_QUOTE, '"')
}

function applyCurlyDoubleQuotes(value) {
  const chars = [...String(value || '')]
  return chars
    .map((ch, idx) => {
      if (ch !== '"') return ch
      return isOpeningQuoteContext(chars, idx) ? LEFT_DOUBLE_CURLY_QUOTE : RIGHT_DOUBLE_CURLY_QUOTE
    })
    .join('')
}

function applyCurlySingleQuotes(value) {
  const chars = [...String(value || '')]
  return chars
    .map((ch, idx) => {
      if (ch !== "'") return ch
      const prev = chars[idx - 1]
      const next = chars[idx + 1]
      if (isLetter(prev) && isLetter(next)) return RIGHT_SINGLE_CURLY_QUOTE
      return isOpeningQuoteContext(chars, idx) ? LEFT_SINGLE_CURLY_QUOTE : RIGHT_SINGLE_CURLY_QUOTE
    })
    .join('')
}

function isOpeningQuoteContext(chars, index) {
  if (index === 0) return true
  const prev = chars[index - 1]
  return (
    prev === ' ' ||
    prev === '\t' ||
    prev === '\n' ||
    prev === '\r' ||
    prev === '(' ||
    prev === '[' ||
    prev === '{' ||
    prev === '\u2014' ||
    prev === '\u2013'
  )
}

function isLetter(value) {
  return value !== undefined && /\p{L}/u.test(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// ReadFileState Tracking (ZCode read-file-state.ts semantics)
// Tracks per-session Read snapshots (path, offset, limit, mtimeMs, readAt).
// When checking staleness before Edit/Write, picks the LATEST readAt for that
// path (whether full or range read) so that a partial re-read after a formatter
// or shell command refreshes the baseline mtime and avoids false-positive stale errors.
// ─────────────────────────────────────────────────────────────────────────────

const _sessionReadStates = new Map() // sessionKey -> Map<sliceKey, { path, normalizedPath, offset, limit, mtimeMs, readAt }>

function normalizePathKey(filePath, platform = process.platform) {
  const resolved = path.resolve(String(filePath || ''))
  return platform === 'win32' ? resolved.toLowerCase() : resolved
}

function createReadFileStateKey(filePath, offset, limit, platform = process.platform) {
  return [
    normalizePathKey(filePath, platform),
    String(offset || 1),
    limit === undefined || limit === 0 ? '' : String(limit),
  ].join('\0')
}

function getSessionMap(sessionId) {
  const key = String(sessionId ?? 'default')
  if (!_sessionReadStates.has(key)) {
    _sessionReadStates.set(key, new Map())
  }
  return _sessionReadStates.get(key)
}

function normalizeMtimeMs(mtimeMs) {
  if (mtimeMs === undefined || mtimeMs === null || !Number.isFinite(mtimeMs)) return undefined
  return Math.floor(mtimeMs)
}

function recordReadFileState(sessionId, filePath, { offset = 1, limit, mtimeMs, readAt } = {}) {
  if (!filePath) return
  const map = getSessionMap(sessionId)
  const sliceKey = createReadFileStateKey(filePath, offset, limit)
  map.set(sliceKey, {
    path: filePath,
    normalizedPath: normalizePathKey(filePath),
    offset: Number(offset) || 1,
    limit: limit ? Number(limit) : undefined,
    mtimeMs: normalizeMtimeMs(mtimeMs),
    readAt: readAt instanceof Date ? readAt : new Date(readAt || Date.now()),
  })
}

function findLatestReadFileState(sessionId, filePath, platform = process.platform) {
  const key = String(sessionId ?? 'default')
  const map = _sessionReadStates.get(key)
  if (!map) return undefined
  const targetPathKey = normalizePathKey(filePath, platform)
  let latest
  let latestReadAt = Number.NEGATIVE_INFINITY
  for (const entry of map.values()) {
    if (normalizePathKey(entry.path, platform) !== targetPathKey) continue
    const ts = entry.readAt instanceof Date ? entry.readAt.getTime() : Number(entry.readAt || 0)
    if (ts >= latestReadAt) {
      latest = entry
      latestReadAt = ts
    }
  }
  return latest
}

/**
 * Verify that if a file was previously read in this session, its on-disk mtimeMs
 * has not advanced beyond the latest Read's mtimeMs.
 */
function checkStaleReadBeforeEdit(sessionId, filePath, currentMtimeMs) {
  const latest = findLatestReadFileState(sessionId, filePath)
  if (!latest || latest.mtimeMs === undefined) {
    return { ok: true, readRecorded: Boolean(latest) }
  }
  const diskMtime = normalizeMtimeMs(currentMtimeMs)
  if (diskMtime !== undefined && diskMtime > latest.mtimeMs) {
    return {
      ok: false,
      stale: true,
      lastReadMtimeMs: latest.mtimeMs,
      currentMtimeMs: diskMtime,
      reason: `File "${filePath}" has been modified externally since it was last read (read mtime=${latest.mtimeMs}, current mtime=${diskMtime}). Please call read_file on "${filePath}" again before editing.`,
    }
  }
  return { ok: true, readRecorded: true, latest }
}

function clearReadFileState(sessionId) {
  if (sessionId === undefined) {
    _sessionReadStates.clear()
  } else {
    _sessionReadStates.delete(String(sessionId))
  }
}

module.exports = {
  findEditMatch,
  normalizeLineEndings,
  normalizeReplacementForMatch,
  preserveQuoteStyle,
  stripReadLineNumberPrefixes,
  recordReadFileState,
  findLatestReadFileState,
  checkStaleReadBeforeEdit,
  clearReadFileState,
}
