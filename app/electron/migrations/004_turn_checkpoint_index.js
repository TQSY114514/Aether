// ─────────────────────────────────────────────────────────────────────────────
// Migration 004: Turn Checkpoint Index
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  version: 4,
  name: 'turn_checkpoint_index',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_turn_checkpoint (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        turn_id INTEGER NOT NULL,
        step_index INTEGER NOT NULL DEFAULT 0,
        messages TEXT NOT NULL,
        tool_trace TEXT DEFAULT '[]',
        checkpoint_meta TEXT DEFAULT '{}',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_turn_checkpoint_session ON agent_turn_checkpoint(session_id, turn_id, step_index);
    `)
  },
  down: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_turn_checkpoint_session;
      DROP TABLE IF EXISTS agent_turn_checkpoint;
    `)
  }
}
