// ───────────────────────────────────────────────────────────────────────────
// Model Router — Claude Code-style sub-agent model selection.
//
// Routes cheap/fast classification tasks to Haiku-class models and saves
// expensive reasoning tasks for Opus/Sonnet-class models. Reduces token
// cost by 60-80% on multi-step tasks where intermediate steps don't need
// full reasoning power.
//
// Three tiers:
//   - 'fast'      -> Haiku-class  (classify, extract, format, filter)
//   - 'standard'  -> Sonnet-class (normal chat, code, reasoning)
//   - 'thinking'  -> Opus-class   (complex analysis, multi-step planning)
//
// Aether-specific additions:
//   - tool classification: decide whether a tool call needs full reasoning
//   - verification routing: cheap checks use fast model, deep review uses standard
// ───────────────────────────────────────────────────────────────────────────

/**
 * @typedef {import('../../types/domain').ModelTier} ModelTier
 * @typedef {import('../../types/domain').ModelConfig} ModelConfig
 * @typedef {import('../../types/domain').ProviderConfig} ProviderConfig
 * @typedef {import('../../types/domain').SuggestedModel} SuggestedModel
 * @typedef {import('../../types/domain').ModelSelectionOptions} ModelSelectionOptions
 * @typedef {import('../../types/domain').EscalationAuditEntry} EscalationAuditEntry
 * @typedef {import('../../types/domain').AuxiliaryTargetResolution} AuxiliaryTargetResolution
 */

// Model name patterns for each tier. Matched against model_name (case-insensitive).
/** @type {RegExp} */
const FAST_RE = /(haiku|flash|gpt-4o-mini|gpt-4\.1-mini|gpt-4\.1-nano|qwen2\.5-(1\.5|3|7)b|qwen-turbo)/i
/** @type {RegExp} */
const THINK_RE = /(opus|claude-4|o1|o3|o4-mini|gemini-2\.5-pro|deepseek-r1|qwq)/i

// Task patterns that can safely use a cheap model.
/** @type {RegExp} */
const FAST_TASK_RE = /^(classify|filter|extract|format|summarize-short|route|detect|validate|parse|count|list|find|search-simple)/i

/**
 * Classify a task into a routing tier.
 * @param {string} taskType  - The operation type (e.g. 'classify', 'complete', 'verify')
 * @param {string} [userMessage] - The raw user request (for complexity heuristics)
 * @param {number} [historyLength] - Number of messages in the conversation
 * @returns {ModelTier}
 */
function routeTask(taskType, userMessage, historyLength) {
  // Explicit fast path: tool classification, short extraction, intent detection
  if (FAST_TASK_RE.test(taskType)) return 'fast'

  // Long conversations or complex prompts need standard reasoning
  const msg = String(userMessage || '')
  if (msg.length > 4000 || historyLength > 20) return 'thinking'

  // Short, simple messages can use fast model
  if (msg.length < 200 && historyLength < 5) return 'fast'

  // Tool execution results + observation: standard is fine
  if (taskType === 'tool_result') return 'standard'

  // Default: standard for everything else
  return 'standard'
}

/**
 * Suggest a model for a given task tier. Returns the best model name from
 * the provided list, or null if no suitable model exists.
 *
 * When `options.autoMode` is true, the selection blends three signals into a
 * single score so Arena ELO data feeds model selection (Task 3.3):
 *   - Arena ELO (from the model_score table) — quality signal
 *   - input price (from model.input_price_per_1k) — cost signal
 *   - observed latency (from usage_log) — speed signal
 * The relative weights are driven by `priority` ('quality' | 'speed' | 'cost').
 *
 * @param {ModelTier} tier - 'fast' | 'standard' | 'thinking'
 * @param {ModelConfig[]} models - Array of { id, model_name, provider_id, is_primary, input_price_per_1k }
 * @param {ModelSelectionOptions} [options]
 * @returns {SuggestedModel | null}
 */
