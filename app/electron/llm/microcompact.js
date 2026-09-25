// ─────────────────────────────────────────────────────────────────────────────
// microcompact.js — ZCode-inspired zero-LLM-cost local tool-result compaction
// and Prompt Cache prefix optimization helpers.
// Pure CommonJS, Electron-free.
// ─────────────────────────────────────────────────────────────────────────────

const MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE = '[Old tool result content cleared]'
const DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS = 5
const DEFAULT_MICROCOMPACT_IDLE_THRESHOLD_MINUTES = 60
const DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS = 256
const DEFAULT_MICROCOMPACT_THRESHOLD_RATIO = 0.9
const DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS = 2000
const DEFAULT_AUTO_COMPACT_THRESHOLD_TOKENS = 32000

const DEFAULT_COMPACTABLE_TOOLS = new Set([
  // Aether tool names
  'read_file',
  'run_command',
  'grep_search',
  'glob_find',
  'web_fetch',
  'web_search',
  'edit_file',
  'write_file',
  'apply_patch',
  'codebase_graph',
  'find_symbol',
  'list_dir',
  // ZCode / Claude Code / MCP standard aliases
  'Read',
  'Bash',
  'Grep',
  'Glob',
  'WebFetch',
  'WebSearch',
  'Edit',
  'Write',
  'ApplyPatch',
])

function estimateMessageTokens(messages) {
  if (!Array.isArray(messages)) return 0
  let chars = 0
  for (const m of messages) {
    if (!m) continue
    if (typeof m.content === 'string') {
      chars += m.content.length
    } else if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (typeof b === 'string') chars += b.length
        else if (b && typeof b.text === 'string') chars += b.text.length
      }
    }
    if (Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        chars += String(tc?.function?.name || '').length
        chars += String(tc?.function?.arguments || '').length
      }
    }
  }
  return Math.ceil(chars / 3.5)
}

function buildDefaultMicrocompactThreshold(autoCompactThreshold = DEFAULT_AUTO_COMPACT_THRESHOLD_TOKENS) {
  const ratioThreshold = Math.floor(autoCompactThreshold * DEFAULT_MICROCOMPACT_THRESHOLD_RATIO)
  const bufferThreshold = autoCompactThreshold - DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS
  return Math.max(0, Math.min(ratioThreshold, bufferThreshold))
}

function resolveMicrocompactTrigger({
  config = {},
  estimatedTokenCount,
  lastAssistantCompletedAtMs,
  nowMs = Date.now(),
  thresholdTokens,
}) {
  const idleMinutes = positiveInt(config.idleThresholdMinutes) ?? DEFAULT_MICROCOMPACT_IDLE_THRESHOLD_MINUTES
  if (
    lastAssistantCompletedAtMs !== undefined &&
    Number.isFinite(lastAssistantCompletedAtMs) &&
    lastAssistantCompletedAtMs > 0
  ) {
    const elapsedMs = nowMs - lastAssistantCompletedAtMs
    if (elapsedMs > idleMinutes * 60_000) {
      return 'time_based'
    }
  }

  if (thresholdTokens !== undefined && estimatedTokenCount >= thresholdTokens) {
    return 'token_pressure'
  }

  return undefined
}

/**
 * Perform zero-LLM-call local microcompaction on conversation messages.
 * Keeps the most recent `keepRecentToolResults` (default 5) tool-call groups intact,
 * protects media and error results, and clears older bulky tool outputs when either
 * token pressure or prompt-cache idle expiry (>60 min) is met.
 */
