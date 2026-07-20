// ───────────────────────────────────────────────────────────────────────────
// Shared cost computation: USD per 1K tokens from model price columns.
// Used by both chat.handler.js (per-message) and arena.handler.js (per-model).
// ───────────────────────────────────────────────────────────────────────────

/**
 * Compute the USD cost for a single LLM call.
 * Returns 0 if the model has no pricing info (free/unpriced models).
 *
 * Cached-read tokens aren't billed at the full input rate (best-effort deduction).
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

module.exports = { computeCost }
