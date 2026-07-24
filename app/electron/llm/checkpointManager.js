// ───────────────────────────────────────────────────────────────────────────
// Agent Checkpoint Manager — save/restore snapshots of agent turn state.
//
// When a long-running agent task (multiple tool calls, planning, sub-agents)
// reaches a milestone, we snapshot the conversation + tool state so the user
// (or the agent itself) can roll back to a known-good point.
//
// Storage: SQLite table `agent_checkpoint` (session_id, turn_id, step_index,
// messages JSON, checkpoint_meta JSON, created_at).
// ───────────────────────────────────────────────────────────────────────────

const { estimateMessagesTokens, estimateTextTokens } = require('./compaction')

const TABLE = 'agent_checkpoint'
const MAX_CHECKPOINTS_PER_SESSION = 20

// Create the checkpoint table (idempotent — called from database.js migrations).
function createTable(db) {
  try {
    db.run(`CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      turn_id INTEGER NOT NULL,
      step_index INTEGER NOT NULL DEFAULT 0,
      messages TEXT NOT NULL,
      tool_trace TEXT DEFAULT '[]',
      checkpoint_meta TEXT DEFAULT '{}',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`)
    try { db.run(`CREATE INDEX IF NOT EXISTS idx_checkpoint_session ON ${TABLE}(session_id, turn_id, step_index)`) } catch {}
    db.saveDatabase()
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
    db.run(`INSERT INTO ${TABLE} (session_id, turn_id, step_index, messages, tool_trace, checkpoint_meta) VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, turnId, stepIndex, payload, trace, JSON.stringify(meta)])
    // Prune old checkpoints for this session to cap storage.
    db.run(`DELETE FROM ${TABLE} WHERE session_id = ? AND id NOT IN (
      SELECT id FROM ${TABLE} WHERE session_id = ? ORDER BY id DESC LIMIT ?)`,
      [sessionId, sessionId, MAX_CHECKPOINTS_PER_SESSION])
    db.saveDatabase()
    return db.lastId()
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
    const r = db.exec(sql, params)
    if (!r[0]?.values?.[0]) return null
    const row = r[0].values[0]
    return {
      id: row[0],
      session_id: row[1],
      turn_id: row[2],
      step_index: row[3],
      messages: JSON.parse(row[4] || '[]'),
      toolTrace: JSON.parse(row[5] || '[]'),
      meta: JSON.parse(row[6] || '{}'),
      created_at: row[7],
    }
  } catch {
    return null
  }
}

// List checkpoints for a session, most recent first.
function listForSession(db, sessionId, limit = 20) {
  try {
    const r = db.exec(`SELECT id, turn_id, step_index, checkpoint_meta, created_at FROM ${TABLE} WHERE session_id = ? ORDER BY id DESC LIMIT ?`,
      [sessionId, Math.min(limit, MAX_CHECKPOINTS_PER_SESSION)])
    if (!r[0]?.values) return []
    return r[0].values.map(row => ({
      id: row[0], sessionId: row[1], turnId: row[2],
      stepIndex: row[3], meta: JSON.parse(row[4] || '{}'), createdAt: row[5],
    }))
  } catch {
    return []
  }
}

// Delete all checkpoints for a session (cleanup on session delete).
function deleteForSession(db, sessionId) {
  try { db.run(`DELETE FROM ${TABLE} WHERE session_id = ?`, [sessionId]); db.saveDatabase() } catch {}
}

// Delete a single checkpoint.
function deleteOne(db, id) {
  try { db.run(`DELETE FROM ${TABLE} WHERE id = ?`, [id]); db.saveDatabase() } catch {}
}

// Auto-checkpoint: called during the tool loop to decide when to save.
// Heuristic: checkpoint every N tool calls, or when the conversation exceeds
// a token threshold (so a long tool chain can be resumed from mid-way).
const AUTO_CHECKPOINT_EVERY_N_TOOLS = 5
const AUTO_CHECKPOINT_TOKEN_THRESHOLD = 8000

function shouldAutoCheckpoint(stepIndex, messages) {
  if (stepIndex > 0 && stepIndex % AUTO_CHECKPOINT_EVERY_N_TOOLS === 0) return true
  try {
    const est = estimateMessagesTokens(messages)
    return est >= AUTO_CHECKPOINT_TOKEN_THRESHOLD
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
  MAX_CHECKPOINTS_PER_SESSION,
}
