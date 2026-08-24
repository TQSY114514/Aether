// ───────────────────────────────────────────────────────────────────────────
// Network Policy — outbound allowlist for agent web tools (web_fetch /
// web_search). Layered on top of the existing SSRF guard (tools/ssrf.js),
// which is reused, not rewritten.
//
// Policy modes (stored in the `settings` table):
//   network.policy        'allow' | 'block' | 'whitelist'  (default 'whitelist')
//   network.whitelist     JSON array of hostname patterns, e.g.
//                         ["example.com", "*.docs.example.com", "developer.mozilla.org"]
//
// Pattern matching rules:
//   - exact hostname match (case-insensitive)
//   - leading "*." wildcard matches any depth of subdomain
//   - leading "." acts like "*." (suffix match on the dotted boundary)
//
// Default behavior (flag 'network.policy' unset → 'whitelist'): no hosts are
// allowed, so web tools return blocked unless the user explicitly permits a
// host. 'allow' keeps the SSRF guard but removes the allowlist requirement.
// ───────────────────────────────────────────────────────────────────────────

const urlMod = require('url')
const { checkSSRF, checkSSRFHostname } = require('../tools/ssrf') // reuse, never rewrite
const featureFlags = require('../featureFlags')

const POLICY_KEY = 'network.policy'
const WHITELIST_KEY = 'network.whitelist'

// ─── Settings access ────────────────────────────────────────────────────────

function getPolicy(db) {
  let mode = 'whitelist' // default
  if (db && typeof db.getSetting === 'function') {
    try {
      const raw = db.getSetting(POLICY_KEY)
      if (raw === 'allow' || raw === 'block' || raw === 'whitelist') mode = raw
    } catch {}
  }
  return mode
}

function getWhitelist(db) {
  if (!db || typeof db.getSetting !== 'function') return []
  try {
    const raw = db.getSetting(WHITELIST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(s => typeof s === 'string' && s.trim()) : []
  } catch { return [] }
}

/**
 * Progressive-enforcement gate for tool call sites: the allowlist only bites
 * when the network.policy feature flag is on AND a whitelist has actually
 * been configured. Turning the flag on with an empty list is a no-op (avoids
 * accidentally blocking every web tool), the user must configure hosts first.
 */
function policyActive(db) {
  if (!db || typeof db.getSetting !== 'function') return false
  try {
    // Evaluation-failure probe: a broken settings store must FAIL CLOSED
    // (throw → callers block) instead of reading as "policy disabled".
    // featureFlags.isEnabled deliberately never throws, and getPolicy /
    // getWhitelist swallow their own read errors, so probe all three raw
    // keys here to surface storage corruption from any of them.
    db.getSetting('feature_flag.network.policy')
    db.getSetting(POLICY_KEY)
    db.getSetting(WHITELIST_KEY)
  } catch (e) {
    throw new Error('network policy evaluation failed: ' + (e && e.message ? e.message : String(e)))
  }
  // Intentional disabled state: unset / corrupt flag resolves through the
  // centralized registry to its declared default (false).
  if (!featureFlags.isEnabled(db, 'network.policy')) return false
  // block mode rejects EVERY url in checkUrlPolicy regardless of whitelist
  // contents — an empty whitelist must not silently deactivate it.
  if (getPolicy(db) === 'block') return true
  return getWhitelist(db).length > 0
}

function setPolicy(db, mode) {
  if (!db || typeof db.setSetting !== 'function') return { ok: false, error: 'db unavailable' }
  if (mode !== 'allow' && mode !== 'block' && mode !== 'whitelist') {
    return { ok: false, error: `invalid policy: ${mode}` }
  }
  try {
    db.setSetting(POLICY_KEY, mode)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) }
  }
}

function setWhitelist(db, hosts) {
  if (!db || typeof db.setSetting !== 'function') return { ok: false, reason: 'db unavailable' }
  try {
    const clean = (Array.isArray(hosts) ? hosts : [])
      .map(h => String(h || '').trim().toLowerCase().replace(/^https?:\/\//, ''))
      .filter(Boolean)
    db.setSetting(WHITELIST_KEY, JSON.stringify(clean))
    return { ok: true, whitelist: clean }
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) }
  }
}

// ─── Host matching ──────────────────────────────────────────────────────────

/**
 * Does `host` match any pattern in the whitelist?
 * Exact matches and "*.domain" wildcards (any subdomain depth).
 */
function matchesWhitelist(host, whitelist) {
  const h = String(host || '').trim().toLowerCase().replace(/^https?:\/\//, '')
  if (!h) return false
  for (const raw of whitelist) {
    const pattern = String(raw || '').trim().toLowerCase().replace(/^https?:\/\//, '')
    if (!pattern) continue
    if (pattern === h) return true
    // "*.example.com" or ".example.com" → suffix wildcard (any subdomain depth)
    if (pattern.startsWith('*.')) {
      const bare = pattern.slice(2)
      if (bare && (h === bare || h.endsWith('.' + bare))) return true
    } else if (pattern.startsWith('.')) {
      const bare = pattern.slice(1)
      if (bare && h.endsWith('.' + bare)) return true
    }
  }
  return false
}

// ─── Policy check for a URL ─────────────────────────────────────────────────

/**
 * Synchronous policy + SSRF check for a URL string.
 * Returns { ok: true } or { ok: false, reason }.
 */
function checkUrlPolicy(db, urlStr) {
  let url
  try { url = new URL(urlStr) } catch {
    return { ok: false, reason: 'invalid url' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `blocked: ${url.protocol} protocol` }
  }

  // SSRF guard always applies regardless of policy.
  const ssrf = checkSSRF(urlStr)
  if (!ssrf.ok) return ssrf

  const mode = getPolicy(db)
  if (mode === 'block') return { ok: false, reason: 'network policy: block' }
  if (mode === 'whitelist') {
    if (!matchesAllowlist(url.hostname, getWhitelist(db))) {
      return { ok: false, reason: `network policy: ${url.hostname} not in whitelist` }
    }
  }
  return { ok: true }
}

// Alias for symmetric naming.
const matchesAllowlist = matchesWhitelist

/**
 * Async version for the tool loop: same policy check plus DNS-level SSRF
 * hostname resolution (the existing checkSSRFHostname). Throws a descriptive
 * Error when blocked — callers wrap it, mirroring web_fetch behavior.
 */
async function assertUrlAllowed(db, urlStr) {
  const policy = checkUrlPolicy(db, urlStr)
  if (!policy.ok) throw new Error(policy.reason)
  const u = new URL(urlStr)
  await checkSSRFHostname(u.hostname)
}

// ─── Summary for settings UI / debugging ────────────────────────────────────

function summary(db) {
  return {
    policy: getPolicy(db),
    whitelist: getWhitelist(db),
    hostsBlocked: getPolicy(db) === 'whitelist' ? 'all non-whitelisted hosts' : 'none',
  }
}

module.exports = {
  POLICY_KEY,
  WHITELIST_KEY,
  getPolicy,
  getWhitelist,
  setPolicy,
  setWhitelist,
  matchesWhitelist,
  matchesAllowlist,
  policyActive,
  checkUrlPolicy, // sync policy+SSRF (hostname-agnostic, no DNS)
  assertUrlAllowed, // async, includes DNS SSRF resolution
  summary,
}