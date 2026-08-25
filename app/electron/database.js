const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')
const { app, safeStorage } = require('electron')
const log = require('./logger')
// 写入层去重与 llm/autoMemory 共用同一套文本比较逻辑（单一来源，防止漂移）。
const { normalizeContent: memNormalize, keywords: memKeywords, jaccard: memJaccard, SIMILAR_JACCARD: MEM_SIMILAR_JACCARD } = require('./memoryText')

let db = null
let dbPath = null

// Simple async mutex to serialize ELO updates and prevent lost-update races.
let _eloMutex = Promise.resolve()

// ─── API Key Encryption (safeStorage) ─────────────────────────────────────

let _warnedNoEncryption = false

function encryptKey(plain) {
  if (!plain) return plain
  if (!safeStorage.isEncryptionAvailable()) {
    if (!_warnedNoEncryption) {
      _warnedNoEncryption = true
      log.warn('[database] safeStorage 不可用，API Key 将明文存储（系统级加密不可用）')
    }
    return plain
  }
  try {
    return safeStorage.encryptString(String(plain)).toString('base64')
  } catch { return plain }
}

function decryptKey(encoded) {
  if (!encoded) return encoded
  if (!safeStorage.isEncryptionAvailable()) return encoded
  try {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
  } catch { return encoded }
}

// Key masking for renderer-facing reads (H2): `sk-1234abcd***wxyz` shape —
// first 4 + *** + last 4. Keys shorter than 12 chars are fully masked so the
// two visible windows can't overlap or reveal the whole key.
function maskKey(key) {
  if (key == null || key === '') return ''
  const s = String(key)
  if (s.length < 12) return '****'
  return `${s.slice(0, 4)}***${s.slice(-4)}`
}

// True when a submitted api_key value means "keep the stored key" (H2 edit
// semantics): empty string (form field left blank) or a masked round-trip
// (the edit form is pre-filled with the masked value from provider:list).
function isMaskedOrEmptyKey(key) {
  if (key == null || key === '') return true
  return typeof key === 'string' && key.includes('***')
}

// A safeStorage-encrypted value is pure base64 (alphabet + padding); a legacy
// plaintext API key almost always contains characters outside that alphabet
// (e.g. "sk-..."), so this heuristic reliably flags unencrypted leftovers.
function isBase64String(s) {
  if (!s || typeof s !== 'string') return false
  if (s.length % 4 !== 0) return false
  return /^[A-Za-z0-9+/]*={0,2}$/.test(s)
}

function isPlaintextKey(stored) {
  return !!stored && !isBase64String(stored)
}

// Idempotent startup migration: re-encrypt any legacy plaintext API keys once
// system-level encryption (safeStorage) is available. Returns how many were
// migrated. Safe to call repeatedly.
function migrateLegacyPlaintextKeys() {
  if (!db || !safeStorage.isEncryptionAvailable()) return 0
  const rows = db.prepare('SELECT id, api_key FROM provider').all()
  let migrated = 0
  for (const r of rows) {
    if (!r.api_key || !isPlaintextKey(r.api_key)) continue
    try {
      const enc = safeStorage.encryptString(String(r.api_key)).toString('base64')
      db.prepare('UPDATE provider SET api_key = ? WHERE id = ?').run(enc, r.id)
      migrated++
    } catch { /* skip un-migratable row */ }
  }
  if (migrated) log.info(`[database] 迁移了 ${migrated} 个明文 API Key 到 safeStorage 加密`)
  return migrated
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getTableColumns(table) {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all()
    return rows.map(row => row.name)
  } catch { return [] }
}

function safeKeys(table, data) {
  const cols = getTableColumns(table)
  if (cols.length === 0) return []
  return Object.keys(data).filter(k => k !== 'id' && cols.includes(k))
}

function saveDatabase() { /* no-op: better-sqlite3 writes directly to disk */ }
async function flushDatabase() { /* no-op: better-sqlite3 writes directly to disk */ }

function lastId() {
  const row = db.prepare('SELECT last_insert_rowid() as id').get()
  let id = row ? row.id : 0
  if (!id) {
    const m = db.prepare('SELECT MAX(id) as max_id FROM message').get()
    id = m ? m.max_id : 0
  }
  return Number(id) || 0
}

function allRows(stmt) {
  return stmt.all()
}

