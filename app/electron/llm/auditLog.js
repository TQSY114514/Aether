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

let auditQueue = []; let auditTimer = null;
function flushAudit() {
  if (auditTimer) { clearTimeout(auditTimer); auditTimer = null; }
  if (auditQueue.length === 0 || !db) return;
  const batch = auditQueue; auditQueue = [];
  try {
    const tx = db.transaction((batch) => {
      const stmt = db.prepare('INSERT INTO agent_execution_log (session_id, turn_id, payload) VALUES (?, ?, ?)');
      for (const b of batch) stmt.run(...b);
    });
    if (tx) tx(batch);
    else for (const b of batch) db.run('INSERT INTO agent_execution_log (session_id, turn_id, payload) VALUES (?, ?, ?)', ...b);
  } catch (e) {
    log.warn('audit log flush failed:', e && e.message)
  }
}

function record({ sessionId, turnId, toolCalls = [], planId = null, planStatus = null, totalIterations = 0, finalStatus = 'success' }) {
  if (!db) return
  try {
    const payload = JSON.stringify({
      toolCalls: toolCalls.map(tc => ({ name: tc.name, args: tc.args, result: tc.result?.slice(0, 500), error: tc.error, latencyMs: tc.latencyMs })),
      planId, planStatus, totalIterations, finalStatus,
    })
    auditQueue.push([sessionId, turnId, payload]);
    if (auditQueue.length >= 10) flushAudit();
    else if (!auditTimer) auditTimer = setTimeout(flushAudit, 2000);
  } catch (e) {
    log.warn('audit log failed:', e && e.message)
  }
}

function getRecent(sessionId, limit = 50) {
  if (!db) return []
  try {
    const rows = db.prepare('SELECT * FROM agent_execution_log WHERE session_id = ? ORDER BY id DESC LIMIT ?').all(sessionId, limit)
    for (const row of rows) {
      try { row.payload = JSON.parse(row.payload || '{}') } catch { row.payload = {} }
    }
    return rows
  } catch { return [] }
}

function getStats(sessionId) {
  if (!db) return { turns: 0, totalToolCalls: 0, avgLatencyMs: 0 }
  try {
    const row = db.prepare('SELECT COUNT(*) as turns, SUM(json_array_length(payload, 0)) as toolCalls FROM agent_execution_log WHERE session_id = ?').get(sessionId) || {}
    // Average tool latency over the most recent turns (best-effort).
    const recent = db.prepare('SELECT payload FROM agent_execution_log WHERE session_id = ? ORDER BY id DESC LIMIT 50').all(sessionId)
    let totalLatency = 0
    let latencies = 0
    for (const r of recent) {
      let p
      try { p = JSON.parse(r.payload || '{}') } catch { continue }
      for (const tc of (p.toolCalls || [])) {
        if (typeof tc.latencyMs === 'number') { totalLatency += tc.latencyMs; latencies++ }
      }
    }
    return {
      turns: Number(row.turns) || 0,
      totalToolCalls: Number(row.toolCalls) || 0,
      avgLatencyMs: latencies ? Math.round(totalLatency / latencies) : 0,
    }
  } catch { return { turns: 0, totalToolCalls: 0, avgLatencyMs: 0 } }
}

module.exports = { setDb, record, getRecent, getStats }
