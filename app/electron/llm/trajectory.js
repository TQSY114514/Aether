// ───────────────────────────────────────────────────────────────────────────
// Trajectory Compression — long-conversation compression preserving key points.
//
// Inspired by Hermes Agent's trajectory compression: long agent conversations
// accumulate many intermediate tool-call/result pairs. Most of these are
// mechanical (file reads, greps) and can be compressed into a summary while
// keeping key decision points (user questions, important findings, errors).
//
// Unlike compaction.js (which handles context-window overflow), trajectory
// compression is proactive — it runs after each agent turn to keep the
// conversation lean, preventing the context window from filling up in the
// first place.
//
// Design:
//   1. After each turn, evaluate if compression is needed (total messages > budget)
//   2. Identify "key" messages (user questions, errors, important findings)
//   3. Compress "mechanical" messages (tool calls/results) into summaries
//   4. Preserve the most recent N messages verbatim
//   5. Track what was compressed so the user can inspect
//
// Phase 4 — PortContext Snapshot (4.7):
//   - buildPortContext(basePath): scans project structure to generate a snapshot
//   - PortContext class: holds sourceRoot, testsRoot, assetsRoot, file counts,
//     and archiveAvailable flag
//   - Snapshot is taken before compression and attached to the result
//   - Snapshot cache uses Map<basePath, { snapshot, mtime }> with
//     automatic invalidation when files change
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { estimateMessagesTokens } = require('./compaction')
const log = require('../logger')

// ─── Configuration ─────────────────────────────────────────────────────────

const COMPRESS_AT_MESSAGES = 30    // start compressing when ≥ 30 messages
const KEEP_RECENT = 10             // always keep the last N messages verbatim
const KEEP_KEY_MESSAGES = true     // preserve user messages and error results
const COMPRESSION_INTERVAL = 5     // compress every N turns (not every turn)

// ─── PortContext Snapshot Cache ────────────────────────────────────────────

// Cache keyed by resolved project path; value is { snapshot, mtime }
const _snapshotCache = new Map()

// ─── PortContext Class ─────────────────────────────────────────────────────

class PortContext {
  constructor({ sourceRoot, testsRoot, assetsRoot, pythonFileCount, testFileCount, assetFileCount, archiveAvailable }) {
    this.sourceRoot = sourceRoot || ''
    this.testsRoot = testsRoot || ''
    this.assetsRoot = assetsRoot || ''
    this.pythonFileCount = pythonFileCount || 0
    this.testFileCount = testFileCount || 0
    this.assetFileCount = assetFileCount || 0
    this.archiveAvailable = archiveAvailable || false
  }

  // Serialize to a compact string for embedding in system messages.
  toString() {
    const lines = [
      '[PortContext Snapshot]',
      `Source: ${this.sourceRoot} (${this.pythonFileCount} files)`,
      `Tests:  ${this.testsRoot} (${this.testFileCount} files)`,
      `Assets: ${this.assetsRoot} (${this.assetFileCount} files)`,
      `Archive: ${this.archiveAvailable ? 'available' : 'not available'}`,
      '[End PortContext Snapshot]',
    ]
    return lines.join('\n')
  }

  // Return a plain object suitable for JSON serialization.
  toJSON() {
    return {
      sourceRoot: this.sourceRoot,
      testsRoot: this.testsRoot,
      assetsRoot: this.assetsRoot,
      pythonFileCount: this.pythonFileCount,
      testFileCount: this.testFileCount,
      assetFileCount: this.assetFileCount,
      archiveAvailable: this.archiveAvailable,
    }
  }
}

// ─── Snapshot Helpers ──────────────────────────────────────────────────────

// Count files with a given extension under a directory (non-recursive by default).
// Returns the count.
function _countFiles(dir, extension, recursive) {
  try {
    if (!fs.existsSync(dir)) return 0
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    let count = 0
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isFile() && entry.name.endsWith(extension)) {
        count++
      } else if (recursive && entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        count += _countFiles(fullPath, extension, recursive)
      }
    }
    return count
  } catch {
    return 0
  }
}

