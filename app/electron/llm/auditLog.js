// ───────────────────────────────────────────────────────────────────────────
// Agent Execution Audit Log — records a complete trace of each agent turn.
//
// Logs: sessionId, turnId (messageId), timestamp, toolCalls (name, args,
// result, error, latencyMs), planId, planStatus, totalIterations,
// finalStatus (success|budget_exhausted|error|loop_detected).
//
// Stored in the `agent_execution_log` table. Queried for debugging, cost
// analysis, and a future "Agent History" view.
// ───────────────────────────────────────────────────────────────────────────

const log = require('../logger')

let db = null

function setDb(d) { db = d }

function record({ sessionId, turnId, toolCalls = [], planId = null, planStatus = null, totalIterations = 0, finalStatus = 'success' }) {
  if (!db) return
  try {
    const payload = JSON.stringify({
      toolCalls: toolCalls.map(tc => ({ name: tc.name, args: tc.args, result: tc.result?.slice(0, 500), error: tc.error, latencyMs: tc.latencyMs })),
      planId, planStatus, totalIterations, finalStatus,
    })
    db.run(`INSERT INTO agent_execution_log (session_id, turn_id, payload) VALUES (?, ?, ?)`,
      [sessionId, turnId, payload])
  } catch (e) {
    log.warn('audit log failed:', e && e.message)
  }
}

function getRecent(sessionId, limit = 50) {
  if (!db) return []
  try {
    const stmt = db.prepare('SELECT * FROM agent_execution_log WHERE session_id = ? ORDER BY id DESC LIMIT ?')
    stmt.bind([sessionId, limit])
    const rows = []
    while (stmt.step()) {
      const row = stmt.getAsObject()
      try { row.payload = JSON.parse(row.payload || '{}') } catch { row.payload = {} }
      rows.push(row)
    }
    stmt.free()
    return rows
  } catch { return [] }
}

function getStats(sessionId) {
  if (!db) return { turns: 0, totalToolCalls: 0, avgLatencyMs: 0 }
  try {
    const stmt = db.prepare('SELECT COUNT(*) as turns, SUM(json_array_length(payload, 0)) as toolCalls FROM agent_execution_log WHERE session_id = ?')
    stmt.bind([sessionId])
    const row = stmt.step() ? stmt.getAsObject() : {}; stmt.free()
    return {
      turns: Number(row.turns) || 0,
      totalToolCalls: Number(row.toolCalls) || 0,
      avgLatencyMs: 0,
    }
  } catch { return { turns: 0, totalToolCalls: 0, avgLatencyMs: 0 } }
}

module.exports = { setDb, record, getRecent, getStats }
