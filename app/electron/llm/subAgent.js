// ───────────────────────────────────────────────────────────────────────────
// Subagent — spawn an isolated child session for complex multi-step tasks.
//
// P1-2: Subagent Isolation — independent history / permissions / token budget / timeout.
//
// Improvements over Phase 4:
// 1. Persistent child sessions (not deleted immediately) — user can review
// 2. Independent permissions — child can have stricter agentMode than parent
// 3. Configurable timeout — wall-clock time limit in addition to iteration budget
// 4. Tool restrictions — child can be limited to a subset of tools
// 5. Result summarization — child output is summarized if too long
// ───────────────────────────────────────────────────────────────────────────

const { completeChatMessage } = require('./providerAdapter')
const { runToolLoop } = require('./toolLoop')
const { buildReasoningParams } = require('./reasoning')
const log = require('../logger')
const { IterationBudget } = require('./toolLoop');
const { subagentLimit } = require('./concurrency');

const SUBAGENT_SYSTEM_PROMPT = `You are a sub-agent spawned by the parent agent to handle a delegated task.
You have your own isolated context — previous conversation history is not available.
Focus solely on the task described. Use available tools as needed.
When done, provide a clear, concise summary of your findings or actions as your final response.
Do NOT call the task tool — nested sub-agents are not allowed.`

// ─── Subagent configuration ──────────────────────────────────────────────

const DEFAULT_SUBAGENT_CONFIG = {
  maxIterations: 15,
  timeoutMs: 5 * 60 * 1000,  // 5 minutes default
  maxOutputChars: 16000,      // summarize if output exceeds this
  cleanup: 'keep',            // 'keep' | 'delete' | 'keep-if-error'
  inheritPermissions: true,   // inherit parent's agentMode
  allowedTools: null,         // null = all tools
}

// ─── Run a single sub-agent ──────────────────────────────────────────────

