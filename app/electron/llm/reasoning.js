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

function normalizeEffort(effort) {
  if (effort === 'low' || effort === 'medium' || effort === 'high') {
    return effort
  }
  return 'medium'
}

// The OpenAI effort vocabulary.
const OPENAI_EFFORT = { low: 'low', medium: 'medium', high: 'high' }

// Build the reasoning params to spread into the request body.
// `effort` is 'low' | 'medium' | 'high'. `thinkingEnabled` is boolean.
// Returns {} when thinking is off (OpenAI) or the model doesn't support reasoning.
function buildReasoningParams(modelName, effort, thinkingEnabled, options) {
  const fam = reasoningFamily(modelName)
  if (fam === 'deepseek') {
    // DeepSeek supports explicit on/off via thinking.type
    return thinkingEnabled ? { thinking: { type: 'enabled' } } : { thinking: { type: 'disabled' } }
  }
  if (!thinkingEnabled) {
    if (fam === 'qwen') return { enable_thinking: false }
    if (fam === 'gemini') return { thinking_config: { thinking_budget: 0 } }
    if (fam === 'hermes') return { enable_thinking: false, thinking: { type: 'disabled' }, reasoning: { effort: 'none' } }
    return {}
  }

  const normEffort = normalizeEffort(effort)
  const maxTokens = typeof options === 'number' ? options : (options?.max_tokens || options?.maxTokens)

  if (fam === 'openai') {
    return { reasoning_effort: normEffort }
  }
  if (fam === 'claude') {
    // Both reasoning_effort and Anthropic-native thinking budget are supplied
    // so relays (OpenRouter / new-api / OneAPI) can pick the shape they need.
    let budget = normEffort === 'low' ? 2048 : normEffort === 'medium' ? 8192 : 24576
    if (typeof maxTokens === 'number' && maxTokens > 0 && budget >= maxTokens) {
      budget = Math.max(1, maxTokens - 1)
    }
    return {
      reasoning_effort: normEffort,
      thinking: { type: 'enabled', budget_tokens: budget },
    }
  }
  if (fam === 'gemini') {
    const budget = normEffort === 'low' ? 1024 : normEffort === 'medium' ? 4096 : 16384
    return {
      thinking_config: { thinking_budget: budget },
      reasoning_effort: normEffort,
    }
  }
  if (fam === 'qwen') {
    const budget = normEffort === 'low' ? 2048 : normEffort === 'medium' ? 8192 : 16384
    return {
      enable_thinking: true,
      thinking_budget: budget,
    }
  }
  if (fam === 'hermes') {
    let budget = normEffort === 'low' ? 2048 : normEffort === 'medium' ? 8192 : 16384
    if (typeof maxTokens === 'number' && maxTokens > 0 && budget >= maxTokens) {
      budget = Math.max(1, maxTokens - 1)
    }
    return {
      enable_thinking: true,
      thinking_budget: budget,
      reasoning: { effort: normEffort, max_tokens: budget },
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

module.exports = { reasoningFamily, buildReasoningParams, supportsReasoning, isBinaryReasoning, normalizeEffort }
