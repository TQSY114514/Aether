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
const RE_OPENAI = /^o[134]|^gpt-5/
const RE_CLAUDE = /claude/
const RE_DEEPSEEK_R = /deepseek[_-]r/i
const RE_QWEN = /^qwq|qwen.*-(thinking|reason)/
function reasoningFamily(modelName = '') {
  const m = modelName.toLowerCase()
  if (RE_OPENAI.test(m)) return 'openai'
  if (RE_CLAUDE.test(m)) return 'claude'
  // Only match deepseek-reasoner / deepseek-r1 style names. The old
  // /deepseek/ + /r/.test(m) regex falsely matched "deepseek-coder" (has r).
  if (RE_DEEPSEEK_R.test(m)) return 'deepseek'
  if (RE_QWEN.test(m)) return 'qwen'
  return 'none'
}

// The OpenAI effort vocabulary.
const OPENAI_EFFORT = { low: 'low', medium: 'medium', high: 'high' }

// Build the reasoning params to spread into the request body.
// `effort` is 'low' | 'medium' | 'high'. `thinkingEnabled` is boolean.
// Returns {} when thinking is off (OpenAI/Claude) or the model doesn't support
// reasoning. DeepSeek gets { thinking: { type: 'disabled' } } when off.
function buildReasoningParams(modelName, effort, thinkingEnabled) {
  const fam = reasoningFamily(modelName)
  if (fam === 'deepseek') {
    // DeepSeek supports explicit on/off via thinking.type
    return thinkingEnabled ? { thinking: { type: 'enabled' } } : { thinking: { type: 'disabled' } }
  }
  if (!thinkingEnabled) return {}
  if (fam === 'openai') {
    const e = OPENAI_EFFORT[effort]
    return e ? { reasoning_effort: e } : {}
  }
  if (fam === 'claude') {
    // Aether only ships an OpenAI-compatible adapter, so Claude models are
    // reached through a relay/shim. Most relays (new-api, OpenRouter) accept
    // `reasoning_effort` for Claude and translate it; sending a native Claude
    // `thinking` block to an OpenAI-shape endpoint usually 400s. So we use the
    // OpenAI vocabulary here and let the relay handle conversion. We do NOT
    // force temperature=1/top_p=undefined — those are only required for the
    // native Claude thinking API and break OpenAI-shape requests.
    const e = OPENAI_EFFORT[effort]
    return e ? { reasoning_effort: e } : {}
  }
  // Qwen: reasoning is usually always-on for these models; sending an
  // extra_body is unreliable across shims, so we send nothing and let the model
  // behave by default. (Best-effort — no harm if omitted.)
  return {}
}

// Whether the model accepts user-controlled reasoning params (drives UI: show/hide slider).
function supportsReasoning(modelName = '') {
  const fam = reasoningFamily(modelName)
  return fam === 'openai' || fam === 'claude' || fam === 'deepseek'
}

module.exports = { reasoningFamily, buildReasoningParams, supportsReasoning }
