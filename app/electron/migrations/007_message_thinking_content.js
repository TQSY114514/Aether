// ─────────────────────────────────────────────────────────────────────────────
// electron/migrations/007_message_thinking_content.js
//
// Migration 007: Thinking Content Persistence in SQLite (P0)
// Adds thinking_content TEXT and thinking_duration_ms INTEGER to message table.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  version: 7,
  name: 'message_thinking_content',
  up: (db) => {
    const cols = db.prepare('PRAGMA table_info(message)').all().map((c) => c.name)
    if (!cols.includes('thinking_content')) {
      db.exec('ALTER TABLE message ADD COLUMN thinking_content TEXT')
    }
    if (!cols.includes('thinking_duration_ms')) {
      db.exec('ALTER TABLE message ADD COLUMN thinking_duration_ms INTEGER')
    }
  },
  down: (db) => {
    // SQLite does not support DROP COLUMN without recreating the table.
    // Retaining columns during down migration is safe and prevents data loss.
  },
}
