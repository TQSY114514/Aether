// ─────────────────────────────────────────────────────────────────────────────
// electron/cli/resume.js — headless CLI session resume/fork helpers (W5-t28).
// Pure DB read helpers over a better-sqlite3 connection (Electron-free, CJS).
// SQL mirrors rpc/server.js session.load / listSessions and tui/sessionLoad.js
// exactly — no duplicated business logic, same column behavior:
//   - session lookup:   SELECT id, title, parent_session_id FROM session WHERE id = ?
//   - message load:     SELECT id, role, content FROM message WHERE session_id = ? ORDER BY id
//   - most recent:      SELECT id, title FROM session ORDER BY id DESC LIMIT 1
//
// LIMITATION (documented, by design): headless resume is CONTEXT-ONLY — the
// new turn of this run is passed to runAgent via the `messages` param but is
// NEVER written back to the DB (no addMessage call anywhere in the headless
// path). --fork DOES create the new session row (so the fork exists for later
// desktop/TUI use) but that row stays empty; the assistant turn of this run
// is not persisted to it either. Persisting headless turns is out of scope for
// W5 — the desktop app and TUI remain the write-back paths.
// ─────────────────────────────────────────────────────────────────────────────

'use strict'

/**
 * Load a session's messages as runAgent-ready { role, content } turns,
 * ordered by DB row id ascending. Only user/assistant rows are carried:
 * system rows (e.g. stale memory prefixes) are excluded because headless runs
 * re-inject persona + memory context via runAgent's sessionContext path.
 * @param {object|null} db  better-sqlite3 connection (agentCore.openDatabase)
 * @param {number|string|null} sessionId
 * @returns {{role: string, content: string}[]}  missing db/session → []
 */
function loadSessionMessages(db, sessionId) {
  if (!db || sessionId == null) return []
  let rows = []
  try {
    rows = db.prepare(
      "SELECT role, content FROM message WHERE session_id = ? AND role IN ('user','assistant') ORDER BY id",
    ).all(Number(sessionId))
  } catch {
    return []
  }
  return rows.map((r) => ({ role: r.role, content: r.content ?? '' }))
}

/**
 * Most recent session (--resume target; same ordering as listSessions —
 * largest id wins).
 * @param {object|null} db
 * @returns {{id: number, title: string|null}|null}  no db / no sessions → null
 */
function findMostRecentSession(db) {
  if (!db) return null
  let row = null
  try {
    row = db.prepare('SELECT id, title FROM session ORDER BY id DESC LIMIT 1').get()
  } catch {
    return null
  }
  return row ? { id: Number(row.id), title: row.title || null } : null
}

/**
 * Resolve the resume target for --session <id> / --resume / --fork <source>.
 * Precedence: --session > --resume (documented). --fork creates a NEW session
 * row (parent_session_id → source) and carries the SOURCE's messages; the new
 * session itself starts empty.
 *
 * @param {object|null} db
 * @param {{session?: string|number, resume?: boolean, fork?: boolean}} opts
 * @returns {{sessionId: number, title: string|null, messages: Array, forked: boolean}|null}
 *   null when the target session is missing / the DB has no sessions.
 */
function resolveResumeTarget(db, { session, resume, fork } = {}) {
  if (!db) return null

  // Source: --session wins over --resume.
  let source = null
  if (session != null) {
    let row = null
    try {
      row = db.prepare('SELECT id, title FROM session WHERE id = ?').get(Number(session))
    } catch {}
    if (!row) return null
    source = { id: Number(row.id), title: row.title || null }
  } else if (resume) {
    source = findMostRecentSession(db)
    if (!source) return null
  }

  if (!source) return null // neither --session nor --resume: nothing to target

  if (fork) {
    // Same SQL + timestamp semantics as taskDbAdapter.createSession (mirrors
    // database.js) so a CLI fork lands in the DB byte-identically.
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const localNow = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    const created = db.prepare(
      'INSERT INTO session (title, parent_session_id, updated_at, is_placeholder) VALUES (?, ?, ?, 1)',
    ).run(source.title || 'fork', source.id, localNow)
    const newId = Number(created.lastInsertRowid)
    // Fork carries the source conversation; the new session row is empty until
    // the app layer writes turns (headless runs do not persist messages).
    return { sessionId: newId, title: source.title, messages: loadSessionMessages(db, source.id), forked: true }
  }

  return { sessionId: source.id, title: source.title, messages: loadSessionMessages(db, source.id), forked: false }
}

module.exports = { loadSessionMessages, findMostRecentSession, resolveResumeTarget }
