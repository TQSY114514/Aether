// ───────────────────────────────────────────────────────────────────────────
// Reasoning / thinking-effort helpers.
//
// Maps a user-facing effort level ('low'|'medium'|'high') + thinking toggle
// to the correct request parameter shape for the model's provider family.
// Names are detected by prefix because Aether stores raw provider model ids,
// not capability flags.
//
// Shapes (verified against QuantumNous/new-api relay conversion logic):
//   OpenAI o-series / gpt-5  ->  { reasoning_effort: 'low'|'medium'|'high' }
//   Claude (via OpenAI shim) ->  { reasoning_effort: 'low'|'medium'|'high' }
//   DeepSeek-R1 / QwQ-style  ->  { thinking: { type: 'enabled'|'disabled' } }
//   others / off            ->  {} (no param)
//
// When thinkingEnabled is false:
//   OpenAI/Claude → {} (no param, model default)
//   DeepSeek      → { thinking: { type: 'disabled' } } (true off)
//
// Claude thinking forces temperature=1 and drops top_p/top_k — applied by the
// caller when it merges these into the request body.
// ───────────────────────────────────────────────────────────────────────────

// Classify a model by its id/name prefix. Returns the reasoning family.
// Regexes are pre-compiled once (module-level) since they're called once per turn.
const RE_OPENAI = /^o[134]|^gpt-5/i
const RE_CLAUDE = /claude/i
const RE_DEEPSEEK_R = /deepseek[_-](r\d|reasoner)/i
const RE_HERMES = /(deephermes|hermes[_-]?[34]|nous[_-]hermes)/i
function isQwenReasoning(m) {
  if (m.startsWith('qwq') || m.startsWith('qwen3')) return true
  if (m.startsWith('qwen') && (m.includes('-thinking') || m.includes('-reason') || m.includes('_thinking') || m.includes('_reason'))) return true
  return false
}

function isGeminiReasoning(m) {
  if (m.includes('gemini-2.5') || m.includes('gemini-3')) return true
  if (m.includes('gemini') && m.includes('thinking')) return true
  return false
}

function reasoningFamily(modelName = '') {
  const m = String(modelName || '').toLowerCase()
  if (RE_OPENAI.test(m)) return 'openai'
  if (RE_CLAUDE.test(m)) return 'claude'
  // Only match deepseek-reasoner / deepseek-r1 style names.
  if (RE_DEEPSEEK_R.test(m)) return 'deepseek'
  if (RE_HERMES.test(m)) return 'hermes'
  if (isQwenReasoning(m)) return 'qwen'
  if (isGeminiReasoning(m)) return 'gemini'
  return 'none'
}

const REASONING_BUDGET_MAP = Object.freeze({
  off: 0,
  minimal: 1024,
  low: 2048,
  medium: 8192,
  high: 16384,
  max: 32768,
})

function getReasoningBudget(level) {
  const key = String(level || 'medium').toLowerCase()
  return REASONING_BUDGET_MAP[key] ?? REASONING_BUDGET_MAP.medium
}

function normalizeEffort(effort) {
  const e = String(effort || 'medium').toLowerCase()
  if (e === 'minimal' || e === 'low' || e === 'medium' || e === 'high' || e === 'max') {
    return e
  }
  return 'medium'
}

// Map 5-tier canonical effort to OpenAI 3-tier reasoning_effort
function toOpenAIEffort(effort) {
  const e = normalizeEffort(effort)
  if (e === 'minimal' || e === 'low') return 'low'
  if (e === 'medium') return 'medium'
  return 'high'
}

// Build the reasoning params to spread into the request body.
// effort is 'minimal' | 'low' | 'medium' | 'high' | 'max'. thinkingEnabled is boolean.
// Returns {} when thinking is off (OpenAI) or the model doesn't support reasoning.
function buildReasoningParams(modelName, effort, thinkingEnabled, options) {
  const fam = reasoningFamily(modelName)
  if (fam === 'deepseek') {
    // DeepSeek supports explicit on/off via thinking.type
    return thinkingEnabled ? { thinking: { type: 'enabled' } } : { thinking: { type: 'disabled' } }
  }
  if (!thinkingEnabled || effort === 'off') {
    if (fam === 'qwen') return { enable_thinking: false }
    if (fam === 'gemini') return { thinking_config: { thinking_budget: 0 } }
    if (fam === 'hermes') return { enable_thinking: false, thinking: { type: 'disabled' }, reasoning: { effort: 'none' } }
    return {}
  }

  const normEffort = normalizeEffort(effort)
  const oaiEffort = toOpenAIEffort(normEffort)
  const maxTokens = typeof options === 'number' ? options : (options?.max_tokens || options?.maxTokens)
  let budget = getReasoningBudget(normEffort)
  if (typeof maxTokens === 'number' && maxTokens > 0 && budget >= maxTokens) {
    budget = Math.max(1, maxTokens - 1)
  }

  if (fam === 'openai') {
    return { reasoning_effort: oaiEffort }
  }
  if (fam === 'claude') {
    return {
      reasoning_effort: oaiEffort,
      thinking: { type: 'enabled', budget_tokens: budget },
    }
  }
  if (fam === 'gemini') {
    const geminiBudget = normEffort === 'minimal' ? 1024 : normEffort === 'low' ? 2048 : normEffort === 'medium' ? 4096 : normEffort === 'high' ? 16384 : 32768
    const clampedGemini = (typeof maxTokens === 'number' && maxTokens > 0 && geminiBudget >= maxTokens)
      ? Math.max(1, maxTokens - 1)
      : geminiBudget
    return {
      thinking_config: { thinking_budget: clampedGemini },
      reasoning_effort: oaiEffort,
    }
  }
  if (fam === 'qwen') {
    return {
      enable_thinking: true,
      thinking_budget: budget,
    }
  }
  if (fam === 'hermes') {
    return {
      enable_thinking: true,
      thinking_budget: budget,
      reasoning: { effort: oaiEffort, max_tokens: budget },
    }
  }
  return {}
}

// Whether the model accepts user-controlled reasoning params (drives UI: show/hide slider).
function supportsReasoning(modelName = '') {
  return reasoningFamily(modelName) !== 'none'
}

// Whether the model only supports binary on/off without tiered effort levels.
function isBinaryReasoning(modelName = '') {
  const m = String(modelName || '').toLowerCase()
  if (reasoningFamily(m) === 'deepseek') return true
  if (/deephermes/i.test(m)) return true
  return false
}

module.exports = {
  reasoningFamily,
  buildReasoningParams,
  supportsReasoning,
  isBinaryReasoning,
  normalizeEffort,
  getReasoningBudget,
  REASONING_BUDGET_MAP,
}
