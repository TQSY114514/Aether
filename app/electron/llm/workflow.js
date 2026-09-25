// ───────────────────────────────────────────────────────────────────────────
// Workflow Runner — typed multi-step agent workflows with role assignment.
//
// P1-3: Workflow 系统化 + JSON 外置化 (.aether/workflows/*.json) + broadcast / cycle 编排
//
// Built-in & declarative workflow templates:
//   - feature: Understand → Plan → Implement → Test → Review
//   - bugfix: Diagnose → Fix → Test → Verify
//   - refactor: Analyze → Plan → Execute → Review
//   - explore: Survey → Deep-dive → Summarize
//   - broadcast-review: Multi-role parallel fan-out → Synthesis
//   - tdd-cycle: Diagnose → Iterative (Fix → Verify) cycle with completion condition
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const subAgent = require('./subAgent')
const agentRoles = require('./agentRoles')
const { buildReasoningParams } = require('./reasoning')
const log = require('../logger')

// ── Fallback built-in templates (synced with .aether/workflows/*.json) ───

const DEFAULT_WORKFLOW_TEMPLATES = {
  feature: {
    name: 'Feature Implementation',
    description: 'Full feature lifecycle: understand requirements, plan implementation, write code, test, and review.',
    steps: [
      { type: 'understand', role: 'explore', description: 'Explore the codebase to understand existing patterns and architecture relevant to this feature.', tools: ['read_file', 'grep_search', 'glob_find', 'codebase_graph'] },
      { type: 'plan', role: 'explore', description: 'Create a detailed implementation plan based on codebase exploration.', tools: ['read_file', 'grep_search'] },
      { type: 'implement', role: 'build', description: 'Implement the feature according to the plan.', tools: null },
      { type: 'test', role: 'build', description: 'Write and run tests to verify the implementation.', tools: ['read_file', 'run_command', 'grep_search'] },
      { type: 'review', role: 'review', description: 'Review the implementation for bugs, security, and style.', tools: ['read_file', 'grep_search', 'glob_find'] },
    ],
  },
  bugfix: {
    name: 'Bug Fix',
    description: 'Systematic bug fixing: diagnose, fix, test, and verify.',
    steps: [
      { type: 'diagnose', role: 'debug', description: 'Trace the bug to its root cause.', tools: ['read_file', 'grep_search', 'run_command'] },
      { type: 'fix', role: 'build', description: 'Apply the fix.', tools: null },
      { type: 'test', role: 'build', description: 'Verify the fix works and does not regress.', tools: ['read_file', 'run_command'] },
      { type: 'verify', role: 'review', description: 'Review the fix for correctness and side effects.', tools: ['read_file', 'grep_search'] },
    ],
  },
  refactor: {
    name: 'Refactoring',
    description: 'Safe refactoring: analyze, plan, execute, review.',
    steps: [
      { type: 'analyze', role: 'explore', description: 'Analyze the code to understand dependencies and impact.', tools: ['read_file', 'grep_search', 'codebase_graph', 'glob_find'] },
      { type: 'plan', role: 'explore', description: 'Plan the refactoring steps to minimize risk.', tools: ['read_file'] },
      { type: 'execute', role: 'build', description: 'Execute the refactoring.', tools: null },
      { type: 'review', role: 'review', description: 'Review the refactored code.', tools: ['read_file', 'grep_search'] },
    ],
  },
  explore: {
    name: 'Codebase Exploration',
    description: 'Quick codebase survey: overview, deep-dive, summary.',
    steps: [
      { type: 'survey', role: 'explore', description: 'Get a high-level overview of the codebase.', tools: ['codebase_graph', 'list_dir', 'glob_find'] },
      { type: 'deepdive', role: 'explore', description: 'Deep-dive into relevant areas.', tools: ['read_file', 'grep_search', 'codebase_graph'] },
      { type: 'summarize', role: 'review', description: 'Summarize findings.', tools: ['read_file', 'grep_search'] },
    ],
  },
}

/**
 * Load declarative workflows from `.aether/workflows/*.json` directories.
 * Follows the same directory discovery convention as `app/electron/recipes/registry.js`.
 * @param {string} [workspaceRoot]
 * @returns {Record<string, object>}
 */
