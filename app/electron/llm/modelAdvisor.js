// ───────────────────────────────────────────────────────────────────────────
// Model Advisor — suggests the best model for a given request.
//
// Three-stage pipeline:  TaskClassifier → RoutingRules → ModelRouter
// ───────────────────────────────────────────────────────────────────────────

// ─── TaskClassifier ──────────────────────────────────────────────────────

const TASK_PATTERNS = [
  { type: 'coding',      regex: /代码|编程|函数|类|const |let |var |async |await |import |export |git |npm |python|javascript|typescript|tsx|jsx|react |vue /i },
  { type: 'debug',       regex: /报错|异常|修复|traceback|typeerror|referenceerror|\berror\b|\bbug\b|\bfix\b|broken|crash/i },
  { type: 'reasoning',   regex: /分析|推理|为什么|比较|\banalyze\b|\bcompare\b|reasoning|explain why/i },
  { type: 'summarization', regex: /总结|概括|摘要|summarize|tl;?dr|condense/i },
  { type: 'creative',    regex: /创作|故事|诗歌|\bwrite\b|compose|draft|brainstorm|story|poem/i },
  { type: 'vision',      regex: /图片|截图|照片|image|picture|screenshot|photo|look at|see this/i },
  { type: 'translation', regex: /翻译|\btranslate\b|convert to/i },
  { type: 'math',        regex: /计算|方程|数学|calculate|\bsolve\b|equation|formula/i },
]
const CHITCHAT_RE = /^(hi|hello|hey|你好|嗨|yo)[\s!！.。]*$/i
const SHORT_MSG_THRESHOLD = 40

/**
 * Classify a user message into primary + secondary task types.
 * @returns {{ primary: string, secondary: string[], confidence: number }}
 */
function classifyTask(userMessage) {
  const text = String(userMessage || '')
  const lower = text.toLowerCase()
  const trimmed = text.trim()

  // Short greetings → chitchat
  if (CHITCHAT_RE.test(trimmed) || trimmed.length < SHORT_MSG_THRESHOLD) {
    return { primary: 'chitchat', secondary: [], confidence: 0.8 }
  }

  // Score each task by regex match count × weight
  const scores = {}
  for (const p of TASK_PATTERNS) {
    const hits = (lower.match(p.regex) || []).length
    if (hits > 0) scores[p.type] = hits * 10
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1])

  // No matches → fallback to chitchat
  if (!ranked.length) {
    return { primary: 'chitchat', secondary: [], confidence: 0.5 }
  }

  const primary = ranked[0][0]
  const secondary = ranked.slice(1, 3).map(([t]) => t)
  const confidence = Math.min(1, ranked[0][1] / 30)

  return { primary, secondary, confidence }
}

// ─── RoutingRules ────────────────────────────────────────────────────────

/** Model family scores for each task type (0–100). Higher = better suited. */
const FAMILY_SCORES = {
  coding:        { claude: 95, gpt: 90, deepseek: 85, gemini: 75, qwen: 80, llama: 70 },
  debug:         { claude: 93, gpt: 88, deepseek: 80, gemini: 70, qwen: 75, llama: 65 },
  reasoning:     { claude: 92, gpt: 95, deepseek: 85, gemini: 60, qwen: 70, llama: 60 },
  summarization: { gpt: 90, claude: 85, gemini: 85, deepseek: 75, qwen: 75, llama: 70 },
  creative:      { claude: 90, gpt: 92, gemini: 85, deepseek: 75, qwen: 80, llama: 70 },
  vision:        { gemini: 95, gpt: 90, claude: 80, deepseek: 65, qwen: 70, llama: 60 },
  translation:   { gpt: 90, claude: 88, deepseek: 85, gemini: 80, qwen: 85, llama: 75 },
  math:          { gpt: 92, deepseek: 90, claude: 88, gemini: 75, qwen: 80, llama: 65 },
  chitchat:      { gpt: 85, claude: 85, gemini: 80, deepseek: 75, qwen: 80, llama: 75 },
}

/**
 * Detect the provider family from a raw model name.
 * @returns {'claude'|'gpt'|'deepseek'|'gemini'|'qwen'|'llama'|'unknown'}
 */
function detectFamily(modelName = '') {
  const m = modelName.toLowerCase()
  if (m.includes('claude'))                            return 'claude'
  if (/^o[134]|^gpt-/.test(m))                        return 'gpt'
  if (m.includes('deepseek'))                          return 'deepseek'
  if (m.includes('gemini'))                            return 'gemini'
  if (m.includes('qwen') || m.includes('qwq'))         return 'qwen'
  if (m.includes('llama'))                             return 'llama'
  return 'unknown'
}