// Compute a quick hash of the top-level directory listing to detect file changes.
// Returns a hex string.
function _dirHash(dir) {
  try {
    if (!fs.existsSync(dir)) return ''
    const entries = fs.readdirSync(dir)
    const hash = crypto.createHash('sha256')
    for (const name of entries.sort()) {
      hash.update(name)
      try {
        const stat = fs.statSync(path.join(dir, name))
        hash.update(String(stat.mtimeMs))
      } catch {
        // skip files that disappear between readdir and stat
      }
    }
    return hash.digest('hex')
  } catch {
    return ''
  }
}

// Check whether a cached snapshot is still valid by comparing the directory hash.
function _isSnapshotValid(cached, basePath) {
  if (!cached) return false
  const currentHash = _dirHash(basePath)
  return cached.dirHash === currentHash
}

// Build a PortContext snapshot for the given project base path.
// Scans common source, test, and asset directories and returns a PortContext instance.
function buildPortContext(basePath) {
  if (!basePath || !fs.existsSync(basePath)) {
    return new PortContext({})
  }

  const resolved = path.resolve(basePath)

  // Check cache validity
  const cached = _snapshotCache.get(resolved)
  if (cached && _isSnapshotValid(cached, resolved)) {
    return cached.snapshot
  }

  // Common directory names across projects
  const candidates = {
    sourceDirs: ['src', 'source', 'app', 'lib', 'libs', 'core', 'packages'],
    testDirs: ['test', 'tests', '__tests__', 'spec', 'specs'],
    assetDirs: ['assets', 'static', 'public', 'resources', 'images', 'fonts'],
  }

  // Find the best matching directories
  let sourceRoot = ''
  let testsRoot = ''
  let assetsRoot = ''
  let pythonFileCount = 0
  let testFileCount = 0
  let assetFileCount = 0

  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue

      const fullPath = path.join(resolved, entry.name)

      // Source directories
      if (candidates.sourceDirs.includes(entry.name)) {
        if (!sourceRoot) sourceRoot = fullPath
        pythonFileCount += _countFiles(fullPath, '.py', true)
        pythonFileCount += _countFiles(fullPath, '.js', true)
        pythonFileCount += _countFiles(fullPath, '.ts', true)
      }

      // Test directories
      if (candidates.testDirs.includes(entry.name)) {
        if (!testsRoot) testsRoot = fullPath
        testFileCount += _countFiles(fullPath, '.py', true)
        testFileCount += _countFiles(fullPath, '.js', true)
        testFileCount += _countFiles(fullPath, '.ts', true)
      }

      // Asset directories
      if (candidates.assetDirs.includes(entry.name)) {
        if (!assetsRoot) assetsRoot = fullPath
        // Count common asset file extensions
        assetFileCount += _countFiles(fullPath, '.png', true)
        assetFileCount += _countFiles(fullPath, '.jpg', true)
        assetFileCount += _countFiles(fullPath, '.jpeg', true)
        assetFileCount += _countFiles(fullPath, '.svg', true)
        assetFileCount += _countFiles(fullPath, '.gif', true)
        assetFileCount += _countFiles(fullPath, '.ico', true)
        assetFileCount += _countFiles(fullPath, '.webp', true)
        assetFileCount += _countFiles(fullPath, '.woff', true)
        assetFileCount += _countFiles(fullPath, '.woff2', true)
        assetFileCount += _countFiles(fullPath, '.css', true)
        assetFileCount += _countFiles(fullPath, '.scss', true)
      }
    }
  } catch {
    // If we can't read the directory, return an empty context
  }

  // Check for archive files (.tar.gz, .zip, .7z) in the project root
  let archiveAvailable = false
  try {
    const rootEntries = fs.readdirSync(resolved)
    for (const name of rootEntries) {
      if (name.endsWith('.tar.gz') || name.endsWith('.zip') || name.endsWith('.7z') || name.endsWith('.rar')) {
        archiveAvailable = true
        break
      }
    }
  } catch {
    // ignore
  }

  const snapshot = new PortContext({
    sourceRoot,
    testsRoot,
    assetsRoot,
    pythonFileCount,
    testFileCount,
    assetFileCount,
    archiveAvailable,
  })

  // Cache the snapshot with a directory hash for invalidation
  _snapshotCache.set(resolved, {
    snapshot,
    dirHash: _dirHash(resolved),
    timestamp: Date.now(),
  })

  return snapshot
}

