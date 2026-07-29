// ───────────────────────────────────────────────────────────────────────────
// Reasoning / thinking-effort helpers.
//
// Maps a user-facing effort level ('off'|'low'|'medium'|'high') to the correct
// request parameter shape for the model's provider family. Names are detected
// by prefix because AetherAI stores raw provider model ids, not capability flags.
//
// Shapes (verified against QuantumNous/new-api relay conversion logic):
//   OpenAI o-series / gpt-5  ->  { reasoning_effort: 'minimal'|'low'|'medium'|'high' }
//   Claude (via OpenAI shim) ->  { thinking: { type: 'enabled', budget_tokens: 1280|2048|4096 } }
//   DeepSeek-R1 / QwQ-style  ->  { reasoning_content / extra_body reasoning } — best-effort, rare
//   others / off            ->  {} (no param)
//
// Claude thinking forces temperature=1 and drops top_p/top_k — applied by the
// caller when it merges these into the request body.
// ───────────────────────────────────────────────────────────────────────────

// Classify a model by its id/name prefix. Returns the reasoning family.
// Regexes are pre-compiled once (module-level) since they're called once per turn.
const RE_OPENAI = /^o[134]|^gpt-5/
const RE_CLAUDE = /claude/
const RE_DEEPSEEK = /deepseek/
const RE_QWEN = /^qwq|qwen.*-(thinking|reason)/
function reasoningFamily(modelName = '') {
  const m = modelName.toLowerCase()
  if (RE_OPENAI.test(m)) return 'openai'
  if (RE_CLAUDE.test(m)) return 'claude'
  if (RE_DEEPSEEK.test(m) && /r/.test(m)) return 'deepseek'
  if (RE_QWEN.test(m)) return 'qwen'
  return 'none'
}

// The OpenAI effort vocabulary. 'off' maps to "send nothing".
const OPENAI_EFFORT = { low: 'low', medium: 'medium', high: 'high' }

// Build the reasoning params to spread into the request body.
// `effort` is 'off' | 'low' | 'medium' | 'high'. Returns {} when off or the
// model doesn't support reasoning.
function buildReasoningParams(modelName, effort) {
  if (!effort || effort === 'off') return {}
  const fam = reasoningFamily(modelName)
  if (fam === 'openai') {
    const e = OPENAI_EFFORT[effort]
    return e ? { reasoning_effort: e } : {}
  }
  if (fam === 'claude') {
    // AetherAI only ships an OpenAI-compatible adapter, so Claude models are
    // reached through a relay/shim. Most relays (new-api, OpenRouter) accept
    // `reasoning_effort` for Claude and translate it; sending a native Claude
    // `thinking` block to an OpenAI-shape endpoint usually 400s. So we use the
    // OpenAI vocabulary here and let the relay handle conversion. We do NOT
    // force temperature=1/top_p=undefined — those are only required for the
    // native Claude thinking API and break OpenAI-shape requests.
    const e = OPENAI_EFFORT[effort]
    return e ? { reasoning_effort: e } : {}
  }
  // DeepSeek/Qwen: reasoning is usually always-on for these models; sending an
  // extra_body is unreliable across shims, so we send nothing and let the model
  // behave by default. (Best-effort — no harm if omitted.)
  return {}
}

// Whether the model accepts user-controlled reasoning params (drives UI: show/hide slider).
function supportsReasoning(modelName = '') {
  const fam = reasoningFamily(modelName)
  return fam === 'openai' || fam === 'claude'
}

module.exports = { reasoningFamily, buildReasoningParams, supportsReasoning }