/**
 * Score a single model for a task type using FAMILY_SCORES.
 * @returns {number} 0–100, or 0 if family unknown / no score table entry
 */
function scoreModel(model, taskType) {
  const family = detectFamily(model.model_name || model.id || '')
  const table = FAMILY_SCORES[taskType]
  return table ? (table[family] || 0) : 0
}

// ─── ModelRouter ─────────────────────────────────────────────────────────

const REASONING_FAMILIES = new Set(['openai', 'claude', 'deepseek', 'qwen'])

class ModelRouter {
  /**
   * @param {object} [options]
   * @param {boolean} [options.autoMode=true]     — on by default
   * @param {object}  [options.userWeights={}]    — per-task family overrides
   */
  constructor(options = {}) {
    this.autoMode = options.autoMode !== false
    this.userWeights = options.userWeights || {}
  }

  /**
   * Main entry: pick the best model for a turn.
   * @param {{ allModels: array, userMessage: string, useTools: boolean, routingContext?: { priority?: 'quality'|'speed'|'cost' } }} ctx
   * @returns {object|null}  winning model object, or null
   */
  route({ allModels, userMessage, useTools, routingContext = {} }) {
    if (!this.autoMode || !allModels || !allModels.length) return null

    try {
      const task = classifyTask(userMessage)
      const priority = routingContext.priority || 'quality'

      // Phase 5: Score every available model with priority-aware adjustments.
      let scored = allModels
        .map(m => {
          const baseScore = scoreModel(m, task.primary)
          const family = detectFamily(m.model_name || m.id || '')
          let finalScore = baseScore

          // When tools are on, prefer a reasoning-capable family if one scores well
          if (useTools && baseScore > 0) {
            if (REASONING_FAMILIES.has(family)) finalScore *= 1.1
          }

          // Priority-aware adjustments (speed/cost)
          if (priority === 'speed') {
            const ctxWindow = m.context_window || 128000
            const speedFactor = Math.max(0.3, 1 - (ctxWindow / 200000))
            finalScore = baseScore * speedFactor
            if (REASONING_FAMILIES.has(family)) finalScore *= 1.05
          } else if (priority === 'cost') {
            const pricePerK = m.input_price_per_1k || 0.003
            const costFactor = Math.max(0.4, 0.01 / (pricePerK + 0.001))
            finalScore = baseScore * costFactor
          }

          return { model: m, score: finalScore, baseScore }
        })
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)

      if (!scored.length) return null

      // When tools are on with quality priority, prefer a reasoning-capable family
      if (useTools && priority === 'quality') {
        const pick = scored.find(s =>
          REASONING_FAMILIES.has(detectFamily(s.model.model_name || s.model.id || ''))
        )
        if (pick) return pick.model
      }

      return scored[0].model
    } catch {
      return null
    }
  }
}

// ─── Explainable Routing ──────────────────────────────────────────────────

const TASK_TO_INTENT = {
  coding: 'coding', debug: 'coding', reasoning: 'general',
  summarization: 'summary', creative: 'general',
  vision: 'general', translation: 'translation', math: 'math',
  chitchat: 'general',
}

/**
 * Route with explanation — returns the winning model plus a human-readable
 * rationale that combines heuristic fit + Arena ELO data when available.
 *
 * @param {{ allModels, userMessage, useTools, intent, eloData }} opts
 *   eloData: optional Map/obj keyed by model_id → { score, win_count, total_count }
 * @returns {{ model, reason, heuristicScores, eloScore, rank, confidence } | null}
 */