// Clear the entire snapshot cache (useful for testing).
function clearSnapshotCache() {
  _snapshotCache.clear()
}

// Invalidate a specific cached snapshot by base path.
function invalidateSnapshot(basePath) {
  if (basePath) {
    _snapshotCache.delete(path.resolve(basePath))
  }
}

// ─── Key Message Detection ─────────────────────────────────────────────────

// Determine if a message is "key" — worth preserving verbatim.
function isKeyMessage(msg) {
  // User messages are always key
  if (msg.role === 'user') return true

  // System messages with important content
  if (msg.role === 'system') {
    const content = typeof msg.content === 'string' ? msg.content : ''
    // Preserve error-related system messages
    if (content.includes('[error') || content.includes('检测到') || content.includes('已停止')) return true
    // Preserve user injections
    if (content.includes('已插入') || content.includes('打断')) return true
    // Preserve PortContext snapshots
    if (content.includes('[PortContext Snapshot]')) return true
    return false
  }

  // Assistant messages with content (not just tool calls) are key
  if (msg.role === 'assistant') {
    const content = typeof msg.content === 'string' ? msg.content : ''
    if (content.trim().length > 100) return true
    // If it has NO tool calls and has content, it's a final answer
    if (!msg.tool_calls && content.trim().length > 0) return true
    return false
  }

  // Tool results: preserve errors
  if (msg.role === 'tool') {
    const content = typeof msg.content === 'string' ? msg.content : ''
    if (content.startsWith('[error:') || content.includes('error')) return true
    // Preserve large results (important findings)
    if (content.length > 2000) return true
    return false
  }

  return false
}

// ─── Compression ───────────────────────────────────────────────────────────

// Compress a list of messages into a compact form.
// Returns { messages: compressed array, compressedCount: number, summary: string, portContext: PortContext|null }
function compressTrajectory(messages, options = {}) {
  const {
    compressAtMessages = COMPRESS_AT_MESSAGES,
    keepRecent = KEEP_RECENT,
    keepKey = KEEP_KEY_MESSAGES,
    basePath,  // optional base path for PortContext snapshot
  } = options

  // Take PortContext snapshot before compression (if basePath provided)
  let portContext = null
  if (basePath) {
    portContext = buildPortContext(basePath)
  }

  if (messages.length < compressAtMessages) {
    return { messages, compressedCount: 0, summary: null, portContext }
  }

  // Split: recent messages (keep verbatim) + older messages (compress)
  const splitIdx = Math.max(0, messages.length - keepRecent)
  const older = messages.slice(0, splitIdx)
  const recent = messages.slice(splitIdx)

  // Separate key messages from mechanical messages in the older block
  const keyMessages = []
  const mechanicalMessages = []

  for (const msg of older) {
    if (keepKey && isKeyMessage(msg)) {
      keyMessages.push(msg)
    } else {
      mechanicalMessages.push(msg)
    }
  }

  // If nothing to compress, return as-is
  if (mechanicalMessages.length === 0) {
    return { messages, compressedCount: 0, summary: null, portContext }
  }

  // Build a summary of mechanical messages
  const summary = buildTrajectorySummary(mechanicalMessages)

  // Build result: system messages + PortContext + key messages + summary + recent
  const systemMsgs = messages.filter(m => m.role === 'system' && !older.includes(m))
  const result = [
    ...systemMsgs,
    { role: 'system', content: summary },
    ...keyMessages,
    ...recent,
  ]

  // Append PortContext snapshot to the summary if available
  if (portContext) {
    // Insert PortContext snapshot as a system message after the compression summary
    result.splice(1, 0, { role: 'system', content: portContext.toString() })
  }

  return {
    messages: result,
    compressedCount: mechanicalMessages.length,
    summary,
    portContext,
  }
}

