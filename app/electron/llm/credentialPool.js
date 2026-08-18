// ───────────────────────────────────────────────────────────────────────────
// Credential pool — multi-key rotation with rate-limit backoff per provider.
//
// Each provider can have N API keys. When the adapter needs a key it calls
// pickCredential(providerId), which returns the least-recently-used viable
// (not disabled, not in cooldown) key and records its usage.
//
// On 429 → mark cooldown with exponential backoff (30s → 60s → 120s → … max 600s).
// On 401 → mark invalid, skip forever (disable_reason distinguishes
//          'insufficient_quota' vs 'invalid_api_key').
//
// This lives as a JS module backed by SQLite rows; no new IPC is needed for
// basic operation (the adapter calls it internally). A new IPC handler exposes
// the pool state to the UI for the provider page.
// ───────────────────────────────────────────────────────────────────────────

let db = null // set by init() from database.js after the DB is opened

const COOLDOWN_BASE_SEC = 30
const COOLDOWN_MAX_SEC = 600

// Exponential backoff cooldown (seconds) based on the credential's error count:
//   error_count=1 → 30s, 2 → 60s, 3 → 120s, 4 → 240s, 5 → 480s, 6+ → 600s (capped).
function computeCooldownSec(errorCount) {
  const n = Math.max(1, Number(errorCount) || 1)
  return Math.min(COOLDOWN_BASE_SEC * Math.pow(2, n - 1), COOLDOWN_MAX_SEC)
}

function init(database) { db = database }

// Encryption helpers (2026-08 audit, Low fix): the provider_credential table
// stores keys safeStorage-encrypted, exactly like the provider table. `db` is
// the database.js facade (init is called from main.js with it), which exports
// encryptKey/decryptKey — use those so both tables share one crypto path.
// Fallback to passthrough when the injected db doesn't provide them (tests,
// headless fakes) so behavior is unchanged when no crypto is available.
function _encKey(k) {
  return db && typeof db.encryptKey === 'function' ? db.encryptKey(k) : k
}
function _decKey(k) {
  return db && typeof db.decryptKey === 'function' ? db.decryptKey(k) : k
}

// Pick the next available key for `providerId`. Returns { id, api_key } or
// null when no viable key exists (caller falls back to provider.api_key for
// backward compat). The returned api_key is DECRYPTED and ready for the
// Authorization header.
function pickCredential(providerId) {
  if (!db) return null
  const now = new Date().toISOString()
  // First, migrate any legacy key from the provider row.
  _migrateFromProvider(providerId)

  const row = db.prepare(
    'SELECT id, api_key, cooldown_until FROM provider_credential WHERE provider_id=? AND enabled=1 AND (cooldown_until IS NULL OR cooldown_until <= ?) ORDER BY last_used_at ASC LIMIT 1'
  ).get(providerId, now)
  if (!row) return null
  // Record usage — bump last_used_at.
  db.run('UPDATE provider_credential SET last_used_at=? WHERE id=?', [now, row.id])
  const plainKey = _decKey(row.api_key)
  // If this key was previously cooled down and its cooldown has just expired,
  // fire a best-effort /models check to see whether it recovered. Never blocks
  // the caller — the key is returned immediately either way.
  if (row.cooldown_until != null) _verifyInBackground(providerId, row.id, plainKey)
  return { id: row.id, api_key: plainKey }
}

// Backward compat: if a provider still has a legacy api_key in the provider
// table, migrate it into the credential table once. The provider row holds a
// safeStorage-ENCRYPTED value, so decrypt it first and re-encrypt on insert —
// never store plaintext in provider_credential (2026-08 audit: keys were
// previously migrated as plaintext).
function _migrateFromProvider(providerId) {
  const n = db.prepare('SELECT count(*) as n FROM provider_credential WHERE provider_id=?').get(providerId)?.n || 0
  if (n > 0) return
  const ps = db.prepare('SELECT api_key FROM provider WHERE id=?').get(providerId)
  const stored = ps ? ps.api_key : null
  if (stored && typeof stored === 'string' && stored.trim()) {
    const plain = _decKey(stored.trim())
    db.run('INSERT INTO provider_credential (provider_id, api_key, label, enabled, last_used_at) VALUES (?,?,?,?,?)',
      [providerId, _encKey(plain), '原密钥', 1, '2000-01-01T00:00:00.000Z'])
    // clear legacy so we don't double-insert it next time
    db.run('UPDATE provider SET api_key=NULL WHERE id=?', [providerId])
  }
}

