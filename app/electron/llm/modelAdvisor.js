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
   * @param {{ allModels: array, userMessage: string, useTools: boolean }} ctx
   * @returns {object|null}  winning model object, or null
   */
  route({ allModels, userMessage, useTools }) {
    if (!this.autoMode || !allModels || !allModels.length) return null

    try {
      const task = classifyTask(userMessage)

      // Score every available model for the primary task
      const scored = allModels
        .map(m => ({ model: m, score: scoreModel(m, task.primary) }))
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)

      if (!scored.length) return null

      // When tools are on, prefer a reasoning-capable family if one scores well
      if (useTools) {
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

module.exports = { suggestModel, classifyTask, detectFamily, ModelRouter }
