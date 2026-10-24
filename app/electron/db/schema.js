const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

/**
 * Schema bootstrap (Electron-free).
 * The pure CREATE TABLE / CREATE VIRTUAL TABLE set from initDatabase, extracted
 * so the TUI/CLI can bootstrap a fresh DB headlessly.
 */
function createEmptyDatabase(dbPath) {
  const dir = path.dirname(String(dbPath));
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const target = new Database(dbPath);
  target.pragma("journal_mode = WAL");
  target.pragma("foreign_keys = OFF");
  target.pragma("busy_timeout = 5000");

  target.exec(
    "CREATE TABLE IF NOT EXISTS provider (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, api_url TEXT NOT NULL, api_key TEXT, api_format TEXT NOT NULL DEFAULT 'openai', enabled INTEGER NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );
  target.exec(
    "CREATE TABLE IF NOT EXISTS model (id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL, model_name TEXT NOT NULL, display_name TEXT, is_primary INTEGER NOT NULL DEFAULT 0, fallback_order INTEGER, context_window INTEGER, input_price_per_1k REAL, output_price_per_1k REAL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );
  target.exec(
    "CREATE TABLE IF NOT EXISTS persona (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, prompt TEXT NOT NULL, avatar TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );
  target.exec(
    "CREATE TABLE IF NOT EXISTS project (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, root_path TEXT NOT NULL UNIQUE, icon TEXT, color TEXT, default_model_id INTEGER, default_agent_mode TEXT NOT NULL DEFAULT 'workspace', is_favorite INTEGER NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, last_opened_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
  );
  try {
    target.exec("CREATE INDEX IF NOT EXISTS idx_project_last_opened ON project(last_opened_at DESC)");
    target.exec("CREATE INDEX IF NOT EXISTS idx_project_favorite ON project(is_favorite DESC, last_opened_at DESC)");
  } catch {}
  target.exec(
    "CREATE TABLE IF NOT EXISTS session (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT '新会话', persona_id INTEGER, parent_session_id INTEGER, pinned INTEGER NOT NULL DEFAULT 0, config TEXT, session_kind TEXT NOT NULL DEFAULT 'chat', project_id INTEGER, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, is_placeholder INTEGER NOT NULL DEFAULT 0)",
  );
  target.exec(
    "CREATE TABLE IF NOT EXISTS message (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','assistant','system')), content TEXT NOT NULL, model_used TEXT, provider_used INTEGER, token_count INTEGER, latency_ms INTEGER, status TEXT NOT NULL DEFAULT 'success' CHECK(status IN ('success','error','fallback','aborted')), error_message TEXT, arena_model TEXT, file_summary TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );

  target.exec(
    "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
  target.exec(`CREATE TABLE IF NOT EXISTS compaction_state (
    session_id TEXT PRIMARY KEY,
    split_index INTEGER NOT NULL,
    summary TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  target.exec(`CREATE TABLE IF NOT EXISTS scheduled_task (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    interval_ms INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    config TEXT,
    last_run_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  target.exec(`CREATE TABLE IF NOT EXISTS agent_task (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    parent_session_id INTEGER,
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
    kind TEXT NOT NULL DEFAULT 'task',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
  )`);
  target.exec(
    "CREATE TABLE IF NOT EXISTS model_score (id INTEGER PRIMARY KEY AUTOINCREMENT, model_id INTEGER NOT NULL, intent TEXT NOT NULL, score REAL NOT NULL DEFAULT 1000, win_count INTEGER NOT NULL DEFAULT 0, total_count INTEGER NOT NULL DEFAULT 0, UNIQUE(model_id, intent))",
  );
  target.exec(
    "CREATE TABLE IF NOT EXISTS arena_vote (id INTEGER PRIMARY KEY AUTOINCREMENT, prompt TEXT NOT NULL, intent TEXT, winner_model_id INTEGER, winner_model_name TEXT, loser_model_ids TEXT NOT NULL, loser_model_names TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );
  target.exec(`CREATE TABLE IF NOT EXISTS arena_benchmark (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tasks TEXT NOT NULL,
    model_ids TEXT NOT NULL,
    last_run TEXT,
    results TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  target.exec(
    "CREATE TABLE IF NOT EXISTS mcp_server (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, command TEXT NOT NULL, args TEXT, env TEXT, enabled INTEGER NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );
  target.exec(
    "CREATE TABLE IF NOT EXISTS memory (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, type TEXT DEFAULT 'fact', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );
  target.exec(
    "CREATE TABLE IF NOT EXISTS repo_index_cache (workspace TEXT PRIMARY KEY, mtime_x REAL NOT NULL, graph_json TEXT NOT NULL)",
  );
  target.exec(
    "CREATE TABLE IF NOT EXISTS tool_loop_run (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, duration_ms INTEGER, iterations INTEGER, input_tokens INTEGER, output_tokens INTEGER, error_kind TEXT)",
  );
  target.exec(
    "CREATE TABLE IF NOT EXISTS tool_call_sample (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER, tool_name TEXT, duration_ms INTEGER, success INTEGER)",
  );

  target.exec(
    'CREATE TABLE IF NOT EXISTS kg_nodes (id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT NOT NULL UNIQUE, type TEXT DEFAULT "entity", created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)',
  );
  target.exec(
    'CREATE TABLE IF NOT EXISTS kg_edges (id INTEGER PRIMARY KEY AUTOINCREMENT, "from" TEXT NOT NULL, "to" TEXT NOT NULL, relation TEXT NOT NULL, confidence REAL NOT NULL DEFAULT 0.8, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  );

  target.exec(`CREATE TABLE IF NOT EXISTS skill_usage (
    name TEXT PRIMARY KEY,
    use_count INTEGER NOT NULL DEFAULT 0,
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  target.exec(`CREATE TABLE IF NOT EXISTS agent_execution_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    turn_id INTEGER NOT NULL,
    payload TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  target.exec(`CREATE TABLE IF NOT EXISTS agent_checkpoint (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    tool_name TEXT NOT NULL,
    args TEXT NOT NULL,
    affected_paths TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    rolled_back_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  target.exec(`CREATE TABLE IF NOT EXISTS agent_turn_checkpoint (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    turn_id INTEGER NOT NULL,
    step_index INTEGER NOT NULL DEFAULT 0,
    messages TEXT NOT NULL,
    tool_trace TEXT DEFAULT '[]',
    checkpoint_meta TEXT DEFAULT '{}',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  try {
    target.exec(`CREATE INDEX IF NOT EXISTS idx_turn_checkpoint_session ON agent_turn_checkpoint(session_id, turn_id, step_index)`);
  } catch {}

  target.exec(
    "CREATE TABLE IF NOT EXISTS user_habit (key TEXT PRIMARY KEY, imperative TEXT, reason TEXT, occurrences INTEGER NOT NULL DEFAULT 0, proposed INTEGER NOT NULL DEFAULT 0, first_seen DATETIME DEFAULT CURRENT_TIMESTAMP, last_seen DATETIME DEFAULT CURRENT_TIMESTAMP)",
  );
  target.exec(`CREATE TABLE IF NOT EXISTS skill_patterns (
    signature TEXT PRIMARY KEY,
    tools TEXT NOT NULL,
    params_json TEXT,
    count INTEGER NOT NULL DEFAULT 1,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  target.exec(`CREATE TABLE IF NOT EXISTS skill_drafts (
    signature TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    drafted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  target.exec(`CREATE TABLE IF NOT EXISTS evolution_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capsule_id TEXT NOT NULL,
    genes TEXT NOT NULL,
    strategy TEXT NOT NULL DEFAULT "balanced",
    signals TEXT,
    blast_radius TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  target.exec(`CREATE TABLE IF NOT EXISTS skill_success (
    name TEXT PRIMARY KEY,
    total_uses INTEGER NOT NULL DEFAULT 0,
    successes INTEGER NOT NULL DEFAULT 0,
    last_result INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  target.exec(
    'CREATE TABLE IF NOT EXISTS provider_credential (id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL, api_key TEXT NOT NULL, label TEXT, enabled INTEGER NOT NULL DEFAULT 1, last_used_at DATETIME DEFAULT "2000-01-01T00:00:00.000Z", cooldown_until DATETIME, error_count INTEGER NOT NULL DEFAULT 0, disable_reason TEXT)',
  );

  target.exec(`CREATE TABLE IF NOT EXISTS usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    provider_id INTEGER,
    provider_name TEXT,
    model_name TEXT,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_creation_tokens INTEGER DEFAULT 0,
    cost REAL DEFAULT 0,
    latency_ms INTEGER,
    status INTEGER,
    source TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  try {
    target.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      session_id UNINDEXED,
      message_id UNINDEXED,
      tokenize = 'unicode61'
    )`);
  } catch {}
  try {
    target.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      type UNINDEXED,
      memory_id UNINDEXED,
      tokenize = 'unicode61'
    )`);
  } catch {}

  try {
    target.exec("CREATE INDEX IF NOT EXISTS idx_message_session_created ON message(session_id, created_at)");
    target.exec("CREATE INDEX IF NOT EXISTS idx_session_updated ON session(updated_at DESC)");
    target.exec("CREATE INDEX IF NOT EXISTS idx_session_project ON session(project_id, updated_at DESC)");
  } catch {}

  return target;
}

module.exports = {
  createEmptyDatabase,
};