// ─── Summary Building ──────────────────────────────────────────────────────

// Build a human-readable summary of compressed mechanical messages.
function buildTrajectorySummary(messages) {
  const toolCalls = []
  const results = []
  let totalChars = 0

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        const fn = tc.function || {}
        const argsStr = JSON.stringify(fn.arguments || {}).slice(0, 80)
        toolCalls.push(`${fn.name}(${argsStr})`)
      }
    } else if (msg.role === 'tool') {
      const content = typeof msg.content === 'string' ? msg.content : ''
      if (content.startsWith('[error:')) {
        results.push(`ERROR: ${content.slice(0, 100)}`)
      } else {
        totalChars += content.length
        if (results.length < 5) {
          results.push(content.slice(0, 80).replace(/\n/g, ' '))
        }
      }
    }
  }

  const lines = [
    `[Trajectory compressed: ${messages.length} messages summarized]`,
    `Tool calls: ${toolCalls.join(' → ') || 'none'}`,
  ]
  if (results.length > 0) {
    lines.push(`Key results: ${results.slice(0, 3).join(' | ')}`)
  }
  if (totalChars > 0) {
    lines.push(`Total result data: ~${Math.round(totalChars / 1024)}KB`)
  }
  lines.push('[End of compressed trajectory]')

  return lines.join('\n')
}

// ─── Turn-based Compression ────────────────────────────────────────────────

// Track per-session compression state.
const _sessionStates = new Map()

function getSessionState(sessionId) {
  if (!_sessionStates.has(sessionId)) {
    _sessionStates.set(sessionId, { turnsSinceCompression: 0, totalCompressed: 0 })
  }
  return _sessionStates.get(sessionId)
}

// Maybe compress: runs every N turns, only if the message count exceeds the threshold.
// Returns the (possibly compressed) message array.
// Accepts optional basePath for PortContext snapshot.
function maybeCompressTrajectory(sessionId, messages, options = {}) {
  const state = getSessionState(sessionId)
  state.turnsSinceCompression++

  if (state.turnsSinceCompression < COMPRESSION_INTERVAL) {
    return messages
  }

  if (messages.length < COMPRESS_AT_MESSAGES) {
    return messages
  }

  state.turnsSinceCompression = 0
  const result = compressTrajectory(messages, options)
  state.totalCompressed += result.compressedCount

  if (result.compressedCount > 0) {
    log.info(`trajectory: compressed ${result.compressedCount} messages in session ${sessionId} (total: ${state.totalCompressed})`)
    if (result.portContext) {
      log.info(`trajectory: attached PortContext snapshot for ${result.portContext.sourceRoot || 'unknown'}`)
    }
  }

  return result.messages
}

// Get compression stats for a session.
function getCompressionStats(sessionId) {
  const state = _sessionStates.get(sessionId)
  if (!state) return { totalCompressed: 0, turnsSinceCompression: 0 }
  return { totalCompressed: state.totalCompressed, turnsSinceCompression: state.turnsSinceCompression }
}

// Reset compression state for a session.
function resetCompression(sessionId) {
  _sessionStates.delete(sessionId)
}

module.exports = {
  compressTrajectory,
  buildTrajectorySummary,
  buildPortContext,
  clearSnapshotCache,
  invalidateSnapshot,
  isKeyMessage,
  maybeCompressTrajectory,
  getCompressionStats,
  resetCompression,
  PortContext,
  COMPRESS_AT_MESSAGES,
  KEEP_RECENT,
  COMPRESSION_INTERVAL,
}