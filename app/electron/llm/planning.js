// ───────────────────────────────────────────────────────────────────────────
// Hierarchical Planner — task decomposition for complex agent requests.
//
// Inspired by:
//   DS4 (antirez)   — structured task breakdown before execution
//   OpenClaw        — plan-then-act rhythm, explicit goal tracking
//   Hermes          — iteration budget + progress visibility
//
// Two modes:
//   isComplexRequest(userMessage, msgCount) → bool
//     Heuristic gate: decides whether to invest in planning.
//
//   generatePlan(provider, model, userMessage, signal, options)
//     Asks the model to decompose the request into sub-tasks.
//     Returns { id, description, tasks } or null.
//
//   PLAN_TOOL_SYSTEM — system prompt fragment that tells the model it can
//     call a `plan_task` tool to report progress on a plan step.
// ───────────────────────────────────────────────────────────────────────────

const { completeChatMessage } = require('./providerAdapter')

const PLANNING_PROMPT = `You are a task planner for an AI agent. Break the user's request into an ordered execution plan.

Output ONLY a JSON object:
{
  "description": "one-line summary of the overall goal",
  "tasks": [
    { "id": "1", "description": "...", "dependsOn": [], "parallelGroup": "A" },
    ...
  ]
}

Rules:
- 3-8 tasks. Each task is one actionable step.
- Tasks with no dependency on each other get the same parallelGroup.
- Include specific file paths, commands, or search queries when possible.
- Trivial requests (single-step) get a plan with just 1 task.
- NEVER output anything other than the JSON object.`

// Complexity heuristics — returns true if explicit planning is worth it.
function isComplexRequest(userMessage, msgCount) {
  const text = String(userMessage || '')
  const sentences = (text.match(/[。！？.!?;；\n]/g) || []).length
  const paths = (text.match(/[A-Za-z]:[\\/][\w\\/]+\.\w{1,5}|\/[\w\/]+\.\w{1,5}/g) || []).length
  const multiStep = /implement.*test|refactor.*then|create.*deploy|build.*from|analyze.*fix|migrate.*to|rewrite.*to/i.test(text)
  return (sentences >= 4 && text.length > 200) || paths >= 3 || multiStep || msgCount > 10
}

// Ask the model for a plan. Returns null on any failure.
async function generatePlan(provider, model, userMessage, signal, options = {}) {
  try {
    const result = await completeChatMessage({
      provider, model,
      messages: [
        { role: 'system', content: PLANNING_PROMPT },
        { role: 'user', content: String(userMessage || '').slice(0, 4000) },
      ],
      signal,
      options: { max_tokens: 1024, temperature: 0.1, ...options },
    })
    const text = (result?.content || '').trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) return null
    return {
      id: 'plan_' + Date.now(),
      description: String(parsed.description || '').slice(0, 80),
      tasks: parsed.tasks.map((t, i) => ({
        id: String(t.id || `t${i + 1}`),
        description: String(t.description || '').trim(),
        dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.map(String) : [],
        parallelGroup: t.parallelGroup ? String(t.parallelGroup) : undefined,
        status: 'pending',
        result: null,
      })),
    }
  } catch {
    return null
  }
}

// Build a system-prompt block that tells the model about the active plan
// and a `plan_progress` tool it can call to mark steps complete.
function planSystemBlock(plan) {
  if (!plan || !plan.tasks || plan.tasks.length === 0) return ''
  const lines = [
    '## Execution Plan',
    `Goal: ${plan.description}`,
    '',
    ...plan.tasks.map(t => {
      const icon = t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : t.status === 'in_progress' ? '⏳' : '○'
      const deps = t.dependsOn.length ? ` (after: ${t.dependsOn.join(', ')})` : ''
      const pg = t.parallelGroup ? ` [group: ${t.parallelGroup}]` : ''
      return `${icon} [${t.id}] ${t.description}${deps}${pg}`
    }),
    '',
    'When you complete a task, call plan_progress with the task id and a brief result summary.',
  ]
  return lines.join('\n')
}

// Available tools for the plan-aware agent loop
function planToolsPayload() {
  return [
    {
      type: 'function',
      function: {
        name: 'plan_progress',
        description: 'Mark a plan task as completed with a result summary. Call this when you finish a step of the execution plan.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'The task id from the execution plan (e.g. "1", "2").' },
            result: { type: 'string', description: 'Brief summary of what was accomplished.' },
          },
          required: ['task_id', 'result'],
        },
      },
    },
  ]
}

// Process a plan_progress tool call from the model. Returns true if handled.
function handlePlanProgress(plan, args) {
  if (!plan) return false
  const taskId = String(args?.task_id || '')
  const result = String(args?.result || '')
  const task = plan.tasks.find(t => t.id === taskId)
  if (!task) return false
  task.status = 'completed'
  task.result = result
  return true
}

// Build a consolidated plan summary from task results.
function planSummary(plan) {
  if (!plan) return ''
  const lines = ['## Plan Results', '']
  for (const t of plan.tasks) {
    const icon = t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : '⏳'
    lines.push(`${icon} [${t.id}] ${t.description}: ${t.result || '(no result)'}`)
  }
  return lines.join('\n')
}

module.exports = {
  isComplexRequest,
  generatePlan,
  planSystemBlock,
  planToolsPayload,
  handlePlanProgress,
  planSummary,
  PLANNING_PROMPT,
}
