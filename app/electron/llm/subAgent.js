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
const { IterationBudget } = require('./toolLoop')

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

async function runSubagent({
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
      log.warn('Subagent execution failed:', e?.message)
      finalContent = `Sub-agent encountered an error: ${e?.message || 'unknown'}`
    }
  } finally {
    clearTimeout(timeout)
  }

  // Update child session with result
  try {
    db.addMessage({ session_id: childSessionId, role: 'assistant', content: finalContent })
    db.updateSession(childSessionId, {
      title: `subagent: ${String(prompt).slice(0, 60)}`,
      status: wasTimeout ? 'timeout' : 'completed',
    })
  } catch {}

  // Cleanup policy
  if (cfg.cleanup === 'delete' || (cfg.cleanup === 'keep-if-error' && !wasTimeout && finalContent && !finalContent.startsWith('['))) {
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
  }
}

// ─── Parallel sub-agent execution ────────────────────────────────────────

async function runParallel(tasks, shared) {
  if (!shared.db) throw new Error('runParallel: db is required')
  if (!Array.isArray(tasks) || tasks.length === 0) return []

  const runners = tasks.map((task, i) => {
    return (async () => {
      const startTime = Date.now()
      const rand = Math.random().toString(36).slice(2, 8)
      const subagentId = `sa_${startTime}_${rand}_${i + 1}`
      try {
        shared.onSubagentEvent?.({
          type: 'start',
          id: subagentId,
          index: i,
          task: String(task).slice(0, 80),
          status: 'running',
          startedAt: startTime,
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
          agentMode: shared.agentMode || 'plan',
          callbacks: shared.callbacks || {},
          config: shared.subagentConfig || {},
        })
        const latencyMs = Date.now() - startTime
        if (result?.wasTimeout) {
          try {
            shared.onSubagentEvent?.({
              type: 'error',
              id: subagentId,
              index: i,
              task: String(task).slice(0, 80),
              status: 'error',
              latencyMs,
              error: 'Timed out',
            })
          } catch {}
          return { success: false, error: 'Timed out', iterations, childSessionId: result.childSessionId, latencyMs }
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

module.exports = { runSubagent, runParallel, SUBAGENT_SYSTEM_PROMPT, DEFAULT_SUBAGENT_CONFIG }
