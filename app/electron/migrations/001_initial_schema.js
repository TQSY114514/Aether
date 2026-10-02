// ─────────────────────────────────────────────────────────────────────────────
// Migration 001: Initial Base Schema
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  version: 1,
  name: 'initial_schema',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS provider (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        api_url TEXT NOT NULL,
        api_key TEXT,
        api_format TEXT NOT NULL DEFAULT 'openai',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS model (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER NOT NULL,
        model_name TEXT NOT NULL,
        display_name TEXT,
        is_primary INTEGER NOT NULL DEFAULT 0,
        fallback_order INTEGER,
        context_window INTEGER,
        input_price_per_1k REAL,
        output_price_per_1k REAL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS persona (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        avatar TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS session (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '新会话',
        persona_id INTEGER,
        parent_session_id INTEGER,
        pinned INTEGER NOT NULL DEFAULT 0,
        config TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_placeholder INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS message (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
        content TEXT NOT NULL,
        model_used TEXT,
        provider_used INTEGER,
        token_count INTEGER,
        latency_ms INTEGER,
        status TEXT NOT NULL DEFAULT 'success' CHECK(status IN ('success','error','fallback','aborted')),
        error_message TEXT,
        arena_model TEXT,
        file_summary TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        type TEXT DEFAULT 'fact',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
  },
  down: (db) => {
    // Migration 001 establishes the baseline application schema.
    // Rolling back migration 001 must not drop core user tables
    // (session, message, settings, provider, model) to protect user data.
  }
}
