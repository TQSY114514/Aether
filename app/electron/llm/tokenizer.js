// ───────────────────────────────────────────────────────────────────────────
// Token counter using js-tiktoken for OpenAI models (cl100k_base).
// Lazy loads on first use to avoid startup overhead.
// ───────────────────────────────────────────────────────────────────────────

let encoding = null
let loadingAttempted = false

// Detect whether a provider/model should use exact token counting.
// OpenAI and OpenAI-compatible providers use cl100k_base. Anthropic and
// unknown providers fall back to the char-based estimate.
const EXACT_TOKEN_PROVIDERS = new Set(['openai', 'openai-compatible', 'deepseek', 'moonshot', 'zhipu', 'qwen', 'openrouter'])
const EXACT_TOKEN_MODEL_PREFIXES = ['gpt-', 'text-', 'o1', 'o3', 'deepseek', 'chatglm', 'qwen', 'moonshot', 'glm']

function shouldUseExact(provider, model) {
  if (!provider) return false
  const p = String(provider).toLowerCase()
  if (EXACT_TOKEN_PROVIDERS.has(p)) return true
  if (model) {
    const m = String(model).toLowerCase()
    return EXACT_TOKEN_MODEL_PREFIXES.some((prefix) => m.startsWith(prefix))
  }
  return false
}

function getEncoding() {
  if (encoding) return encoding
  if (loadingAttempted) return null
  try {
    // js-tiktoken is lazily required so the cost of loading it is only paid
    // when a message actually needs exact counting.
    const { getEncoding } = require('js-tiktoken')
    encoding = getEncoding('cl100k_base')
    return encoding
  } catch {
    // js-tiktoken not installed or failed to load — fall back to estimate.
    loadingAttempted = true
    return null
  }
}

// Exact token count for OpenAI-compatible text. Returns null if unavailable.
function countTokensExact(text) {
  if (!text) return 0
  const enc = getEncoding()
  if (!enc) return null
  try {
    return enc.encode(text).length
  } catch {
    return null
  }
}

// Char-based estimate: CJK chars ≈ 1.5 tokens (BPE merges them less aggressively),
// other chars ≈ 0.25 (≈4 chars/token, the common English heuristic).
function countTokensFallback(text) {
  if (!text) return 0
  let tokens = 0
  for (const c of text) {
    const code = c.codePointAt(0)
    if ((code >= 0x3400 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0x3040 && code <= 0x309f) || (code >= 0x30a0 && code <= 0x30ff) ||
        (code >= 0xac00 && code <= 0xd7af)) tokens += 1.5
    else tokens += 0.25
  }
  return Math.max(1, Math.ceil(tokens))
}

// Count tokens for a piece of text, choosing exact vs fallback automatically.
function countTokens(text, provider, model) {
  if (shouldUseExact(provider, model)) {
    const exact = countTokensExact(text)
    if (exact !== null) return exact
  }
  return countTokensFallback(text)
}

module.exports = {
  countTokens,
  countTokensExact,
  countTokensFallback,
  shouldUseExact,
  getEncoding
}