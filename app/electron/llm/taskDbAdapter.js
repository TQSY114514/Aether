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

    // ── Model / Provider / Settings (read-only) ───────────────────────────
    getModel(id) {
      const row = raw.prepare('SELECT * FROM model WHERE id = ?').get(id)
      return row ? { ...row, id: Number(row.id) } : null
    },

    getProvider(id) {
      const row = raw.prepare('SELECT * FROM provider WHERE id = ?').get(id)
      return row ? { ...row, id: Number(row.id) } : null
    },

    getSetting(key) {
      const row = raw.prepare('SELECT value FROM settings WHERE key = ?').get(key)
      return row ? row.value : null
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