function _getProviderApiUrl(providerId) {
  const row = db.prepare('SELECT api_url FROM provider WHERE id=?').get(providerId)
  return row ? row.api_url : null
}

// Best-effort background verification of a previously-cooled key. On success
// resets error_count and clears cooldown; on failure re-applies cooldown.
// Never throws / never blocks — silent fallback to the estimated cooldown.
function _verifyInBackground(providerId, credentialId, apiKey) {
  const apiUrl = _getProviderApiUrl(providerId)
  if (!apiUrl || !apiKey) return
  verifyCredential({ api_url: apiUrl, api_key: apiKey })
    .then(ok => {
      if (!db) return
      if (ok) markSuccess(credentialId)
      else markCooldown(credentialId)
    })
    .catch(() => {})
}

// Verify a credential by GETting {api_url}/models with the key. Returns true on
// 2xx, false otherwise. Best-effort: never throws, 3s timeout.
async function verifyCredential(provider) {
  if (!provider || !provider.api_url || !provider.api_key) return false
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    const res = await fetch(`${String(provider.api_url).replace(/\/+$/, '')}/models`, {
      headers: { Authorization: `Bearer ${provider.api_key}` },
      signal: controller.signal,
    })
    return res.status >= 200 && res.status < 300
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// Mark a specific credential as rate-limited (cool down with exponential backoff
// based on its accumulated error count).
function markCooldown(credentialId) {
  if (!db) return
  const cur = Number(db.prepare('SELECT error_count FROM provider_credential WHERE id=?').get(credentialId)?.error_count) || 0
  const errCount = cur + 1
  const until = new Date(Date.now() + computeCooldownSec(errCount) * 1000).toISOString()
  db.run('UPDATE provider_credential SET cooldown_until=?, error_count=? WHERE id=?', [until, errCount, credentialId])
}

// Mark the *most recently used* credential for a provider as cooling down.
// Called on a 429 from the adapter when we don't know exactly which key was
// used (the adapter called pickCredential earlier and got one).
function markCooldownForProvider(providerId) {
  if (!db) return
  const row = db.prepare('SELECT id FROM provider_credential WHERE provider_id=? AND enabled=1 ORDER BY last_used_at DESC LIMIT 1').get(providerId)
  if (row && row.id) markCooldown(row.id)
}

// Reset a credential's error state after a successful use (or cooldown recovery).
function markSuccess(credentialId) {
  if (!db) return
  db.run('UPDATE provider_credential SET error_count=0, cooldown_until=NULL WHERE id=?', [credentialId])
}

// Mark a specific credential as permanently disabled (401) with a reason.
// detail is 'insufficient_quota' or 'invalid_api_key'; both disable the key.
function markInvalidDetail(credentialId, detail) {
  if (!db) return
  const reason = detail === 'insufficient_quota' ? 'insufficient_quota' : 'invalid_api_key'
  db.run('UPDATE provider_credential SET enabled=0, disable_reason=? WHERE id=?', [reason, credentialId])
}

// Mark a specific credential as invalid (401). Backward-compat: treated as
// invalid_api_key.
function markInvalid(credentialId) {
  markInvalidDetail(credentialId, 'invalid_api_key')
}

// List all credentials for a provider (UI-facing).
function listCredentials(providerId) {
  if (!db) return []
  return db.prepare('SELECT * FROM provider_credential WHERE provider_id=? ORDER BY id').all(providerId)
}

// Add a new key. Stored safeStorage-encrypted (same path as provider.api_key);
// decrypted transparently in pickCredential. Returns { lastInsertRowid }.
function addCredential(providerId, api_key, label) {
  if (!db) return null
  const info = db.prepare('INSERT INTO provider_credential (provider_id, api_key, label, enabled) VALUES (?,?,?,?)').run(providerId, _encKey(api_key), label || '', 1)
  return { lastInsertRowid: Number(info.lastInsertRowid) }
}

// Remove a credential row.
function removeCredential(credentialId) {
  if (!db) return
  db.run('DELETE FROM provider_credential WHERE id=?', [credentialId])
}

module.exports = { init, computeCooldownSec, pickCredential, markCooldown, markCooldownForProvider, markSuccess, markInvalid, markInvalidDetail, verifyCredential, listCredentials, addCredential, removeCredential }