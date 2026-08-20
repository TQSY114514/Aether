// ───────────────────────────────────────────────────────────────────────────
// Workflow Runner — typed multi-step agent workflows with role assignment.
//
// P1-3: Workflow 系统化 (inspired by Claude Code's Workflow + Grok Build's Workflows).
//
// Built-in workflow templates:
//   - feature: Understand → Plan → Implement → Test → Review
//   - bugfix: Diagnose → Fix → Test → Verify
//   - refactor: Analyze → Plan → Execute → Review
//   - explore: Survey → Deep-dive → Summarize
//
// Each step has a type, description, assigned agent role, and optional
// tool restrictions. Steps execute sequentially; each step's output feeds
// the next step's context.
// ───────────────────────────────────────────────────────────────────────────

const subAgent = require('./subAgent')
const agentRoles = require('./agentRoles')
const { buildReasoningParams } = require('./reasoning')
const log = require('../logger')

// ── Built-in workflow templates ──────────────────────────────────────────

const WORKFLOW_TEMPLATES = {
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

const TEMPLATE_NAMES = Object.keys(WORKFLOW_TEMPLATES)

function getTemplate(name) {
  return WORKFLOW_TEMPLATES[name] || null
}

function listTemplates() {
  return TEMPLATE_NAMES.map(n => ({ name: n, ...WORKFLOW_TEMPLATES[n] }))
}

// ── Workflow step execution ───────────────────────────────────────────────

async function runWorkflowStep({ db, provider, model, step, stepIndex, context, signal, userRequest }) {
  const roleName = step.role || 'build'
  const role = agentRoles.getRole(roleName)
  if (!role) return { success: false, error: `unknown role: ${roleName}`, output: null }

  const rolePrompt = agentRoles.buildRolePrompt(roleName, step.description)
  if (!rolePrompt) return { success: false, error: `failed to build prompt for role: ${roleName}`, output: null }

  // Build step-specific prompt
  const fullPrompt = `${rolePrompt}

─── WORKFLOW STEP ${stepIndex + 1}: ${step.type.toUpperCase()} ───
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
    }
  } catch (e) {
    return { success: false, error: e?.message || 'unknown', output: null }
  }
}

// ── Run a full workflow ──────────────────────────────────────────────────

async function runWorkflow({ db, provider, model, templateName, userRequest, signal, onStepComplete }) {
  const template = getTemplate(templateName)
  if (!template) return { ok: false, error: `unknown template: ${templateName}. Valid: ${TEMPLATE_NAMES.join(', ')}` }

  const trace = []
  let context = ''

  for (let i = 0; i < template.steps.length; i++) {
    const step = template.steps[i]
    const stepResult = await runWorkflowStep({
      db, provider, model,
      step, stepIndex: i,
      context, signal, userRequest,
    })

    trace.push({ step: i, type: step.type, role: step.role, ...stepResult })

    if (onStepComplete) {
      onStepComplete({ step: i, type: step.type, result: stepResult })
    }

    if (!stepResult.success) {
      return {
        ok: false,
        error: `Step ${i + 1} (${step.type}) failed: ${stepResult.error}`,
        trace,
        completedSteps: i,
      }
    }

    // Feed this step's output into the next step's context
    context = `(Output from step ${i + 1} - ${step.type}): ${stepResult.output || '(no output)'}`
  }

  // Build summary from all step outputs
  const summary = trace.map((t, i) => {
    const step = template.steps[i]
    return `## Step ${i + 1}: ${step.type} (${step.role})\n${t.output || '(no output)'}`  }).join('\n\n')

  return { ok: true, trace, summary, template: templateName }
}

module.exports = {
  WORKFLOW_TEMPLATES,
  TEMPLATE_NAMES,
  getTemplate,
  listTemplates,
  runWorkflow,
  runWorkflowStep,
}