function suggestModelForTier(tier, models, options = {}) {
  if (!models || !models.length) return null
  const pool = models.slice()
  const { autoMode = false, priority = 'quality', eloData, latencyData } = options

  // 1) Find models matching the tier preference
  let candidates = pool
  if (tier === 'fast') {
    candidates = pool.filter(m => FAST_RE.test(m.model_name))
    if (!candidates.length) candidates = pool.filter(m => !THINK_RE.test(m.model_name))
  } else if (tier === 'thinking') {
    candidates = pool.filter(m => THINK_RE.test(m.model_name))
  }
  // 'standard' uses the full pool (no filter)

  // 2) Auto mode: blend Arena ELO + price + latency into a single score.
  //    Only kicks in when there are multiple candidates to choose between.
  if (autoMode && candidates.length > 1) {
    const weights = { quality: [0.6, 0.2, 0.2], speed: [0.3, 0.1, 0.6], cost: [0.3, 0.6, 0.1] }[priority] || [0.6, 0.2, 0.2]
    const [wElo, wPrice, wLat] = weights

    const scored = candidates.map(m => {
      const elo = eloData?.[m.id]
      // ELO ~1000 baseline; map 600..1400 → 0..100, neutral 50 when unknown.
      const eloNorm = elo ? Math.max(0, Math.min(100, ((elo.score - 600) / 800) * 100)) : 50
      // Confidence: only trust ELO after >=5 matches; otherwise pull toward neutral.
      const conf = elo ? (elo.total_count >= 5 ? 1 : 0.4) : 0
      const eloEffective = 50 + (eloNorm - 50) * conf

      const price = m.input_price_per_1k ?? 0.003
      const priceNorm = Math.max(0, Math.min(100, (0.01 / (price + 0.001)) * 10))

      const latency = latencyData?.[m.id]
      const latNorm = latency != null ? Math.max(0, Math.min(100, 100 - (latency / 5000) * 100)) : 50

      const score = wElo * eloEffective + wPrice * priceNorm + wLat * latNorm
      return { model: m, score, eloScore: elo?.score ?? null, eloTotal: elo?.total_count ?? 0 }
    })

    scored.sort((a, b) => (b.score - a.score) || ((b.model.is_primary ? 1 : 0) - (a.model.is_primary ? 1 : 0)))
    const winner = scored[0]

    const parts = [`auto mode (${priority})`]
    if (winner.eloScore != null) {
      parts.push(`ELO ${winner.eloScore.toFixed(0)}${winner.eloTotal >= 5 ? '' : ' (sparse)'}`)
    }
    parts.push(`score ${winner.score.toFixed(1)}`)
    return {
      modelName: winner.model.model_name,
      modelId: winner.model.id,
      rationale: parts.join(' · '),
      eloScore: winner.eloScore,
      autoMode: true,
    }
  }

  // 3) Legacy path: pick primary, or first enabled model
  const pick = candidates.find(m => m.is_primary) || candidates[0]
  if (!pick) return null

  const rationaleMap = {
    fast: `${pick.model_name} (fast tier — cheap/fast task)`,
    standard: `${pick.model_name} (standard tier — balanced)`,
    thinking: `${pick.model_name} (thinking tier — complex reasoning)`,
  }
  return {
    modelName: pick.model_name,
    modelId: pick.id,
    rationale: rationaleMap[tier],
    eloScore: eloData?.[pick.id]?.score ?? null,
    autoMode: false,
  }
}

/**
 * Estimate whether a user message looks like it needs extended thinking.
 * Used as a pre-check before the main routing logic.
 * @param {string} userMessage
 * @param {number} historyLength
 * @returns {boolean}
 */
function needsExtendedThinking(userMessage, historyLength) {
  const msg = String(userMessage || '')
  // Complex signals: long message, multiple questions, code review request
  const complexRe = /(分析|比较|架构|设计|重构|review|refactor|architecture|implement.*full|build.*complete)/i
  return msg.length > 800 || historyLength > 15 || complexRe.test(msg)
}

