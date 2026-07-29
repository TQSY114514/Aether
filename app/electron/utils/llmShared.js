// ───────────────────────────────────────────────────────────────────────────
// Shared LLM utilities — used by both openaiAdapter.js and anthropicAdapter.js.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Strip trailing slashes from a provider's API URL.
 */
function baseUrl(provider) {
  return (provider.api_url || '').replace(/\/+$/, '')
}

/**
 * Normalize a provider usage object into AetherAI's canonical shape.
 * Handles both OpenAI-style (prompt_tokens, cached_tokens in details)
 * and Anthropic-style (input_tokens, cache_read_input_tokens) field names.
 * Returns null if the input is empty.
 */
function normalizeUsage(u) {
  if (!u || typeof u !== 'object') return null
  const num = (v) => (typeof v === 'number' ? v : 0)
  return {
    prompt_tokens: num(u.prompt_tokens) || num(u.input_tokens),
    completion_tokens: num(u.completion_tokens) || num(u.output_tokens),
    total_tokens: num(u.total_tokens) || num(u.input_tokens || 0) + num(u.output_tokens || 0),
    cache_read_tokens: num(u.cache_read_input_tokens) || num(u.prompt_tokens_details?.cached_tokens) || 0,
    cache_creation_tokens: num(u.cache_creation_input_tokens) || num(u.cache_creation_tokens) || 0,
  }
}

module.exports = { baseUrl, normalizeUsage }
