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
const { applyMiddleware, enrichWithSummary } = require('./toolResultMiddleware')
const { classifyError } = require('./errorClassify')
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
const { reasoningFamily } = require('./reasoning')
const hooks = require('./hooks')

const DEFAULT_MAX_ITERATIONS = 25
const MAX_TOTAL_CHARS = 200000
const LOOP_REPEAT_LIMIT = 3
const TOOL_TIMEOUT_MS = 30000
const TOOL_RETRY_MAX = 2
const TOOL_RETRY_BASE_MS = 1000
const PERMISSION_TIMEOUT_MS = 120000
const MAX_CONCURRENT_TOOLS = 5 // cap parallel tool calls per round

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
async function runToolLoop({ provider, model, messages, tools = true, signal, onToolCall, onPlanStep, onStatus, onTodoUpdate, onAskUser, options = {}, agentMode = 'ask', requestPermission, maxIterations, onThinkingStart, onThinkingEnd, sessionId, onBudgetUpdate, onAudit }) {
  const toolPayload = tools ? toolsPayload(agentMode) : []
  const budget = new IterationBudget(maxIterations)
  let totalChars = 0
  let lastSig = ''
  let sigRepeat = 0
  const convo = messages.slice()
  if (!convo.some(m => m.role === 'system')) convo.unshift({ role: 'system', content: AGENT_SYSTEM_PROMPT })

  let plan = null
  let planningMode = false
  let planToolsPayload = []
  // Collect all tool calls for the audit log.
  const auditTrail = []

  // Planning gate: if the request is complex enough, generate a plan first.
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  if (lastUserMsg && planning.isComplexRequest(lastUserMsg.content, messages.length)) {
    try {
      plan = await planning.generatePlan(provider, model, lastUserMsg.content, signal, options)
      if (plan && plan.tasks.length > 1) {
        planningMode = true
        planToolsPayload = planning.planToolsPayload()
        // Inject plan into system context
        const planBlock = planning.planSystemBlock(plan)
        convo.unshift({ role: 'system', content: `\n\n${planBlock}` })
        onPlanStep?.({ step: 0, depth: 0, remaining: budget.remaining, assistantText: `📋 Plan: ${plan.description} (${plan.tasks.length} tasks)` })
      }
    } catch {}
  }

  // Build tool context with sessionId for sandbox checks.
  const toolCtx = { sessionId, provider, model, signal, agentMode, onTodoUpdate, onAskUser, onStream }
  const permissionCtx = { provider, model, agentMode, sessionId, signal }

  while (budget.consume()) {
    const depth = budget.used
    const opts = { ...options }
    if (toolPayload.length) { opts.tools = toolPayload; opts.tool_choice = 'auto' }
    if (planToolsPayload.length) { opts.tools = [...toolPayload, ...planToolsPayload]; opts.tool_choice = 'auto' }

    let msg
    try {
      try { onThinkingStart?.() } catch {}
      msg = await completeChatMessage({ provider, model, messages: convo, signal, options: opts })
      try { onThinkingEnd?.() } catch {}
    } catch (e) {
      try { onThinkingEnd?.() } catch {}
      return `[agent error: ${e && e.message ? e.message : String(e)}]`
    }
    if (!msg) msg = { content: '', tool_calls: undefined }
    try { if (msg.content) onPlanStep?.({ step: depth, depth, remaining: budget.remaining, assistantText: msg.content }) } catch {}

    if (msg.tool_calls && msg.tool_calls.length) {
      convo.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls })

      // Per-round loop detection
      const roundSig = msg.tool_calls.map(tc => (tc.function||{}).name + ':' + (tc.function||{}).arguments).join('||')
      if (roundSig === lastSig) { sigRepeat++ } else { lastSig = roundSig; sigRepeat = 1 }
      if (sigRepeat >= LOOP_REPEAT_LIMIT) {
        if (onAudit) try { onAudit({ totalIterations: budget.used, toolCalls: auditTrail, finalStatus: 'loop_detected', planId: plan?.id }) } catch {}
        try { onToolCall?.({ name: msg.tool_calls[0].function.name, args: {}, result: null, error: `loop detected: identical tool-call round repeated ${sigRepeat} times — stopping`, risk: null, latencyMs: null }) } catch {}
        return '（检测到工具调用循环，已停止）'
      }

      // Execute the round's tool calls CONCURRENTLY (capped at MAX_CONCURRENT_TOOLS).
      // Batch into chunks so independent calls take max(latency) not sum.
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
          // Tool lifecycle: prepareArguments rewrites args, then beforeToolCall
          // can block by throwing (OpenClaw pattern).
          try {
            if (typeof tool.prepareArguments === 'function') {
              const modified = tool.prepareArguments(args)
              if (modified && typeof modified === 'object') Object.assign(args, modified)
            }
          } catch (e) {
            entry.error = `blocked by prepareArguments: ${e.message}`
          }
          if (!entry.error) {
            try {
              if (typeof tool.beforeToolCall === 'function') {
                await tool.beforeToolCall({ toolName: fn.name, args, sessionId, messageId: tc.id })
              }
            } catch (e) {
              entry.error = `blocked by tool hook: ${e.message}`
            }
          }
          // Hooks: PreToolUse — user-defined scripts can block or modify.
          if (!entry.error) {
            try { await hooks.runHooks('PreToolUse', { toolName: fn.name, args, sessionId, messageId: tc.id }) } catch (e) {
              entry.error = `blocked by hook: ${e.message}`
            }
          }
          // Permission gate
          if (!entry.error) {
            const effectiveMode = agentMode === 'auto_confirm'
              ? (tool.risk === 'safe' ? 'auto' : 'ask')
              : agentMode
            if (tool.risk === 'dangerous' && effectiveMode !== 'auto' && effectiveMode !== 'yolo') {
              if (effectiveMode === 'plan') {
                entry.error = 'blocked by plan mode (read-only)'
              } else if (effectiveMode === 'ask') {
                const allowed = await requestPermissionWithTimeout(requestPermission, { name: fn.name, args, risk: tool.risk, sessionId })
                if (!allowed) { entry.error = 'denied by user' }
              }
            }
          }
          if (!entry.error) {
            const t0 = Date.now()
            const r = await runToolWithTimeout(tool, args, { ...toolCtx, agentMode: effectiveMode }, signal)
            entry.latencyMs = Date.now() - t0
            if (r.error) {
              entry.error = r.error
              try { await hooks.runHooks('ToolError', { toolName: fn.name, args, error: r.error, sessionId, messageId: tc.id }) } catch {}
            } else {
              entry.result = r.result
              // Tool lifecycle: afterToolCall can modify the result (OpenClaw pattern).
              try {
                if (typeof tool.afterToolCall === 'function') {
                  const modified = tool.afterToolCall({ toolName: fn.name, args, result: entry.result, sessionId, messageId: tc.id })
                  if (modified !== undefined) entry.result = modified
                }
              } catch {}
              try { await hooks.runHooks('PostToolUse', { toolName: fn.name, args, result: r.result, sessionId, messageId: tc.id }) } catch {}
            }
          }
        }
        return { tc, isPlan: false, entry }
      }

      // Execute tool calls. If any tool declares sequential mode (e.g. run_command),
      // run them one at a time to avoid shared-state races. Otherwise, batch into
      // MAX_CONCURRENT_TOOLS groups for parallel execution.
      const anySequential = msg.tool_calls.some(tc => {
        const t = getTool((tc.function || {}).name)
        return t && t.executionMode === 'sequential'
      })
      let allExecuted = []
      if (anySequential) {
        // Sequential execution — one tool at a time.
        for (const tc of msg.tool_calls) {
          allExecuted.push(await execOne(tc))
        }
      } else {
        // Parallel execution — batch into groups of MAX_CONCURRENT_TOOLS.
        for (let i = 0; i < msg.tool_calls.length; i += MAX_CONCURRENT_TOOLS) {
          const chunk = msg.tool_calls.slice(i, i + MAX_CONCURRENT_TOOLS)
          const executed = await Promise.all(chunk.map(execOne))
          allExecuted.push(...executed)
        }
      }

      // Append results in order.
      for (const { tc, isPlan, entry, planStep } of allExecuted) {
        if (isPlan && planStep) {
          try { onPlanStep?.({ step: depth, depth, remaining: budget.remaining, assistantText: planStep }) } catch {}
        } else {
          try { onToolCall?.(entry) } catch {}
          // Audit log: record each tool call.
          if (onAudit && !isPlan) {
            auditTrail.push({ name: entry.name, args: entry.args, result: entry.result, error: entry.error, latencyMs: entry.latencyMs, depth })
          }
        }
        let rawContent = entry.error ? `[error: ${entry.error}]` : String(entry.result ?? '')
        // Middleware chain (redact, truncate) — never let it break the loop.
        try { rawContent = applyMiddleware(rawContent, { tool: (tc.function||{}).name, args: entry.args }) } catch {}
        // Enrich structured results with a summary line (OpenClaw-inspired).
        try { rawContent = enrichWithSummary(rawContent, (tc.function||{}).name) } catch {}
        totalChars += rawContent.length
        convo.push({ role: 'tool', tool_call_id: tc.id, content: rawContent })
      }
      if (totalChars > MAX_TOTAL_CHARS) {
        return '（工具输出超出上下文预算，已停止）'
      }
      if (planningMode && plan && plan.tasks.every(t => t.status === 'completed')) {
        const summary = planning.planSummary(plan)
        convo.push({ role: 'system', content: summary })
        try {
          const finalMsg = await completeChatMessage({ provider, model, messages: convo, signal, options: { max_tokens: 2048, ...options } })
          if (finalMsg?.content) return finalMsg.content
        } catch {}
        return summary
      }
      continue
    }
    // No tool calls — final answer.
    const finalStatus = budget.used >= budget.maxTotal ? 'budget_exhausted' : 'success'
    if (onAudit) {
      try { onAudit({ totalIterations: budget.used, toolCalls: auditTrail, finalStatus, planId: plan?.id, planStatus: plan?.tasks?.map(t => t.status) }) } catch {}
    }
    return msg.content || ''
  }
  try { onStatus?.({ kind: 'budget_exhausted', text: `已达到最大迭代次数 ${budget.maxTotal}，已停止` }) } catch {}
  // Audit log: record the complete agent turn.
  if (onAudit) {
    try { onAudit({ totalIterations: budget.used, toolCalls: auditTrail, finalStatus: 'budget_exhausted', planId: plan?.id, planStatus: plan?.tasks.map(t => t.status) }) } catch {}
  }
  const planNote = plan ? `\n\n${planning.planSummary(plan)}` : ''
  return `（已达到最大迭代次数 ${budget.maxTotal}，已停止。可在设置中调高「Agent 最大迭代次数」）${planNote}`
}

// Execute a tool with timeout, retry on transient errors (Claude Code-style
// resilient tool execution). Transient failures (rate_limit, 5xx, network)
// are retried with exponential backoff up to TOOL_RETRY_MAX attempts.
// Permanent failures (auth, content_filter, abort) are returned immediately.
async function runToolWithTimeout(tool, args, ctx, signal) {
  let lastResult
  for (let attempt = 0; attempt <= TOOL_RETRY_MAX; attempt++) {
    const result = await new Promise((resolve) => {
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
    lastResult = result
    if (!result.error) return result // success
    // Classify and decide whether to retry.
    const verdict = classifyError(new Error(result.error))
    if (!verdict.retryable || verdict.kind === 'abort' || verdict.kind === 'auth') return result
    if (attempt < TOOL_RETRY_MAX) {
      const backoff = TOOL_RETRY_BASE_MS * Math.pow(2, attempt)
      await sleep(backoff)
    }
  }
  return lastResult
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
  MAX_CONCURRENT_TOOLS,
}
