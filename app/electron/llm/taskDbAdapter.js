// Headless task DB adapter — the bridge between a bare better-sqlite3
// connection and the TaskEngine's expected data API (same shape as the
// business methods on the desktop database.js wrapper).
//
// Why this exists: in the desktop app, `db` handed to backgroundTasks.js is
// the full database.js wrapper (createSession / addMessage / createAgentTask /
// ...). In headless mode (cli.js --task) there is no Electron, so agentCore
// only opens a raw connection. This adapter re-implements the ten methods the
// TaskEngine actually calls, with the exact same SQL and column behavior as
// database.js, so a task derived from the CLI is persisted identically.
//
// Keep in sync with the corresponding methods in app/electron/database.js.
'use strict'

function localNow() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const AGENT_TASK_PATCH_COLS = new Set(['status', 'error', 'result', 'attempts', 'priority', 'max_retry'])

function taskDbAdapter(raw) {
  return {
    // ── Session ────────────────────────────────────────────────────────────
    createSession({ title = '新会话', persona_id = null, parentSessionId = null } = {}) {
      const info = raw.prepare('INSERT INTO session (title, persona_id, parent_session_id, updated_at, is_placeholder) VALUES (?, ?, ?, ?, 1)')
        .run(title, persona_id, parentSessionId, localNow())
      return { lastInsertRowid: Number(info.lastInsertRowid) }
    },

    // Mirror database.js renameSession — no-op silently if id is null/undefined
    // (better-sqlite3 throws on undefined bind parameters).
    renameSession(id, title) {
      if (id == null) return
      raw.prepare('UPDATE session SET title = ?, updated_at = ? WHERE id = ?').run(title, localNow(), id)
    },

    // Mirror database.js deleteSession: cascade-delete the session and its
    // messages in one transaction. Optional tables are wrapped in try/catch so
    // older DB files (missing newer tables) still delete cleanly.
    deleteSession(id) {
      if (id == null) return
      const del = raw.transaction((sid) => {
        try { raw.prepare('DELETE FROM messages_fts WHERE session_id = ?').run(sid) } catch {}
        raw.prepare('DELETE FROM message WHERE session_id = ?').run(sid)
        try { raw.prepare('DELETE FROM agent_checkpoint WHERE session_id = ?').run(sid) } catch {}
        try { raw.prepare('DELETE FROM agent_execution_log WHERE session_id = ?').run(sid) } catch {}
        try { raw.prepare('DELETE FROM usage_log WHERE session_id = ?').run(sid) } catch {}
        try { raw.prepare('UPDATE memory SET source_session_id = NULL WHERE source_session_id = ?').run(sid) } catch {}
        raw.prepare('DELETE FROM session WHERE id = ?').run(sid)
        return sid
      })
      del(id)
    },

    // ── Message ────────────────────────────────────────────────────────────
    addMessage({ session_id, role, content, model_used = null, provider_used = null }) {
      const info = raw.prepare('INSERT INTO message (session_id, role, content, model_used, provider_used, token_count, latency_ms, status, error_message, arena_model) VALUES (?, ?, ?, ?, ?, NULL, NULL, \'success\', NULL, NULL)')
        .run(session_id, role, content, model_used, provider_used)
      try { raw.prepare('UPDATE session SET is_placeholder = 0 WHERE id = ? AND is_placeholder = 1').run(session_id) } catch {}
      try { raw.prepare('INSERT INTO messages_fts (content, session_id, message_id) VALUES (?, ?, ?)').run(String(content || ''), session_id, Number(info.lastInsertRowid)) } catch {}
      return { lastInsertRowid: Number(info.lastInsertRowid) }
    },

    updateMessage(id, data) {
      const keys = Object.keys(data || {}).filter((k) => typeof data[k] !== 'undefined')
      if (!keys.length) return
      raw.prepare(`UPDATE message SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
        .run(...keys.map((k) => data[k]), id)
    },

    // Delete a single message by id. database.js has no by-id delete; this is
    // the adapter's own (idempotent, null-safe). Returns { changes } so callers
    // can distinguish "deleted 1" from "already gone" without throwing.
    deleteMessage(id) {
      if (id == null) return { changes: 0 }
      const info = raw.prepare('DELETE FROM message WHERE id = ?').run(id)
      return { changes: Number(info.changes) }
    },

    // Truncate-by-idx parity with database.js deleteMessagesAfter: remove every
    // message after a given message id in a session. Like database.js, FTS rows
    // are left untouched.
    deleteMessagesAfter(sessionId, afterId) {
      if (sessionId == null) return { changes: 0 }
      const info = raw.prepare('DELETE FROM message WHERE session_id = ? AND id > ?').run(sessionId, afterId)
      return { changes: Number(info.changes) }
    },

    // ── Model / Provider / Settings (read-only) ───────────────────────────
    getModel(id) {
      const row = raw.prepare('SELECT * FROM model WHERE id = ?').get(id)
      return row ? { ...row, id: Number(row.id) } : null
    },

    getProvider(id) {
      const row = raw.prepare('SELECT * FROM provider WHERE id = ?').get(id)
      return row ? { ...row, id: Number(row.id) } : null
    },

    // Providers read-only list (W0-t6): mirrors database.js getProviders minus
    // api_key — headless surfaces must never expose stored keys. Returns
    // id/name/api_url/api_format/enabled only.
    listProviders() {
      return raw.prepare('SELECT id, name, api_url, api_format, enabled FROM provider ORDER BY id')
        .all()
        .map((r) => ({ id: Number(r.id), name: r.name, api_url: r.api_url, api_format: r.api_format, enabled: Number(r.enabled) }))
    },

    // Upsert a provider by name. Deliberately NOT literal `INSERT OR REPLACE`:
    // provider.name has no UNIQUE constraint (database.js:109), so OR REPLACE
    // would silently create duplicate rows. If a provider with the same name
    // exists it is updated, otherwise inserted. No safeStorage headless, so the
    // key is stored as given (same stance as agentCore.decryptApiKey).
    upsertProvider({ name, api_url, api_key = null, api_format = 'openai', enabled = 1 }) {
      if (name == null || name === '') throw new Error('upsertProvider: name is required')
      const existing = raw.prepare('SELECT id FROM provider WHERE name = ?').get(name)
      if (existing) {
        raw.prepare('UPDATE provider SET api_url = ?, api_key = ?, api_format = ?, enabled = ? WHERE id = ?')
          .run(api_url, api_key, api_format, enabled, Number(existing.id))
        return { lastInsertRowid: Number(existing.id), upserted: false }
      }
      const info = raw.prepare('INSERT INTO provider (name, api_url, api_key, api_format, enabled) VALUES (?, ?, ?, ?, ?)')
        .run(name, api_url, api_key, api_format, enabled)
      return { lastInsertRowid: Number(info.lastInsertRowid), upserted: true }
    },

    getSetting(key) {
      const row = raw.prepare('SELECT value FROM settings WHERE key = ?').get(key)
      return row ? row.value : null
    },

    // Mirror database.js setSetting. INSERT OR REPLACE is safe here because
    // settings.key is PRIMARY KEY (database.js:115).
    setSetting(key, value) {
      raw.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
    },

    // ── Agent task CRUD ─────────────────────────────────────────────────────
    createAgentTask({ session_id = null, title, content, model_id = null, agent_mode = 'ask', priority = 0, max_retry = 2 }) {
      const info = raw.prepare('INSERT INTO agent_task (session_id, title, content, model_id, agent_mode, priority, max_retry) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(session_id, title, content, model_id, agent_mode, priority, max_retry)
      return Number(info.lastInsertRowid)
    },

    getAgentTask(id) {
      const row = raw.prepare('SELECT * FROM agent_task WHERE id = ?').get(id)
      if (!row) return null
      return { ...row, id: Number(row.id), session_id: row.session_id ? Number(row.session_id) : null, model_id: row.model_id ? Number(row.model_id) : null, priority: Number(row.priority), attempts: Number(row.attempts), max_retry: Number(row.max_retry) }
    },

    updateAgentTask(id, patch) {
      const cols = Object.keys(patch || {}).filter((k) => AGENT_TASK_PATCH_COLS.has(k))
      if (!cols.length) return
      const sets = cols.map((k) => `${k} = ?`).join(', ')
      raw.prepare(`UPDATE agent_task SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
        .run(...cols.map((k) => patch[k]), id)
    },

    listAgentTasks(limit = 100) {
      return raw.prepare('SELECT * FROM agent_task ORDER BY priority DESC, id DESC LIMIT ?')
        .all(limit)
        .map((r) => ({ ...r, id: Number(r.id), session_id: r.session_id ? Number(r.session_id) : null, model_id: r.model_id ? Number(r.model_id) : null, priority: Number(r.priority), attempts: Number(r.attempts), max_retry: Number(r.max_retry) }))
    },
  }
}

module.exports = { taskDbAdapter }