function maybeLocalMicrocompactMessages(input = {}) {
  const config = input.config || {}
  const rawMessages = Array.isArray(input.messages) ? input.messages : []
  const messages = rawMessages.map(cloneMessage)
  const estimatedTokenCount = estimateMessageTokens(messages)
  const thresholdTokens =
    positiveInt(config.thresholdTokens) ??
    buildDefaultMicrocompactThreshold(config.autoCompactThreshold)

  if (config.enabled === false) {
    return {
      decision: { estimatedTokenCount, reason: 'disabled', thresholdTokens },
      messages,
    }
  }

  const trigger = resolveMicrocompactTrigger({
    config,
    estimatedTokenCount,
    lastAssistantCompletedAtMs: input.lastAssistantCompletedAtMs,
    nowMs: input.nowMs,
    thresholdTokens,
  })

  if (!trigger) {
    return {
      decision: { estimatedTokenCount, reason: 'not_triggered', thresholdTokens },
      messages,
    }
  }

  const candidateGroups = collectCompactableToolResultGroups(messages, config)
  if (candidateGroups.length === 0) {
    return {
      decision: { estimatedTokenCount, reason: 'no_candidates', thresholdTokens, trigger },
      messages,
    }
  }

  const keepCount = Math.max(
    1,
    positiveInt(config.keepRecentToolResults) ?? DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS
  )
  const clearGroupCount = Math.max(0, candidateGroups.length - keepCount)
  if (clearGroupCount === 0) {
    return {
      decision: { estimatedTokenCount, reason: 'nothing_to_clear', thresholdTokens, trigger },
      messages,
    }
  }

  const toClear = candidateGroups.slice(0, clearGroupCount).flat()
  const toKeep = candidateGroups.slice(clearGroupCount).flat()
  for (const candidate of toClear) {
    const msg = messages[candidate.index]
    if (!msg) continue
    messages[candidate.index] = {
      ...msg,
      content: MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE,
    }
  }

  const postTokenCount = estimateMessageTokens(messages)
  const tokensSaved = Math.max(0, estimatedTokenCount - postTokenCount)
  const minSavings = positiveInt(config.minTokenSavings) ?? DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS
  if (tokensSaved < minSavings) {
    return {
      decision: { estimatedTokenCount, reason: 'below_min_savings', thresholdTokens, trigger },
      messages: rawMessages.map(cloneMessage),
    }
  }

  return {
    decision: { estimatedTokenCount, reason: 'applied', thresholdTokens, trigger },
    messages,
    payload: {
      clearedMessageCount: toClear.length,
      clearedToolCallIds: toClear.map((c) => c.toolCallId),
      keptToolCallIds: toKeep.map((c) => c.toolCallId),
      preMicrocompactTokenCount: estimatedTokenCount,
      postMicrocompactTokenCount: postTokenCount,
      tokensSaved,
      trigger,
      strategy: 'local_tool_result_clear',
    },
  }
}

function collectCompactableToolResultGroups(messages, config) {
  const compactableTools = config.compactableToolNames
    ? new Set(config.compactableToolNames)
    : DEFAULT_COMPACTABLE_TOOLS
  const clearErrorResults = config.clearErrorResults === true

  // Build a map from tool_call_id -> tool_name from assistant messages
  const callIdToName = new Map()
  for (const msg of messages) {
    if (msg && msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        const id = tc?.id
        const name = tc?.function?.name || tc?.name
        if (id && name) callIdToName.set(id, name)
      }
    }
  }

  const groups = []
  let currentGroup

  const flushCurrentGroup = () => {
    if (currentGroup && currentGroup.length > 0) {
      groups.push(currentGroup)
    }
    currentGroup = undefined
  }

  messages.forEach((msg, index) => {
    if (!msg) return
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      flushCurrentGroup()
      currentGroup = []
      return
    }
    if (msg.role !== 'tool') return
    const toolCallId = msg.tool_call_id || msg.toolCallId || `idx_${index}`
    const toolName = msg.name || msg.toolName || callIdToName.get(toolCallId)
    // If toolName is known, check compactableTools; if unknown in legacy messages, allow compacting non-error text
    if (toolName && !compactableTools.has(toolName)) return
    if (isErrorToolResult(msg) && !clearErrorResults) return
    if (isClearedContent(msg.content)) return
    if (hasMediaContent(msg.content)) return

    if (!currentGroup) {
      groups.push([{ index, toolCallId }])
      return
    }
    currentGroup.push({ index, toolCallId })
  })

  flushCurrentGroup()
  return groups
}