// ─── P1-1: Auxiliary Calls Flash-First + Visible Escalation ────────────────
// Compaction summarization, AutoMemory extraction/recall, and Session Title
// distillation default to the FAST tier (FAST_RE). If no FAST model exists in
// the pool (or the FAST model call errors out and escalates to the primary
// model), the escalation MUST be recorded in the audit trail and surfaced to
// the UI — silent escalation to an expensive model is prohibited.
/** @type {EscalationAuditEntry[]} */
const _escalationAuditLog = []

/**
 * @param {number} [limit=50]
 * @returns {EscalationAuditEntry[]}
 */
function getEscalationAuditLog(limit = 50) {
  return _escalationAuditLog.slice(-limit)
}

/**
 * @returns {void}
 */
function clearEscalationAuditLog() {
  _escalationAuditLog.length = 0
}

/**
 * Record a tier escalation event in the audit trail.
 * @param {object} [opts]
 * @param {any} [opts.db]
 * @param {number | null} [opts.sessionId]
 * @param {string} [opts.taskType]
 * @param {ModelTier | string} [opts.fromTier]
 * @param {ModelConfig | string | null} [opts.fromModel]
 * @param {ModelConfig | string} opts.toModel
 * @param {string} [opts.reason]
 * @param {(entry: EscalationAuditEntry) => void} [opts.onEscalation]
 * @returns {EscalationAuditEntry}
 */
function recordTierEscalation({ db, sessionId = null, taskType = 'auxiliary', fromTier = 'fast', fromModel = null, toModel, reason = 'no_fast_model_available', onEscalation } = {}) {
  const toModelName = (toModel && typeof toModel === 'object') ? (toModel.model_name || String(toModel.id || 'unknown')) : String(toModel || 'unknown')
  const entry = {
    kind: 'model_tier_escalation',
    taskType: String(taskType || 'auxiliary'),
    taskKind: String(taskType || 'auxiliary'),
    fromTier,
    fromModel: fromModel ? ((typeof fromModel === 'object') ? fromModel.model_name : String(fromModel)) : 'fast-tier (unavailable)',
    toModel: toModelName,
    reason,
    sessionId,
    timestamp: new Date().toISOString(),
    uiText: `⚡ 辅助任务[${taskType}] 升档至 ${toModelName} (${reason})`,
  }
  _escalationAuditLog.push(entry)
  if (_escalationAuditLog.length > 200) _escalationAuditLog.shift()

  try {
    if (db && typeof db.setSetting === 'function') {
      db.setSetting('llm.lastAuxiliaryEscalation', JSON.stringify(entry))
    }
    if (db && typeof db.addAuditLog === 'function' && sessionId != null) {
      db.addAuditLog({ sessionId, turnId: 0, payload: entry })
    }
  } catch {}

  try {
    if (typeof onEscalation === 'function') onEscalation(entry)
  } catch {}

  return entry
}

/**
 * Resolve a FAST-tier { provider, model } for an auxiliary task.
 * If primaryModel is already a FAST_RE model, uses it directly without escalation.
 * If another enabled model matches FAST_RE, selects it.
 * Otherwise escalates to primaryModel and records a visible escalation event.
 * @param {object | any} [arg1] - Options object or db
 * @param {ProviderConfig} [arg2] - Provider if positional
 * @param {ModelConfig} [arg3] - Model if positional
 * @param {string} [arg4] - Task type if positional
 * @param {(entry: EscalationAuditEntry) => void} [arg5] - onEscalation callback if positional
 * @returns {AuxiliaryTargetResolution}
 */
