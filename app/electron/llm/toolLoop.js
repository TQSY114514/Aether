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
const { applyMiddleware } = require('./toolResultMiddleware')
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
// Loop detection (from OpenClaw's before-tool-call loop-detection): if the
// model calls the same tool with the same args N times in a row, break — it's
// stuck. Keeps MAX_DEPTH as a hard backstop but catches stuck loops faster.
const LOOP_REPEAT_LIMIT = 3
// Per-tool execution timeout. A tool that hangs (e.g. a dead web_fetch) would
// otherwise block the loop forever. Wraps every tool.run in a Promise.race.
const TOOL_TIMEOUT_MS = 30000
// Permission request timeout. If the user walks away from the approval dialog,
// default to DENY after this long rather than hanging the agent indefinitely.
const PERMISSION_TIMEOUT_MS = 120000

// System prompt injected at the head of the conversation to steer the model
// toward a Plan→Act→Observe rhythm (like a coding agent). The model is told to
// think step-by-step, call one tool at a time when useful, and stop when done.
const AGENT_SYSTEM_PROMPT = `You are an agent with access to tools. Work through the user's request step by step:
1. Plan: briefly reason about what to do next.
2. Act: call a tool (or several) to gather information or make a change.
3. Observe: read the tool results, then decide the next step.
Call tools only when they help. When you have the final answer, respond in plain text with no tool calls. Prefer read-only tools (read_file, list_dir, grep_search, glob_find, web_search) before making changes. Be concise in your reasoning.
For multi-step tasks (3+ steps), call todo_write first to lay out the checklist, and update it (mark in_progress→completed) as you progress so the user can follow along.`