function isErrorToolResult(msg) {
  if (msg.isError === true) return true
  const text = typeof msg.content === 'string' ? msg.content.trim() : ''
  if (!text) return false
  return (
    text.startsWith('[ERROR]') ||
    text.startsWith('[FAILED:') ||
    text.startsWith('[TIMED OUT]') ||
    text.startsWith('<tool_use_error>') ||
    text.startsWith('Error:')
  )
}

function isClearedContent(content) {
  return String(content || '').trim() === MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE
}

function hasMediaContent(content) {
  if (!Array.isArray(content)) return false
  return content.some((block) => {
    if (!block || typeof block !== 'object') return false
    return (
      block.type === 'image' ||
      block.type === 'image_url' ||
      block.type === 'video' ||
      block.type === 'file'
    )
  })
}

function cloneMessage(msg) {
  if (!msg || typeof msg !== 'object') return msg
  return {
    ...msg,
    content: Array.isArray(msg.content) ? msg.content.map((b) => ({ ...b })) : msg.content,
    tool_calls: Array.isArray(msg.tool_calls) ? msg.tool_calls.map((tc) => ({ ...tc })) : msg.tool_calls,
  }
}

function positiveInt(value) {
  if (value === undefined || value === null || !Number.isFinite(value) || value < 0) return undefined
  return Math.floor(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Cache-Aware Context Ordering & Subagent Same-Catalog Boundary Guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Partition and order leading system messages so that `stable` system prompts
 * (core identity, persona, AGENTS.md, project rules) precede `dynamic` system
 * blocks (memory prefetch, replay snippets, plan snapshots). This prevents
 * turn-level dynamic blocks from invalidating the KV cache prefix of stable blocks.
 */
function orderSystemMessagesForCache(messages) {
  if (!Array.isArray(messages) || messages.length <= 1) return messages
  const firstNonSystemIdx = messages.findIndex((m) => m?.role !== 'system')
  const sysCount = firstNonSystemIdx === -1 ? messages.length : firstNonSystemIdx
  if (sysCount <= 1) return messages

  const sysMessages = messages.slice(0, sysCount)
  const restMessages = messages.slice(sysCount)

  const stable = []
  const dynamic = []
  for (const m of sysMessages) {
    const text = String(m?.content || '')
    const isDynamic =
      m?.cacheHint === 'dynamic' ||
      text.includes('<relevant_memories>') ||
      text.includes('<untrusted_memory>') ||
      text.includes('[Experience Replay') ||
      text.includes('📋 Active Plan') ||
      text.includes('Current Plan:')
    if (isDynamic) {
      dynamic.push({ ...m, cacheHint: 'dynamic' })
    } else {
      stable.push({ ...m, cacheHint: 'stable' })
    }
  }

  return [...stable, ...dynamic, ...restMessages]
}

/**
 * ZCode memory-agent-loop insight:
 * Subagents / background memory agents can send the EXACT same `tools` array as
 * the main agent in the LLM API request so the provider's `Tools -> System` KV
 * cache prefix is 100% reused, and then enforce the restricted tool allowlist
 * at the `tool_call` execution boundary via this guard.
 */
function evaluateToolBoundaryAllowlist(toolName, allowedTools) {
  if (!allowedTools) return { allowed: true }
  const allowSet = allowedTools instanceof Set ? allowedTools : new Set(allowedTools)
  if (allowSet.has(toolName)) {
    return { allowed: true }
  }
  return {
    allowed: false,
    reason: `<tool_use_error>Tool "${toolName}" is not permitted in this subagent context. Allowed tools: ${[...allowSet].join(', ')}</tool_use_error>`,
  }
}

module.exports = {
  MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE,
  DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS,
  DEFAULT_MICROCOMPACT_IDLE_THRESHOLD_MINUTES,
  DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS,
  estimateMessageTokens,
  buildDefaultMicrocompactThreshold,
  maybeLocalMicrocompactMessages,
  orderSystemMessagesForCache,
  evaluateToolBoundaryAllowlist,
}
