// ───────────────────────────────────────────────────────────────────────────
// Tool-call loop.
//
// stream → detect tool_calls → run tools → append tool results → re-request,
// until the model returns a final text answer with no tool calls. Hard depth
// cap to prevent infinite loops. Each tool invocation is reported via the
// onToolCall callback so the UI can render a live tool-call block.
//
// This uses non-streaming completeChat under the hood: streaming tool-call
// argument accumulation is complex and provider-variable, and tool calls are
// short discrete steps where latency is less noticeable than for long prose.
// The plain chat path (no tools) still uses streamChat for live token streaming.
// ───────────────────────────────────────────────────────────────────────────

const { completeChat } = require('./providerAdapter')
const { safeParseToolCallArgs } = require('./toolArgs')
// Use the MCP-aware merged registry so the agent can call both built-in tools
// and any connected MCP server's tools. Falls back to the plain built-in
// registry if the manager isn't loadable for some reason.
let getTool, toolsPayload
try {
  const m = require('../mcp/manager')
  getTool = m.getMergedTool
  toolsPayload = m.getMergedToolsPayload
} catch {
  const r = require('../tools/registry')
  getTool = r.getTool
  toolsPayload = r.toolsPayload
}

const MAX_DEPTH = 12
const MAX_TOTAL_CHARS = 200000 // crude context budget across all tool results

// System prompt injected at the head of the conversation to steer the model
// toward a Plan→Act→Observe rhythm (like a coding agent). The model is told to
// think step-by-step, call one tool at a time when useful, and stop when done.
const AGENT_SYSTEM_PROMPT = `You are an agent with access to tools. Work through the user's request step by step:
1. Plan: briefly reason about what to do next.
2. Act: call a tool (or several) to gather information or make a change.
3. Observe: read the tool results, then decide the next step.
Call tools only when they help. When you have the final answer, respond in plain text with no tool calls. Prefer read-only tools (read_file, list_dir, grep_search, glob_find, web_search) before making changes. Be concise in your reasoning.`

// Run a tool-calling loop. Returns the final assistant text.
// `onToolCall({ name, args, result, error })` is called for each tool invocation.
// `onPlanStep({ step, depth, assistantText })` is called each round so the UI can
//   render a live trace of the agent's thinking.
// `options` is spread into each completion request body (used to carry reasoning params).
// `agentMode`: 'ask' (confirm dangerous tools) | 'auto' (run everything) | 'plan' (safe tools only, block dangerous).
// `requestPermission({ name, args, risk })`: async, resolves true to allow a dangerous tool. Only called in 'ask' mode.
async function runToolLoop({ provider, model, messages, tools = true, signal, onToolCall, onPlanStep, options = {}, agentMode = 'ask', requestPermission }) {
  const toolPayload = tools ? toolsPayload(agentMode) : []
  let depth = 0
  let totalChars = 0
  // We mutate a local copy of the conversation, appending assistant + tool messages.
  // Prepend the agent system prompt if the caller didn't already provide one.
  const convo = messages.slice()
  if (!convo.some(m => m.role === 'system')) convo.unshift({ role: 'system', content: AGENT_SYSTEM_PROMPT })

  while (depth < MAX_DEPTH) {
    depth++
    const opts = { ...options }
    if (toolPayload.length) { opts.tools = toolPayload; opts.tool_choice = 'auto' }
    const msg = await completeChatMessage({ provider, model, messages: convo, signal, options: opts })
    // Surface the assistant's reasoning this round as a plan step (even if it
    // only contains text, the UI shows it as the agent's current thought).
    if (msg.content) onPlanStep && onPlanStep({ step: depth, depth, assistantText: msg.content })
    if (msg.tool_calls && msg.tool_calls.length) {
      // Append the assistant message that requested the calls.
      convo.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls })
      // Execute each tool call (sequentially for determinism).
      for (const tc of msg.tool_calls) {
        const fn = tc.function || {}
        const args = safeParseToolCallArgs(fn.arguments)
        const tool = getTool(fn.name)
        let entry = { name: fn.name, args, result: null, error: null }
        if (!tool) {
          entry.error = `unknown tool: ${fn.name}`
        } else {
          // Permission gate for dangerous tools. 'plan' mode never runs them;
          // 'ask' mode requires the user to approve each one; 'auto' runs all.
          if (tool.risk === 'dangerous' && agentMode !== 'auto') {
            if (agentMode === 'plan') {
              entry.error = 'blocked by plan mode (read-only)'
            } else if (agentMode === 'ask') {
              const allowed = requestPermission ? await requestPermission({ name: fn.name, args, risk: tool.risk }) : false
              if (!allowed) { entry.error = 'denied by user' }
            }
          }
          if (!entry.error) {
            try {
              entry.result = await tool.run(args, { provider, model })
            } catch (e) {
              entry.error = e.message || String(e)
            }
          }
        }
        onToolCall && onToolCall(entry)
        // Append the tool result message so the model can use it next round.
        const resultContent = entry.error ? `[error: ${entry.error}]` : String(entry.result ?? '')
        totalChars += resultContent.length
        convo.push({ role: 'tool', tool_call_id: tc.id, content: resultContent })
      }
      // Stop if the accumulated tool output has blown the context budget.
      if (totalChars > MAX_TOTAL_CHARS) {
        return '（工具输出超出上下文预算，已停止）'
      }
      continue // re-request with tool results
    }
    // No tool calls — final answer.
    return msg.content || ''
  }
  // Depth exhausted — return whatever we last got.
  return '（工具调用达到最大深度，已停止）'
}

// Fetch the full assistant message object (content + tool_calls) for a
// non-streaming completion. Lives on the adapter so provider-specific parsing
// stays there; here we just call through.
async function completeChatMessage({ provider, model, messages, signal, options = {} }) {
  // Defer to the openai adapter's raw completer via the public dispatcher.
  const adapter = require('./providerAdapter')
  // providerAdapter exposes completeChat (string) and completeChatMessage (object).
  return adapter.completeChatMessage({ provider, model, messages, signal, options })
}

module.exports = { runToolLoop }
