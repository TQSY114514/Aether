// ───────────────────────────────────────────────────────────────────────────
// Hierarchical Planner — task decomposition for complex agent requests.
//
// Inspired by:
//   DS4 (antirez)   — structured task breakdown before execution
//   OpenClaw        — plan-then-act rhythm, explicit goal tracking
//   Hermes          — iteration budget + progress visibility
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
- Trivial requests get a plan with just 1 task.
- NEVER output anything other than the JSON object.`

function isComplexRequest(userMessage, msgCount) {
  const text = String(userMessage || '')
  const sentences = (text.match(/[。！？.!?;；\n]/g) || []).length
  const paths = (text.match(/[A-Za-z]:[\/][\w\/]{1,80}\.\w{1,5}|\/[\w\/]{1,80}\.\w{1,5}/g) || []).length
  const multiStep = /implement.{0,50}test|refactor.{0,50}then|create.{0,50}deploy|build.{0,50}from|analyze.{0,50}fix|migrate.{0,50}to|rewrite.{0,50}to/i.test(text) ||
    /(重构|改写|重写|迁移|实现).{0,50}(并且|同时|然后|再|以及)/.test(text) ||
    /(拆|分|并行|多个文件|涉及多个|子任务|步骤)/.test(text) ||
    /(修复|解决|实现|构建).{0,50}(bug|测试|登录|模块|功能).{0,50}(并且|同时|一起|再)/.test(text)
  return (sentences >= 4 && text.length > 200) || paths >= 3 || multiStep || msgCount > 10
}

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

function planToolsPayload() {
  return [{
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
  }]
}

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
