// ───────────────────────────────────────────────────────────────────────────
// Agent Checkpoint Manager — save/restore snapshots of agent turn state.
//
// When a long-running agent task (multiple tool calls, planning, sub-agents)
// reaches a milestone, we snapshot the conversation + tool state so the user
// (or the agent itself) can roll back to a known-good point.
//
// Storage: SQLite table `agent_turn_checkpoint` (session_id, turn_id, step_index,
// messages JSON, checkpoint_meta JSON, created_at).
// ───────────────────────────────────────────────────────────────────────────

const { estimateMessagesTokens, estimateTextTokens } = require('./compaction')

const TABLE = 'agent_turn_checkpoint'
const MAX_CHECKPOINTS_PER_SESSION = 20
// Track last auto-checkpoint step & token estimate per session to avoid
// re-serializing and writing on every tool step once context >= 8000 tokens.
const _lastAutoCheckpoint = new Map()

// Create the checkpoint table (idempotent — called from database.js migrations).
function createTable(db) {
  try {
    const execSql = (sql) => {
      if (typeof db.exec === 'function') return db.exec(sql)
      if (typeof db.run === 'function') return db.run(sql)
      return db.prepare(sql).run()
    }
    execSql(`CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      turn_id INTEGER NOT NULL,
      step_index INTEGER NOT NULL DEFAULT 0,
      messages TEXT NOT NULL,
      tool_trace TEXT DEFAULT '[]',
      checkpoint_meta TEXT DEFAULT '{}',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`)
    try { execSql(`CREATE INDEX IF NOT EXISTS idx_turn_checkpoint_session ON ${TABLE}(session_id, turn_id, step_index)`) } catch {}
    if (typeof db.saveDatabase === 'function') db.saveDatabase()
  } catch (e) {
    // best-effort — table creation must not crash the app
  }
}

// Save a checkpoint. `messages` is the conversation array (plain JSON-serializable).
// `toolTrace` is the accumulated audit trail so far.
// Returns the checkpoint id or null.
function save(db, sessionId, turnId, stepIndex, messages, toolTrace = [], meta = {}) {
  try {
    const payload = JSON.stringify(messages)
    const trace = JSON.stringify(toolTrace.slice(-20)) // keep last 20 entries
    try {
      if (sessionId != null) {
        _lastAutoCheckpoint.set(sessionId, {
          stepIndex: Number(stepIndex) || 0,
          tokens: estimateMessagesTokens(messages || []),
        })
      }
    } catch {}
    let info = null
    if (typeof db.prepare === 'function') {
      info = db.prepare(`INSERT INTO ${TABLE} (session_id, turn_id, step_index, messages, tool_trace, checkpoint_meta) VALUES (?, ?, ?, ?, ?, ?)`).run(
        sessionId, turnId, stepIndex, payload, trace, JSON.stringify(meta)
      )
      try {
        db.prepare(`DELETE FROM ${TABLE} WHERE session_id = ? AND id NOT IN (
          SELECT id FROM ${TABLE} WHERE session_id = ? ORDER BY id DESC LIMIT ?)`).run(
          sessionId, sessionId, MAX_CHECKPOINTS_PER_SESSION
        )
      } catch {}
    } else if (typeof db.run === 'function') {
      info = db.run(`INSERT INTO ${TABLE} (session_id, turn_id, step_index, messages, tool_trace, checkpoint_meta) VALUES (?, ?, ?, ?, ?, ?)`,
        [sessionId, turnId, stepIndex, payload, trace, JSON.stringify(meta)])
      try {
        db.run(`DELETE FROM ${TABLE} WHERE session_id = ? AND id NOT IN (
          SELECT id FROM ${TABLE} WHERE session_id = ? ORDER BY id DESC LIMIT ?)`,
          [sessionId, sessionId, MAX_CHECKPOINTS_PER_SESSION])
      } catch {}
    }
    if (typeof db.saveDatabase === 'function') db.saveDatabase()
    if (info && info.lastInsertRowid != null) return Number(info.lastInsertRowid)
    return typeof db.lastId === 'function' ? db.lastId() : null
  } catch (e) {
    return null
  }
}

// Load the most recent checkpoint for a session+turn, optionally before a given step.
// Returns { id, messages, toolTrace, stepIndex, meta, created_at } or null.
function load(db, sessionId, turnId, beforeStep = null) {
  try {
    let sql = `SELECT * FROM ${TABLE} WHERE session_id = ? AND turn_id = ?`
    const params = [sessionId, turnId]
    if (beforeStep != null) {
      sql += ' AND step_index < ?'
      params.push(beforeStep)
    }
    sql += ' ORDER BY step_index DESC LIMIT 1'
    const r = typeof db.prepare === 'function' ? db.prepare(sql).get(...params) : null
    if (!r) return null
    return {
      id: r.id,
      session_id: r.session_id,
      turn_id: r.turn_id,
      step_index: r.step_index,
      messages: JSON.parse(r.messages || '[]'),
      toolTrace: JSON.parse(r.tool_trace || '[]'),
      meta: JSON.parse(r.checkpoint_meta || '{}'),
      created_at: r.created_at,
    }
  } catch {
    return null
  }
}

