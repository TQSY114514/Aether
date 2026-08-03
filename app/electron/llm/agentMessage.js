// ───────────────────────────────────────────────────────────────────────────
// AgentMessage — abstraction layer separating UI messages from LLM messages.
//
// Inspired by pi's AgentMessage abstraction: the UI and the LLM have different
// message formats (tool results, system prompts, injections), and converting
// between them should be explicit and testable.
//
// Core flow:
//   AgentMessage (UI format) → transformContext (enrich) → convertToLlm (API format)
//
// This prevents the common bug where UI-only fields leak into the LLM request
// or LLM-specific fields pollute the UI store.
// ───────────────────────────────────────────────────────────────────────────

const { estimateMessageTokens } = require('./compaction')

// ─── AgentMessage type ─────────────────────────────────────────────────────

class AgentMessage {
  constructor({ role, content, toolCalls, toolCallId, metadata }) {
    this.role = role          // 'system' | 'user' | 'assistant' | 'tool'
    this.content = content    // string | multimodal parts
    this.toolCalls = toolCalls || null     // LLM tool_calls (assistant only)
    this.toolCallId = toolCallId || null   // tool result ID (tool only)
    this.metadata = metadata || {}         // UI-only fields (display, timing, etc.)
  }

  // Check if this message carries tool calls.
  get hasToolCalls() {
    return !!(this.toolCalls && this.toolCalls.length)
  }

  // Check if this is a tool result message.
  get isToolResult() {
    return this.role === 'tool'
  }

  // Estimate token count for this message.
  estimateTokens() {
    return estimateMessageTokens(this)
  }
}

// ─── Transform Context ─────────────────────────────────────────────────────

// Transform a list of AgentMessages with context enrichment:
// - Inject memory prefetch
// - Inject skill descriptions
// - Inject evolution guidance
// - Inject project instructions
// Returns enriched AgentMessage array (does NOT mutate input).
function transformContext(messages, { memories, skills, gepPrompt, projectCtx }) {
  const enriched = [...messages]

  // Inject system messages at the beginning (after the main system prompt).
  const sysIdx = enriched.findIndex(m => m.role === 'system')
  const insertAt = sysIdx >= 0 ? sysIdx + 1 : 0

  if (projectCtx) {
    enriched.splice(insertAt, 0, new AgentMessage({
      role: 'system',
      content: projectCtx,
      metadata: { source: 'project_instructions' }
    }))
  }

  if (memories) {
    enriched.splice(insertAt, 0, new AgentMessage({
      role: 'system',
      content: memories,
      metadata: { source: 'memory_prefetch' }
    }))
  }

  if (skills) {
    enriched.splice(insertAt, 0, new AgentMessage({
      role: 'system',
      content: skills,
      metadata: { source: 'skills_prompt' }
    }))
  }

  if (gepPrompt) {
    enriched.splice(insertAt, 0, new AgentMessage({
      role: 'system',
      content: gepPrompt,
      metadata: { source: 'gep_guidance' }
    }))
  }

  return enriched
}

// ─── Convert to LLM Format ─────────────────────────────────────────────────

// Convert AgentMessages to the plain-object format expected by the LLM API.
// Strips metadata and other UI-only fields.
function convertToLlm(messages) {
  return messages.map(m => {
    const out = { role: m.role }
    if (m.content !== undefined) out.content = m.content
    if (m.toolCalls) out.tool_calls = m.toolCalls
    if (m.toolCallId) out.tool_call_id = m.toolCallId
    // Explicitly NOT copying metadata — it's UI-only.
    return out
  })
}

// ─── Convert from UI/DB format ─────────────────────────────────────────────

// Convert plain message objects (from the database or UI store) to AgentMessages.
function fromPlain(messages) {
  return messages.map(m => new AgentMessage({
    role: m.role,
    content: m.content,
    toolCalls: m.tool_calls || null,
    toolCallId: m.tool_call_id || null,
    metadata: m.metadata || {}
  }))
}

// ─── Message Pair Detection ────────────────────────────────────────────────

// Find tool_call ↔ tool_result pairs in a message list.
// Returns an array of { call, result } pairs.
function findToolPairs(messages) {
  const pairs = []
  const pendingCalls = new Map() // tool_call_id → message

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.hasToolCalls) {
      for (const tc of msg.toolCalls) {
        pendingCalls.set(tc.id, { call: msg, toolCall: tc })
      }
    } else if (msg.role === 'tool' && msg.toolCallId) {
      const pending = pendingCalls.get(msg.toolCallId)
      if (pending) {
        pairs.push({ call: pending.call, toolCall: pending.toolCall, result: msg })
        pendingCalls.delete(msg.toolCallId)
      }
    }
  }

  return pairs
}

module.exports = {
  AgentMessage,
  transformContext,
  convertToLlm,
  fromPlain,
  findToolPairs,
}