function resolveAuxiliaryTarget(arg1 = {}, arg2, arg3, arg4, arg5) {
  const opts = (arg1 && typeof arg1 === 'object' && ('provider' in arg1 || 'model' in arg1 || 'taskType' in arg1))
    ? arg1
    : { db: arg1, provider: arg2, model: arg3, taskType: arg4, onEscalation: arg5 }
  const { db, provider, model, models: explicitModels = null, taskType = 'auxiliary', sessionId = null, onEscalation } = opts

  const primaryName = (model && typeof model === 'object') ? (model.model_name || '') : String(model || '')
  if (FAST_RE.test(primaryName)) {
    return {
      provider,
      model,
      tier: 'fast',
      escalated: false,
      escalation: null,
    }
  }

  let pool = Array.isArray(explicitModels) ? explicitModels : []
  if (!pool.length && db) {
    try {
      if (typeof db.getEnabledModels === 'function') pool = db.getEnabledModels() || []
      else if (typeof db.getModels === 'function') pool = db.getModels() || []
      else if (typeof db.listModels === 'function') pool = db.listModels() || []
    } catch {}
  }

  // Prefer FAST_RE models from the same provider first, then any enabled provider
  const fastCandidates = pool.filter(m => m && m.model_name && FAST_RE.test(m.model_name) && m.enabled !== 0)
  const sameProviderFast = provider && provider.id != null
    ? fastCandidates.filter(m => m.provider_id === provider.id)
    : []
  const picked = sameProviderFast[0] || fastCandidates[0] || null

  if (picked) {
    let pickedProvider = provider
    if (picked.provider_id && (!provider || picked.provider_id !== provider.id)) {
      try {
        if (db && typeof db.getProviderById === 'function') {
          pickedProvider = db.getProviderById(picked.provider_id) || provider
        }
      } catch {}
    }
    return {
      provider: pickedProvider,
      model: picked,
      tier: 'fast',
      escalated: false,
      escalation: null,
      fallbackProvider: provider,
      fallbackModel: model,
    }
  }

  // No FAST_RE model available in pool -> visible escalation to primary model
  const escalation = recordTierEscalation({
    db,
    sessionId,
    taskType,
    fromTier: 'fast',
    fromModel: null,
    toModel: model,
    reason: 'no_fast_model_in_pool',
    onEscalation,
  })

  return {
    provider,
    model,
    tier: 'escalated_primary',
    escalated: true,
    escalation,
  }
}

const MUTATION_TOOLS = new Set([
  'edit_file', 'replace_file_content', 'write_to_file', 'patch', 'apply_patch',
  'create_file', 'modify_file', 'delete_file', 'write_file', 'multi_replace_file_content',
  'notebook_edit',
])
const EXPLORATION_TOOLS = new Set([
  'read_file', 'list_dir', 'grep_search', 'search_files', 'find_symbol',
  'get_symbols_overview', 'view_file', 'list_dir_contents', 'find_by_name',
  'read_url_content', 'search_web', 'glob_find', 'workspace_files', 'web_fetch',
  'web_search', 'get_project_context', 'codebase_graph', 'ask_user', 'plan',
  'plan_progress', 'mcp_list_tools', 'mcp_call_tool',
])
const VERIFY_TOOLS = new Set([
  'run_command', 'run_test', 'test', 'exec', 'execute_command',
  'lsp_diagnostics', 'test_runner',
])

/**
 * Infer current tool loop phase: 'spec' | 'worker' | 'validator'
 * @param {object} [opts]
 * @param {number} [opts.depth]
 * @param {number} [opts.turnIndex]
 * @param {string[] | string} [opts.lastToolCalls]
 * @param {string} [opts.toolName]
 * @param {string} [opts.status]
 * @param {boolean} [opts.hasVerification]
 * @param {boolean} [opts.isPlanning]
 * @param {boolean} [opts.isVerifying]
 * @param {string[]} [opts.lastErrorKinds]
 * @returns {'spec' | 'worker' | 'validator'}
 */