function loadWorkflowsFromDisk(workspaceRoot) {
  const loaded = {}
  const candidateDirs = [
    path.resolve(__dirname, '..', '..', '..', '.aether', 'workflows'),
    path.resolve(__dirname, '..', '..', '.aether', 'workflows'),
  ]
  if (workspaceRoot && typeof workspaceRoot === 'string') {
    candidateDirs.push(path.join(workspaceRoot, '.aether', 'workflows'))
  }

  for (const dir of candidateDirs) {
    try {
      if (!fs.existsSync(dir)) continue
      const files = fs.readdirSync(dir)
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        try {
          const full = path.join(dir, file)
          const parsed = JSON.parse(fs.readFileSync(full, 'utf8'))
          const id = (parsed && (parsed.id || path.basename(file, '.json'))) || ''
          if (
            id &&
            parsed &&
            typeof parsed === 'object' &&
            typeof parsed.name === 'string' &&
            Array.isArray(parsed.steps) &&
            parsed.steps.length > 0
          ) {
            loaded[id] = {
              name: parsed.name,
              description: parsed.description || '',
              steps: parsed.steps,
              source: full,
            }
          }
        } catch { /* ignore invalid JSON workflow file */ }
      }
    } catch { /* ignore unreadable dir */ }
  }
  return loaded
}

const WORKFLOW_TEMPLATES = {
  ...DEFAULT_WORKFLOW_TEMPLATES,
  ...loadWorkflowsFromDisk(),
}

const TEMPLATE_NAMES = Object.keys(WORKFLOW_TEMPLATES)

function getTemplate(name, workspaceRoot) {
  if (workspaceRoot) {
    const custom = loadWorkflowsFromDisk(workspaceRoot)
    if (custom[name]) return custom[name]
  }
  return WORKFLOW_TEMPLATES[name] || null
}

function listTemplates(workspaceRoot) {
  const merged = workspaceRoot
    ? { ...WORKFLOW_TEMPLATES, ...loadWorkflowsFromDisk(workspaceRoot) }
    : WORKFLOW_TEMPLATES
  return Object.keys(merged).map(n => ({ name: n, ...merged[n] }))
}

// ── Workflow step execution (Sequential / Broadcast / Cycle) ─────────────

async function runSingleRoleStep({ db, provider, model, step, stepIndex, context, signal, userRequest }) {
  const roleName = step.role || 'build'
  const role = agentRoles.getRole(roleName)
  if (!role) return { success: false, error: `unknown role: ${roleName}`, output: null }

  const rolePrompt = agentRoles.buildRolePrompt(roleName, step.description)
  if (!rolePrompt) return { success: false, error: `failed to build prompt for role: ${roleName}`, output: null }

  const fullPrompt = `${rolePrompt}

─── WORKFLOW STEP ${stepIndex + 1}: ${(step.type || 'step').toUpperCase()} ───
${step.description}

─── ORIGINAL USER REQUEST ───
${userRequest}

─── PREVIOUS CONTEXT ───
${context || '(no previous context — this is the first step)'}`

  try {
    const result = await subAgent.runSubagent({
      db,
      parentSessionId: null,
      provider,
      model,
      prompt: fullPrompt,
      signal,
      agentMode: agentRoles.getRoleDefaultMode(roleName),
      config: { cleanup: 'keep' },
    })

    return {
      success: true,
      output: result.content,
      childSessionId: result.childSessionId,
      wasTimeout: result.wasTimeout,
      callsUsed: 1,
    }
  } catch (e) {
    return { success: false, error: e?.message || 'unknown', output: null, callsUsed: 1 }
  }
}

/**
 * Execute a `broadcast` workflow step: fan out the same context & step goal to
 * multiple read-only roles in parallel via `subAgent.runParallel`.
 */
async function runBroadcastStep({ db, provider, model, step, stepIndex, context, signal, userRequest }) {
  const roles = Array.isArray(step.roles) && step.roles.length > 0
    ? step.roles
    : ['explore', 'review']

  const parallelTasks = []
  for (const roleName of roles) {
    const role = agentRoles.getRole(roleName)
    if (!role) {
      return { success: false, error: `unknown role in broadcast: ${roleName}`, output: null, callsUsed: 0 }
    }
    const rolePrompt = agentRoles.buildRolePrompt(roleName, step.description || `Analyze from ${roleName} perspective.`)
    const fullPrompt = `${rolePrompt}

─── BROADCAST WORKFLOW STEP ${stepIndex + 1}: ${(step.type || 'broadcast').toUpperCase()} [ROLE: ${roleName}] ───
${step.description || ''}

─── ORIGINAL USER REQUEST ───
${userRequest}

─── PREVIOUS CONTEXT ───
${context || '(no previous context — this is the first step)'}`

    parallelTasks.push({
      role: roleName,
      task: fullPrompt,
      read_only: true,
      write_paths: [],
    })
  }

  try {
    const results = await subAgent.runParallel(parallelTasks, {
      db,
      parentSessionId: null,
      provider,
      model,
      signal,
      agentMode: 'plan',
      readOnly: true,
    })

    const sections = results.map((r, idx) => {
      const rName = parallelTasks[idx].role
      return `### Broadcast Role: ${rName}\n${r.content || '(no output)'}`
    })

    return {
      success: true,
      kind: 'broadcast',
      roles,
      output: sections.join('\n\n'),
      results,
      callsUsed: parallelTasks.length,
    }
  } catch (e) {
    return { success: false, kind: 'broadcast', error: e?.message || 'broadcast failed', output: null, callsUsed: parallelTasks.length }
  }
}

