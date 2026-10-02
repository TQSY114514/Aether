// ─────────────────────────────────────────────────────────────────────────────
// Migration 002: Agent Task Tool Journal
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  version: 2,
  name: 'agent_task_journal',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_task (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        model_id INTEGER,
        agent_mode TEXT NOT NULL DEFAULT 'ask',
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','queued','running','plan','paused','done','cancelled','error')),
        priority INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_retry INTEGER NOT NULL DEFAULT 2,
        error TEXT,
        result TEXT,
        tool_journal TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
      );
    `)
    // If agent_task already existed before this migration, ensure tool_journal column exists
    try {
      const cols = db.prepare("PRAGMA table_info(agent_task)").all().map(c => c.name)
      if (!cols.includes('tool_journal')) {
        db.exec("ALTER TABLE agent_task ADD COLUMN tool_journal TEXT")
      }
    } catch {}
  },
  down: (db) => {
    try {
      db.exec("ALTER TABLE agent_task DROP COLUMN tool_journal")
    } catch {
      // Fallback: clear the journal contents if DROP COLUMN is unsupported
      try {
        db.exec("UPDATE agent_task SET tool_journal = NULL")
      } catch {}
    }
  }
}
