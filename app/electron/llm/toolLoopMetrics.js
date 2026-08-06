// ───────────────────────────────────────────────────────────────────────────
// Tool-loop observability.
//
// Lightweight metrics collector + SQLite persistence for the agent tool loop.
// Records one row per run (iterations, tokens, duration, error kind) and one
// row per tool call, then exposes aggregate queries for a compact UI view.
//
// DB is required lazily so this module stays importable in node-only tests
// (better-sqlite3/electron are only pulled in at call time).
// ───────────────────────────────────────────────────────────────────────────

function db() { return require('../database') }

// Persist a finished tool-loop run. Returns the new run id (or null if DB is
// unavailable). Call once at the end of a run.
function recordRun({ sessionId = null, iterations = 0, inputTokens = 0, outputTokens = 0, durationMs = 0, errorKind = null } = {}) {
  try {
    const info = db().run(
      'INSERT INTO tool_loop_run (session_id, duration_ms, iterations, input_tokens, output_tokens, error_kind) VALUES (?, ?, ?, ?, ?, ?)',
      sessionId, durationMs, iterations, inputTokens, outputTokens, errorKind
    )
    return info ? Number(info.lastInsertRowid) : null
  } catch { return null }
}

// Finalize a run row created earlier (so tool samples can reference its id).
// Only provided fields are updated. Returns void.
function updateRun(id, { iterations, inputTokens, outputTokens, durationMs, errorKind } = {}) {
  if (!id) return
  try {
    db().run(
      'UPDATE tool_loop_run SET iterations = ?, input_tokens = ?, output_tokens = ?, duration_ms = ?, error_kind = ? WHERE id = ?',
      iterations ?? 0, inputTokens ?? 0, outputTokens ?? 0, durationMs ?? 0, errorKind ?? null, id
    )
  } catch {}
}

// Record a single tool invocation belonging to a run. Returns void.
function recordTool({ runId = null, toolName = '', ms = 0, success = true } = {}) {
  try {
    db().run(
      'INSERT INTO tool_call_sample (run_id, tool_name, duration_ms, success) VALUES (?, ?, ?, ?)',
      runId, toolName, ms, success ? 1 : 0
    )
  } catch {}
}

// Recent runs with per-run aggregates, newest first. Used by the UI.
function recentRuns(limit = 20) {
  try {
    return db().allRows('SELECT * FROM tool_loop_run ORDER BY id DESC LIMIT ?', [limit])
  } catch { return [] }
}

// Aggregate over the last N runs: totals + averages.
function summary(limit = 50) {
  try {
    const row = db().allRows(
      `SELECT COUNT(*) AS runs,
              AVG(duration_ms) AS avg_duration_ms,
              AVG(iterations) AS avg_iterations,
              SUM(input_tokens) AS total_input_tokens,
              SUM(output_tokens) AS total_output_tokens,
              SUM(CASE WHEN error_kind IS NOT NULL THEN 1 ELSE 0 END) AS error_runs
       FROM (SELECT * FROM tool_loop_run ORDER BY id DESC LIMIT ${Number(limit)})`
    )[0] || {}
    return {
      runs: Number(row.runs) || 0,
      avgDurationMs: Math.round(Number(row.avg_duration_ms) || 0),
      avgIterations: Number(row.avg_iterations) || 0,
      totalInputTokens: Number(row.total_input_tokens) || 0,
      totalOutputTokens: Number(row.total_output_tokens) || 0,
      errorRuns: Number(row.error_runs) || 0,
    }
  } catch {
    return { runs: 0, avgDurationMs: 0, avgIterations: 0, totalInputTokens: 0, totalOutputTokens: 0, errorRuns: 0 }
  }
}

// Per-tool call stats over the last N runs: count, avg duration, success rate.
function byTool(limit = 50) {
  try {
    return db().allRows(
      `SELECT tool_name, COUNT(*) AS calls, AVG(duration_ms) AS avg_duration_ms,
              SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS ok
       FROM tool_call_sample
       WHERE run_id IN (SELECT id FROM (SELECT id FROM tool_loop_run ORDER BY id DESC LIMIT ${Number(limit)}))
       GROUP BY tool_name ORDER BY calls DESC`
    )
  } catch { return [] }
}

module.exports = { recordRun, updateRun, recordTool, recentRuns, summary, byTool }