/**
 * Execute a `cycle` workflow step: repeat sub-steps up to `maxCycles` until
 * `step.until` regex/substring matches in the step output.
 */
async function runCycleStep({ db, provider, model, step, stepIndex, context, signal, userRequest }) {
  const subSteps = Array.isArray(step.steps) && step.steps.length > 0
    ? step.steps
    : [{ type: step.type || 'iterate', role: step.role || 'build', description: step.description || 'Execute cycle step' }]
  const maxCycles = Math.max(1, Math.min(10, Number(step.maxCycles) || 3))
  const untilPattern = step.until ? new RegExp(step.until, 'i') : /ALL_TESTS_PASSED|VERIFIED_OK|CYCLE_COMPLETE/i

  let cycleContext = context || ''
  let callsUsed = 0
  let conditionMet = false
  const cycleHistory = []

  for (let cycleIdx = 0; cycleIdx < maxCycles; cycleIdx++) {
    for (let sIdx = 0; sIdx < subSteps.length; sIdx++) {
      const subStep = subSteps[sIdx]
      const res = await runSingleRoleStep({
        db,
        provider,
        model,
        step: subStep,
        stepIndex: `${stepIndex + 1}.${cycleIdx + 1}.${sIdx + 1}`,
        context: cycleContext,
        signal,
        userRequest,
      })
      callsUsed += res.callsUsed || 1
      cycleHistory.push({
        cycle: cycleIdx + 1,
        subStep: subStep.type || `sub_${sIdx + 1}`,
        role: subStep.role || 'build',
        output: res.output,
        success: res.success,
      })

      if (!res.success) {
        return {
          success: false,
          kind: 'cycle',
          error: `Cycle ${cycleIdx + 1} sub-step ${subStep.type} failed: ${res.error}`,
          output: null,
          cyclesUsed: cycleIdx + 1,
          conditionMet: false,
          callsUsed,
        }
      }

      cycleContext = `(Cycle ${cycleIdx + 1} - ${subStep.type}): ${res.output || '(no output)'}`
      if (untilPattern.test(String(res.output || ''))) {
        conditionMet = true
        break
      }
    }
    if (conditionMet) break
  }

  const formattedOutput = cycleHistory
    .map(h => `### Cycle ${h.cycle} · ${h.subStep} (${h.role})\n${h.output || '(no output)'}`)
    .join('\n\n')

  return {
    success: true,
    kind: 'cycle',
    output: formattedOutput,
    cyclesUsed: cycleHistory.length > 0 ? cycleHistory[cycleHistory.length - 1].cycle : 0,
    conditionMet,
    cycleHistory,
    callsUsed,
  }
}

async function runWorkflowStep({ db, provider, model, step, stepIndex, context, signal, userRequest }) {
  if (step && step.kind === 'broadcast') {
    return runBroadcastStep({ db, provider, model, step, stepIndex, context, signal, userRequest })
  }
  if (step && step.kind === 'cycle') {
    return runCycleStep({ db, provider, model, step, stepIndex, context, signal, userRequest })
  }
  return runSingleRoleStep({ db, provider, model, step, stepIndex, context, signal, userRequest })
}

// ── Checkpoint persistence (best-effort, like compactionStore) ───────────
// Key format: `run_workflow:checkpoint:<key>`. Survives app restarts via the
// settings table; degrades silently to a per-process Map when db is absent.

const _ckMem = new Map()

function _ckDb(db) {
  return db && typeof db.getSetting === 'function' ? db : null
}

