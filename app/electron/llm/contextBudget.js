// ───────────────────────────────────────────────────────────────────────────
// Context Budget Manager — per-tool result truncation + context budget tracking.
//
// P1-1: Context Manager (inspired by OpenCode's Context Manager + Gemini CLI's
// reserved token budget).
//
// Responsibilities:
//   1. Per-tool-type truncation limits (read_file can be longer, grep shorter)
//   2. Context budget tracking (current tokens / max tokens)
//   3. Layered retention: system / recent / older with different lifetimes
//   4. Tool result pruning: drop low-value tool results from older blocks
// ───────────────────────────────────────────────────────────────────────────

const { estimateTextTokens } = require('./tokenizer')

// ── Per-tool-type truncation limits ──────────────────────────────────────
// Different tools produce different value-per-char. A grep hit is dense; a
// directory listing is sparse. Truncate accordingly.

const TOOL_TRUNCATION = {
  // Read tools: high value, allow longer
  read_file: 32000,
  codebase_graph: 24000,
  lsp_definition: 16000,
  lsp_references: 12000,
  lsp_diagnostics: 12000,
  lsp_code_actions: 16000,

  // Search tools: medium value, moderate length
  grep_search: 16000,
  glob_find: 8000,
  find_symbol: 8000,
  list_dir: 8000,

  // Web tools: variable, cap generously
  web_search: 24000,
  web_fetch: 32000,

  // Shell: can be very long, cap high
  run_command: 24000,

  // Agent/summary: usually concise
  delegate_task: 16000,
  task: 16000,
  run_agent: 16000,
  review_code: 16000,

  // Write tools: usually short confirmations
  write_file: 4000,
  edit_file: 4000,
  apply_patch: 4000,

  // Default fallback
  default: 16000,
}

// ── Context budget tiers ──────────────────────────────────────────────────
// Messages are classified into tiers with different retention policies.

const TIER_SYSTEM = 'system'       // System prompts — never prune
const TIER_RECENT = 'recent'       // Last N messages — always keep
const TIER_RELEVANT = 'relevant'   // Important tool results — keep if possible
const TIER_NOISE = 'noise'         // Verbose tool results — prune first

const TIER_CONFIG = {
  [TIER_SYSTEM]: { maxAge: Infinity, maxChars: 64000, priority: 3 },
  [TIER_RECENT]: { maxAge: 30 * 60 * 1000, maxChars: 32000, priority: 2 },  // 30 min
  [TIER_RELEVANT]: { maxAge: 2 * 60 * 60 * 1000, maxChars: 16000, priority: 1 },  // 2 hours
  [TIER_NOISE]: { maxAge: 10 * 60 * 1000, maxChars: 4000, priority: 0 },  // 10 min
}

// ── Tool result classifier ────────────────────────────────────────────────
// Classify a tool result into a tier based on tool name + content shape.

function classifyToolResult(toolName, content) {
  const len = (content || '').length

  // System-level: never prune
  if (toolName === 'use_skill') return TIER_RELEVANT

  // High-value tools: keep longer
  if (['read_file', 'codebase_graph', 'web_fetch', 'run_command', 'run_agent'].includes(toolName)) {
    if (len < 8000) return TIER_RELEVANT
    return TIER_NOISE  // very long read_file output → noise
  }

  // Medium-value tools
  if (['grep_search', 'glob_find', 'find_symbol', 'lsp_definition', 'lsp_references'].includes(toolName)) {
    if (len < 4000) return TIER_RELEVANT
    return TIER_NOISE
  }

  // Short confirmations: always relevant
  if (['write_file', 'edit_file', 'apply_patch', 'ask_user'].includes(toolName)) {
    return TIER_RELEVANT
  }

  // Default: medium
  if (len < 8000) return TIER_RELEVANT
  return TIER_NOISE
}

// ── Get truncation limit for a tool ──────────────────────────────────────

function getTruncationLimit(toolName) {
  return TOOL_TRUNCATION[toolName] || TOOL_TRUNCATION.default
}

// ── Apply tiered truncation to a message list ────────────────────────────
// Called BEFORE compaction. Walks messages from oldest to newest, applying
// per-tier truncation limits. System messages are never touched.

function applyTieredTruncation(messages, provider, model) {
  if (!messages || messages.length === 0) return messages

  const now = Date.now()
  const result = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      result.push(msg)  // system: never truncate
      continue
    }

    const content = typeof msg.content === 'string' ? msg.content : ''
    if (!content) {
      result.push(msg)
      continue
    }

    // Determine tier
    let tier = TIER_RELEVANT
    if (msg.role === 'tool') {
      const toolName = msg.tool_call_id || ''
      tier = classifyToolResult(toolName, content)
    } else if (msg.role === 'assistant' && msg.tool_calls) {
      tier = TIER_RELEVANT  // assistant tool-call messages are always relevant
    }

    const cfg = TIER_CONFIG[tier]
    if (!cfg) {
      result.push(msg)
      continue
    }

    // Age-based truncation: older messages get shorter limits
    const age = now - new Date(msg.created_at || now).getTime()
    const ageRatio = Math.min(1, age / (cfg.maxAge || 1))
    const ageFactor = 1 - ageRatio * 0.5  // up to 50% reduction for old messages

    // Tool-specific limit
    const toolLimit = msg.role === 'tool'
      ? getTruncationLimit(msg.tool_call_id || '')
      : cfg.maxChars

    const limit = Math.floor(toolLimit * ageFactor)

    if (content.length > limit) {
      const truncated = content.slice(0, limit) + `\n[… truncated ${content.length - limit} chars — tier: ${tier}]`
      result.push({ ...msg, content: truncated })
    } else {
      result.push(msg)
    }
  }

  return result
}

// ── Context budget calculation ───────────────────────────────────────────

function calculateBudget(messages, provider, model) {
  let totalTokens = 0
  const breakdown = {
    system: 0,
    user: 0,
    assistant: 0,
    tool: 0,
  }

  for (const msg of messages) {
    const tokens = estimateTextTokens(msg.content || '')
    totalTokens += tokens
    const key = msg.role === 'system' ? 'system'
      : msg.role === 'user' ? 'user'
      : msg.role === 'assistant' ? 'assistant'
      : 'tool'
    breakdown[key] += tokens
  }

  return { totalTokens, breakdown }
}

// ── Prune low-value tool results from older blocks ──────────────────────
// Called by compaction.js before summarization. Walks the "older" block and
// replaces verbose tool results with one-line summaries.

function pruneOlderBlock(olderMessages, provider, model) {
  if (!olderMessages || olderMessages.length === 0) return olderMessages

  return olderMessages.map(msg => {
    if (msg.role !== 'tool') return msg

    const content = typeof msg.content === 'string' ? msg.content : ''
    const toolName = msg.tool_call_id || ''
    const tier = classifyToolResult(toolName, content)

    // Only prune NOISE tier messages
    if (tier !== TIER_NOISE) return msg

    // Replace with a one-line summary
    const lines = content.split('\n').filter(l => l.trim())
    const firstLine = lines[0]?.slice(0, 100) || '(empty)'
    const pruned = `[${toolName} result pruned — ${content.length} chars, ${lines.length} lines. First: ${firstLine}]`

    return { ...msg, content: pruned }
  })
}

module.exports = {
  TOOL_TRUNCATION,
  TIER_CONFIG,
  TIER_SYSTEM,
  TIER_RECENT,
  TIER_RELEVANT,
  TIER_NOISE,
  classifyToolResult,
  getTruncationLimit,
  applyTieredTruncation,
  calculateBudget,
  pruneOlderBlock,
}
