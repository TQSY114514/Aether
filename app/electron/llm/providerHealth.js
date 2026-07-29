// ───────────────────────────────────────────────────────────────────────────
// Provider health tracking
//
// Tracks per-provider success rate, latency, and last error. Used by the
// tool loop and fallback chain to prefer healthy providers and skip ones that
// are consistently failing.
// ───────────────────────────────────────────────────────────────────────────

const MAX_SAMPLES = 20 // rolling window size
const HEALTHY_THRESHOLD = 0.7 // success rate >= this → healthy
const COOLDOWN_MS = 60_000 // 1-minute cooldown after a 429

const _entries = new Map() // providerId → { samples: number[], lastError: string | null, cooldownUntil: number }

function _ensure(providerId) {
  if (!_entries.has(providerId)) {
    _entries.set(providerId, { samples: [], lastError: null, cooldownUntil: 0 })
  }
  return _entries.get(providerId)
}

// Record the outcome of a request: true = success, false = failure.
function recordResult(providerId, success) {
  const entry = _ensure(providerId)
  entry.samples.push(success ? 1 : 0)
  if (entry.samples.length > MAX_SAMPLES) entry.samples.shift()
}

// Record an error message (e.g. after a non-recoverable failure).
function recordError(providerId, errorMessage) {
  _ensure(providerId).lastError = errorMessage
}

// Put a provider in cooldown (e.g. after rate-limit 429).
function setCooldown(providerId, ms = COOLDOWN_MS) {
  _ensure(providerId).cooldownUntil = Date.now() + ms
}

// True when the provider is in cooldown (rate-limit backoff).
function isCoolingDown(providerId) {
  const entry = _entries.get(providerId)
  return entry ? entry.cooldownUntil > Date.now() : false
}

// Compute rolling success rate 0–1.
function successRate(providerId) {
  const entry = _entries.get(providerId)
  if (!entry || entry.samples.length === 0) return 1 // no data → assume healthy
  return entry.samples.reduce((a, b) => a + b, 0) / entry.samples.length
}

// True when the provider should be considered healthy for routing.
function isHealthy(providerId) {
  if (isCoolingDown(providerId)) return false
  return successRate(providerId) >= HEALTHY_THRESHOLD
}

// Get the last error message, if any.
function lastError(providerId) {
  const entry = _entries.get(providerId)
  return entry ? entry.lastError : null
}

// Get average latency from samples. Returns null if no latency data yet.
// (Not yet integrated with the adapter — placeholder for future use.)
function avgLatency(providerId) {
  // Placeholder: latency tracking can be added when adapters report it.
  return null
}

// Clear all tracking data (e.g. on app restart or provider change).
function reset() {
  _entries.clear()
}

// Snapshot for diagnostics / UI display.
function snapshot(providerIds = []) {
  const ids = providerIds.length > 0 ? providerIds : Array.from(_entries.keys())
  return ids.map(id => {
    const entry = _entries.get(id)
    if (!entry) return { id, healthy: true, successRate: 1, lastError: null, coolingDown: false, samples: 0 }
    return {
      id,
      healthy: isHealthy(id),
      successRate: entry.samples.length > 0 ? +(successRate(id).toFixed(2)) : 1,
      lastError: entry.lastError,
      coolingDown: isCoolingDown(id),
      samples: entry.samples.length,
    }
  })
}

module.exports = {
  recordResult, recordError, setCooldown, isCoolingDown,
  successRate, isHealthy, lastError, avgLatency, reset, snapshot,
}
