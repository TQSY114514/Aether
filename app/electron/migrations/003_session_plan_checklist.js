// ─────────────────────────────────────────────────────────────────────────────
// Migration 003: Session Plan Checklist Table
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  version: 3,
  name: 'session_plan_checklist',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_plan (
        session_id INTEGER PRIMARY KEY,
        plan_json TEXT NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
  },
  down: (db) => {
    db.exec("DROP TABLE IF EXISTS session_plan")
  }
}
