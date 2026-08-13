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

// Model name patterns for each tier. Matched against model_name (lowercase).
const FAST_RE = /^(haiku|flash|gemini-2\.0-flash|gpt-4o-mini|qwen2\.5-(1\.5|3|7)b)/i
const THINK_RE = /^(opus|claude-4|o3|o4-mini|gemini-2\.5-pro|deepseek-r1|qwq)/i

// Task patterns that can safely use a cheap model.
const FAST_TASK_RE = /^(classify|filter|extract|format|summarize-short|route|detect|validate|parse|count|list|find|search-simple)/i

/**
 * Classify a task into a routing tier.
 * @param {string} taskType  - The operation type (e.g. 'classify', 'complete', 'verify')
 * @param {string} userMessage - The raw user request (for complexity heuristics)
 * @param {number} historyLength - Number of messages in the conversation
 * @returns {'fast' | 'standard' | 'thinking'}
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
 * @param {string} tier - 'fast' | 'standard' | 'thinking'
 * @param {Array} models - Array of { id, model_name, provider_id, is_primary, input_price_per_1k }
 * @param {object} [options]
 * @param {boolean} [options.autoMode=false] - enable ELO+price+latency blending
 * @param {string}  [options.priority='quality'] - 'quality' | 'speed' | 'cost'
 * @param {object}  [options.eloData] - Map/obj keyed by model_id → { score, win_count, total_count }
 * @param {object}  [options.latencyData] - Map/obj keyed by model_id → avg latency ms
 * @returns {{ modelName: string, modelId: number, rationale: string, eloScore: number|null, autoMode: boolean } | null}
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
 */
function needsExtendedThinking(userMessage, historyLength) {
  const msg = String(userMessage || '')
  // Complex signals: long message, multiple questions, code review request
  const complexRe = /(分析|比较|架构|设计|重构|review|refactor|architecture|implement.*full|build.*complete)/i
  return msg.length > 800 || historyLength > 15 || complexRe.test(msg)
}

module.exports = { routeTask, suggestModelForTier, needsExtendedThinking }
