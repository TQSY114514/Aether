// ───────────────────────────────────────────────────────────────────────────
// Agent tool-call loop with integrated planning.
//
// Pipeline: receive → detect tool_calls → run tools → re-request → finalize.
// Hard depth cap prevents infinite loops. Each invocation is reported via
// callbacks so the UI renders a live tool-call block + plan trace.
//
// Planning integration (DS4 / OpenClaw-inspired):
//   - isComplexRequest() gates whether to invest in explicit planning.
//   - generatePlan() asks the model for a sub-task breakdown.
//   - plan_progress tool calls from the model update plan status live.
// ───────────────────────────────────────────────────────────────────────────

const { completeChatMessage } = require('./providerAdapter')
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

const planning = require('./planning')

const DEFAULT_MAX_ITERATIONS = 25
const MAX_TOTAL_CHARS = 200000
const LOOP_REPEAT_LIMIT = 3
const TOOL_TIMEOUT_MS = 30000
const PERMISSION_TIMEOUT_MS = 120000

class IterationBudget {
  constructor(maxTotal) {
    this.maxTotal = maxTotal > 0 ? Math.floor(maxTotal) : DEFAULT_MAX_ITERATIONS
    this._used = 0
  }
  consume() { if (this._used >= this.maxTotal) return false; this._used++; return true }
  refund() { if (this._used > 0) this._used-- }
  get used() { return this._used }
  get remaining() { return Math.max(0, this.maxTotal - this._used) }
}

// System prompt: Plan→Act→Observe rhythm (coding-agent style).
// References `plan_progress` when the model has an active plan.
const AGENT_SYSTEM_PROMPT = `You are an agent with access to tools. Work through the user's request step by step:
1. Plan: briefly reason about what to do next.
2. Act: call a tool (or several) to gather information or make a change.
3. Observe: read the tool results, then decide the next step.
Call tools only when they help. When you have the final answer, respond in plain text with no tool calls. Prefer read-only tools (read_file, list_dir, grep_search, glob_find, web_search) before making changes. Be concise in your reasoning.
For multi-step tasks (3+ steps), call todo_write first to lay out the checklist, and update it (mark in_progress→completed) as you progress so the user can follow along. When an execution plan is shown, call plan_progress with the task id and a brief result as you finish each step.
Parallelism: you may call multiple INDEPENDENT tools in one round (they run concurrently). For larger independent sub-tasks (e.g. researching 3 unrelated files), call delegate_task with an array of task descriptions — sub-agents run them in parallel and return combined results.`