// Run a tool-calling loop. Returns the final assistant text.
// `onToolCall({ name, args, result, error })` is called for each tool invocation.
// `onPlanStep({ step, depth, assistantText })` is called each round so the UI can
//   render a live trace of the agent's thinking.
// `options` is spread into each completion request body (used to carry reasoning params).
// `agentMode`: 'ask' (confirm dangerous tools) | 'auto' (run everything) | 'plan' (safe tools only, block dangerous).
// `requestPermission({ name, args, risk })`: async, resolves true to allow a dangerous tool. Only called in 'ask' mode.
async function runToolLoop({ provider, model, messages, tools = true, signal, onToolCall, onPlanStep, onTodoUpdate, onAskUser, options = {}, agentMode = 'ask', requestPermission }) {
  const toolPayload = tools ? toolsPayload(agentMode) : []
  let depth = 0
  let totalChars = 0
  // Rolling signature of recent tool calls for loop detection.
  let lastSig = ''
  let sigRepeat = 0
  // We mutate a local copy of the conversation, appending assistant + tool messages.
  // Prepend the agent system prompt if the caller didn't already provide one.
  const convo = messages.slice()
  if (!convo.some(m => m.role === 'system')) convo.unshift({ role: 'system', content: AGENT_SYSTEM_PROMPT })

  while (depth < MAX_DEPTH) {
    depth++
    const opts = { ...options }
    if (toolPayload.length) { opts.tools = toolPayload; opts.tool_choice = 'auto' }
    // Fetch the assistant message, defensively: a provider hiccup (non-JSON,
    // connection drop, 5xx) must not crash the loop or lose the partial trace.
    let msg
    try {
      msg = await completeChatMessage({ provider, model, messages: convo, signal, options: opts })
    } catch (e) {
      // Could not get a completion — return the error as the final answer so the
      // user sees what went wrong instead of a silent hang.
      return `[agent error: ${e && e.message ? e.message : String(e)}]`
    }
    if (!msg) msg = { content: '', tool_calls: undefined }
    // Surface the assistant's reasoning this round as a plan step (even if it
    // only contains text, the UI shows it as the agent's current thought).
    // Wrapped: a destroyed webContents must not abort the whole loop.
    try { if (msg.content) onPlanStep && onPlanStep({ step: depth, depth, assistantText: msg.content }) } catch {}
    if (msg.tool_calls && msg.tool_calls.length) {
      // Append the assistant message that requested the calls.
      convo.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls })
      // Execute each tool call (sequentially for determinism).
      for (const tc of msg.tool_calls) {
        const fn = tc.function || {}
        const args = safeParseToolCallArgs(fn.arguments)
        const tool = getTool(fn.name)
        // Loop detection: same tool + same args repeated back-to-back → stuck.
        const sig = fn.name + ':' + JSON.stringify(args)
        if (sig === lastSig) { sigRepeat++ } else { lastSig = sig; sigRepeat = 1 }
        let entry = { name: fn.name, args, result: null, error: null, risk: tool ? tool.risk : null, latencyMs: null }
        if (sigRepeat >= LOOP_REPEAT_LIMIT) {
          entry.error = `loop detected: ${fn.name} called with identical args ${sigRepeat} times — stopping`
          try { onToolCall && onToolCall(entry) } catch {}
          return '（检测到工具调用循环，已停止）'
        }
        if (!tool) {
          entry.error = `unknown tool: ${fn.name}`
        } else {
          // Permission gate for dangerous tools:
          //   plan — blocked (read-only)
          //   ask  — requires user approval per call
          //   auto / yolo — run without prompting (yolo also skips the sandbox)
          if (tool.risk === 'dangerous' && agentMode !== 'auto' && agentMode !== 'yolo') {
            if (agentMode === 'plan') {
              entry.error = 'blocked by plan mode (read-only)'
            } else if (agentMode === 'ask') {
              const allowed = await requestPermissionWithTimeout(requestPermission, { name: fn.name, args, risk: tool.risk })
              if (!allowed) { entry.error = 'denied by user' }
            }
          }
          if (!entry.error) {
            const t0 = Date.now()
            // Pass agentMode in ctx so tools can relax the sandbox in 'yolo' mode.
            // Pass the loop's `signal` (the AbortSignal from chat.handler) so a
            // user Stop / tool timeout cancels an in-flight tool.
            // Pass onTodoUpdate so the todo_write tool can stream the checklist to the UI.
            const r = await runToolWithTimeout(tool, args, { provider, model, agentMode, onTodoUpdate, onAskUser }, signal)
            entry.latencyMs = Date.now() - t0
            if (r.error) { entry.error = r.error } else { entry.result = r.result }
          }
        }
        try { onToolCall && onToolCall(entry) } catch {}
        // Append the tool result message so the model can use it next round.
        // Pass it through the middleware chain first: redact secrets, truncate
        // over-long output so one verbose tool can't dominate the context.
        const rawContent = entry.error ? `[error: ${entry.error}]` : String(entry.result ?? '')
        const resultContent = applyMiddleware(rawContent, { tool: fn.name, args })
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

// Run a tool with a timeout. Resolves to { result } or { error } — never throws
// (a hung tool must not freeze the loop). The abort signal is internal so
// stopping generation still works via the loop's outer signal.
function runToolWithTimeout(tool, args, ctx, signal) {
  return new Promise((resolve) => {
    let done = false
    const finish = (val) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (signal && onAbort) signal.removeEventListener('abort', onAbort)
      resolve(val)
    }
    const timer = setTimeout(() => finish({ error: `tool timed out after ${TOOL_TIMEOUT_MS}ms` }), TOOL_TIMEOUT_MS)
    // If the outer loop is aborted (user stopped generation), resolve fast.
    const onAbort = () => finish({ error: 'aborted' })
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve()
      .then(() => tool.run(args, ctx))
      .then((result) => finish({ result }))
      .catch((e) => finish({ error: e && e.message ? e.message : String(e) }))
  })
}

// Ask for permission with a timeout. Defaults to DENY if the user doesn't
// respond — safer than hanging the loop. The chat.handler side also has its
// own expiry, but this is the hard backstop inside the loop.
function requestPermissionWithTimeout(requestPermission, payload) {
  if (!requestPermission) return Promise.resolve(false)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), PERMISSION_TIMEOUT_MS)
    Promise.resolve(requestPermission(payload))
      .then((ok) => { clearTimeout(timer); resolve(!!ok) })
      .catch(() => { clearTimeout(timer); resolve(false) })
  })
}
// non-streaming completion. Lives on the adapter so provider-specific parsing
// stays there; here we just call through.
async function completeChatMessage({ provider, model, messages, signal, options = {} }) {
  // Defer to the openai adapter's raw completer via the public dispatcher.
  const adapter = require('./providerAdapter')
  // providerAdapter exposes completeChat (string) and completeChatMessage (object).
  return adapter.completeChatMessage({ provider, model, messages, signal, options })
}

module.exports = { runToolLoop }
