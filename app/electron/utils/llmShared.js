// ───────────────────────────────────────────────────────────────────────────
// Shared LLM utilities — used by both openaiAdapter.js and anthropicAdapter.js.
// Extracted to eliminate copy-paste across adapters.
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

/**
 * Compute USD cost for a single LLM call from model price columns.
 * Returns 0 for unpriced models. Cached-read tokens are deducted from
 * billable input (best-effort — not all providers report them).
 */
function computeCost(model, usage) {
  const inPrice = Number(model.input_price_per_1k) || 0
  const outPrice = Number(model.output_price_per_1k) || 0
  if (!inPrice && !outPrice) return 0
  const promptTokens = Number(usage?.prompt_tokens) || 0
  const completionTokens = Number(usage?.completion_tokens) || 0
  const cacheReadTokens = Number(usage?.cache_read_tokens) || 0
  const billableInput = Math.max(0, promptTokens - cacheReadTokens)
  return (billableInput / 1000) * inPrice + (completionTokens / 1000) * outPrice
}

/**
 * Credential-rotation retry: wraps a function so that on 429/5xx/network
 * errors it marks the current key as cooldown and retries with the next key.
 *
 * @param {Function} fn           The function to call (should return a Promise).
 * @param {Function} markCooldown Called with (providerId) on 429 to mark
 *                                the current key as cooling down.
 * @returns {Function} Wrapper with same signature as fn.
 */
function withRetry(fn, markCooldown) {
  const MAX = 3
  return async function retrying(provider, ...args) {
    let lastErr
    for (let attempt = 0; attempt < MAX; attempt++) {
      try { return await fn(provider, ...args) }
      catch (err) {
        lastErr = err
        if (!isRetryable(err)) break
        const status = Number(err?.status) || 0
        if (status === 429 && provider?.id != null) { try { markCooldown(provider.id) } catch {} }
      }
    }
    throw lastErr
  }
}

function isRetryable(err) {
  if (!err) return false
  const status = Number(err?.status) || 0
  if (status === 429 || (status >= 500 && status < 600)) return true
  return /ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed|network/i.test(String(err?.message || ''))
}

module.exports = {
  baseUrl, normalizeUsage, computeCost, withRetry, isRetryable,
}