// ─── Schema bootstrap (Electron-free) ───────────────────────────────────────
// The pure CREATE TABLE / CREATE VIRTUAL TABLE set from initDatabase, extracted
// so the TUI/CLI can bootstrap a fresh DB headlessly — no Electron app / path /
// safeStorage here, the target path comes from the argument. Every statement is
// idempotent (IF NOT EXISTS / guarded try-catch): running this against an
// already-initialized DB is a safe no-op and never wipes data. Versioned /
// conditional migrations (addCol block, agent_task CHECK rebuild, memory/skill
// ALTERs, seed rows, checkpointManager table) stay in initDatabase, layered on
// top of this base schema — single DDL source, no duplicated SQL.
function createEmptyDatabase(dbPath) {
  const dir = path.dirname(String(dbPath))
  if (dir) fs.mkdirSync(dir, { recursive: true })
  const target = new Database(dbPath)
  target.pragma('journal_mode = WAL')
  target.pragma('foreign_keys = OFF')

  target.exec("CREATE TABLE IF NOT EXISTS provider (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, api_url TEXT NOT NULL, api_key TEXT, api_format TEXT NOT NULL DEFAULT 'openai', enabled INTEGER NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
  target.exec("CREATE TABLE IF NOT EXISTS model (id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL, model_name TEXT NOT NULL, display_name TEXT, is_primary INTEGER NOT NULL DEFAULT 0, fallback_order INTEGER, context_window INTEGER, input_price_per_1k REAL, output_price_per_1k REAL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
  target.exec("CREATE TABLE IF NOT EXISTS persona (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, prompt TEXT NOT NULL, avatar TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
  target.exec("CREATE TABLE IF NOT EXISTS session (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT '新会话', persona_id INTEGER, parent_session_id INTEGER, pinned INTEGER NOT NULL DEFAULT 0, config TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, is_placeholder INTEGER NOT NULL DEFAULT 0)")
  target.exec("CREATE TABLE IF NOT EXISTS message (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','assistant','system')), content TEXT NOT NULL, model_used TEXT, provider_used INTEGER, token_count INTEGER, latency_ms INTEGER, status TEXT NOT NULL DEFAULT 'success' CHECK(status IN ('success','error','fallback','aborted')), error_message TEXT, arena_model TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")

  target.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  target.exec(`CREATE TABLE IF NOT EXISTS compaction_state (
    session_id TEXT PRIMARY KEY,
    split_index INTEGER NOT NULL,
    summary TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)
  target.exec(`CREATE TABLE IF NOT EXISTS scheduled_task (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    interval_ms INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    config TEXT,
    last_run_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  target.exec(`CREATE TABLE IF NOT EXISTS agent_task (
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
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
  )`)
  target.exec('CREATE TABLE IF NOT EXISTS model_score (id INTEGER PRIMARY KEY AUTOINCREMENT, model_id INTEGER NOT NULL, intent TEXT NOT NULL, score REAL NOT NULL DEFAULT 1000, win_count INTEGER NOT NULL DEFAULT 0, total_count INTEGER NOT NULL DEFAULT 0, UNIQUE(model_id, intent))')
  target.exec('CREATE TABLE IF NOT EXISTS arena_vote (id INTEGER PRIMARY KEY AUTOINCREMENT, prompt TEXT NOT NULL, intent TEXT, winner_model_id INTEGER, winner_model_name TEXT, loser_model_ids TEXT NOT NULL, loser_model_names TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)')
  // Arena 2.0 (review P0-3): personal benchmark suite — user-defined task set
  // run against chosen models, results aggregated per model (win/latency/cost).
  // `tasks` = JSON array of prompts; `last_run` = ISO timestamp; `results` =
  // JSON map model_id -> { wins, runs, total_ms, total_cost }.
  target.exec(`CREATE TABLE IF NOT EXISTS arena_benchmark (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tasks TEXT NOT NULL,
    model_ids TEXT NOT NULL,
    last_run TEXT,
    results TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  target.exec('CREATE TABLE IF NOT EXISTS mcp_server (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, command TEXT NOT NULL, args TEXT, env TEXT, enabled INTEGER NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)')
  target.exec("CREATE TABLE IF NOT EXISTS memory (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, type TEXT DEFAULT 'fact', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
  target.exec('CREATE TABLE IF NOT EXISTS repo_index_cache (workspace TEXT PRIMARY KEY, mtime_x REAL NOT NULL, graph_json TEXT NOT NULL)')
  target.exec('CREATE TABLE IF NOT EXISTS tool_loop_run (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, duration_ms INTEGER, iterations INTEGER, input_tokens INTEGER, output_tokens INTEGER, error_kind TEXT)')
  target.exec('CREATE TABLE IF NOT EXISTS tool_call_sample (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER, tool_name TEXT, duration_ms INTEGER, success INTEGER)')

  target.exec('CREATE TABLE IF NOT EXISTS kg_nodes (id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT NOT NULL UNIQUE, type TEXT DEFAULT "entity", created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)')
  target.exec('CREATE TABLE IF NOT EXISTS kg_edges (id INTEGER PRIMARY KEY AUTOINCREMENT, "from" TEXT NOT NULL, "to" TEXT NOT NULL, relation TEXT NOT NULL, confidence REAL NOT NULL DEFAULT 0.8, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)')

  target.exec(`CREATE TABLE IF NOT EXISTS skill_usage (
    name TEXT PRIMARY KEY,
    use_count INTEGER NOT NULL DEFAULT 0,
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  target.exec(`CREATE TABLE IF NOT EXISTS agent_execution_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    turn_id INTEGER NOT NULL,
    payload TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)

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
  )`)

  target.exec('CREATE TABLE IF NOT EXISTS user_habit (key TEXT PRIMARY KEY, imperative TEXT, reason TEXT, occurrences INTEGER NOT NULL DEFAULT 0, proposed INTEGER NOT NULL DEFAULT 0, first_seen DATETIME DEFAULT CURRENT_TIMESTAMP, last_seen DATETIME DEFAULT CURRENT_TIMESTAMP)')
  target.exec(`CREATE TABLE IF NOT EXISTS skill_patterns (
    signature TEXT PRIMARY KEY,
    tools TEXT NOT NULL,
    params_json TEXT,
    count INTEGER NOT NULL DEFAULT 1,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)
  target.exec(`CREATE TABLE IF NOT EXISTS skill_drafts (
    signature TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    drafted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  target.exec(`CREATE TABLE IF NOT EXISTS evolution_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capsule_id TEXT NOT NULL,
    genes TEXT NOT NULL,
    strategy TEXT NOT NULL DEFAULT "balanced",
    signals TEXT,
    blast_radius TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)

  target.exec(`CREATE TABLE IF NOT EXISTS skill_success (
    name TEXT PRIMARY KEY,
    total_uses INTEGER NOT NULL DEFAULT 0,
    successes INTEGER NOT NULL DEFAULT 0,
    last_result INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  target.exec('CREATE TABLE IF NOT EXISTS provider_credential (id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL, api_key TEXT NOT NULL, label TEXT, enabled INTEGER NOT NULL DEFAULT 1, last_used_at DATETIME DEFAULT "2000-01-01T00:00:00.000Z", cooldown_until DATETIME, error_count INTEGER NOT NULL DEFAULT 0, disable_reason TEXT)')

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
  )`)

  try {
    target.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      session_id UNINDEXED,
      message_id UNINDEXED,
      tokenize = 'unicode61'
    )`)
  } catch {}
  try {
    target.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      type UNINDEXED,
      memory_id UNINDEXED,
      tokenize = 'unicode61'
    )`)
  } catch {}

  return target
}

function initDatabase() {
  dbPath = path.join(app.getPath('userData'), 'aetherai.db')
  db = createEmptyDatabase(dbPath)

  try { db.exec("ALTER TABLE memory ADD COLUMN type TEXT DEFAULT 'fact'") } catch {}
  try { db.exec("ALTER TABLE memory ADD COLUMN relation_entity TEXT") } catch {}
  try { db.exec("ALTER TABLE memory ADD COLUMN relation_type TEXT") } catch {}
  try { db.exec("ALTER TABLE memory ADD COLUMN relation_target TEXT") } catch {}
  try { db.exec("ALTER TABLE memory ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0") } catch {}
  try { db.exec("ALTER TABLE memory ADD COLUMN last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP") } catch {}
  try { db.exec("ALTER TABLE memory ADD COLUMN source_session_id INTEGER") } catch {}
  try { db.exec("ALTER TABLE memory ADD COLUMN source_turn_id INTEGER") } catch {}
  try { db.exec("ALTER TABLE memory ADD COLUMN confidence REAL DEFAULT 1.0") } catch {}
  try { db.exec("ALTER TABLE memory ADD COLUMN conflicts_with INTEGER") } catch {}
  // 存量自指清理：历史 bug 中 detectConflict 曾把 conflicts_with 指向行自身
  //（[row.id, row.id]），导致 UI 出现"自己和自己冲突"的二选一，且任一按钮
  // 都会删掉这条记忆。此语句幂等，每次启动跑一遍无害。
  try { db.prepare('UPDATE memory SET conflicts_with = NULL WHERE conflicts_with = id').run() } catch {}
  // 规范化内容列 + 索引：精确查重从全表 LOWER(TRIM(content)) 扫描降为索引
  // 查找；mergeDuplicateMemories 分组同样走它（跨类型，与 findSolidifyTarget
  // 语义一致）。回填必须用共享 memNormalize（含内部空白折叠）：SQL 的
  // LOWER(TRIM()) 不折叠多空格，存量 "user likes  tea" 会得到与新写入
  // "user likes tea" 不一致的键，精确查重和启动合并都会漏。全量重算幂等，
  // 值未变的行不写，个人应用规模开销可忽略。
  try { db.exec("ALTER TABLE memory ADD COLUMN content_norm TEXT") } catch {}
  try {
    const rows = db.prepare('SELECT id, content, content_norm FROM memory').all()
    const upd = db.prepare('UPDATE memory SET content_norm = ? WHERE id = ?')
    for (const r of rows) {
      const norm = memNormalize(r.content)
      if (r.content_norm !== norm) upd.run(norm, r.id)
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_memory_content_norm ON memory(content_norm)')
  } catch {}
  // Jaccard 扫描的取数查询（findSolidifyTarget :811）按 LOWER(TRIM(type))
  // 过滤 + created_at DESC, id DESC 排序取近 500 条 —— 表达式索引避免主线程
  // 上全表扫描 + 临时排序。
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_memory_type_time ON memory (LOWER(TRIM(type)), created_at DESC, id DESC)') } catch {}
  // 启动时自动合并完全重复的记忆（幂等）：历史去重漏洞积累的存量在升级后
  // 首次启动即清零，无需再手动点"记忆去重"。个人应用规模的全表 GROUP BY
  // 开销可忽略；函数声明在模块内提升，运行期调用安全。
  try { mergeDuplicateMemories() } catch {}
  // H5 记忆来源标注：user/assistant/external/review — autoMemory 写此列，
  // 注入时 external 来源以 untrusted 包裹降权。
  try { db.exec("ALTER TABLE memory ADD COLUMN origin TEXT DEFAULT 'user'") } catch {}

  try { db.exec('CREATE INDEX IF NOT EXISTS idx_kg_edges_from ON kg_edges("from")') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_kg_edges_to ON kg_edges("to")') } catch {}

  try { require('./llm/checkpointManager').createTable(db) } catch {}
  initSkillSuccessTable()

  try { db.exec("ALTER TABLE evolution_events ADD COLUMN blast_radius TEXT"); } catch (e) {}

  try { db.exec("ALTER TABLE skill_usage ADD COLUMN state TEXT NOT NULL DEFAULT 'active'") } catch {}
  try { db.exec("ALTER TABLE skill_usage ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0") } catch {}
  try { db.exec("ALTER TABLE skill_usage ADD COLUMN created_by TEXT NOT NULL DEFAULT 'user'") } catch {}
  try { db.exec("ALTER TABLE skill_usage ADD COLUMN patch_count INTEGER NOT NULL DEFAULT 0") } catch {}
  try { db.exec("ALTER TABLE skill_usage ADD COLUMN last_viewed_at DATETIME") } catch {}
  try { db.exec("ALTER TABLE skill_usage ADD COLUMN archived_at DATETIME") } catch {}

  const cols = {
    provider: getTableColumns('provider'),
    model: getTableColumns('model'),
    persona: getTableColumns('persona'),
    session: getTableColumns('session'),
    message: getTableColumns('message'),
    user_habit: getTableColumns('user_habit'),
    agent_checkpoint: getTableColumns('agent_checkpoint'),
    provider_credential: getTableColumns('provider_credential'),
    skill_patterns: getTableColumns('skill_patterns'),
    memory: getTableColumns('memory'),
  }
  const addCol = (table, col, def) => {
    if (!cols[table].includes(col)) {
      try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`) } catch {}
    }
  }
  addCol('provider', 'api_format', "TEXT NOT NULL DEFAULT 'openai'")
  addCol('provider', 'enabled', 'INTEGER NOT NULL DEFAULT 1')
  addCol('provider', 'created_at', 'DATETIME')
  addCol('model', 'display_name', 'TEXT')
  addCol('model', 'fallback_order', 'INTEGER')
  addCol('model', 'context_window', 'INTEGER')
  addCol('model', 'input_price_per_1k', 'REAL')
  addCol('model', 'output_price_per_1k', 'REAL')
  addCol('model', 'created_at', 'DATETIME')
  addCol('persona', 'avatar', 'TEXT')
  addCol('persona', 'created_at', 'DATETIME')
  addCol('session', 'pinned', 'INTEGER NOT NULL DEFAULT 0')
  addCol('session', 'config', 'TEXT')
  addCol('session', 'updated_at', 'DATETIME')
  addCol('session', 'is_placeholder', 'INTEGER NOT NULL DEFAULT 0')
  addCol('message', 'model_used', 'TEXT')
  addCol('message', 'provider_used', 'INTEGER')
  addCol('message', 'token_count', 'INTEGER')
  addCol('message', 'latency_ms', 'INTEGER')
  addCol('message', 'status', "TEXT NOT NULL DEFAULT 'success'")
  addCol('message', 'error_message', 'TEXT')
  addCol('message', 'arena_model', 'TEXT')
  addCol('user_habit', 'proposed', "INTEGER NOT NULL DEFAULT 0")
  addCol('agent_checkpoint', 'rolled_back_at', 'DATETIME')
  addCol('skill_patterns', 'params_json', 'TEXT')
  addCol('session', 'trust_score', 'INTEGER DEFAULT 50')
  addCol('session', 'last_update', 'DATETIME')
  addCol('session', 'parent_session_id', 'INTEGER')
  addCol('session', 'status', "TEXT NOT NULL DEFAULT 'active'")
  addCol('provider_credential', 'disable_reason', 'TEXT')
  // Project Brain: workspace 列 —— 项目级记忆(architecture/conventions/decisions)
  // 的作用域。值来源：session.config JSON 字段 `workspace`
  // (chat-send.handler.js: JSON.parse(session0.config)?.workspace)；全局兜底为
  // settings 的 agent_workspace_root。NULL = 全局记忆(所有会话注入)；非 NULL =
  // 仅注入到该 workspace 的会话。注入侧只对 type='project' 做作用域过滤。
  addCol('memory', 'workspace', 'TEXT')

  // agent_task status CHECK 迁移：旧库 CHECK 只允许 5 态 (pending/running/
  // done/cancelled/error)，Phase 0 状态机扩为 7 态 (queued/plan/paused)。
  // SQLite 无法 ALTER CHECK，采用标准重建表步骤：建新表 → 拷数据 → 删旧表 → 改名。
  try {
    const agentTaskSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_task'").get()
    if (agentTaskSql && agentTaskSql.sql && !/'(queued|plan|paused)'/.test(agentTaskSql.sql)) {
      db.exec(`
        CREATE TABLE agent_task_new (
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
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME
        );
        INSERT INTO agent_task_new (id, session_id, title, content, model_id, agent_mode, status, priority, attempts, max_retry, error, result, created_at, updated_at)
          SELECT id, session_id, title, content, model_id, agent_mode, status, priority, attempts, max_retry, error, result, created_at, updated_at FROM agent_task;
        DROP TABLE agent_task;
        ALTER TABLE agent_task_new RENAME TO agent_task;
      `)
    }
  } catch {}

  try {
    const modelIds = db.prepare('SELECT id FROM model').pluck().all()
    for (const mid of modelIds) initModelScores(mid)
  } catch {}

  const existingKeys = db.prepare('SELECT key FROM settings').pluck().all()
  if (!existingKeys.includes('fallback_timeout_ms')) db.prepare("INSERT INTO settings (key, value) VALUES ('fallback_timeout_ms', '30000')").run()
  if (!existingKeys.includes('theme')) db.prepare("INSERT INTO settings (key, value) VALUES ('theme', 'light')").run()
  // Lint/Test auto-repair (Task 2.3): empty by default so the agent auto-detects
  // the project type; the user can override with explicit commands via Settings.
  if (!existingKeys.includes('lint_command')) db.prepare("INSERT INTO settings (key, value) VALUES ('lint_command', '')").run()
  if (!existingKeys.includes('test_command')) db.prepare("INSERT INTO settings (key, value) VALUES ('test_command', '')").run()

  return db
}

// ===== Provider CRUD =====
// H2 key exposure: list reads are renderer-facing (provider:list IPC) and
// return a MASKED api_key. Anything that builds LLM request headers must use
// getProvider / getProvidersDecrypted instead — never the masked list.
function getProviders() {
  return db.prepare('SELECT * FROM provider ORDER BY id').all().map(r => ({ ...r, api_key: maskKey(decryptKey(r.api_key)) }))
}
function getProvidersDecrypted() {
  return db.prepare('SELECT * FROM provider ORDER BY id').all().map(r => ({ ...r, api_key: decryptKey(r.api_key) }))
}
// Returns the DECRYPTED key — internal LLM request path only (chat-send,
// openaiChatHandler, backgroundTasks, arena, provider test/fetch). Never
// forward the result over IPC without masking.
function getProvider(id) {
  const row = db.prepare('SELECT * FROM provider WHERE id = ?').get(id)
  return row ? { ...row, api_key: decryptKey(row.api_key) } : null
}
function getProviderDecrypted(id) { return getProvider(id) }
function addProvider({ name, api_url, api_key, api_format = 'openai', enabled = 1 }) {
  const encrypted = encryptKey(api_key)
  const info = db.prepare('INSERT INTO provider (name, api_url, api_key, api_format, enabled) VALUES (?, ?, ?, ?, ?)').run(name, api_url, encrypted, api_format, enabled)
  return { lastInsertRowid: Number(info.lastInsertRowid) }
}
function updateProvider(id, data) {
  // "留空/掩码 = 不修改"（H2）：编辑表单回显掩码值或留空时，不得覆盖已存 key。
  const patch = { ...data }
  if ('api_key' in patch && isMaskedOrEmptyKey(patch.api_key)) delete patch.api_key
  // M8: column-name whitelist — callers can no longer inject arbitrary SQL
  // through Object.keys(data) interpolation.
  const keys = safeKeys('provider', patch)
  if (!keys.length) return
  const values = keys.map(k => k === 'api_key' ? encryptKey(patch[k]) : patch[k])
  db.prepare(`UPDATE provider SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(...values, id)
}
function deleteProvider(id) {
  db.prepare('DELETE FROM model WHERE provider_id = ?').run(id)
  db.prepare('DELETE FROM provider WHERE id = ?').run(id)
}

// ===== Model CRUD =====
function getModels(providerId) {
  return db.prepare('SELECT * FROM model WHERE provider_id = ? ORDER BY fallback_order ASC, id ASC').all(providerId)
}
// NOTE(H2): this stays DECRYPTED on purpose — arena.handler builds request
// headers straight from these rows, and its only IPC exit (model:list-all)
// already strips api_key at the handler layer. Do NOT mask here.
function getAllModels() {
  return db.prepare('SELECT m.*, p.name as provider_name, p.api_url, p.api_key FROM model m JOIN provider p ON m.provider_id = p.id WHERE p.enabled = 1 ORDER BY m.provider_id, m.id').all().map(r => ({ ...r, api_key: decryptKey(r.api_key) }))
}
function getModel(id) {
  return db.prepare('SELECT * FROM model WHERE id = ?').get(id) || null
}
function addModel({ provider_id, model_name, display_name = null, is_primary = 0, fallback_order = null, context_window = null, input_price_per_1k = null, output_price_per_1k = null }) {
  const info = db.prepare('INSERT INTO model (provider_id, model_name, display_name, is_primary, fallback_order, context_window, input_price_per_1k, output_price_per_1k) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(provider_id, model_name, display_name, is_primary, fallback_order, context_window, input_price_per_1k, output_price_per_1k)
  return { lastInsertRowid: Number(info.lastInsertRowid) }
}
function updateModel(id, data) {
  const keys = safeKeys('model', data)
  if (!keys.length) return
  db.prepare(`UPDATE model SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map(k => data[k]), id)
}
function deleteModel(id) {
  db.prepare('DELETE FROM model WHERE id = ?').run(id)
}
function getFallbackChain(providerId) {
  return db.prepare('SELECT * FROM model WHERE provider_id = ? AND fallback_order IS NOT NULL ORDER BY fallback_order ASC').all(providerId)
}

// ===== Persona CRUD =====
function getPersonas() {
  return db.prepare('SELECT * FROM persona ORDER BY id').all()
}
function getPersona(id) {
  return db.prepare('SELECT * FROM persona WHERE id = ?').get(id) || null
}
function addPersona({ name, prompt, avatar = null }) {
  const info = db.prepare('INSERT INTO persona (name, prompt, avatar) VALUES (?, ?, ?)').run(name, prompt, avatar)
  return { lastInsertRowid: Number(info.lastInsertRowid) }
}
function updatePersona(id, data) {
  const keys = safeKeys('persona', data)
  if (!keys.length) return
  db.prepare(`UPDATE persona SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map(k => data[k]), id)
}
function deletePersona(id) {
  db.prepare('DELETE FROM persona WHERE id = ?').run(id)
}

// ===== Session CRUD =====
function getSessions() {
  return db.prepare("SELECT s.*, (SELECT content FROM message WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message FROM session s ORDER BY s.pinned DESC, s.updated_at DESC").all()
}
function getSession(id) {
  return db.prepare('SELECT * FROM session WHERE id = ?').get(id) || null
}
function localNow() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function createSession({ title = '新会话', persona_id = null, parentSessionId = null }) {
  const info = db.prepare('INSERT INTO session (title, persona_id, parent_session_id, updated_at, is_placeholder) VALUES (?, ?, ?, ?, 1)')
    .run(title, persona_id, parentSessionId, localNow())
  return { lastInsertRowid: Number(info.lastInsertRowid) }
}

function pruneEmptySessions() {
  db.prepare(`DELETE FROM session WHERE is_placeholder = 1 AND NOT EXISTS (SELECT 1 FROM message WHERE message.session_id = session.id)`).run()
}
function renameSession(id, title) {
  db.prepare('UPDATE session SET title = ?, updated_at = ? WHERE id = ?').run(title, localNow(), id)
}
function pinSession(id, pinned = 1) {
  db.prepare('UPDATE session SET pinned = ?, updated_at = ? WHERE id = ?').run(pinned, localNow(), id)
}
function deleteSession(id) {
  const del = db.transaction((sid) => {
    try { db.prepare('DELETE FROM messages_fts WHERE session_id = ?').run(sid) } catch {}
    db.prepare('DELETE FROM message WHERE session_id = ?').run(sid)
    try { db.prepare('DELETE FROM agent_checkpoint WHERE session_id = ?').run(sid) } catch {}
    try { db.prepare('DELETE FROM agent_execution_log WHERE session_id = ?').run(sid) } catch {}
    try { db.prepare('DELETE FROM usage_log WHERE session_id = ?').run(sid) } catch {}
    try { db.prepare('UPDATE memory SET source_session_id = NULL WHERE source_session_id = ?').run(sid) } catch {}
    db.prepare('DELETE FROM session WHERE id = ?').run(sid)
    return sid
  })
  del(id)
}
function touchSession(id) {
  db.prepare('UPDATE session SET updated_at = ? WHERE id = ?').run(localNow(), id)
}

function updateSession(id, fields) {
  const allowed = ['title', 'persona_id', 'pinned', 'config', 'status', 'parent_session_id']
  const sets = []
  const vals = []
  for (const k of allowed) {
    if (fields[k] !== undefined) {
      sets.push(`${k} = ?`)
      vals.push(typeof fields[k] === 'object' ? JSON.stringify(fields[k]) : fields[k])
    }
  }
  if (!sets.length) return
  sets.push('updated_at = ?')
  vals.push(localNow())
  vals.push(id)
  db.prepare(`UPDATE session SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}
function getSessionConfig(id) {
  const row = db.prepare('SELECT config, persona_id FROM session WHERE id = ?').get(id)
  if (!row) return null
  try { return JSON.parse(row.config || 'null') } catch { return null }
}
function setSessionConfig(id, config) {
  db.prepare('UPDATE session SET config = ? WHERE id = ?').run(JSON.stringify(config), id)
}

// ===== Message CRUD =====
function getMessages(sessionId) {
  return db.prepare('SELECT * FROM message WHERE session_id = ? ORDER BY id ASC').all(sessionId)
}
function addMessage({ session_id, role, content, model_used = null, provider_used = null, token_count = null, latency_ms = null, status = 'success', error_message = null, arena_model = null }) {
  const info = db.prepare('INSERT INTO message (session_id, role, content, model_used, provider_used, token_count, latency_ms, status, error_message, arena_model) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(session_id, role, content, model_used, provider_used, token_count, latency_ms, status, error_message, arena_model)
  try { db.prepare('UPDATE session SET is_placeholder = 0 WHERE id = ? AND is_placeholder = 1').run(session_id) } catch {}
  try { db.prepare('INSERT INTO messages_fts (content, session_id, message_id) VALUES (?, ?, ?)').run(String(content || ''), session_id, Number(info.lastInsertRowid)) } catch {}
  return { lastInsertRowid: Number(info.lastInsertRowid) }
}
function updateMessage(id, data) {
  const keys = safeKeys('message', data)
  if (!keys.length) return
  db.prepare(`UPDATE message SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map(k => data[k]), id)
}

// ===== Settings CRUD =====
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? row.value : null
}
async function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}
function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const result = {}
  rows.forEach(r => result[r.key] = r.value)
  return result
}

// ===== Agent Task CRUD (persistent background tasks) =====
function createAgentTask({ session_id = null, title, content, model_id = null, agent_mode = 'ask', priority = 0, max_retry = 2 }) {
  const info = db.prepare('INSERT INTO agent_task (session_id, title, content, model_id, agent_mode, priority, max_retry) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(session_id, title, content, model_id, agent_mode, priority, max_retry)
  return Number(info.lastInsertRowid)
}
function getAgentTask(id) {
  const row = db.prepare('SELECT * FROM agent_task WHERE id = ?').get(id)
  if (!row) return null
  return { ...row, id: Number(row.id), session_id: row.session_id ? Number(row.session_id) : null, model_id: row.model_id ? Number(row.model_id) : null, priority: Number(row.priority), attempts: Number(row.attempts), max_retry: Number(row.max_retry) }
}
// Whitelisted patch columns only — prevents arbitrary SQL injection via caller.
const AGENT_TASK_PATCH_COLS = new Set(['status', 'error', 'result', 'attempts', 'priority', 'max_retry'])
function updateAgentTask(id, patch) {
  const cols = Object.keys(patch || {}).filter(k => AGENT_TASK_PATCH_COLS.has(k))
  if (!cols.length) return
  const sets = cols.map(k => `${k} = ?`).join(', ')
  const vals = cols.map(k => patch[k])
  db.prepare(`UPDATE agent_task SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...vals, id)
}
function listAgentTasks(limit = 100) {
  return db.prepare('SELECT * FROM agent_task ORDER BY priority DESC, id DESC LIMIT ?')
    .all(limit)
    .map(r => ({ ...r, id: Number(r.id), session_id: r.session_id ? Number(r.session_id) : null, model_id: r.model_id ? Number(r.model_id) : null, priority: Number(r.priority), attempts: Number(r.attempts), max_retry: Number(r.max_retry) }))
}

// ===== Scheduled Tasks CRUD (Task 4.3) =====
function getScheduledTasks() {
  const rows = db.prepare('SELECT * FROM scheduled_task ORDER BY id ASC').all()
  return rows.map(r => {
    let config = {}
    try { config = JSON.parse(r.config || '{}') } catch { config = {} }
    return { id: Number(r.id), name: r.name, type: r.type, interval_ms: Number(r.interval_ms), enabled: Number(r.enabled) === 1, config, last_run_at: r.last_run_at, created_at: r.created_at }
  })
}
function addScheduledTask({ name, type, interval_ms, enabled = 1, config = {} }) {
  const info = db.prepare('INSERT INTO scheduled_task (name, type, interval_ms, enabled, config) VALUES (?, ?, ?, ?, ?)')
    .run(name, type, interval_ms, enabled ? 1 : 0, JSON.stringify(config || {}))
  return { lastInsertRowid: Number(info.lastInsertRowid) }
}
function getScheduledTask(id) {
  const row = db.prepare('SELECT * FROM scheduled_task WHERE id = ?').get(id)
  if (!row) return null
  let config = {}
  try { config = JSON.parse(row.config || '{}') } catch { config = {} }
  return { id: Number(row.id), name: row.name, type: row.type, interval_ms: Number(row.interval_ms), enabled: Number(row.enabled) === 1, config, last_run_at: row.last_run_at, created_at: row.created_at }
}
function deleteScheduledTask(id) {
  db.prepare('DELETE FROM scheduled_task WHERE id = ?').run(id)
}
function markScheduledTaskRun(id) {
  db.prepare('UPDATE scheduled_task SET last_run_at = ? WHERE id = ?').run(localNow(), id)
}

// ===== Arena / ELO =====
function getModelScores() {
  return db.prepare(`SELECT ms.*, m.model_name, p.name as provider_name FROM model_score ms JOIN model m ON ms.model_id=m.id JOIN provider p ON m.provider_id=p.id ORDER BY ms.intent, ms.score DESC`).all()
}
function initModelScores(modelId) {
  for (const intent of ['coding', 'math', 'translation', 'summary', 'general']) {
    db.prepare("INSERT OR IGNORE INTO model_score (model_id, intent, score, win_count, total_count) VALUES (?,?,1000,0,0)").run(modelId)
  }
}
function updateElo(winnerModelId, loserModelIds, intent) {
  const K = 32
  const readScore = (modelId) => {
    const row = db.prepare('SELECT score FROM model_score WHERE model_id=? AND intent=?').get(modelId, intent)
    return row ? row.score : 1000
  }
  const upsertScore = (modelId, newScore, incrementWin) => {
    db.prepare('INSERT OR IGNORE INTO model_score (model_id, intent, score, win_count, total_count) VALUES (?,?,1000,0,0)').run(modelId, intent)
    db.prepare('UPDATE model_score SET score = ?, win_count = win_count + ?, total_count = total_count + 1 WHERE model_id = ? AND intent = ?').run(newScore, incrementWin ? 1 : 0, modelId, intent)
  }
  // ELO update is fully synchronous (better-sqlite3 read+write), wrapped in a
  // single transaction so all losers for one intent are updated atomically.
  const eloTx = db.transaction(() => {
    for (const loserId of loserModelIds) {
      const ws = readScore(winnerModelId)
      const ls = readScore(loserId)
      const expected = 1 / (1 + Math.pow(10, (ls - ws) / 400))
      const newW = Math.round((ws + K * (1 - expected)) * 10) / 10
      const newL = Math.round((ls + K * (0 - (1 - expected))) * 10) / 10
      upsertScore(winnerModelId, newW, true)
      upsertScore(loserId, newL, false)
    }
  })
  // Keep the _eloMutex serialization to prevent lost-update races across calls.
  const work = () => eloTx()
  return _eloMutex = _eloMutex.catch(() => {}).then(work)
}
async function recordArenaVote({ prompt, winnerModelId, winnerModelName, loserModelIds, loserModelNames, intent }) {
  db.prepare('INSERT INTO arena_vote (prompt, intent, winner_model_id, winner_model_name, loser_model_ids, loser_model_names) VALUES (?, ?, ?, ?, ?, ?)')
    .run(prompt, intent, winnerModelId, winnerModelName, JSON.stringify(loserModelIds), JSON.stringify(loserModelNames))
  if (winnerModelId && loserModelIds.length > 0) await updateElo(winnerModelId, loserModelIds, intent)
}

// ── Arena 2.0: personal benchmark suite (review P0-3) ───────────────────────
function listArenaBenchmarks() {
  return db.prepare('SELECT * FROM arena_benchmark ORDER BY created_at DESC').all()
    .map(r => ({ ...r, tasks: JSON.parse(r.tasks || '[]'), model_ids: JSON.parse(r.model_ids || '[]'), results: r.results ? JSON.parse(r.results) : null }))
}
function saveArenaBenchmark({ id = null, name, tasks, modelIds }) {
  const t = JSON.stringify(Array.isArray(tasks) ? tasks : [])
  const m = JSON.stringify(Array.isArray(modelIds) ? modelIds : [])
  if (id != null) {
    db.prepare('UPDATE arena_benchmark SET name = ?, tasks = ?, model_ids = ? WHERE id = ?').run(name, t, m, id)
    return { id }
  }
  const info = db.prepare('INSERT INTO arena_benchmark (name, tasks, model_ids) VALUES (?, ?, ?)').run(name, t, m)
  return { id: Number(info.lastInsertRowid) }
}
function deleteArenaBenchmark(id) {
  db.prepare('DELETE FROM arena_benchmark WHERE id = ?').run(id)
}
function updateArenaBenchmarkResults(id, results, lastRun) {
  db.prepare('UPDATE arena_benchmark SET results = ?, last_run = ? WHERE id = ?').run(JSON.stringify(results), lastRun, id)
}
// Average observed latency per model_id (from successful usage_log rows).
// Used by modelRouter's auto mode to blend latency into the model score.
function getModelLatency() {
  const rows = db.prepare(`SELECT m.id AS model_id, AVG(u.latency_ms) AS avg_latency
    FROM usage_log u JOIN model m ON m.model_name = u.model_name AND m.provider_id = u.provider_id
    WHERE u.status = 200 AND u.latency_ms IS NOT NULL
    GROUP BY m.id`).all()
  const out = {}
  for (const r of rows) {
    if (r.model_id != null) out[Number(r.model_id)] = Number(r.avg_latency)
  }
  return out
}
// ── Arena 2.0 leaderboard: per-model usage metrics from real traffic ────────
// Aggregates usage_log rows per configured model: request count, average
// latency, accumulated cost, success share. Read-only; no new tables.
function getModelUsageMetrics() {
  return db.prepare(`
    SELECT m.id AS model_id, m.model_name, p.name AS provider_name,
           COUNT(*) AS run_count,
           AVG(u.latency_ms) AS avg_latency_ms,
           SUM(u.cost) AS total_cost_usd,
           SUM(CASE WHEN u.status = 200 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS success_rate
    FROM usage_log u
    JOIN model m ON m.model_name = u.model_name AND m.provider_id = u.provider_id
    JOIN provider p ON p.id = m.provider_id
    GROUP BY m.id
    ORDER BY run_count DESC`).all()
    .map(r => ({
      model_id: Number(r.model_id),
      model_name: r.model_name,
      provider_name: r.provider_name,
      run_count: Number(r.run_count),
      avg_latency_ms: r.avg_latency_ms == null ? null : Number(r.avg_latency_ms),
      total_cost_usd: r.total_cost_usd == null ? null : Number(r.total_cost_usd),
      success_rate: r.success_rate == null ? null : Number(r.success_rate),
    }))
}
function getPrimaryModel() {
  const row = db.prepare('SELECT m.id, m.provider_id FROM model m JOIN provider p ON m.provider_id = p.id WHERE p.enabled = 1 ORDER BY m.is_primary DESC, m.id ASC LIMIT 1').get()
  return row ? { id: Number(row.id), provider_id: Number(row.provider_id) } : null
}
function classifyIntent(text) {
  if (!text) return 'general'
  const t = text.toLowerCase()
  if (/\b(def |class |import |function|debug|bug|compile|error|git|bash|cmd|docker|sql|api|rest)\b/.test(t) || /代码|编程|python|javascript|写一个|实现|算法|terminal/i.test(t)) return 'coding'
  if (/数|算|方程|公式|证明|积分|导数|矩阵|定理|概率|统计|calculate|solve|math|equation/i.test(t)) return 'math'
  if (/翻译|english|chinese|translate|日语|英语|法语/i.test(t)) return 'translation'
  if (/总结|摘要|概括|summarize|summarise|提炼/i.test(t)) return 'summary'
  return 'general'
}
function autoRoute(intent) {
  const scores = db.prepare(`SELECT ms.score, ms.model_id, m.model_name, m.provider_id, p.api_url, p.api_key, p.name as provider_name FROM model_score ms JOIN model m ON ms.model_id = m.id JOIN provider p ON m.provider_id = p.id WHERE ms.intent=? AND p.enabled=1 ORDER BY ms.score DESC LIMIT 1`).all(intent)
  if (scores.length > 0) {
    const best = scores[0]
    return { model_id: best.model_id, model_name: best.model_name, provider_id: best.provider_id, api_url: best.api_url, api_key: decryptKey(best.api_key), route_reason: `ELO ${best.score.toFixed(0)}` }
  }
  const m2 = db.prepare('SELECT m.id, m.model_name, p.api_url, p.api_key FROM model m JOIN provider p ON m.provider_id=p.id WHERE m.is_primary=1 AND p.enabled=1 LIMIT 1').get()
  if (m2) return { model_id: Number(m2.id), model_name: m2.model_name, api_url: m2.api_url, api_key: decryptKey(m2.api_key), route_reason: 'Primary model' }
  return null
}

// ===== Memory CRUD =====
function getMemories(limit) {
  const q = limit ? `LIMIT ${Math.max(1, Math.floor(limit))}` : ''
  return db.prepare(`SELECT * FROM memory ORDER BY created_at DESC ${q}`).all()
}
// Project Brain: workspace 作用域读取。workspace 来自 session.config JSON 的
// `workspace` 字段(chat-send.handler.js: JSON.parse(session0.config)?.workspace；
// 全局兜底 settings 的 agent_workspace_root)。返回全局行(workspace IS NULL)
// + 当前 workspace 行，当前 workspace 行优先(ORDER BY (workspace IS NULL) ASC)，
// 供 prefetch 的项目块与 memory:list 的 {workspace} 过滤使用。未传 workspace
// 时回退全量 getMemories()(旧行为)。
function getMemoriesScoped(workspace) {
  if (!workspace) return getMemories()
  return db.prepare('SELECT * FROM memory WHERE workspace IS NULL OR workspace = ? ORDER BY (workspace IS NULL) ASC, created_at DESC, id DESC').all(workspace)
}
function addMemory({ content, type, source_session_id, workspace }) {
  // 手动添加与自动写入共用同一条去重入口（Hermes 式：重复在写入时拦截）。
  // source_session_id / workspace 为可选透传：undo 重建与 JSON 导入需要把
  // 原行的会话来源和工作区作用域带回来，否则项目记忆会静默降级为全局。
  return addMemoryWithProvenance(content, type, source_session_id ?? null, 'user', null, workspace)
}

// 写入层查重：返回应 solidify 的已有行 id，无重复返回 null。
// 精确匹配不限类型 —— 同一句话换个类型标签（fact/context）仍是同一条记忆；
// 改写级 Jaccard 扫描仅限同类型近 500 条；relation 是结构化三元组，只做精确。
function findSolidifyTarget(content, type) {
  try {
    const t = String(type || 'fact').toLowerCase()
    // content_norm 列（迁移回填 + 写入维护）带索引，精确匹配 O(log n)。
    const exact = db.prepare('SELECT id FROM memory WHERE content_norm = ? ORDER BY id ASC LIMIT 1')
      .get(memNormalize(String(content)))
    if (exact) return exact.id
    if (t === 'relation') return null
    const kw = memKeywords(content)
    if (kw.size === 0) return null
    const rows = db.prepare('SELECT id, content FROM memory WHERE LOWER(TRIM(type)) = ? ORDER BY created_at DESC, id DESC LIMIT 500').all(t)
    const nTarget = memNormalize(content)
    for (const r of rows) {
      if (memNormalize(r.content) === nTarget) return r.id // 大小写/空白变体
      const rk = memKeywords(r.content)
      let inter = 0
      for (const k of kw) if (rk.has(k)) inter++
      if (inter >= 2 && memJaccard(kw, rk) >= MEM_SIMILAR_JACCARD) return r.id
    }
  } catch {}
  return null
}

function addMemoryWithProvenance(content, type, sourceSessionId, origin, relationMeta, workspace) {
  const t = String(type || 'fact')
  const c = String(content || '').trim()
  if (!c) return { lastInsertRowid: null }
  // 写入层去重（Hermes 式）：自动提取 / memory_save 工具 / 手动添加 /
  // 备份导入四条路径全部经此处。命中已有记忆时 solidify（confidence +0.1
  // 封顶 1.0）而不是插入副本。duplicate 标记供调用方跳过后续的 origin
  // 改写与冲突标记（重新观察到同一事实不是冲突，也不能覆盖原始来源）。
  const dupId = findSolidifyTarget(c, t)
  if (dupId != null) {
    try { db.prepare('UPDATE memory SET confidence = MIN(COALESCE(confidence, 1.0) + 0.1, 1.0) WHERE id = ?').run(dupId) } catch {}
    return { lastInsertRowid: Number(dupId), duplicate: true }
  }
  // relation 条目带关系三元组字段；其余类型走通用插入。两条路径都写
  // content_norm，保证启动合并和精确查重对全类型生效。workspace 为可选
  // 第 6 参：未传(undefined/null)时落 NULL = 全局记忆，旧行为不变。
  let info
  if (t === 'relation' && relationMeta) {
    info = db.prepare('INSERT INTO memory (content, type, relation_entity, relation_type, relation_target, source_session_id, confidence, origin, content_norm, workspace) VALUES (?, ?, ?, ?, ?, ?, 1.0, ?, ?, ?)')
      .run(c, t, relationMeta.entity1 || null, relationMeta.relation || null, relationMeta.entity2 || null, sourceSessionId, origin || 'user', memNormalize(c), workspace || null)
  } else {
    info = db.prepare('INSERT INTO memory (content, type, source_session_id, confidence, origin, content_norm, workspace) VALUES (?, ?, ?, 1.0, ?, ?, ?)').run(c, t, sourceSessionId, origin || 'user', memNormalize(c), workspace || null)
  }
  try { db.prepare('INSERT INTO memories_fts (content, type, memory_id) VALUES (?, ?, ?)').run(c, t, Number(info.lastInsertRowid)) } catch {}
  return { lastInsertRowid: Number(info.lastInsertRowid), duplicate: false }
}
function addMemoriesBatch(entries) {
  const insert = db.transaction((list) => {
    for (const e of list) addMemoryWithProvenance(e.content, e.type, e.sourceSessionId)
    return list.length
  })
  return insert(entries || [])
}
function updateMemory(id, { content }) {
  if (!content) return
  // 内容变更时同步维护 content_norm，否则该行的精确查重从此失准。
  db.prepare('UPDATE memory SET content = ?, content_norm = ? WHERE id = ?').run(content, memNormalize(content), id)
  try { db.prepare('UPDATE memories_fts SET content = ? WHERE memory_id = ?').run(String(content || ''), Number(id)) } catch {}
}
function deleteMemory(id) {
  db.prepare('DELETE FROM memory WHERE id = ?').run(id)
  try { db.prepare('DELETE FROM memories_fts WHERE memory_id = ?').run(Number(id)) } catch {}
}
// 合并完全重复的记忆：按 content_norm 分组（不分类型 —— 与 findSolidifyTarget
// 的精确层语义一致，同一句话换个类型标签仍是同一条记忆），保留最早一条
// (id 最小)，删除其余并同步清理 FTS、把 conflicts_with 引用改指保留行。
// NULL content_norm 的行不参与合并（防御异常数据被整组误删）。
function mergeDuplicateMemories() {
  let removed = 0
  try {
    const groups = db.prepare(
      `SELECT content_norm AS cn, MIN(id) AS keep_id
       FROM memory GROUP BY content_norm HAVING COUNT(*) > 1 AND content_norm IS NOT NULL`
    ).all()
    // 原子合并：conflicts_with 改指、删行、清 FTS 三步同生共死。此前各自
    // 独立执行且 FTS 清理失败被吞掉 —— 中途出错会留下"记忆已删但 FTS 残留
    // /指针改了一半"的半成品状态。事务内任一步失败即整体回滚。
    let txRemoved = 0
    const mergeTx = db.transaction(() => {
      for (const g of groups) {
        const toDelete = db.prepare(
          'SELECT id FROM memory WHERE content_norm = ? AND id <> ?'
        ).all(g.cn, g.keep_id)
        for (const row of toDelete) {
          db.prepare('UPDATE memory SET conflicts_with = ? WHERE conflicts_with = ?').run(g.keep_id, row.id)
          db.prepare('DELETE FROM memory WHERE id = ?').run(row.id)
          db.prepare('DELETE FROM memories_fts WHERE memory_id = ?').run(Number(row.id))
          txRemoved++
        }
      }
    })
    mergeTx()
    removed += txRemoved
  } catch (e) {
    log.warn('mergeDuplicateMemories failed:', e && e.message)
  }
  return { removed }
}
function incrementMemoryAccess(id) {
  try { db.prepare('UPDATE memory SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?').run(localNow(), id) } catch {}
}
function getMemoryConflicts() {
  try {
    const rows = db.prepare('SELECT m.*, c.content as conflicting_content, c.type as conflicting_type FROM memory m JOIN memory c ON c.id = m.conflicts_with WHERE m.conflicts_with IS NOT NULL ORDER BY m.created_at DESC').all()
    return rows.map(r => ({ memoryId: r.id, content: r.content, type: r.type, conflictingId: r.conflicts_with, conflictingContent: r.conflicting_content, conflictingType: r.conflicting_type }))
  } catch { return [] }
}
function resolveMemoryConflict(keepId, removeId) {
  try { db.prepare('DELETE FROM memory WHERE id = ?').run(removeId) } catch {}
  try { db.prepare('UPDATE memory SET conflicts_with = NULL WHERE id = ?').run(keepId) } catch {}
}

// ===== Skill Usage & Success Rate =====
function recordSkillResult(name, success) {
  try {
    db.prepare('INSERT INTO skill_success (name, total_uses, successes, last_result) VALUES (?, 1, ?, ?) ON CONFLICT(name) DO UPDATE SET total_uses=total_uses+1, successes=successes+?, last_result=?, updated_at=CURRENT_TIMESTAMP')
      .run(name, success ? 1 : 0, success ? 1 : 0, success ? 1 : 0)
  } catch {}
}
function getSkillStats() {
  try {
    const rows = db.prepare('SELECT name, total_uses, successes, last_result, updated_at FROM skill_success ORDER BY total_uses DESC').all()
    return rows.map(r => ({ name: r.name, totalUses: r.total_uses || 0, successes: r.successes || 0, lastResult: !!r.last_result, successRate: r.total_uses > 0 ? ((r.successes || 0) / r.total_uses) : 0, updatedAt: r.updated_at }))
  } catch { return [] }
}
function initSkillSuccessTable() {
  try { db.exec(`CREATE TABLE IF NOT EXISTS skill_success (name TEXT PRIMARY KEY, total_uses INTEGER NOT NULL DEFAULT 0, successes INTEGER NOT NULL DEFAULT 0, last_result INTEGER DEFAULT 1, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`) } catch {}
}
// Skill draft name sanitizing (M10): draft names become file names under
// <userData>/skills/drafts/. Reject anything that could escape the drafts
// dir — path separators, `..`, leading dot — and collapse the rest through
// path.basename as defense in depth.
function sanitizeSkillName(name) {
  const raw = String(name == null ? '' : name).trim()
  if (!raw) return null
  if (raw.includes('/') || raw.includes('\\')) return null
  if (raw.includes('..')) return null
  const base = path.basename(raw)
  if (!base || base === '.' || base === '..' || base.startsWith('.')) return null
  if (/[<>:"|?*\x00-\x1f]/.test(base)) return null
  return base
}
function autoDraftSkill(name, body, description) {
  try {
    const safeName = sanitizeSkillName(name)
    if (!safeName) return false
    const { app } = require('electron')
    const dir = path.join(app.getPath('userData'), 'skills', 'drafts')
    fs.mkdirSync(dir, { recursive: true })
    const fp = path.join(dir, `${safeName}.md`)
    if (!fs.existsSync(fp)) {
      const md = `---\nname: ${safeName}\ndescription: ${description || 'Auto-drafted skill'}\nauto_draft: true\n---\n\n${body}\n\n(This skill was auto-drafted from successful usage. Edit or delete it via Settings → Skills.)`
      fs.writeFileSync(fp, md, 'utf8')
    }
    return true
  } catch { return false }
}

// ===== Agent Audit Log =====
function addAuditLog({ sessionId, turnId, payload }) {
  db.prepare('INSERT INTO agent_execution_log (session_id, turn_id, payload) VALUES (?, ?, ?)').run(sessionId, turnId, JSON.stringify(payload))
}
function addCheckpoint({ sessionId, turnId, stepIndex, messages, toolTrace = [], meta = {} }) {
  const cm = require('./llm/checkpointManager')
  return cm.save(db, sessionId, turnId, stepIndex, messages, toolTrace, meta)
}
function getCheckpoints(sessionId, limit = 20) {
  const cm = require('./llm/checkpointManager')
  return cm.listForSession(db, sessionId, limit)
}
function deleteCheckpoints(sessionId) {
  const cm = require('./llm/checkpointManager')
  cm.deleteForSession(db, sessionId)
}
function deleteCheckpoint(id) {
  const cm = require('./llm/checkpointManager')
  cm.deleteOne(db, id)
}
function addAgentCheckpoint({ sessionId, messageId, toolName, args, affectedPaths, snapshot }) {
  const info = db.prepare('INSERT INTO agent_checkpoint (session_id, message_id, tool_name, args, affected_paths, snapshot) VALUES (?, ?, ?, ?, ?, ?)')
    .run(sessionId, messageId, toolName, JSON.stringify(args || {}), JSON.stringify(affectedPaths || []), JSON.stringify(snapshot || {}))
  return { lastInsertRowid: Number(info.lastInsertRowid) }
}
function getAgentCheckpoint(id) {
  const row = db.prepare('SELECT * FROM agent_checkpoint WHERE id = ?').get(id)
  if (!row) return null
  try { row.args = JSON.parse(row.args || '{}') } catch { row.args = {} }
  try { row.affected_paths = JSON.parse(row.affected_paths || '[]') } catch { row.affected_paths = [] }
  try { row.snapshot = JSON.parse(row.snapshot || '{}') } catch { row.snapshot = {} }
  return row
}
function markAgentCheckpointRolledBack(id) {
  db.prepare('UPDATE agent_checkpoint SET rolled_back_at = ? WHERE id = ?').run(localNow(), id)
}
function listAgentCheckpoints(sessionId, messageId = null) {
  const where = messageId ? 'session_id = ? AND message_id = ?' : 'session_id = ?'
  const rows = db.prepare(`SELECT id, session_id, message_id, tool_name, args, affected_paths, rolled_back_at, created_at FROM agent_checkpoint WHERE ${where} ORDER BY id DESC`).all(messageId ? sessionId : messageId, sessionId)
  for (const row of rows) {
    try { row.args = JSON.parse(row.args || '{}') } catch { row.args = {} }
    try { row.affected_paths = JSON.parse(row.affected_paths || '[]') } catch { row.affected_paths = [] }
  }
  return rows
}
function getAuditLog(sessionId, limit = 50) {
  const rows = db.prepare('SELECT * FROM agent_execution_log WHERE session_id = ? ORDER BY id DESC LIMIT ?').all(sessionId, limit)
  for (const row of rows) try { row.payload = JSON.parse(row.payload || '{}') } catch { row.payload = {} }
  return rows
}
function logUsage({ session_id = null, provider_id = null, provider_name = null, model_name = null, prompt_tokens = 0, completion_tokens = 0, total_tokens = 0, cache_read_tokens = 0, cache_creation_tokens = 0, cost = 0, latency_ms = null, status = 200, source = 'chat' }) {
  db.prepare('INSERT INTO usage_log (session_id, provider_id, provider_name, model_name, prompt_tokens, completion_tokens, total_tokens, cache_read_tokens, cache_creation_tokens, cost, latency_ms, status, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(session_id, provider_id, provider_name, model_name, prompt_tokens, completion_tokens, total_tokens, cache_read_tokens, cache_creation_tokens, cost, latency_ms, status, source)
}
function getUsageStats({ since = null, until = null } = {}) {
  const w = buildRangeWhere(since, until)
  const row = db.prepare(`SELECT COUNT(*) as requests, COALESCE(SUM(prompt_tokens),0) as prompt_tokens, COALESCE(SUM(completion_tokens),0) as completion_tokens, COALESCE(SUM(total_tokens),0) as total_tokens, COALESCE(SUM(cache_read_tokens),0) as cache_read_tokens, COALESCE(SUM(cache_creation_tokens),0) as cache_creation_tokens, COALESCE(SUM(cost),0) as cost, COALESCE(SUM(latency_ms),0) as latency_ms_sum, COUNT(latency_ms) as latency_count FROM usage_log ${w.where}`).get(...w.params)
  if (!row) return { requests: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, cost: 0, latency_avg: 0 }
  return { requests: Number(row.requests) || 0, prompt_tokens: Number(row.prompt_tokens) || 0, completion_tokens: Number(row.completion_tokens) || 0, total_tokens: Number(row.total_tokens) || 0, cache_read_tokens: Number(row.cache_read_tokens) || 0, cache_creation_tokens: Number(row.cache_creation_tokens) || 0, cost: Number(row.cost) || 0, latency_avg: row.latency_count > 0 ? Number(row.latency_ms_sum) / Number(row.latency_count) : 0 }
}
function getUsageByProvider({ since = null, until = null } = {}) {
  const w = buildRangeWhere(since, until)
  return db.prepare(`SELECT provider_name, COUNT(*) as requests, COALESCE(SUM(total_tokens),0) as total_tokens, COALESCE(SUM(cost),0) as cost FROM usage_log ${w.where} GROUP BY provider_name ORDER BY cost DESC`).all(...w.params)
}
function getUsageByModel({ since = null, until = null } = {}) {
  const w = buildRangeWhere(since, until)
  return db.prepare(`SELECT model_name, COUNT(*) as requests, COALESCE(SUM(total_tokens),0) as total_tokens, COALESCE(SUM(cost),0) as cost FROM usage_log ${w.where} GROUP BY model_name ORDER BY cost DESC`).all(...w.params)
}
function getUsageDaily({ since = null, until = null } = {}) {
  const w = buildRangeWhere(since, until)
  return db.prepare(`SELECT date(created_at) as day, COUNT(*) as requests, COALESCE(SUM(total_tokens),0) as total_tokens, COALESCE(SUM(cost),0) as cost FROM usage_log ${w.where} GROUP BY day ORDER BY day ASC`).all(...w.params)
}
function getUsageLog({ limit = 200, since = null, until = null } = {}) {
  const w = buildRangeWhere(since, until)
  return db.prepare(`SELECT * FROM usage_log ${w.where} ORDER BY id DESC LIMIT ?`).all(...w.params, limit)
}
function buildRangeWhere(since, until) {
  const where = []; const params = []
  if (since) { where.push('created_at >= ?'); params.push(since) }
  if (until) { where.push('created_at <= ?'); params.push(until) }
  return { where: where.length ? 'WHERE ' + where.join(' AND ') : '', params }
}
function deleteAssistantAfterLastUser(sessionId) {
  const rows = db.prepare('SELECT id, role FROM message WHERE session_id = ? ORDER BY id ASC').all(sessionId)
  let lastUserId = 0
  for (const row of rows) { if (String(row.role) === 'user') lastUserId = Number(row.id) }
  if (lastUserId > 0) db.prepare('DELETE FROM message WHERE session_id = ? AND role = ? AND id > ?').run(sessionId, 'assistant', lastUserId)
}
function deleteMessagesAfter(sessionId, afterId) {
  db.prepare('DELETE FROM message WHERE session_id = ? AND id > ?').run(sessionId, afterId)
}
function deleteArenaAssistantMessages(sessionId) {
  db.prepare("DELETE FROM message WHERE session_id = ? AND arena_model IS NOT NULL AND arena_model != ''").run(sessionId)
}

// ===== MCP server CRUD =====
function getMcpServers() { return db.prepare('SELECT * FROM mcp_server ORDER BY id').all() }
function addMcpServer({ name, command, args = [], env = {}, enabled = 1 }) {
  const info = db.prepare('INSERT INTO mcp_server (name, command, args, env, enabled) VALUES (?, ?, ?, ?, ?)').run(name, command, JSON.stringify(args), JSON.stringify(env), enabled ? 1 : 0)
  return { lastInsertRowid: Number(info.lastInsertRowid) }
}
function updateMcpServer(id, data) {
  const keys = safeKeys('mcp_server', data)
  if (!keys.length) return
  const serialized = keys.map(k => k === 'args' || k === 'env' ? JSON.stringify(data[k]) : data[k])
  db.prepare(`UPDATE mcp_server SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(...serialized, id)
}
function deleteMcpServer(id) { db.prepare('DELETE FROM mcp_server WHERE id = ?').run(id) }

// ===== FTS Full-text Search =====
// CJK bigram tokenizer (shared with ipc/search.handler.js). FTS5's unicode61
// tokenizer doesn't split CJK ideographs, so queries are transformed into
// overlapping bigrams at the app layer.
function isCJKCodePoint(code) {
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0xac00 && code <= 0xd7a3)
  )
}
function cjkBigram(text) {
  if (!text) return ''
  const chars = Array.from(text)
  const tokens = []
  let cjkBuf = ''
  let otherBuf = ''
  const flushCjk = () => {
    if (!cjkBuf) return
    if (cjkBuf.length >= 2) {
      for (let i = 0; i < cjkBuf.length - 1; i++) tokens.push(cjkBuf.slice(i, i + 2))
    } else {
      tokens.push(cjkBuf)
    }
    cjkBuf = ''
  }
  const flushOther = () => {
    if (!otherBuf) return
    tokens.push(otherBuf)
    otherBuf = ''
  }
  for (const ch of chars) {
    if (isCJKCodePoint(ch.codePointAt(0))) {
      flushOther()
      cjkBuf += ch
    } else {
      flushCjk()
      otherBuf += ch
    }
  }
  flushCjk()
  flushOther()
  return tokens.join(' ')
}
function cjkBigramQuery(query) {
  const bigrammed = cjkBigram(query)
  if (!bigrammed.trim()) return ''
  return bigrammed
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => '"' + tok.replace(/"/g, '""') + '"')
    .join(' ')
}
function searchMessages(ftsQuery, sessionId, rawQuery) {
  try {
    const ftsAvailable = db.prepare("SELECT name FROM sqlite_master WHERE name = 'messages_fts'").all().length > 0
    if (ftsAvailable) {
      const sql = sessionId ? 'SELECT message_id, session_id FROM messages_fts WHERE messages_fts MATCH ? AND session_id = ? ORDER BY rowid DESC LIMIT 50' : 'SELECT message_id, session_id FROM messages_fts WHERE messages_fts MATCH ? ORDER BY rowid DESC LIMIT 50'
      const rows = sessionId ? db.prepare(sql).all(ftsQuery, sessionId) : db.prepare(sql).all(ftsQuery)
      return rows.map(r => db.prepare('SELECT * FROM message WHERE id = ?').get(r.message_id) || null).filter(Boolean)
    }
    if (!rawQuery) return []
    const like = `%${rawQuery.replace(/[!%_]/g, '!$&')}%`
    const sql = sessionId ? "SELECT * FROM message WHERE content LIKE ? ESCAPE '!' AND session_id = ? ORDER BY id DESC LIMIT 50" : "SELECT * FROM message WHERE content LIKE ? ESCAPE '!' ORDER BY id DESC LIMIT 50"
    return sessionId ? db.prepare(sql).all(like, sessionId) : db.prepare(sql).all(like)
  } catch { return [] }
}
function searchMemories(rawQuery) {
  try {
    const ftsAvailable = db.prepare("SELECT name FROM sqlite_master WHERE name = 'memories_fts'").all().length > 0
    if (ftsAvailable) {
      const query = cjkBigramQuery(rawQuery)
      if (!query) return []
      const rows = db.prepare('SELECT memory_id FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rowid DESC LIMIT 30').all(query)
      return rows.map(r => db.prepare('SELECT * FROM memory WHERE id = ?').get(r.memory_id) || null).filter(Boolean)
    }
    if (!rawQuery) return []
    const like = `%${rawQuery.replace(/[!%_]/g, '!$&')}%`
    return db.prepare("SELECT * FROM memory WHERE content LIKE ? ESCAPE '!' ORDER BY id DESC LIMIT 30").all(like)
  } catch { return [] }
}
async function searchFiles(query, rootDir, limit = 30) {
  if (!rootDir || !query || !query.trim()) return []
  try {
    const { scanWorkspace } = require('./context/fileScanner')
    const files = await scanWorkspace(rootDir)
    const q = query.trim().toLowerCase()
    const results = []
    for (const f of files) {
      if (results.length >= limit) break
      if (f.relPath.toLowerCase().includes(q)) {
        results.push({ relPath: f.relPath, absPath: f.absPath, size: f.size, ext: f.ext, modified: f.modified })
      }
    }
    return results
  } catch { return [] }
}

// ===== Repo Index Cache (persistent) =====
function getRepoIndexCache(workspace) {
  if (!db || !workspace) return null
  try {
    return db.prepare('SELECT mtime_x, graph_json FROM repo_index_cache WHERE workspace=?').get(workspace) || null
  } catch { return null }
}
function setRepoIndexCache(workspace, mtimeX, graphJson) {
  if (!db || !workspace) return
  try {
    db.prepare('INSERT INTO repo_index_cache (workspace, mtime_x, graph_json) VALUES (?, ?, ?) ON CONFLICT(workspace) DO UPDATE SET mtime_x=excluded.mtime_x, graph_json=excluded.graph_json')
      .run(workspace, mtimeX, graphJson)
  } catch {}
}
function deleteRepoIndexCache(workspace) {
  if (!db || !workspace) return
  try { db.prepare('DELETE FROM repo_index_cache WHERE workspace=?').run(workspace) } catch {}
}

// ===== Skill Lifecycle =====
function getSkillUsage() { try { return db.prepare('SELECT * FROM skill_usage ORDER BY use_count DESC').all() } catch { return [] } }
function updateSkillState(name, state) {
  try {
    if (state === 'archived') db.prepare("UPDATE skill_usage SET state = ?, archived_at = datetime('now') WHERE name = ?").run(state, name)
    else db.prepare('UPDATE skill_usage SET state = ? WHERE name = ?').run(state, name)
  } catch {}
}
function pinSkill(name, pinned) { try { db.prepare('UPDATE skill_usage SET pinned = ? WHERE name = ?').run(pinned ? 1 : 0, name) } catch {} }
function applySkillTransitions() {
  try {
    db.prepare("UPDATE skill_usage SET state = 'stale' WHERE state = 'active' AND pinned = 0 AND last_used_at IS NOT NULL AND julianday('now') - julianday(last_used_at) > 30").run()
    db.prepare("UPDATE skill_usage SET state = 'archived', archived_at = datetime('now') WHERE state IN ('active','stale') AND pinned = 0 AND last_used_at IS NOT NULL AND julianday('now') - julianday(last_used_at) > 90").run()
    // Success-rate demotion (Evolver rollback principle): skills that fail
    // >= 50% of their last 5+ uses are demoted to stale so the model stops
    // being offered them. Pinned skills are exempt.
    db.prepare("UPDATE skill_usage SET state = 'stale' WHERE state = 'active' AND pinned = 0 AND name IN (SELECT name FROM skill_success WHERE total_uses >= 5 AND (successes * 1.0 / total_uses) < 0.5)").run()
  } catch {}
}

// Close the underlying database handle (used by tests / clean shutdown). Safe
// to call when not initialized.
function closeDatabase() {
  try { if (db) db.close() } catch {}
  db = null
  dbPath = null
}

// ── Compaction state (session → { split_index, summary }) ──────────────────
function getCompactionState(sessionId) {
  return db.prepare('SELECT split_index, summary FROM compaction_state WHERE session_id = ?').get(sessionId)
}

function saveCompactionState(sessionId, splitIndex, summary) {
  db.prepare(`INSERT INTO compaction_state (session_id, split_index, summary, updated_at)
              VALUES (?, ?, ?, datetime('now'))
              ON CONFLICT(session_id) DO UPDATE SET
                split_index = excluded.split_index,
                summary = excluded.summary,
                updated_at = excluded.updated_at`)
    .run(sessionId, splitIndex, summary)
}

function deleteCompactionState(sessionId) {
  db.prepare('DELETE FROM compaction_state WHERE session_id = ?').run(sessionId)
}

module.exports = {
  initDatabase, createEmptyDatabase, closeDatabase, getProviders, getProvidersDecrypted, getProvider, getProviderDecrypted, addProvider, updateProvider, deleteProvider,
  maskKey, isMaskedOrEmptyKey, sanitizeSkillName,
  getModels, getAllModels, getModel, addModel, updateModel, deleteModel, getFallbackChain,
  getPersonas, getPersona, addPersona, updatePersona, deletePersona,
  getSessions, getSession, createSession, pruneEmptySessions, renameSession, pinSession, deleteSession, touchSession, updateSession,
  getMessages, addMessage, updateMessage,
  getSetting, setSetting, getAllSettings,
  getScheduledTasks, addScheduledTask, getScheduledTask, deleteScheduledTask, markScheduledTaskRun,
  createAgentTask, getAgentTask, updateAgentTask, listAgentTasks,
  getModelScores, getModelUsageMetrics, getModelLatency, initModelScores, updateElo, recordArenaVote, classifyIntent, autoRoute,
listArenaBenchmarks, saveArenaBenchmark, deleteArenaBenchmark, updateArenaBenchmarkResults,
saveDatabase, flushDatabase,
  getPrimaryModel, getSessionConfig, setSessionConfig,
  getMemories, getMemoriesScoped, addMemory, addMemoryWithProvenance, addMemoriesBatch, updateMemory, deleteMemory, incrementMemoryAccess, mergeDuplicateMemories,
  getCompactionState, saveCompactionState, deleteCompactionState,
  getMemoryConflicts, resolveMemoryConflict,
  recordSkillResult, getSkillStats,
  logUsage, getUsageStats, getUsageByProvider, getUsageByModel, getUsageDaily, getUsageLog,
  deleteAssistantAfterLastUser, deleteMessagesAfter, deleteArenaAssistantMessages,
  addNormalMessage: function({ session_id, role, content, model_used }) {
    db.prepare("INSERT INTO message (session_id, role, content, model_used, created_at) VALUES (?, ?, ?, ?, datetime('now'))").run(session_id, role, content, model_used || null)
  },
  getMcpServers, addMcpServer, updateMcpServer, deleteMcpServer,
  addAuditLog, getAuditLog,
  addCheckpoint, getCheckpoints, deleteCheckpoints, deleteCheckpoint,
  addAgentCheckpoint, getAgentCheckpoint, markAgentCheckpointRolledBack, listAgentCheckpoints,
  searchMessages, searchMemories, searchFiles,
  getRepoIndexCache, setRepoIndexCache, deleteRepoIndexCache,
  getSkillUsage, updateSkillState, pinSkill, applySkillTransitions,
  listCredentials: function(pid) { return require('./llm/credentialPool').listCredentials(pid) },
  addCredential: function(pid, key, label) { return require('./llm/credentialPool').addCredential(pid, key, label) },
  removeCredential: function(cid) { return require('./llm/credentialPool').removeCredential(cid) },
  prepare: (...args) => db ? db.prepare(...args) : null,
  run: (...args) => { if (db) db.prepare(args[0]).run(...args.slice(1)) },
  exec: (...args) => db ? db.exec(...args) : [],
  allRows: (sql, params = []) => { if (!db) return []; return db.prepare(sql).all(...params) },
  encryptKey, decryptKey, isPlaintextKey, migrateLegacyPlaintextKeys,
}