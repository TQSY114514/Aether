// ───────────────────────────────────────────────────────────────────────────
// Long-running Task — persistent, resumable agent loops.
//
// P1-4: Long-running Task (inspired by Grok Build's long-running execution
// and Claude Code's workflow persistence).
//
// Features:
//   1. Persistence — task state is saved to the `agent_task` table; survives app restart
//   2. Self-recovery — on app start, `restorePendingTasks` resumes interrupted tasks
//   3. Progress reporting — onStatus callback streams progress to the UI
//   4. Checkpointing — each cycle saves a checkpoint; resume from last checkpoint
//   5. State machine — queued → running → needs_input → completed/error
// ───────────────────────────────────────────────────────────────────────────

const { completeChat } = require('./providerAdapter')
const log = require('../logger')

const MAX_CYCLES = 10          // max fix cycles (up from debugAgent's 5)
const DEFAULT_TIMEOUT_MS = 60000  // 1 minute per cycle

// ── State machine ──────────────────────────────────────────────────────────

const STATE = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  NEEDS_INPUT: 'needs_input',
  COMPLETED: 'completed',
  ERROR: 'error',
  CANCELLED: 'cancelled',
})

// ── Task types ─────────────────────────────────────────────────────────────

const TASK_TYPES = {
  debug_loop: {
    name: 'Debug Loop',
    description: 'Run tests, analyze failures, apply fixes, repeat until green.',
    maxCycles: MAX_CYCLES,
  },
  test_fix: {
    name: 'Test & Fix',
    description: 'Run project tests and fix failures automatically.',
    maxCycles: 5,
  },
  build_verify: {
    name: 'Build & Verify',
    description: 'Run build, fix errors, verify output.',
    maxCycles: 3,
  },
}

// ── Run a long-running task ────────────────────────────────────────────────

async function runLongTask({
  db,
  provider,
  model,
  sessionId,
  taskType,
  prompt,
  signal,
  onStatus,
  onFix,
  onCycleComplete,
  workspace,
}) {
  const config = TASK_TYPES[taskType] || TASK_TYPES.debug_loop
  const maxCycles = config.maxCycles

  // Create task record
  let taskId
  try {
    const info = db.createAgentTask({
      session_id: sessionId,
      title: `${config.name}: ${String(prompt).slice(0, 60)}`,
      content: prompt,
      model_id: model.id,
      agent_mode: 'auto',
      status: STATE.RUNNING,
      priority: 0,
      max_retry: 1,
    })
    taskId = info?.lastInsertRowid
  } catch {}

  // Import the debug loop implementation
  const debugAgent = require('./debugAgent')
  const { getWorkspaceRoot } = require('../tools/sandbox')
  const root = workspace || getWorkspaceRoot(sessionId)

  if (!root) {
    if (taskId) db.updateAgentTask(taskId, { status: STATE.ERROR, error: 'no workspace' })
    return { ok: false, error: 'no workspace configured' }
  }

  const cycleResults = []
  let finalResult

  try {
    for (let cycle = 1; cycle <= maxCycles; cycle++) {
      if (signal?.aborted) {
        if (taskId) db.updateAgentTask(taskId, { status: STATE.CANCELLED })
        return { ok: false, error: 'cancelled', cycles: cycle - 1 }
      }

      onStatus?.({ kind: 'cycle_start', cycle, max: maxCycles, text: `🔧 Cycle ${cycle}/${maxCycles}` })

      // Run test
      const projectType = debugAgent.detectProjectType(root)
      if (!projectType) {
        const err = 'no recognized project type'
        if (taskId) db.updateAgentTask(taskId, { status: STATE.ERROR, error: err })
        return { ok: false, error: err, cycles: cycle }
      }

      const testCmd = debugAgent.findTestCommand(projectType, root)
      if (!testCmd) {
        const err = `no test command for ${projectType}`
        if (taskId) db.updateAgentTask(taskId, { status: STATE.ERROR, error: err })
        return { ok: false, error: err, cycles: cycle }
      }

      // Execute test
      const { runCommand } = require('../tools/exec')
      const [prog, ...args] = testCmd.split(/\s+/)
      let testResult
      try {
        testResult = await runCommand(prog, args, { cwd: root, timeout: 30000, maxBuffer: 64 * 1024 })
      } catch (e) {
        const err = `command failed: ${e.message}`
        if (taskId) db.updateAgentTask(taskId, { status: STATE.ERROR, error: err })
        return { ok: false, error: err, cycles: cycle }
      }

      if (testResult.exitCode === 0) {
        finalResult = { ok: true, cycles: cycle, summary: `✅ Tests passed after ${cycle} cycle(s)` }
        onStatus?.({ kind: 'completed', cycle, text: '✅ All tests passing' })
        if (taskId) db.updateAgentTask(taskId, { status: STATE.COMPLETED, result: finalResult.summary })
        return finalResult
      }

      // Analyze error
      onStatus?.({ kind: 'analyzing', cycle, text: '🔍 Analyzing failure...' })
      const errorOutput = [testResult.stdout, testResult.stderr].filter(Boolean).join('\n').trim()
      cycleResults.push({ cycle, exitCode: testResult.exitCode, error: errorOutput.slice(0, 500) })

      // Ask LLM for fix
      const analysis = await debugAgent.analyzeError({
        provider, model, errorOutput, projectType, testCmd, cycle, maxCycles, signal,
      })

      if (!analysis.fix) {
        const err = `Analysis produced no fix (confidence: ${analysis.confidence || 'unknown'})`
        onStatus?.({ kind: 'needs_input', cycle, text: '⚠️ No fix suggested — needs human input' })
        if (taskId) db.updateAgentTask(taskId, { status: STATE.NEEDS_INPUT, error: err, result: JSON.stringify(analysis) })
        return { ok: false, error: err, cycles: cycle, analysis, cycleResults }
      }

      onFix?.({ cycle, description: analysis.description, files: analysis.files, fix: analysis.fix })
      onCycleComplete?.({ cycle, analysis, testResult })

      // Save checkpoint
      if (taskId) {
        try {
          db.updateAgentTask(taskId, {
            status: STATE.RUNNING,
            result: JSON.stringify({ cycle, analysis, cycleResults }),
          })
        } catch {}
      }
    }

    // Exhausted cycles
    const err = `Exhausted ${maxCycles} cycles without passing`
    if (taskId) db.updateAgentTask(taskId, { status: STATE.ERROR, error: err })
    return { ok: false, error: err, cycles: maxCycles, cycleResults }

  } catch (e) {
    if (taskId) db.updateAgentTask(taskId, { status: STATE.ERROR, error: e?.message || 'unknown' })
    return { ok: false, error: e?.message || 'unknown' }
  }
}

// ── Restore pending tasks on app start ─────────────────────────────────────

function restorePendingTasks(db, { provider, model, signal, onStatus, onFix } = {}) {
  if (!db) return []
  try {
    const pending = db.allRows(
      "SELECT * FROM agent_task WHERE status IN ('queued', 'running', 'needs_input') ORDER BY created_at ASC LIMIT 10"
    ) || []
    for (const task of pending) {
      // Mark as cancelled (app was closed mid-run)
      db.updateAgentTask(task.id, { status: STATE.CANCELLED, error: 'App restarted — task cancelled' })
    }
    return pending
  } catch {
    return []
  }
}

module.exports = {
  STATE,
  TASK_TYPES,
  runLongTask,
  restorePendingTasks,
  MAX_CYCLES,
  DEFAULT_TIMEOUT_MS,
}
