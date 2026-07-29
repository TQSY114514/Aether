// ───────────────────────────────────────────────────────────────────────────
// Tool-result cache — idempotent tool calls return cached results within
// the same tool-loop turn, avoiding redundant LLM context bloat.
//
// Inspired by OpenClaw's caching layer: read-only tools (read_file, list_dir,
// grep_search, git_status, git_log, web_fetch) are deterministic — same args
// → same result. Caching them saves tokens and latency.
//
// Cache key: toolName + stable-serialized args (sorted keys, truncated values).
// TTL: per-turn (cleared at the start of each runToolLoop invocation).
// ───────────────────────────────────────────────────────────────────────────

const CACHEABLE_TOOLS = new Set([
  'read_file', 'list_dir', 'glob_find', 'grep_search',
  'git_status', 'git_diff', 'git_log',
  'web_fetch', 'web_search',
])

const MAX_CACHE_ENTRIES = 50
const MAX_ARG_VALUE_CHARS = 200 // truncate long args for cache key stability

// Per-turn cache instance. Cleared between turns.
let cache = new Map()
let hits = 0
let misses = 0

function clear() {
  cache.clear()
  hits = 0
  misses = 0
}

function isEnabled() {
  return cache.size >= 0 // always enabled; individual tools opt in via CACHEABLE_TOOLS
}

// Build a stable cache key from tool name + args.
function cacheKey(toolName, args) {
  if (!CACHEABLE_TOOLS.has(toolName)) return null
  if (!args || typeof args !== 'object') return toolName + ':' + JSON.stringify(args ?? '')
  // Sort keys for stability, truncate long values.
  const parts = []
  for (const k of Object.keys(args).sort()) {
    const v = args[k]
    const s = typeof v === 'string' ? v.slice(0, MAX_ARG_VALUE_CHARS) : JSON.stringify(v)
    parts.push(k + '=' + s)
  }
  return toolName + ':' + parts.join('&')
}

// Try to get a cached result. Returns { hit, result } or { hit: false }.
function get(toolName, args) {
  const key = cacheKey(toolName, args)
  if (!key) return { hit: false }
  const entry = cache.get(key)
  if (entry) {
    hits++
    return { hit: true, result: entry.result }
  }
  misses++
  return { hit: false }
}

// Store a result in cache.
function set(toolName, args, result) {
  const key = cacheKey(toolName, args)
  if (!key) return
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Evict oldest entry (first inserted).
    const firstKey = cache.keys().next().value
    cache.delete(firstKey)
  }
  cache.set(key, { result, ts: Date.now() })
}

// Stats for debugging / UI.
function stats() {
  return {
    entries: cache.size,
    hits,
    misses,
    hitRate: hits + misses > 0 ? (hits / (hits + misses) * 100).toFixed(1) + '%' : '0%',
  }
}

module.exports = { clear, get, set, isEnabled, stats, CACHEABLE_TOOLS }
