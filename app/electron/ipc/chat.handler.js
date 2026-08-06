const { createAllowRulesStore } = require('./toolLoopCallbacks')
const { registerChatSendHandler } = require('./chat-send.handler')
const auditLog = require('../llm/auditLog')
const checkpoints = require('../llm/checkpoints')
const modelAdvisor = require('../llm/modelAdvisor')
const modelRouter = require('../llm/modelRouter')
const habitLearner = require('../llm/habitLearner')
const log = require('../logger')
const steering = require('../llm/steering')
const trajectory = require('../llm/trajectory')

// Per-request abort controllers to avoid race conditions
const abortControllers = new Map()

// Feature B: track active tool loops and buffered injection messages.
const activeToolLoops = new Set() // sessionIds with a running tool loop
const pendingInjections = new Map() // sessionId -> string[] of pending injections

// Per-session message tracking for abortControllers cleanup on session delete.
let sessionMessagesMap = new Map() // sessionId -> Set<messageId>
function registerSessionMessages(sessionId, messageIds) {
  if (!sessionMessagesMap.has(sessionId)) sessionMessagesMap.set(sessionId, new Set())
  const set = sessionMessagesMap.get(sessionId)
  for (const mid of messageIds) set.add(mid)
}
function cleanupSessionControllers(sessionId) {
  const msgIds = sessionMessagesMap.get(sessionId)
  if (msgIds) {
    for (const mid of msgIds) {
      const ctrl = abortControllers.get(mid)
      if (ctrl) { ctrl.abort(); abortControllers.delete(mid) }
    }
    sessionMessagesMap.delete(sessionId)
  }
}

// ─── Session-scoped permission allow-rules ─────────────────────────────────
// Backed by createAllowRulesStore() from toolLoopCallbacks.js.
// Granularity preserved: run_command → binary token; write/edit → directory;
// others → '*'. Rules are per-session and cleared on session delete.
const allowRulesStore = createAllowRulesStore()
function clearAllowRules(sessionId) { allowRulesStore.clear(sessionId) }

