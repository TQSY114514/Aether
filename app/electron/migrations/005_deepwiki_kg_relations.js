// ─────────────────────────────────────────────────────────────────────────────
// Migration 005: DeepWiki Knowledge Graph Relations
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  version: 5,
  name: 'deepwiki_kg_relations',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kg_nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL UNIQUE,
        type TEXT DEFAULT "entity",
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS kg_edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        "from" TEXT NOT NULL,
        "to" TEXT NOT NULL,
        relation TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.8,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_kg_edges_from ON kg_edges("from");
      CREATE INDEX IF NOT EXISTS idx_kg_edges_to ON kg_edges("to");
    `)
  },
  down: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_kg_edges_to;
      DROP INDEX IF EXISTS idx_kg_edges_from;
      DROP TABLE IF EXISTS kg_edges;
      DROP TABLE IF EXISTS kg_nodes;
    `)
  }
}