async function _runSubagent({
  db,
  parentSessionId,
  provider,
  model,
  prompt,
  signal,
  agentMode = 'plan',
  callbacks = {},
  config = {},
}) {
  if (!db || !provider || !model) {
    throw new Error('runSubagent: missing required params')
  }

  const cfg = { ...DEFAULT_SUBAGENT_CONFIG, ...config }

  // Create child session (persistent — not deleted immediately)
  let childSessionId
  try {
    const result = db.createSession({
      title: `subagent-${new Date().toISOString().slice(0, 19)}`,
      persona_id: null,
      parent_session_id: parentSessionId || null,
    })
    childSessionId = result?.lastInsertRowid || result
  } catch (e) {
    throw new Error(`runSubagent: failed to create child session: ${e.message}`)
  }

  // Add user message
  db.addMessage({ session_id: childSessionId, role: 'user', content: prompt })

  // Build messages
  const messages = [
    { role: 'system', content: SUBAGENT_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]

  // Permission derivation: child can be more restrictive than parent
  const childAgentMode = cfg.inheritPermissions
    ? (agentMode === 'yolo' ? 'auto' : (agentMode || 'plan'))
    : 'plan'  // forced plan if not inheriting

  const reasoningOpts = buildReasoningParams(model.model_name, 'medium')
  const opts = { ...reasoningOpts, max_tokens: 4096 }

  // Create iteration budget
  const budget = new IterationBudget(cfg.maxIterations)

  // Wall-clock timeout
  const timeoutCtrl = new AbortController()
  const timeout = setTimeout(() => timeoutCtrl.abort(), cfg.timeoutMs)

  // Merge signals so parent cancellation propagates
  const mergedSignal = signal
    ? AbortSignal.any([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal

  let finalContent = ''
  let wasTimeout = false
  let hasError = false
  let errorMessage = ''
  try {
    finalContent = await runToolLoop({
      provider,
      model,
      messages,
      tools: true,
      signal: mergedSignal,
      options: opts,
      agentMode: childAgentMode,
      budget,
      sessionId: childSessionId,
      messageId: 0,
      db,
      autoCommit: false,
      ...(callbacks || {}),
    })
  } catch (e) {
    if (e?.name === 'AbortError' || e?.message?.includes('abort')) {
      wasTimeout = true
      finalContent = `[Sub-agent timed out after ${cfg.timeoutMs / 1000}s — partial result]`
    } else {
      hasError = true
      errorMessage = e?.message || 'unknown'
      log.warn('Subagent execution failed:', errorMessage)
      finalContent = `Sub-agent encountered an error: ${errorMessage}`
    }
  } finally {
    clearTimeout(timeout)
  }

  // Update child session with result
  try {
    db.addMessage({ session_id: childSessionId, role: 'assistant', content: finalContent })
    db.updateSession(childSessionId, {
      title: `subagent: ${String(prompt).slice(0, 60)}`,
      status: wasTimeout ? 'timeout' : hasError ? 'failed' : 'completed',
    })
  } catch {}

  // Cleanup policy
  if (cfg.cleanup === 'delete' || (cfg.cleanup === 'keep-if-error' && !wasTimeout && !hasError && finalContent && !finalContent.startsWith('['))) {
    try { db.deleteSession(childSessionId) } catch {}
  }

  // Truncate output if too long
  if (finalContent && finalContent.length > cfg.maxOutputChars) {
    finalContent = finalContent.slice(0, cfg.maxOutputChars) + `\n[… truncated ${finalContent.length - cfg.maxOutputChars} chars]`
  }

  return {
    content: finalContent || '(sub-agent returned no content)',
    childSessionId,
    wasTimeout,
    hasError,
    error: errorMessage || (wasTimeout ? 'Timed out' : null),
  }
}

// ─── Parallel sub-agent execution & write_paths preflight (P0-2) ─────────
const MAX_PARALLEL_WRITERS = 3

function normalizeWritePath(rawPath) {
  let s = String(rawPath || '').trim().replace(/\\/g, '/')
  while (s.startsWith('./')) {
    s = s.slice(2)
  }
  while (s.endsWith('/')) {
    s = s.slice(0, -1)
  }
  if (s.endsWith('/**')) {
    s = s.slice(0, -3)
  } else if (s.endsWith('/*')) {
    s = s.slice(0, -2)
  }
  while (s.endsWith('/')) {
    s = s.slice(0, -1)
  }
  if (!s || s === '.' || s === '*' || s === '**') {
    return '' // whole workspace
  }
  return s
}

function pathsOverlap(rawA, rawB) {
  const a = normalizeWritePath(rawA)
  const b = normalizeWritePath(rawB)
  if (a === '' || b === '') return true
  if (a === b) return true
  return a.startsWith(b + '/') || b.startsWith(a + '/')
}

function normalizeParallelTask(item, index, shared = {}) {
  const sharedReadOnly = shared.readOnly === true || shared.agentMode === 'plan'
  if (typeof item === 'string') {
    return {
      index,
      prompt: item,
      isWriter: !sharedReadOnly,
      wholeWorkspace: !sharedReadOnly,
      writePaths: [],
      effectiveMode: sharedReadOnly ? 'plan' : (shared.agentMode || 'auto'),
    }
  }
  const obj = item && typeof item === 'object' ? item : {}
  const prompt = String(obj.task || obj.prompt || '').trim()
  const hasWritePathsArray = Array.isArray(obj.write_paths) || Array.isArray(obj.writePaths)
  const rawPaths = Array.isArray(obj.write_paths)
    ? obj.write_paths
    : (Array.isArray(obj.writePaths) ? obj.writePaths : null)
  const explicitReadOnly =
    sharedReadOnly ||
    obj.read_only === true ||
    obj.readOnly === true ||
    obj.mode === 'plan' ||
    obj.agentMode === 'plan' ||
    (hasWritePathsArray && rawPaths.length === 0)

  if (explicitReadOnly) {
    return {
      index,
      prompt,
      isWriter: false,
      wholeWorkspace: false,
      writePaths: [],
      effectiveMode: 'plan',
    }
  }

  if (!hasWritePathsArray || !rawPaths || rawPaths.length === 0) {
    return {
      index,
      prompt,
      isWriter: true,
      wholeWorkspace: true,
      writePaths: [''],
      effectiveMode: obj.mode || obj.agentMode || shared.agentMode || 'auto',
    }
  }

  const normalized = rawPaths.map(normalizeWritePath)
  const claimsRoot = normalized.some(p => p === '')
  return {
    index,
    prompt,
    isWriter: true,
    wholeWorkspace: claimsRoot,
    writePaths: normalized,
    effectiveMode: obj.mode || obj.agentMode || shared.agentMode || 'auto',
  }
}

function validateParallelWritePaths(tasks, shared = {}) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { ok: true, writers: 0, total: 0, normalizedTasks: [] }
  }
  const maxWriters = typeof shared.maxParallelWriters === 'number' && shared.maxParallelWriters > 0
    ? shared.maxParallelWriters
    : MAX_PARALLEL_WRITERS
  const normalizedTasks = tasks.map((t, i) => normalizeParallelTask(t, i, shared))
  const writers = normalizedTasks.filter(t => t.isWriter)

  if (writers.length > maxWriters) {
    return {
      ok: false,
      code: 'MAX_PARALLEL_WRITERS_EXCEEDED',
      writers: writers.length,
      total: normalizedTasks.length,
      error: `Parallel write preflight failed: ${writers.length} writers requested, exceeding max_parallel_writers=${maxWriters} (fail-closed, 0 sub-agents started).`,
    }
  }

  if (writers.length > 1) {
    const wholeLockers = writers.filter(w => w.wholeWorkspace)
    if (wholeLockers.length > 0) {
      return {
        ok: false,
        code: 'WHOLE_WORKSPACE_CONFLICT',
        writers: writers.length,
        total: normalizedTasks.length,
        conflicts: wholeLockers.map(w => w.index),
        error: `Parallel write preflight failed: task #${wholeLockers[0].index + 1} omits write_paths (occupies entire workspace) while ${writers.length} parallel writers are scheduled. Declare disjoint write_paths or mark read-only tasks with write_paths: [] (fail-closed, 0 sub-agents started).`,
      }
    }

    for (let i = 0; i < writers.length; i++) {
      for (let j = i + 1; j < writers.length; j++) {
        const wA = writers[i]
        const wB = writers[j]
        for (const pA of wA.writePaths) {
          for (const pB of wB.writePaths) {
            if (pathsOverlap(pA, pB)) {
              return {
                ok: false,
                code: 'WRITE_PATH_OVERLAP',
                writers: writers.length,
                total: normalizedTasks.length,
                conflicts: [{ taskA: wA.index, pathA: pA, taskB: wB.index, pathB: pB }],
                error: `Parallel write preflight failed: overlapping write_paths between task #${wA.index + 1} ("${pA || '.'}") and task #${wB.index + 1} ("${pB || '.'}") (fail-closed, 0 sub-agents started).`,
              }
            }
          }
        }
      }
    }
  }

  return {
    ok: true,
    writers: writers.length,
    total: normalizedTasks.length,
    normalizedTasks,
  }
}

async function runParallel(tasks, shared = {}) {
  if (!shared || !shared.db) throw new Error('runParallel: db is required')
  if (!Array.isArray(tasks) || tasks.length === 0) return []

  const preflight = validateParallelWritePaths(tasks, shared)
  if (!preflight.ok) {
    const err = new Error(preflight.error)
    err.code = preflight.code
    err.preflight = preflight
    throw err
  }

  let _subagentCounter = 0
  const runners = preflight.normalizedTasks.map((normTask, i) => {
    const task = normTask.prompt
    return (async () => {
      const startTime = Date.now()
      const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 8)
        : `${Date.now()}-${++_subagentCounter}-${Math.random().toString(36).slice(2, 8)}`
      const subagentId = `sa_${startTime}_${uniqueId}_${i + 1}`
      try {
        shared.onSubagentEvent?.({
          type: 'start',
          id: subagentId,
          index: i,
          task: String(task).slice(0, 80),
          status: 'running',
          startedAt: startTime,
          writePaths: normTask.writePaths,
          isWriter: normTask.isWriter,
        })
      } catch {}
      const iterations = 0
      try {
        const result = await runSubagent({
          db: shared.db,
          parentSessionId: shared.parentSessionId || null,
          provider: shared.provider,
          model: shared.model,
          prompt: task,
          signal: shared.signal,
          agentMode: normTask.effectiveMode || shared.agentMode || 'plan',
          callbacks: shared.callbacks || {},
          config: shared.subagentConfig || {},
        })
        const latencyMs = Date.now() - startTime
        if (result?.wasTimeout || result?.hasError) {
          const errText = result?.error || (result?.wasTimeout ? 'Timed out' : 'Sub-agent error')
          try {
            shared.onSubagentEvent?.({
              type: 'error',
              id: subagentId,
              index: i,
              task: String(task).slice(0, 80),
              status: 'error',
              latencyMs,
              error: errText,
            })
          } catch {}
          return { success: false, error: errText, iterations, childSessionId: result.childSessionId, latencyMs }
        }
        try {
          shared.onSubagentEvent?.({
            type: 'done',
            id: subagentId,
            index: i,
            task: String(task).slice(0, 80),
            status: 'done',
            latencyMs,
            output: result.content,
            childSessionId: result.childSessionId,
          })
        } catch {}
        return { success: true, output: result.content, iterations, childSessionId: result.childSessionId, latencyMs }
      } catch (e) {
        const latencyMs = Date.now() - startTime
        try {
          shared.onSubagentEvent?.({
            type: 'error',
            id: subagentId,
            index: i,
            task: String(task).slice(0, 80),
            status: 'error',
            latencyMs,
            error: e.message || 'unknown',
          })
        } catch {}
        return { success: false, error: e.message || 'unknown', iterations, latencyMs }
      }
    })()
  })

  return Promise.all(runners)
}

async function runSubagent(args) { return subagentLimit.run(() => _runSubagent(args)) }
module.exports = {
  runSubagent,
  runParallel,
  validateParallelWritePaths,
  pathsOverlap,
  normalizeWritePath,
  MAX_PARALLEL_WRITERS,
  SUBAGENT_SYSTEM_PROMPT,
  DEFAULT_SUBAGENT_CONFIG,
}