function inferToolLoopPhase(opts = {}) {
  const {
    depth = 0,
    turnIndex = 0,
    lastToolCalls = [],
    toolName = null,
    status = null,
    hasVerification = false,
    isPlanning = false,
    isVerifying = false,
    lastErrorKinds = [],
  } = opts

  let tools = []
  if (Array.isArray(lastToolCalls)) {
    tools.push(...lastToolCalls)
  } else if (typeof lastToolCalls === 'string' && lastToolCalls) {
    tools.push(lastToolCalls)
  }
  if (toolName && typeof toolName === 'string') {
    tools.push(toolName)
  }

  // Explicit verification or validator status
  if (hasVerification || isVerifying || status === 'verify' || status === 'validator') {
    return 'validator'
  }

  // Verification tools with errors or test failure signals
  if (tools.some(t => VERIFY_TOOLS.has(t)) && ((Array.isArray(lastErrorKinds) && lastErrorKinds.length > 0) || status === 'verify')) {
    return 'validator'
  }

  // Code mutation tools -> worker phase (takes precedence over pure exploration)
  if (tools.some(t => MUTATION_TOOLS.has(t))) {
    return 'worker'
  }

  // Verification tools without errors (e.g. testing)
  if (tools.length > 0 && tools.some(t => VERIFY_TOOLS.has(t)) && !tools.some(t => EXPLORATION_TOOLS.has(t))) {
    return 'validator'
  }

  // Planning mode -> spec phase
  if (isPlanning) {
    return 'spec'
  }

  // Depth 0 or turn index 0 with no mutation tools -> spec phase
  if ((turnIndex === 0 || depth === 0) && !tools.some(t => MUTATION_TOOLS.has(t))) {
    return 'spec'
  }

  // If all tools are exploration tools -> spec phase
  if (tools.length > 0 && tools.every(t => EXPLORATION_TOOLS.has(t))) {
    return 'spec'
  }

  // Early depth / turnIndex -> spec phase
  if (depth <= 1 && turnIndex <= 1) {
    return 'spec'
  }

  return 'worker'
}

/**
 * Resolve target { provider, model, tier, reason } for a tool loop phase
 * @param {'spec' | 'worker' | 'validator' | string} phase
 * @param {object} [opts]
 * @param {any} [opts.db]
 * @param {any[]} [opts.allModels]
 * @param {any[]} [opts.models]
 * @param {any[]} [opts.providers]
 * @param {any} [opts.currentModelId]
 * @param {any} [opts.currentModel]
 * @param {any} [opts.currentProvider]
 * @returns {{ model: any, provider: any, tier: string, reason: string }}
 */
