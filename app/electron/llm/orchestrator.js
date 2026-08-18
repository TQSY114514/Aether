// ───────────────────────────────────────────────────────────────────────────
// Orchestrator — the Manager layer for complex multi-part requests.
//
// Pipeline:
//   1. Determine complexity (planning.isComplexRequest) and, when warranted,
//      ask the model for a plan (planning.generatePlan).
//   2. Convert plan tasks into parallel batches respecting dependsOn, then
//      execute them with subAgent.runParallel — one sub-agent per task.
//   3. Collect results, update the plan, and summarize into a single reply.
//
// Everything is injectable (planner/runner/summarizer) so the module stays
// unit-testable without live model calls; production usage wires in
// planning.js + subAgent.js.
//
// Gated by the `agent.orchestrator` feature flag — when disabled,
// `orchestrate` falls back to running the request through a single runner
// call (or returns null if no runner) instead of planning+fan-out.
// ───────────────────────────────────────────────────────────────────────────

const planning = require('./planning')
const subAgent = require('./subAgent')
const log = require('../logger')
const featureFlags = require('../featureFlags')

const FLAG_KEY = 'agent.orchestrator'

// flag 单一事实来源:存储值或声明默认值。改 featureFlags.js 的 default 才真正生效。
function isEnabled(db) {
  return featureFlags.isEnabled(db, FLAG_KEY)
}

// ─── Batching ───────────────────────────────────────────────────────────────

/**
 * Partition plan tasks into dependency-aware parallel batches.
 * Sorted topologically: a task may appear in the batch after all tasks it
 * dependsOn. Each batch is run concurrently by the runner.
 */
function batchTasks(tasks) {
  const byId = new Map(tasks.map(t => [String(t.id), t]))
  const result = []
  let remaining = tasks.map(t => String(t.id))
  const done = new Set()
  while (remaining.length > 0) {
    const ready = remaining.filter(id => {
      const t = byId.get(id)
      return (t.dependsOn || []).every(d => done.has(String(d)))
    })
    if (ready.length === 0) ready.push(remaining[0]) // break cycles
    result.push(ready)
    for (const id of ready) done.add(String(id))
    remaining = remaining.filter(id => !done.has(String(id)))
  }
  return result
}

/**
 * Convert a plan into parallel batches (each element = array of sub-agent
 * prompts to run concurrently).
 */
function planToBatches(plan, context = '') {
  if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length === 0) return []
  const suffix = context ? `\n\nContext:\n${context.slice(0, 2000)}` : ''
  const map = new Map(plan.tasks.map(t => [String(t.id), t]))
  return batchTasks(plan.tasks).map(batch => batch.map(id => {
    const task = map.get(id)
    return `Task: ${task.description}${suffix}`
  }))
}

// ─── Summarize results ──────────────────────────────────────────────────────

/**
 * Build a human-readable summary from run results (array of
 * { success, output, error } in runParallel shape).
 */
function summarizeResults(results, plan) {
  const lines = []
  if (plan && plan.description) lines.push(`# ${plan.description}`)
  lines.push('')
  ;(results || []).forEach((r, i) => {
    const label = (plan && plan.tasks[i]) ? `[${plan.tasks[i].id}] ${plan.tasks[i].description}` : `Task ${i + 1}`
    lines.push(`## ${label}`)
    lines.push(r.success ? String(r.output || '(no output)') : `(failed: ${r.error || 'unknown error'})`)
    lines.push('')
  })
  return lines.join('\n').trim()
}

// ─── Orchestrate ────────────────────────────────────────────────────────────

/**
 * Entry point.
 *
 * @param {object} opts
 * @param {object} opts.db
 * @param {string} [opts.request]       user request text
 * @param {object} [opts.provider]     provider object (for the planner + runner)
 * @param {object} [opts.model]        model object
 * @param {object} [opts.signal]       abort signal
 * @param {object} [opts.options]      model options
 * @param {function} [opts.generatePlan]  injected planner (default planning.generatePlan)
 * @param {function} [opts.runner]     injected runner ({ db, provider, model, prompt, signal, agentMode }) => result
 * @param {boolean} [opts.planRequested] force planning on/off
 * @param {string} [opts.context]      extra context for sub-tasks
 */
async function orchestrate(opts = {}) {
  const db = opts.db
  const request = String(opts.request || '').trim()
  if (!request) return { ok: false, error: 'orchestrate: request is required' }

  const enabled = isEnabled(db)
  const planProvider = opts.generatePlan || ((provider, model, text, signal, o) => planning.generatePlan(provider, model, text, signal, o))
  const runner = opts.runParallel || ((tasks, shared) => subAgent.runParallel(tasks, shared))
  const sharedCallbacks = opts.callbacks || {}

  // Decide whether to invest in a plan.
  const planEnabled = opts.isPlanRequested != null ? opts.isPlanRequested : (enabled && planning.isComplexRequest(request, 0))

  if (!planEnabled) {
    // No orchestration — single runner pass, still wrapped so the caller
    // sees the same result shape.
    try {
      const single = await runner([request], { db, provider: opts.provider, model: opts.model, signal: opts.signal, agentMode: opts.agentMode, callbacks: sharedCallbacks })
      return { ok: true, plan: null, results: single, summary: single[0] ? (single[0].output || single[0].error) : '' }
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) }
    }
  }

  // Plan → batches → run.
  try {
    const plan = await planProvider(opts.provider, opts.model, request, opts.signal, { max_tokens: 1024, temperature: 0.1 })
    if (!plan || !plan.tasks || plan.tasks.length === 0) {
      // planning failed — degrade to a single run.
      const single = await runner([request], { provider: opts.provider, model: opts.model, signal: opts.signal, agentMode: opts.agentMode, callbacks: sharedCallbacks })
      return { ok: true, plan: null, results: single, summary: single[0] ? (single[0].output || single[0].error) : '' }
    }

    const batches = batchTasks(plan.tasks)
    const results = []
    const shared = { provider: opts.provider, model: opts.model, signal: opts.signal, agentMode: opts.agentMode, callbacks: sharedCallbacks }

    for (const batch of batches) {
      const prompts = batch.map(id => {
        const t = plan.tasks.find(x => String(x.id) === String(id))
        return `Task: ${t.description}${opts.context ? '\n\n' + opts.context.slice(0, 2000) : ''}`
      })
      const batchResults = await runner(prompts, shared)
      results.push(...batchResults)
    }

    const summary = summarizeResults(results, plan)
    return { ok: true, plan, results, summary }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
}

module.exports = {
  FLAG_KEY,
  isEnabled,
  batchTasks,
  planToBatches,
  summarizeResults,
  orchestrate,
}