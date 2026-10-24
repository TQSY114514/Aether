// ─────────────────────────────────────────────────────────────────────────────
// electron/migrations/006_project_multi_workspace.js
//
// Migration 006: Project-Based Multi-Workspace Architecture (Aether v2.0 R1)
// Creates project table with indices and adds project_id column to session table.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  version: 6,
  name: 'project_multi_workspace',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        icon TEXT,
        color TEXT,
        default_model_id INTEGER,
        default_agent_mode TEXT NOT NULL DEFAULT 'workspace',
        is_favorite INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_opened_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_project_last_opened ON project(last_opened_at DESC);
      CREATE INDEX IF NOT EXISTS idx_project_favorite ON project(is_favorite DESC, last_opened_at DESC);
    `);

    const sessionCols = db.prepare("PRAGMA table_info(session)").all().map((c) => c.name);
    if (!sessionCols.includes('project_id')) {
      db.exec("ALTER TABLE session ADD COLUMN project_id INTEGER");
      db.exec("CREATE INDEX IF NOT EXISTS idx_session_project ON session(project_id, updated_at DESC)");
    }
  },
  down: (db) => {
    try {
      db.exec("DROP INDEX IF EXISTS idx_project_favorite");
      db.exec("DROP INDEX IF EXISTS idx_project_last_opened");
      db.exec("DROP TABLE IF EXISTS project");
    } catch {}
  },
};