function loadWorkflowCheckpoint(db, key) {
  if (!key) return null
  const memKey = `run_workflow:checkpoint:${key}`
  if (_ckMem.has(memKey)) return _ckMem.get(memKey)
  const sdb = _ckDb(db)
  if (!sdb) return null
  try {
    const row = sdb.getSetting(memKey)
    if (!row) return null
    const ck = JSON.parse(row)
    _ckMem.set(memKey, ck)
    return ck
  } catch { return null }
}

function saveWorkflowCheckpoint(db, key, data) {
  if (!key) return
  const memKey = `run_workflow:checkpoint:${key}`
  _ckMem.set(memKey, data)
  const sdb = _ckDb(db)
  if (!sdb) return
  try { sdb.setSetting(memKey, JSON.stringify(data)) } catch { /* best-effort */ }
}

// ── Run a full workflow ──────────────────────────────────────────────────

async function runWorkflow({
  db, provider, model, templateName, userRequest, signal, onStepComplete,
  maxSubagentCalls = null,   // hard budget on spawned sub-agents; null = unlimited (legacy)
  stepModels = null,         // role→model or step-index→model override: { explore: m1 } | [m1, m2]
  checkpointKey = null,      // resume/save checkpoint under this key
  workspaceRoot = null,      // optional workspace root for custom .aether/workflows/*.json
}) {
  const template = getTemplate(templateName, workspaceRoot)
  if (!template) return { ok: false, error: `unknown template: ${templateName}. Valid: ${TEMPLATE_NAMES.join(', ')}` }

  // Resolve model per step: explicit entry wins, else role map, else main model.
  const stepModelFor = (i, role) => {
    if (Array.isArray(stepModels)) return stepModels[i] || model
    if (stepModels && typeof stepModels === 'object' && stepModels[role]) return stepModels[role]
    return model
  }

  const trace = []
  let context = ''
  let calls = 0
  let startIndex = 0

  // Resume: replay completed steps from checkpoint into trace/context instead of re-running.
  const done = loadWorkflowCheckpoint(db, checkpointKey)
  if (done && Array.isArray(done.trace)) {
    startIndex = Math.min(done.completedSteps || 0, template.steps.length)
    done.trace.slice(0, startIndex).forEach(t => trace.push(t))
    context = done.context || ''
    if (startIndex > template.steps.length) startIndex = template.steps.length
  }

  for (let i = startIndex; i < template.steps.length; i++) {
    const step = template.steps[i]

    if (maxSubagentCalls != null && calls >= maxSubagentCalls) {
      return {
        ok: false,
        error: `sub-agent budget exhausted after ${calls} calls (max ${maxSubagentCalls}) before step ${i + 1} (${step.type})`,
        trace,
        completedSteps: i,
        budgetExhausted: true,
      }
    }

    const stepResult = await runWorkflowStep({
      db, provider, model: stepModelFor(i, step.role),
      step, stepIndex: i,
      context, signal, userRequest,
    })
    calls += stepResult.callsUsed || 1

    trace.push({ step: i, type: step.type, role: step.role || step.kind, ...stepResult })

    if (onStepComplete) {
      onStepComplete({ step: i, type: step.type, result: stepResult })
    }

    if (!stepResult.success) {
      // Persist progress so a retry can skip the steps that already succeeded.
      saveWorkflowCheckpoint(db, checkpointKey, { completedSteps: i, trace, context })
      return {
        ok: false,
        error: `Step ${i + 1} (${step.type}) failed: ${stepResult.error}`,
        trace,
        completedSteps: i,
        checkpoint: checkpointKey || null,
      }
    }

    // Feed this step's output into the next step's context
    context = `(Output from step ${i + 1} - ${step.type}): ${stepResult.output || '(no output)'}`

    // Save checkpoint after each successful step — a crash mid-workflow can resume from here.
    saveWorkflowCheckpoint(db, checkpointKey, { completedSteps: i + 1, trace, context })
  }

  // Build summary from all step outputs
  const summary = trace.map((t, i) => {
    const step = template.steps[i]
    return `## Step ${i + 1}: ${step.type} (${step.role || step.kind || 'build'})\n${t.output || '(no output)'}`
  }).join('\n\n')

  saveWorkflowCheckpoint(db, checkpointKey, { completedSteps: template.steps.length, trace, context, done: true })

  return { ok: true, trace, summary, template: templateName, checkpoint: checkpointKey || null }
}

module.exports = {
  WORKFLOW_TEMPLATES,
  TEMPLATE_NAMES,
  loadWorkflowsFromDisk,
  getTemplate,
  listTemplates,
  runWorkflow,
  runWorkflowStep,
  loadWorkflowCheckpoint,
  saveWorkflowCheckpoint,
}