function resolvePhaseTarget(phase, opts = {}) {
  const { db, allModels = null, models = null, providers = null, currentModelId = null, currentModel = null, currentProvider = null } = opts

  let pool = Array.isArray(allModels) ? allModels.slice() : (Array.isArray(models) ? models.slice() : [])
  if (!pool.length && db) {
    try {
      if (typeof db.getModels === 'function') pool = db.getModels() || []
      else if (typeof db.listModels === 'function') pool = db.listModels() || []
      else if (typeof db.prepare === 'function') {
        pool = db.prepare("SELECT m.*, p.name as provider_name, p.api_url, p.api_key, p.api_format, p.enabled as provider_enabled FROM model m JOIN provider p ON m.provider_id = p.id").all() || []
      }
    } catch {}
  }

  // Filter pool to enabled models and verify provider is enabled
  const enabledPool = pool.filter(m => {
    if (!m) return false
    if (m.enabled === 0) return false
    if (m.provider_enabled === 0) return false
    if (db && m.provider_id && typeof db.prepare === 'function') {
      try {
        const provRow = db.prepare("SELECT enabled FROM provider WHERE id = ?").get(m.provider_id)
        if (provRow && provRow.enabled === 0) return false
      } catch {}
    }
    return true
  })

  const candidatePool = enabledPool.length > 0 ? enabledPool : pool

  function buildResolution(pickedModel, tier, reason) {
    if (!pickedModel) return null
    let pickedProvider = null

    if (currentProvider && currentProvider.id === pickedModel.provider_id) {
      pickedProvider = currentProvider
    } else if (Array.isArray(providers) && providers.length > 0) {
      const matchProv = providers.find(p => p.id === pickedModel.provider_id)
      if (matchProv) pickedProvider = matchProv
    }

    if (!pickedProvider && db && pickedModel.provider_id) {
      try {
        if (typeof db.getProviderDecrypted === 'function') {
          pickedProvider = db.getProviderDecrypted(pickedModel.provider_id)
        } else if (typeof db.getProvider === 'function') {
          pickedProvider = db.getProvider(pickedModel.provider_id)
        } else if (typeof db.prepare === 'function') {
          pickedProvider = db.prepare("SELECT * FROM provider WHERE id = ?").get(pickedModel.provider_id)
        }
      } catch {}
    }

    if (!pickedProvider && pickedModel.provider_id && pickedModel.api_url) {
      pickedProvider = {
        id: pickedModel.provider_id,
        name: pickedModel.provider_name || 'default',
        api_url: pickedModel.api_url,
        api_key: pickedModel.api_key || '',
        api_format: pickedModel.api_format || 'openai',
      }
    }

    if (!pickedProvider && currentProvider && !pickedModel.provider_id) {
      pickedProvider = currentProvider
    }

    if (!pickedProvider) return null

    return {
      provider: pickedProvider,
      model: pickedModel,
      tier,
      reason,
    }
  }

  if (phase === 'worker') {
    // Coding ELO leader from SQLite model_score table
    if (db && typeof db.prepare === 'function') {
      try {
        const rows = db.prepare("SELECT model_id, score FROM model_score WHERE intent = 'coding' ORDER BY score DESC").all()
        for (const row of rows) {
          const match = candidatePool.find(m => m.id === row.model_id)
          if (match) {
            return buildResolution(match, 'worker', 'elo_coding_leader')
          }
        }
      } catch {}
    }
    if (db && typeof db.autoRoute === 'function') {
      try {
        const auto = db.autoRoute('coding')
        if (auto) {
          const match = candidatePool.find(m => m.id === auto.model_id)
          if (match) return buildResolution(match, 'worker', 'elo_coding_leader')
        }
      } catch {}
    }
    const primary = candidatePool.find(m => m.is_primary) || candidatePool[0]
    return buildResolution(primary, 'worker', 'fallback_primary')
  }

  if (phase === 'validator') {
    // Reasoning ELO leader from SQLite model_score table
    if (db && typeof db.prepare === 'function') {
      try {
        const rows = db.prepare("SELECT model_id, score FROM model_score WHERE intent = 'reasoning' ORDER BY score DESC").all()
        for (const row of rows) {
          const match = candidatePool.find(m => m.id === row.model_id)
          if (match) {
            return buildResolution(match, 'validator', 'elo_reasoning_leader')
          }
        }
      } catch {}
    }
    if (db && typeof db.autoRoute === 'function') {
      try {
        const auto = db.autoRoute('reasoning')
        if (auto) {
          const match = candidatePool.find(m => m.id === auto.model_id)
          if (match) return buildResolution(match, 'validator', 'elo_reasoning_leader')
        }
      } catch {}
    }
    const thinkModel = candidatePool.find(m => THINK_RE.test(m.model_name || '')) || candidatePool.find(m => m.is_primary) || candidatePool[0]
    return buildResolution(thinkModel, 'validator', thinkModel && THINK_RE.test(thinkModel.model_name || '') ? 'think_tier_model' : 'fallback_reasoning')
  }

  // Spec phase: High-throughput, low-cost fast tier model
  let fastModel = candidatePool.find(m => FAST_RE.test(m.model_name || ''))
  if (!fastModel && typeof suggestModelForTier === 'function') {
    try {
      const suggested = suggestModelForTier('fast', candidatePool)
      if (suggested) {
        fastModel = candidatePool.find(m => m.id === suggested.modelId || m.model_name === suggested.modelName)
      }
    } catch {}
  }
  if (!fastModel && db && typeof db.autoRoute === 'function') {
    try {
      const auto = db.autoRoute('general')
      if (auto) {
        fastModel = candidatePool.find(m => m.id === auto.model_id)
      }
    } catch {}
  }
  if (!fastModel) {
    fastModel = candidatePool.find(m => m.is_primary) || candidatePool[0]
  }
  return buildResolution(fastModel, 'spec', fastModel && FAST_RE.test(fastModel.model_name || '') ? 'fast_tier_model' : 'fallback_primary')
}

module.exports = {
  FAST_RE,
  THINK_RE,
  FAST_TASK_RE,
  routeTask,
  suggestModelForTier,
  needsExtendedThinking,
  resolveAuxiliaryTarget,
  recordTierEscalation,
  getEscalationAuditLog,
  clearEscalationAuditLog,
  inferToolLoopPhase,
  resolvePhaseTarget,
}