function routeWithExplanation({ allModels, userMessage, useTools, intent, eloData }) {
  if (!allModels || !allModels.length) return null

  try {
    const task = classifyTask(userMessage)
    const taskType = intent || task.primary
    const confidence = task.confidence

    // Score every model on heuristic (family × task-type table)
    const ranked = allModels
      .map(m => {
        const hScore = scoreModel(m, taskType)
        const elo = eloData?.[m.id]
        // Blend: heuristic is primary signal; ELO acts as a tiebreaker / confidence boost
        // When ELO data is available and substantial (≥5 matches), weight it at 30%
        const eloWeight = (elo && elo.total_count >= 5) ? 0.3 : 0
        const blended = hScore * (1 - eloWeight) + Math.min(100, (elo?.score ?? 1000) / 20) * eloWeight
        return {
          model: m, hScore, eloScore: elo?.score ?? null,
          eloWins: elo?.win_count ?? 0, eloTotal: elo?.total_count ?? 0,
          blended, family: detectFamily(m.model_name || m.id || ''),
        }
      })
      .filter(s => s.hScore > 0)
      .sort((a, b) => b.blended - a.blended)

    if (!ranked.length) return null

    // When tools are on, prefer reasoning-capable family among top scorers
    let winner = ranked[0]
    if (useTools) {
      const reasoningPick = ranked.find(s =>
        REASONING_FAMILIES.has(s.family) && s.hScore >= ranked[0].hScore * 0.8
      )
      if (reasoningPick) winner = reasoningPick
    }

    // Build human-readable rationale
    const parts = []
    const taskLabel = { coding: 'Coding', debug: 'Debug', reasoning: 'Reasoning',
      summarization: 'Summarization', creative: 'Creative', vision: 'Vision',
      translation: 'Translation', math: 'Math', chitchat: 'Chat', general: 'General' }[taskType] || taskType

    parts.push(`Task: ${taskLabel}${confidence < 0.5 ? ' (low confidence)' : ''}`)
    parts.push(`Heuristic: ${winner.hScore}/100 as ${winner.family}`)

    if (winner.eloScore !== null) {
      if (winner.eloTotal >= 5) {
        parts.push(`Arena ELO: ${winner.eloScore.toFixed(1)} (${winner.eloWins}/${winner.eloTotal})`)
      } else {
        parts.push(`Arena ELO: ${winner.eloScore.toFixed(1)} (insufficient data)`)
      }
    }

    let reasoningPickUsed = false
    if (useTools) {
      parts.push('Tools active: reasoning-capable family preferred')
      reasoningPickUsed = winner !== ranked[0]
    }
    let gap = null
    let runnerUpName = null
    if (ranked.length > 1) {
      const second = ranked[1]
      gap = winner.blended - second.blended
      runnerUpName = second.model.model_name
      if (gap < 5) parts.push(`Close race: +${gap.toFixed(1)} over ${runnerUpName}`)
    }

    const secondary = task.secondary.filter(t => t !== taskType).slice(0, 2)
    if (secondary.length) parts.push(`Also: ${secondary.join(', ')}`)

    return {
      model: winner.model,
      reason: parts.join(' · '),
      // Structured rationale for the renderer to localize (i18n) instead of
      // showing the raw English `reason` string above.
      reasonParts: {
        task: taskType,
        taskLabel,
        confidence: Math.round(confidence * 100),
        lowConfidence: confidence < 0.5,
        family: winner.family,
        heuristic: winner.hScore,
        eloScore: winner.eloScore,
        eloWins: winner.eloWins,
        eloTotal: winner.eloTotal,
        eloReliable: winner.eloTotal >= 5,
        useTools: !!useTools,
        reasonPickUsed: reasoningPickUsed,
        closeRace: gap !== null && gap < 5,
        gap: gap !== null ? Number(gap.toFixed(1)) : null,
        runnerUpName,
        secondary: secondary.map(s => ({ type: s, label: s })),
        ranked: ranked.length,
      },
      heuristicScores: ranked.map(r => ({ modelId: r.model.id, modelName: r.model.model_name,
        family: r.family, heuristic: r.hScore, eloScore: r.eloScore, blended: r.blended })),
      eloScore: winner.eloScore,
      confidence,
    }
  } catch {
    return null
  }
}

// ─── Public API (backward-compatible) ────────────────────────────────────

/**
 * Suggest the best model for a given request.
 * Signature preserved: suggestModel({ allModels, userMessage, useTools, intent })
 */
function suggestModel({ allModels, userMessage, useTools, intent }) {
  try {
    const router = new ModelRouter()
    return router.route({ allModels, userMessage, useTools })
  } catch {
    return null
  }
}

/**
 * Enhanced suggest with ELO data and explainable rationale.
 * @param {{ allModels, userMessage, useTools, intent, eloData }}
 * @returns {{ suggestedModelId, reason, reasonParts, heuristicScores, confidence } | null}
 */
function suggestModelExplained({ allModels, userMessage, useTools, intent, eloData }) {
  try {
    const result = routeWithExplanation({ allModels, userMessage, useTools, intent, eloData })
    if (!result) return null
    return {
      suggestedModelId: result.model.id,
      reason: result.reason,
      reasonParts: result.reasonParts,
      heuristicScores: result.heuristicScores,
      confidence: result.confidence,
    }
  } catch {
    return null
  }
}

module.exports = {
  suggestModel, suggestModelExplained, routeWithExplanation,
  classifyTask, detectFamily, ModelRouter, scoreModel, FAMILY_SCORES,
}