function registerChatHandlers(ipcMain, db, getWebContents) {
  auditLog.setDb(db)
  checkpoints.setDb(db)

  // Pass the shared live state to the extracted chat:send handler
  const ctx = {
    abortControllers,
    activeToolLoops,
    pendingInjections,
    sessionMessagesMap,
    registerSessionMessages,
    allowRulesStore,
  }
  const chatSendState = registerChatSendHandler({ ipcMain, db, getWebContents, ctx })

  ipcMain.handle('chat:stop', (_e, sessionId) => {
    // Abort only controllers for the given session. Each request has a catch
    // block that preserves accumulated content in the DB and sends the 'done'
    // signal to the renderer. DO NOT clear the map here — the abort handlers in
    // chat:send will delete their own entry after saving content.
    if (sessionId) {
      const msgIds = sessionMessagesMap.get(sessionId)
      if (msgIds) {
        for (const mid of msgIds) {
          const ctrl = abortControllers.get(mid)
          if (ctrl) { ctrl.abort(); abortControllers.delete(mid) }
        }
      }
    }
  })

  // Feature B: mid-turn message injection. The renderer calls this when a tool loop
  // is running for the session. The message is buffered and consumed at the next loop
  // iteration instead of starting a new send turn.
  ipcMain.handle('chat:inject', (event, { sessionId, content }) => {
    try {
      if (!sessionId || !content) return { queued: false }
      if (!pendingInjections.has(sessionId)) pendingInjections.set(sessionId, [])
      pendingInjections.get(sessionId).push(content)
      try { getWebContents()?.send('chat:injection-queued', { sessionId, content }) } catch {}
      return { queued: true }
    } catch {
      return { queued: false }
    }
  })

  // Habit-confirmation flow: the renderer asks us to confirm (promote now) or
  // dismiss (delete) a proposed habit. We don't need to reply with data — the
  // skill is rewritten synchronously inside habitLearner.
  ipcMain.handle('chat:habit-confirm', (_e, key) => { try { habitLearner.confirmHabit(db, key) } catch (e) { log.warn('habit confirm failed:', e) } return { ok: true } })
  ipcMain.handle('chat:habit-dismiss', (_e, key) => { try { habitLearner.dismissHabit(db, key) } catch (e) { log.warn('habit dismiss failed:', e) } return { ok: true } })

  // Model suggestion (Claude Code-style): given a user message and the full model
  // list, return the best model id for the task. Falls back to the user's current
  // model if no better match is found. Includes explainable rationale combining
  // heuristic family fit with Arena ELO data when available.
  ipcMain.handle('model:suggest', (_e, { sessionId, userMessage }) => {
    try {
      const session = db.getSession(sessionId)
      const currentModelId = session?.config ? JSON.parse(session.config)?.modelId : null
      const allModels = db.getAllModels().filter(m => {
        const p = db.getProvider(m.provider_id)
        return p && p.enabled
      })
      const intent = db.classifyIntent(userMessage)
      // Fetch ELO data for all models — keyed by model_id for the explainable router
      const scores = db.getModelScores()
      const eloData = {}
      for (const s of scores) {
        if (s.model_id && !eloData[s.model_id]) eloData[s.model_id] = { score: s.score, win_count: s.win_count || 0, total_count: s.total_count || 0 }
      }
      const result = modelAdvisor.suggestModelExplained({ allModels, userMessage, useTools: true, intent, eloData })
      if (result) {
        return { suggestedModelId: result.suggestedModelId, reason: result.reason,
          heuristicScores: result.heuristicScores, confidence: result.confidence }
      }
      return { suggestedModelId: currentModelId, reason: 'current', confidence: 0 }
    } catch {
      return { suggestedModelId: null, reason: 'error', confidence: 0 }
    }
  })

  // Model router (Claude Code-style): pick a model tier for a task type.
  // Returns { tier, suggestedModelName, rationale } for cost-optimized routing.
  // When the user enables "Auto" mode (modelAutoRoute), the selection blends
  // Arena ELO + price + latency (Task 3.3).
  ipcMain.handle('model:route-tier', (_e, { taskType, userMessage }) => {
    try {
      const allModels = db.getAllModels().filter(m => {
        const p = db.getProvider(m.provider_id)
        return p && p.enabled
      })
      const tier = modelRouter.routeTask(taskType, userMessage || '', 0)
      const autoMode = db.getSetting('modelAutoRoute') === '1'
      const priority = db.getSetting('modelRoutingPriority') || 'quality'
      // Arena ELO keyed by model_id (from the model_score table).
      const scores = db.getModelScores()
      const eloData = {}
      for (const s of scores) {
        if (s.model_id && !eloData[s.model_id]) eloData[s.model_id] = { score: s.score, win_count: s.win_count || 0, total_count: s.total_count || 0 }
      }
      const latencyData = db.getModelLatency()
      const suggestion = modelRouter.suggestModelForTier(tier, allModels, { autoMode, priority, eloData, latencyData })
      return { tier, modelName: suggestion?.modelName || null, modelId: suggestion?.modelId || null, rationale: suggestion?.rationale || '', eloScore: suggestion?.eloScore ?? null, autoMode }
    } catch {
      return { tier: 'standard', modelName: null, rationale: 'error', autoMode: false }
    }
  })

  // Renderer replies to a permission-request via this invoke. We just forward
  // the reply as an event so the waiting requestPermission closure (which uses
  // wc.on('chat:permission-reply')) picks it up.
  ipcMain.handle('chat:permission-reply', (event, payload) => {
    event.sender.send('chat:permission-reply', payload)
    return true
  })
  // Same forwarding pattern for AskUserQuestion replies.
  ipcMain.handle('chat:question-reply', (event, payload) => {
    event.sender.send('chat:question-reply', payload)
    return true
  })

  // ─── Audit log ───────────────────────────────────────────────────────────
  ipcMain.handle('audit:log', (_e, { sessionId, limit = 50 }) => {
    return db.getAuditLog(sessionId, limit)
  })
  ipcMain.handle('agent-checkpoint:list', (_e, { sessionId, messageId = null } = {}) => {
    return db.listAgentCheckpoints(sessionId, messageId)
  })
  ipcMain.handle('agent-checkpoint:rollback', (_e, { id }) => checkpoints.rollbackCheckpoint(id))

  // Trust badge: renderer queries trust score for current session
  ipcMain.handle('trust:badge', (_e, { sessionId }) => {
    try {
      if (!sessionId) return null
      const trustEngine = require('../llm/trustEngine')
      return trustEngine.getTrustBadge(db, sessionId)
    } catch {
      return null
    }
  })

  // ─── Steering IPC ────────────────────────────────────────────────────────
  ipcMain.handle('steering:steer', (_e, { sessionId, text, priority }) => {
    try {
      return steering.steer(sessionId, text, priority)
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('steering:follow-up', (_e, { sessionId, task }) => {
    try {
      return steering.followUp(sessionId, task)
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('steering:list-sessions', () => {
    try {
      return steering.listSessions()
    } catch (e) {
      return []
    }
  })

  // ─── Trajectory IPC ──────────────────────────────────────────────────────
  ipcMain.handle('trajectory:stats', (_e, sessionId) => {
    try {
      return trajectory.getCompressionStats(sessionId)
    } catch (e) {
      return { totalCompressed: 0, turnsSinceCompression: 0 }
    }
  })

  // Surface the chat-send handler exports (e.g. handleChatComplete for the
  // local gateway) so main.js can register them as proxy channels.
  return chatSendState
}

// estimateTextTokens is imported from compaction.js in chat-send.handler.js
// now that the bulk of the logic lives there.

module.exports = { registerChatHandlers, clearAllowRules, registerSessionMessages, cleanupSessionControllers }
