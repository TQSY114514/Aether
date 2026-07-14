// ───────────────────────────────────────────────────────────────────────────
// Credential pool — multi-key rotation with rate-limit backoff per provider.
//
// Each provider can have N API keys. When the adapter needs a key it calls
// pickCredential(providerId), which returns the least-recently-used viable
// (not disabled, not in cooldown) key and records its usage.
//
// On 429 → mark cooldown (30 s), retry with next key.
// On 401 → mark invalid, skip forever.
//
// This lives as a JS module backed by SQLite rows; no new IPC is needed for
// basic operation (the adapter calls it internally). A new IPC handler exposes
// the pool state to the UI for the provider page.
// ───────────────────────────────────────────────────────────────────────────

let db = null // set by init() from database.js after the DB is opened

const COOLDOWN_SEC = 30

function init(database) { db = database }

// Pick the next available key for `providerId`. Returns { id, api_key } or
// null when no viable key exists (caller falls back to provider.api_key for
// backward compat).
function pickCredential(providerId) {
  if (!db) return null
  const now = new Date().toISOString()
  // First, migrate any legacy key from the provider row.
  _migrateFromProvider(providerId)

  const stmt = db.prepare(
    'SELECT id, api_key FROM provider_credential WHERE provider_id=? AND enabled=1 AND (cooldown_until IS NULL OR cooldown_until <= ?) ORDER BY last_used_at ASC LIMIT 1'
  )
  stmt.bind([providerId, now])
  let row = null
  if (stmt.step()) row = stmt.getAsObject()
  stmt.free()
  if (!row) return null
  // Record usage — bump last_used_at.
  db.run('UPDATE provider_credential SET last_used_at=? WHERE id=?', [now, row.id])
  return { id: row.id, api_key: row.api_key }
}

// Backward compat: if a provider still has a legacy api_key in the provider
// table, migrate it into the credential table once.
function _migrateFromProvider(providerId) {
  const chk = db.prepare('SELECT count(*) as n FROM provider_credential WHERE provider_id=?')
  chk.bind([providerId])
  let n = 0
  if (chk.step()) n = chk.getAsObject().n; chk.free()
  if (n > 0) return
  const ps = db.prepare('SELECT api_key FROM provider WHERE id=?')
  ps.bind([providerId])
  let key = null
  if (ps.step()) key = ps.getAsObject().api_key; ps.free()
  if (key && typeof key === 'string' && key.trim()) {
    db.run('INSERT INTO provider_credential (provider_id, api_key, label, enabled, last_used_at) VALUES (?,?,?,?,?)',
      [providerId, key.trim(), '原密钥', 1, '2000-01-01T00:00:00.000Z'])
    // clear legacy so we don't double-insert it next time
    db.run('UPDATE provider SET api_key=NULL WHERE id=?', [providerId])
  }
}

// Mark a specific credential as rate-limited (cool down for COOLDOWN_SEC).
function markCooldown(credentialId) {
  if (!db) return
  const until = new Date(Date.now() + COOLDOWN_SEC * 1000).toISOString()
  db.run('UPDATE provider_credential SET cooldown_until=?, error_count=error_count+1 WHERE id=?', [until, credentialId])
}

// Mark the *most recently used* credential for a provider as cooling down.
// Called on a 429 from the adapter when we don't know exactly which key was
// used (the adapter called pickCredential earlier and got one).
function markCooldownForProvider(providerId) {
  if (!db) return
  const stmt = db.prepare('SELECT id FROM provider_credential WHERE provider_id=? AND enabled=1 ORDER BY last_used_at DESC LIMIT 1')
  stmt.bind([providerId])
  let id = null
  if (stmt.step()) id = stmt.getAsObject().id; stmt.free()
  if (id) markCooldown(id)
}

// Mark a specific credential as invalid (401).
function markInvalid(credentialId) {
  if (!db) return
  db.run('UPDATE provider_credential SET enabled=0 WHERE id=?', [credentialId])
}

// List all credentials for a provider (UI-facing).
function listCredentials(providerId) {
  if (!db) return []
  const stmt = db.prepare('SELECT * FROM provider_credential WHERE provider_id=? ORDER BY id')
  stmt.bind([providerId])
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

// Add a new key. Returns { lastInsertRowid }.
function addCredential(providerId, api_key, label) {
  if (!db) return null
  db.run('INSERT INTO provider_credential (provider_id, api_key, label, enabled) VALUES (?,?,?,?)', [providerId, api_key, label || '', 1])
  return { lastInsertRowid: db.lastInsertRowid?.() || db.exec('SELECT last_insert_rowid()')[0]?.values?.[0]?.[0] }
}

// Remove a credential row.
function removeCredential(credentialId) {
  if (!db) return
  db.run('DELETE FROM provider_credential WHERE id=?', [credentialId])
}

module.exports = { init, pickCredential, markCooldown, markCooldownForProvider, markInvalid, listCredentials, addCredential, removeCredential }