// List checkpoints for a session, most recent first.
function listForSession(db, sessionId, limit = 20) {
  try {
    const sql = `SELECT id, session_id, turn_id, step_index, checkpoint_meta, created_at FROM ${TABLE} WHERE session_id = ? ORDER BY id DESC LIMIT ?`
    const lim = Math.min(limit, MAX_CHECKPOINTS_PER_SESSION)
    const rows = typeof db.prepare === 'function' ? db.prepare(sql).all(sessionId, lim) : []
    return rows.map(row => ({
      id: row.id, sessionId: row.session_id, turnId: row.turn_id,
      stepIndex: row.step_index, meta: JSON.parse(row.checkpoint_meta || '{}'), createdAt: row.created_at,
    }))
  } catch {
    return []
  }
}

// Delete all checkpoints for a session (cleanup on session delete).
function deleteForSession(db, sessionId) {
  _lastAutoCheckpoint.delete(sessionId)
  try {
    if (typeof db.prepare === 'function') db.prepare(`DELETE FROM ${TABLE} WHERE session_id = ?`).run(sessionId)
    else if (typeof db.run === 'function') db.run(`DELETE FROM ${TABLE} WHERE session_id = ?`, [sessionId])
    if (typeof db.saveDatabase === 'function') db.saveDatabase()
  } catch {}
}

// Delete a single checkpoint.
function deleteOne(db, id) {
  try {
    if (typeof db.prepare === 'function') db.prepare(`DELETE FROM ${TABLE} WHERE id = ?`).run(id)
    else if (typeof db.run === 'function') db.run(`DELETE FROM ${TABLE} WHERE id = ?`, [id])
    if (typeof db.saveDatabase === 'function') db.saveDatabase()
  } catch {}
}

// Auto-checkpoint: called during the tool loop to decide when to save.
// Heuristic: checkpoint every N tool calls, or when a meaningful step + token
// delta has accumulated since the last checkpoint (never firing on every
// single tool step once context exceeds 8000 tokens).
const AUTO_CHECKPOINT_EVERY_N_TOOLS = 5
const AUTO_CHECKPOINT_TOKEN_THRESHOLD = 8000
const AUTO_CHECKPOINT_TOKEN_DELTA = 4000
const AUTO_CHECKPOINT_MIN_STEP_DELTA = 2

function resetAutoCheckpointState(sessionId) {
  if (sessionId == null) _lastAutoCheckpoint.clear()
  else _lastAutoCheckpoint.delete(sessionId)
}

function shouldAutoCheckpoint(stepIndex, messages, opts = {}) {
  if (stepIndex <= 0) return false
  if (stepIndex % AUTO_CHECKPOINT_EVERY_N_TOOLS === 0) return true
  if (!Array.isArray(messages) || messages.length === 0) return false
  try {
    const est = estimateMessagesTokens(messages)
    if (est < AUTO_CHECKPOINT_TOKEN_THRESHOLD) return false

    const hasExplicitLast = opts && (opts.lastTokens !== undefined || opts.lastStep !== undefined)
    const sessionState = opts?.sessionId != null ? _lastAutoCheckpoint.get(opts.sessionId) : null
    const prev = hasExplicitLast
      ? { stepIndex: opts.lastStep ?? 0, tokens: opts.lastTokens ?? 0 }
      : sessionState

    if (prev) {
      const stepDelta = stepIndex - (Number(prev.stepIndex) || 0)
      const tokenDelta = est - (Number(prev.tokens) || 0)
      return stepDelta >= AUTO_CHECKPOINT_MIN_STEP_DELTA && tokenDelta >= AUTO_CHECKPOINT_TOKEN_DELTA
    }

    // First/stateless check on large context: avoid firing on every step (1,2,3,4);
    // gate to step-delta intervals until a checkpoint records baseline tokens.
    return stepIndex % AUTO_CHECKPOINT_MIN_STEP_DELTA === 0
  } catch {
    return false
  }
}

module.exports = {
  createTable,
  save,
  load,
  listForSession,
  deleteForSession,
  deleteOne,
  shouldAutoCheckpoint,
  resetAutoCheckpointState,
  MAX_CHECKPOINTS_PER_SESSION,
  AUTO_CHECKPOINT_EVERY_N_TOOLS,
  AUTO_CHECKPOINT_TOKEN_THRESHOLD,
  AUTO_CHECKPOINT_TOKEN_DELTA,
  AUTO_CHECKPOINT_MIN_STEP_DELTA,
}
