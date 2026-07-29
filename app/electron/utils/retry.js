// ───────────────────────────────────────────────────────────────────────────
// Shared credential-rotation retry helpers.
// Both openaiAdapter.js and anthropicAdapter.js had near-identical retry loops
// (3 attempts, 429/5xx/network retryable, cooldown on 429). This module
// provides the loop logic and predicates so adapters just supply their own
// function + cooldown hook.
// ───────────────────────────────────────────────────────────────────────────

const MAX_CRED_RETRIES = 3

function isRetryable(err) {
  if (!err) return false
  const status = Number(err?.status) || 0
  if (status === 429 || (status >= 500 && status < 600)) return true
  return /ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed|network/i.test(String(err?.message || ''))
}

/**
 * Retry a Promise-returning function with credential rotation.
 *
 * @param {Function} attemptFn     Returns a Promise. Called each attempt.
 * @param {Function} markCooldown  (providerId) => void. Called on 429.
 * @returns {Promise} Resolves with the first successful attempt result.
 */
async function retryPromise(attemptFn, markCooldown) {
  let lastErr
  for (let attempt = 0; attempt < MAX_CRED_RETRIES; attempt++) {
    try { return await attemptFn() }
    catch (err) {
      lastErr = err
      if (!isRetryable(err)) break
      try { markCooldown() } catch {}
    }
  }
  throw lastErr
}

/**
 * Retry an async-generator-returning function with credential rotation.
 * The delegate returns an async generator; the wrapper yields from it on
 * each attempt. If the generator completes successfully, iteration stops.
 * If it throws mid-stream, we retry (the consumer sees the stream end
 * early and can decide whether to retry on the consumer side).
 *
 * @param {Function} attemptFn     Returns an async generator.
 * @param {Function} markCooldown  () => void. Called on 429.
 * @returns {AsyncGenerator} That delegates to each attempt.
 */
async function* retryStream(attemptFn, markCooldown) {
  let lastErr
  for (let attempt = 0; attempt < MAX_CRED_RETRIES; attempt++) {
    try { yield* attemptFn(); return }
    catch (err) {
      lastErr = err
      if (!isRetryable(err)) break
      try { markCooldown() } catch {}
    }
  }
  throw lastErr
}

module.exports = { MAX_CRED_RETRIES, isRetryable, retryPromise, retryStream }
