// ───────────────────────────────────────────────────────────────────────────
// Sub-Agent Delegate — inspired by Claude Code's Task tool and OpenClaw's
// parallel agent execution.
//
// For complex multi-step tasks, the main agent can delegate sub-tasks to
// independent sub-agent instances. Each sub-agent gets its own tool loop
// with a focused prompt, and returns a structured result.
//
// Key design decisions:
//   - Sub-agents share the same provider/model as the parent (no extra config).
//   - Each sub-agent has its own iteration budget (smaller than the parent).
//   - Sub-agent failures are isolated — a failed sub-task doesn't crash the
//     parent, it just reports the error.
//   - Results are aggregated back into the parent's context as tool results.
//
// API:
//   SubAgent.run({ task, provider, model, signal, options, agentMode, maxIter })
//     → { success: boolean, output: string, error?: string, iterations: number }
//   SubAgent.runParallel(tasks[], same params)
//     → Promise<SubAgentResult[]>  (all run concurrently)

const { runToolLoop } = require('./toolLoop')

const DEFAULT_SUB_AGENT_ITERATIONS = 12
const SUB_AGENT_SYSTEM = `You are a focused sub-agent. Complete the assigned task using the available tools. Be concise — only report what's needed. If you cannot complete the task, explain why.`

// Run a single sub-agent for the given task description.
async function run({ task, provider, model, signal, options = {}, agentMode = 'auto', maxIter, onProgress }) {
  const iterations = maxIter || DEFAULT_SUB_AGENT_ITERATIONS
  const messages = [
    { role: 'system', content: SUB_AGENT_SYSTEM },
    { role: 'user', content: `Task: ${task}\n\nComplete this task using the available tools. Report the result when done.` },
  ]

  let iterationsUsed = 0
  let output = ''
  let error = null

  try {
    const result = await runToolLoop({
      provider, model, messages, signal,
      agentMode,
      maxIterations: iterations,
      options,
      onPlanStep: ({ assistantText }) => {
        iterationsUsed++
        onProgress?.(`Step ${iterationsUsed}: ${(assistantText || '').slice(0, 60)}`)
      },
      onStatus: ({ text }) => {
        if (text?.includes('迭代')) error = text
      },
    })
    output = result
    if (!output || output.startsWith('（已达到')) {
      error = output
      output = ''
    }
  } catch (e) {
    error = e.message
  }

  return {
    success: !error && output.length > 0,
    output: output.slice(0, 10000),
    error,
    iterations: iterationsUsed,
  }
}

// Run multiple sub-agents in parallel. Each gets the same provider/model but
// independent iteration budgets. Results come back in order.
async function runParallel(tasks, shared) {
  return Promise.all(tasks.map(t => run({ ...shared, task: t.description || t })))
}

module.exports = { run, runParallel, DEFAULT_SUB_AGENT_ITERATIONS, SUB_AGENT_SYSTEM }