// Main entry: run a tool-calling loop with optional planning support.
// Returns the final assistant text.
async function runToolLoop({ provider, model, messages, tools = true, signal, onToolCall, onPlanStep, onStatus, onTodoUpdate, onAskUser, options = {}, agentMode = 'ask', requestPermission, maxIterations }) {
  const toolPayload = tools ? toolsPayload(agentMode) : []
  const budget = new IterationBudget(maxIterations)
  let totalChars = 0
  let lastSig = ''
  let sigRepeat = 0
  const convo = messages.slice()
  if (!convo.some(m => m.role === 'system')) convo.unshift({ role: 'system', content: AGENT_SYSTEM_PROMPT })

  let plan = null
  let planningMode = false

  // Planning gate: if the request is complex enough, generate a plan first.
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  if (lastUserMsg && planning.isComplexRequest(lastUserMsg.content, messages.length)) {
    try {
      plan = await planning.generatePlan(provider, model, lastUserMsg.content, signal, options)
      if (plan && plan.tasks.length > 1) {
        planningMode = true
        // Inject plan into system context
        const planBlock = planning.planSystemBlock(plan)
        convo.unshift({ role: 'system', content: `\n\n${planBlock}` })
        onPlanStep?.({ step: 0, depth: 0, remaining: budget.remaining, assistantText: `📋 Plan: ${plan.description} (${plan.tasks.length} tasks)` })
      }
    } catch {}
  }

  while (budget.consume()) {
    const depth = budget.used
    const opts = { ...options }
    if (toolPayload.length) { opts.tools = toolPayload; opts.tool_choice = 'auto' }
    // When planning, also inject the plan_progress tool so the model can report
    // task completion. Inject plan_progress alongside the regular tools.
    const effectiveTools = planningMode ? [...toolPayload, ...planning.planToolsPayload()] : toolPayload
    if (effectiveTools.length) { opts.tools = effectiveTools; opts.tool_choice = 'auto' }

    let msg
    try {
      msg = await completeChatMessage({ provider, model, messages: convo, signal, options: opts })
    } catch (e) {
      return `[agent error: ${e && e.message ? e.message : String(e)}]`
    }
    if (!msg) msg = { content: '', tool_calls: undefined }
    try { if (msg.content) onPlanStep?.({ step: depth, depth, remaining: budget.remaining, assistantText: msg.content }) } catch {}

    if (msg.tool_calls && msg.tool_calls.length) {
      convo.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls })

      // Per-round loop detection: identical tool-call set repeated back-to-back.
      const roundSig = msg.tool_calls.map(tc => (tc.function||{}).name + ':' + (tc.function||{}).arguments).join('||')
      if (roundSig === lastSig) { sigRepeat++ } else { lastSig = roundSig; sigRepeat = 1 }
      if (sigRepeat >= LOOP_REPEAT_LIMIT) {
        try { onToolCall?.({ name: msg.tool_calls[0].function.name, args: {}, result: null, error: `loop detected: identical tool-call round repeated ${sigRepeat} times — stopping`, risk: null, latencyMs: null }) } catch {}
        return '（检测到工具调用循环，已停止）'
      }

      // Execute the round's tool calls CONCURRENTLY (Promise.all) so independent
      // calls take max(latency) not sum. Results stay in tool_call_id order.
      // plan_progress is a meta-tool handled inline (no real execution), but it
      // rides the same parallel path so ordering is preserved.
      const execOne = async (tc) => {
        const fn = tc.function || {}
        const args = safeParseToolCallArgs(fn.arguments)
        // Plan-progress meta-tool: record + return a synthetic tool result.
        if (fn.name === 'plan_progress' && planningMode) {
          const handled = planning.handlePlanProgress(plan, args)
          if (handled) {
            return { tc, isPlan: true, entry: { name: fn.name, args, result: `progress recorded for task ${args.task_id}`, error: null, risk: null, latencyMs: null }, planStep: `📊 [${args.task_id}] ${(args.result || '').slice(0, 60)}` }
          }
        }
        const tool = getTool(fn.name)
        const entry = { name: fn.name, args, result: null, error: null, risk: tool ? tool.risk : null, latencyMs: null }
        if (!tool) {
          entry.error = `unknown tool: ${fn.name}`
        } else {
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
            const r = await runToolWithTimeout(tool, args, { provider, model, agentMode, onTodoUpdate, onAskUser, signal }, signal)
            entry.latencyMs = Date.now() - t0
            if (r.error) { entry.error = r.error } else { entry.result = r.result }
          }
        }
        return { tc, isPlan: false, entry }
      }
      const executed = await Promise.all(msg.tool_calls.map(execOne))
      // Append results in the model's issuance order (tool_call_id pairing).
      for (const { tc, isPlan, entry, planStep } of executed) {
        if (isPlan && planStep) {
          try { onPlanStep?.({ step: depth, depth, remaining: budget.remaining, assistantText: planStep }) } catch {}
        } else {
          try { onToolCall?.(entry) } catch {}
        }
        const rawContent = entry.error ? `[error: ${entry.error}]` : String(entry.result ?? '')
        const resultContent = applyMiddleware(rawContent, { tool: (tc.function||{}).name, args: entry.args })
        totalChars += resultContent.length
        convo.push({ role: 'tool', tool_call_id: tc.id, content: resultContent })
      }
      if (totalChars > MAX_TOTAL_CHARS) {
        return '（工具输出超出上下文预算，已停止）'
      }
      // If planning mode is active and all tasks are completed, break out
      // and produce a final summary.
      if (planningMode && plan && plan.tasks.every(t => t.status === 'completed')) {
        const summary = planning.planSummary(plan)
        convo.push({ role: 'system', content: summary })
        // One more request to get the model to synthesize the final answer
        try {
          const finalMsg = await completeChatMessage({ provider, model, messages: convo, signal, options: { max_tokens: 2048, ...options } })
          if (finalMsg?.content) return finalMsg.content
        } catch {}
        return summary
      }
      continue
    }
    // No tool calls — final answer.
    return msg.content || ''
  }
  try { onStatus?.({ kind: 'budget_exhausted', text: `已达到最大迭代次数 ${budget.maxTotal}，已停止` }) } catch {}
  const planNote = plan ? `\n\n${planning.planSummary(plan)}` : ''
  return `（已达到最大迭代次数 ${budget.maxTotal}，已停止。可在设置中调高「Agent 最大迭代次数」）${planNote}`
}

function runToolWithTimeout(tool, args, ctx, signal) {
  return new Promise((resolve) => {
    let done = false
    const finish = (val) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve(val)
    }
    const timer = setTimeout(() => finish({ error: `tool timed out after ${TOOL_TIMEOUT_MS}ms` }), TOOL_TIMEOUT_MS)
    const onAbort = () => finish({ error: 'aborted' })
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve()
      .then(() => tool.run(args, ctx))
      .then((result) => finish({ result }))
      .catch((e) => finish({ error: e && e.message ? e.message : String(e) }))
  })
}

function requestPermissionWithTimeout(requestPermission, payload) {
  if (!requestPermission) return Promise.resolve(false)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), PERMISSION_TIMEOUT_MS)
    Promise.resolve(requestPermission(payload))
      .then((ok) => { clearTimeout(timer); resolve(!!ok) })
      .catch(() => { clearTimeout(timer); resolve(false) })
  })
}

module.exports = {
  runToolLoop,
  IterationBudget,
  isComplexRequest: planning.isComplexRequest,
  generatePlan: planning.generatePlan,
}
