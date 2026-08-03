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
// ───────────────────────────────────────────────────────────────────────────

const { estimateMessagesTokens } = require('./compaction')
const log = require('../logger')

// ─── Configuration ─────────────────────────────────────────────────────────

const COMPRESS_AT_MESSAGES = 30    // start compressing when ≥ 30 messages
const KEEP_RECENT = 10             // always keep the last N messages verbatim
const KEEP_KEY_MESSAGES = true     // preserve user messages and error results
const COMPRESSION_INTERVAL = 5     // compress every N turns (not every turn)

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
// Returns { messages: compressed array, compressedCount: number, summary: string }
function compressTrajectory(messages, options = {}) {
  const {
    compressAtMessages = COMPRESS_AT_MESSAGES,
    keepRecent = KEEP_RECENT,
    keepKey = KEEP_KEY_MESSAGES,
  } = options

  if (messages.length < compressAtMessages) {
    return { messages, compressedCount: 0, summary: null }
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
    return { messages, compressedCount: 0, summary: null }
  }

  // Build a summary of mechanical messages
  const summary = buildTrajectorySummary(mechanicalMessages)

  // Build result: system messages + key messages + summary + recent
  const systemMsgs = messages.filter(m => m.role === 'system' && !older.includes(m))
  const result = [
    ...systemMsgs,
    { role: 'system', content: summary },
    ...keyMessages,
    ...recent,
  ]

  return {
    messages: result,
    compressedCount: mechanicalMessages.length,
    summary
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
function maybeCompressTrajectory(sessionId, messages) {
  const state = getSessionState(sessionId)
  state.turnsSinceCompression++

  if (state.turnsSinceCompression < COMPRESSION_INTERVAL) {
    return messages
  }

  if (messages.length < COMPRESS_AT_MESSAGES) {
    return messages
  }

  state.turnsSinceCompression = 0
  const result = compressTrajectory(messages)
  state.totalCompressed += result.compressedCount

  if (result.compressedCount > 0) {
    log.info(`trajectory: compressed ${result.compressedCount} messages in session ${sessionId} (total: ${state.totalCompressed})`)
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
  isKeyMessage,
  maybeCompressTrajectory,
  getCompressionStats,
  resetCompression,
  COMPRESS_AT_MESSAGES,
  KEEP_RECENT,
  COMPRESSION_INTERVAL,
}