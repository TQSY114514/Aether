const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

let db = null
let dbPath = null

function getTableColumns(table) {
  try {
    const r = db.exec(`PRAGMA table_info(${table})`)
    if (!r || !r[0]) return []
    return r[0].values.map(row => row[1])
  } catch { return [] }
}

// Persisting the DB is expensive: db.export() serializes the whole database and
// writeFileSync is synchronous, blocking the main process. During streaming we
// updateMessage on every chunk, so we debounce the save — coalesce rapid writes
// into a single flush 200ms after the last one. `flushNow` forces an immediate
// write for moments that must be durable before returning (e.g. before quit).
let saveTimer = null
const SAVE_DEBOUNCE_MS = 200
function saveDatabase() {
  if (!db || !dbPath) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      const data = db.export()
      fs.writeFileSync(dbPath, Buffer.from(data))
    } catch (e) {
      console.error('[AetherAI] saveDatabase failed:', e)
    }
  }, SAVE_DEBOUNCE_MS)
}
// Force an immediate, non-debounced write. Use sparingly.
function flushDatabase() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  if (db && dbPath) {
    try {
      const data = db.export()
      fs.writeFileSync(dbPath, Buffer.from(data))
    } catch (e) {
      console.error('[AetherAI] flushDatabase failed:', e)
    }
  }
}

function lastId() {
  const r = db.exec('SELECT last_insert_rowid()')
  let id = r[0].values[0][0]
  if (!id) { const m = db.exec('SELECT MAX(id) FROM message'); id = m[0].values[0][0] || 0 }
  // sql.js may return BigInt for INTEGER columns; coerce to Number so JS
  // strict-equality (currentSessionId === session.id) works across the app.
  if (typeof id === 'bigint') id = Number(id)
  return id
}
function allRows(stmt) {
  const rows = []
  while (stmt.step()) {
    const obj = stmt.getAsObject()
    // sql.js returns BigInt for 64-bit INTEGER columns; normalize to Number so
    // ids compare with strict-equality on the renderer side (highlight, etc.).
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === 'bigint') obj[k] = Number(obj[k])
    }
    rows.push(obj)
  }
  stmt.free()
  return rows
}

async function initDatabase() {
  const SQL = await initSqlJs()
  dbPath = path.join(app.getPath('userData'), 'aetherai.db')

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  // Core tables
  db.run("CREATE TABLE IF NOT EXISTS provider (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, api_url TEXT NOT NULL, api_key TEXT, api_format TEXT NOT NULL DEFAULT 'openai', enabled INTEGER NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
  db.run("CREATE TABLE IF NOT EXISTS model (id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL, model_name TEXT NOT NULL, display_name TEXT, is_primary INTEGER NOT NULL DEFAULT 0, fallback_order INTEGER, context_window INTEGER, input_price_per_1k REAL, output_price_per_1k REAL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
  db.run("CREATE TABLE IF NOT EXISTS persona (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, prompt TEXT NOT NULL, avatar TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
  db.run("CREATE TABLE IF NOT EXISTS session (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT '新会话', persona_id INTEGER, pinned INTEGER NOT NULL DEFAULT 0, config TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
  db.run("CREATE TABLE IF NOT EXISTS message (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','assistant','system')), content TEXT NOT NULL, model_used TEXT, provider_used INTEGER, token_count INTEGER, latency_ms INTEGER, status TEXT NOT NULL DEFAULT 'success' CHECK(status IN ('success','error','fallback','aborted')), error_message TEXT, arena_model TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")

  // Phase 2 tables
  db.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  db.run('CREATE TABLE IF NOT EXISTS model_score (id INTEGER PRIMARY KEY AUTOINCREMENT, model_id INTEGER NOT NULL, intent TEXT NOT NULL, score REAL NOT NULL DEFAULT 1000, win_count INTEGER NOT NULL DEFAULT 0, total_count INTEGER NOT NULL DEFAULT 0, UNIQUE(model_id, intent))')
  db.run('CREATE TABLE IF NOT EXISTS arena_vote (id INTEGER PRIMARY KEY AUTOINCREMENT, prompt TEXT NOT NULL, intent TEXT, winner_model_id INTEGER, winner_model_name TEXT, loser_model_ids TEXT NOT NULL, loser_model_names TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)')
  // MCP servers: external tool servers the agent can call via stdio.
  db.run('CREATE TABLE IF NOT EXISTS mcp_server (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, command TEXT NOT NULL, args TEXT, env TEXT, enabled INTEGER NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)')
  db.run("CREATE TABLE IF NOT EXISTS memory (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")

  // Per-API-call usage log (one row per real provider request, across ALL
  // call sites: primary chat, arena, title-gen, auto-memory, compaction).
  // Drives the TokenPage stats: total tokens / cost / cache hit rate /
  // per-provider & per-model breakdowns + a request-log table.
  db.run(`CREATE TABLE IF NOT EXISTS usage_log (
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

  // Migrate old schema
  const cols = {
    provider: getTableColumns('provider'),
    model: getTableColumns('model'),
    persona: getTableColumns('persona'),
    session: getTableColumns('session'),
    message: getTableColumns('message'),
  }
  const addCol = (table, col, def) => {
    if (!cols[table].includes(col)) {
      try { db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); saveDatabase() } catch {}
    }
  }
  addCol('provider', 'api_format', "TEXT NOT NULL DEFAULT 'openai'")
  addCol('provider', 'enabled', 'INTEGER NOT NULL DEFAULT 1')
  addCol('provider', 'created_at', "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP")
  addCol('model', 'display_name', 'TEXT')
  addCol('model', 'fallback_order', 'INTEGER')
  addCol('model', 'context_window', 'INTEGER')
  addCol('model', 'input_price_per_1k', 'REAL')
  addCol('model', 'output_price_per_1k', 'REAL')
  addCol('model', 'created_at', "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP")
  addCol('persona', 'avatar', 'TEXT')
  addCol('persona', 'created_at', "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP")
  addCol('session', 'pinned', 'INTEGER NOT NULL DEFAULT 0')
  addCol('session', 'config', 'TEXT')
  addCol('session', 'updated_at', "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP")
  addCol('message', 'model_used', 'TEXT')
  addCol('message', 'provider_used', 'INTEGER')
  addCol('message', 'token_count', 'INTEGER')
  addCol('message', 'latency_ms', 'INTEGER')
  addCol('message', 'status', "TEXT NOT NULL DEFAULT 'success'")
  addCol('message', 'error_message', 'TEXT')
  addCol('message', 'arena_model', 'TEXT')

  // Seed defaults
  const existingKeys = (db.exec('SELECT key FROM settings')[0]?.values || []).map(r => r[0])
  if (!existingKeys.includes('fallback_timeout_ms')) db.run("INSERT INTO settings (key, value) VALUES ('fallback_timeout_ms', '30000')")
  if (!existingKeys.includes('theme')) db.run("INSERT INTO settings (key, value) VALUES ('theme', 'light')")

  saveDatabase()
  return db
}

// ===== Provider CRUD =====
function getProviders() {
  const stmt = db.prepare('SELECT * FROM provider ORDER BY id')
  return allRows(stmt)
}
function getProvider(id) {
  const stmt = db.prepare('SELECT * FROM provider WHERE id = ?'); stmt.bind([id])
  return allRows(stmt)[0] || null
}
function addProvider({ name, api_url, api_key, api_format = 'openai', enabled = 1 }) {
  db.run('INSERT INTO provider (name, api_url, api_key, api_format, enabled) VALUES (?, ?, ?, ?, ?)', [name, api_url, api_key, api_format, enabled])
  saveDatabase(); return { lastInsertRowid: lastId() }
}
function updateProvider(id, data) {
  const keys = Object.keys(data).filter(k => k !== 'id')
  if (!keys.length) return
  db.run(`UPDATE provider SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => data[k]), id])
  saveDatabase()
}
function deleteProvider(id) {
  // cascade models
  db.run('DELETE FROM model WHERE provider_id = ?', [id])
  db.run('DELETE FROM provider WHERE id = ?', [id]); saveDatabase()
}

// ===== Model CRUD =====
function getModels(providerId) {
  const stmt = db.prepare('SELECT * FROM model WHERE provider_id = ? ORDER BY fallback_order ASC, id ASC')
  stmt.bind([providerId]); return allRows(stmt)
}
function getAllModels() {
  const stmt = db.prepare('SELECT m.*, p.name as provider_name, p.api_url, p.api_key FROM model m JOIN provider p ON m.provider_id = p.id WHERE p.enabled = 1 ORDER BY m.provider_id, m.id')
  return allRows(stmt)
}
function getModel(id) {
  const stmt = db.prepare('SELECT * FROM model WHERE id = ?'); stmt.bind([id])
  return allRows(stmt)[0] || null
}
function addModel({ provider_id, model_name, display_name = null, is_primary = 0, fallback_order = null, context_window = null, input_price_per_1k = null, output_price_per_1k = null }) {
  db.run('INSERT INTO model (provider_id, model_name, display_name, is_primary, fallback_order, context_window, input_price_per_1k, output_price_per_1k) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [provider_id, model_name, display_name, is_primary, fallback_order, context_window, input_price_per_1k, output_price_per_1k])
  saveDatabase(); return { lastInsertRowid: lastId() }
}
function updateModel(id, data) {
  const keys = Object.keys(data).filter(k => k !== 'id')
  if (!keys.length) return
  db.run(`UPDATE model SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => data[k]), id])
  saveDatabase()
}
function deleteModel(id) {
  db.run('DELETE FROM model WHERE id = ?', [id]); saveDatabase()
}
function getFallbackChain(providerId) {
  const stmt = db.prepare('SELECT * FROM model WHERE provider_id = ? AND fallback_order IS NOT NULL ORDER BY fallback_order ASC')
  stmt.bind([providerId]); return allRows(stmt)
}

// ===== Persona CRUD =====
function getPersonas() {
  const stmt = db.prepare('SELECT * FROM persona ORDER BY id'); return allRows(stmt)
}
function getPersona(id) {
  const stmt = db.prepare('SELECT * FROM persona WHERE id = ?'); stmt.bind([id])
  return allRows(stmt)[0] || null
}
function addPersona({ name, prompt, avatar = null }) {
  db.run('INSERT INTO persona (name, prompt, avatar) VALUES (?, ?, ?)', [name, prompt, avatar])
  saveDatabase(); return { lastInsertRowid: lastId() }
}
function updatePersona(id, data) {
  const keys = Object.keys(data).filter(k => k !== 'id')
  if (!keys.length) return
  db.run(`UPDATE persona SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => data[k]), id])
  saveDatabase()
}
function deletePersona(id) {
  db.run('DELETE FROM persona WHERE id = ?', [id]); saveDatabase()
}

// ===== Session CRUD =====
function getSessions() {
  const stmt = db.prepare("SELECT s.*, (SELECT content FROM message WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message FROM session s ORDER BY s.pinned DESC, s.updated_at DESC")
  return allRows(stmt)
}
// Fetch a single session by id — a direct indexed lookup, far cheaper than
// getSessions() (which runs a correlated subquery per session row + sorts all).
// Used by hot paths like chat:send that only need the current session.
function getSession(id) {
  const stmt = db.prepare('SELECT * FROM session WHERE id = ?'); stmt.bind([id])
  return allRows(stmt)[0] || null
}
function createSession({ title = '新会话', persona_id = null }) {
  db.run('INSERT INTO session (title, persona_id, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [title, persona_id])
  saveDatabase(); return { lastInsertRowid: lastId() }
}
function renameSession(id, title) {
  db.run('UPDATE session SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [title, id]); saveDatabase()
}
function pinSession(id, pinned = 1) {
  db.run('UPDATE session SET pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [pinned, id]); saveDatabase()
}
function deleteSession(id) {
  db.run('DELETE FROM session WHERE id = ?', [id]); saveDatabase()
}
function touchSession(id) {
  db.run('UPDATE session SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]); saveDatabase()
}
function getSessionConfig(id) {
  const stmt = db.prepare('SELECT config, persona_id FROM session WHERE id = ?')
  stmt.bind([id])
  const rows = allRows(stmt)
  if (!rows.length) return null
  try { return JSON.parse(rows[0].config || 'null') } catch { return null }
}
function setSessionConfig(id, config) {
  db.run('UPDATE session SET config = ? WHERE id = ?', [JSON.stringify(config), id])
  saveDatabase()
}

// ===== Message CRUD =====
function getMessages(sessionId) {
  const stmt = db.prepare('SELECT * FROM message WHERE session_id = ? ORDER BY id ASC')
  stmt.bind([sessionId]); return allRows(stmt)
}
function addMessage({ session_id, role, content, model_used = null, provider_used = null, token_count = null, latency_ms = null, status = 'success', error_message = null, arena_model = null }) {
  db.run('INSERT INTO message (session_id, role, content, model_used, provider_used, token_count, latency_ms, status, error_message, arena_model) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [session_id, role, content, model_used, provider_used, token_count, latency_ms, status, error_message, arena_model])
  saveDatabase(); return { lastInsertRowid: lastId() }
}
function updateMessage(id, data) {
  const keys = Object.keys(data).filter(k => k !== 'id')
  if (!keys.length) return
  db.run(`UPDATE message SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => data[k]), id])
  console.log(`[AetherAI] updateMessage id=${id} modified=${db.getRowsModified()} keys=[${keys.join(',')}]`)
  saveDatabase()
}

// ===== Settings CRUD =====
function getSetting(key) {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?')
  stmt.bind([key])
  const rows = allRows(stmt)
  return rows[0]?.value || null
}
function setSetting(key, value) {
  db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value])
  saveDatabase()
}
function getAllSettings() {
  const stmt = db.prepare('SELECT key, value FROM settings')
  const rows = allRows(stmt)
  const result = {}
  rows.forEach(r => result[r.key] = r.value)
  return result
}

// ===== Arena / ELO =====
function getModelScores() {
  const stmt = db.prepare(`
    SELECT ms.*, m.model_name, p.name as provider_name
    FROM model_score ms JOIN model m ON ms.model_id=m.id JOIN provider p ON m.provider_id=p.id
    ORDER BY ms.intent, ms.score DESC`)
  return allRows(stmt)
}

function initModelScores(modelId) {
  for (const intent of ['coding', 'math', 'translation', 'summary', 'general']) {
    db.run("INSERT OR IGNORE INTO model_score (model_id, intent, score, win_count, total_count) VALUES (?,?,1000,0,0)", [modelId])
  }
  saveDatabase()
}

function updateElo(winnerModelId, loserModelIds, intent) {
  const K = 32
  for (const loserId of loserModelIds) {
    // sql.js db.exec() does not bind params; use prepare()+bind() to read scores.
    const wStmt = db.prepare('SELECT score FROM model_score WHERE model_id=? AND intent=?'); wStmt.bind([winnerModelId, intent])
    const wRow = wStmt.step() ? wStmt.getAsObject() : null; wStmt.free()
    const lStmt = db.prepare('SELECT score FROM model_score WHERE model_id=? AND intent=?'); lStmt.bind([loserId, intent])
    const lRow = lStmt.step() ? lStmt.getAsObject() : null; lStmt.free()
    const ws = wRow?.score ?? 1000
    const ls = lRow?.score ?? 1000
    const expected = 1 / (1 + Math.pow(10, (ls - ws) / 400))
    const newW = ws + K * (1 - expected)
    const newL = ls + K * (0 - (1 - expected))

    db.run(`INSERT OR REPLACE INTO model_score (model_id, intent, score, win_count, total_count) VALUES (?,?,?,
      COALESCE((SELECT win_count FROM model_score WHERE model_id=? AND intent=?),0)+1,
      COALESCE((SELECT total_count FROM model_score WHERE model_id=? AND intent=?),0)+1)`,
      [winnerModelId, intent, Math.round(newW * 10) / 10, winnerModelId, intent, winnerModelId, intent])
    db.run(`INSERT OR REPLACE INTO model_score (model_id, intent, score, win_count, total_count) VALUES (?,?,?,
      COALESCE((SELECT win_count FROM model_score WHERE model_id=? AND intent=?),0),
      COALESCE((SELECT total_count FROM model_score WHERE model_id=? AND intent=?),0)+1)`,
      [loserId, intent, Math.round(newL * 10) / 10, loserId, intent, loserId, intent])
  }
  saveDatabase()
}

// Persist an arena vote (prompt + winner/losers + detected intent) and update ELO.
function recordArenaVote({ prompt, winnerModelId, winnerModelName, loserModelIds, loserModelNames, intent }) {
  db.run(`INSERT INTO arena_vote (prompt, intent, winner_model_id, winner_model_name, loser_model_ids, loser_model_names)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [prompt, intent, winnerModelId, winnerModelName, JSON.stringify(loserModelIds), JSON.stringify(loserModelNames)])
  if (winnerModelId && loserModelIds.length > 0) {
    updateElo(winnerModelId, loserModelIds, intent)
  }
  saveDatabase()
}

function getPrimaryModel() {
  const r = db.exec('SELECT m.id, m.provider_id FROM model m JOIN provider p ON m.provider_id = p.id WHERE p.enabled = 1 ORDER BY m.is_primary DESC, m.id ASC LIMIT 1')
  if (r[0]?.values?.[0]) {
    const v = r[0].values[0]
    // sql.js may return BigInt for INTEGER columns; coerce to Number so the
    // value survives JSON.stringify (setSessionConfig) and strict-equality checks.
    const num = (x) => typeof x === 'bigint' ? Number(x) : x
    return { id: num(v[0]), provider_id: num(v[1]) }
  }
  return null
}

// ===== Intent classification (ported from Python v0.3) =====
function classifyIntent(text) {
  if (!text) return 'general'
  const t = text.toLowerCase()
  if (/\b(def |class |import |function|debug|bug|compile|error|git|bash|cmd|docker|sql|api|rest)\b/.test(t) ||
      /代码|编程|python|javascript|写一个|实现|算法|terminal/i.test(t)) return 'coding'
  if (/数|算|方程|公式|证明|积分|导数|矩阵|定理|概率|统计|calculate|solve|math|equation/i.test(t)) return 'math'
  if (/翻译|english|chinese|translate|日语|英语|法语/i.test(t)) return 'translation'
  if (/总结|摘要|概括|summarize|summarise|提炼/i.test(t)) return 'summary'
  return 'general'
}

function autoRoute(intent) {
  const stmt = db.prepare(`
    SELECT ms.score, ms.model_id, m.model_name, m.provider_id, p.api_url, p.api_key, p.name as provider_name
    FROM model_score ms JOIN model m ON ms.model_id = m.id JOIN provider p ON m.provider_id = p.id
    WHERE ms.intent=? AND p.enabled=1 ORDER BY ms.score DESC LIMIT 1`)
  stmt.bind([intent])
  const scores = allRows(stmt)
  if (scores.length > 0) {
    const best = scores[0]
    return { model_id: best.model_id, model_name: best.model_name, provider_id: best.provider_id,
      api_url: best.api_url, api_key: best.api_key, route_reason: `ELO ${best.score.toFixed(0)}` }
  }
  // fallback: primary model
  const m2 = db.exec('SELECT m.id, m.model_name, p.api_url, p.api_key FROM model m JOIN provider p ON m.provider_id=p.id WHERE m.is_primary=1 AND p.enabled=1 LIMIT 1')
  if (m2[0]?.values?.[0]) {
    const v = m2[0].values[0]
    const num = (x) => (typeof x === 'bigint' ? Number(x) : x)
    return { model_id: num(v[0]), model_name: v[1], api_url: v[2], api_key: v[3], route_reason: 'Primary model' }
  }
  return null
}

// ===== Memory CRUD =====
function getMemories() {
  const stmt = db.prepare('SELECT * FROM memory ORDER BY created_at DESC')
  return allRows(stmt)
}
function addMemory({ content }) {
  db.run('INSERT INTO memory (content) VALUES (?)', [content])
  saveDatabase(); return { lastInsertRowid: lastId() }
}
function updateMemory(id, { content }) {
  if (!content) return
  db.run('UPDATE memory SET content = ? WHERE id = ?', [content, id])
  saveDatabase()
}
function deleteMemory(id) {
  db.run('DELETE FROM memory WHERE id = ?', [id]); saveDatabase()
}

// ===== Usage log CRUD =====
// One row per real API call. `source` tags the call site: 'chat' | 'arena' |
// 'title' | 'memory' | 'compaction' | 'tool'. cost is computed by the caller
// from the model's price columns; if unknown, 0.
function logUsage({ session_id = null, provider_id = null, provider_name = null, model_name = null,
  prompt_tokens = 0, completion_tokens = 0, total_tokens = 0,
  cache_read_tokens = 0, cache_creation_tokens = 0, cost = 0, latency_ms = null, status = 200, source = 'chat' }) {
  db.run(`INSERT INTO usage_log
    (session_id, provider_id, provider_name, model_name, prompt_tokens, completion_tokens, total_tokens,
     cache_read_tokens, cache_creation_tokens, cost, latency_ms, status, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [session_id, provider_id, provider_name, model_name, prompt_tokens, completion_tokens, total_tokens,
     cache_read_tokens, cache_creation_tokens, cost, latency_ms, status, source])
  saveDatabase()
}
// Aggregate stats for the TokenPage. Optional since/until (ISO) for the range picker.
function getUsageStats({ since = null, until = null } = {}) {
  const where = []
  const params = []
  if (since) { where.push('created_at >= ?'); params.push(since) }
  if (until) { where.push('created_at <= ?'); params.push(until) }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const stmt = db.prepare(`SELECT
      COUNT(*) as requests,
      COALESCE(SUM(prompt_tokens),0) as prompt_tokens,
      COALESCE(SUM(completion_tokens),0) as completion_tokens,
      COALESCE(SUM(total_tokens),0) as total_tokens,
      COALESCE(SUM(cache_read_tokens),0) as cache_read_tokens,
      COALESCE(SUM(cache_creation_tokens),0) as cache_creation_tokens,
      COALESCE(SUM(cost),0) as cost,
      COALESCE(SUM(latency_ms),0) as latency_ms_sum,
      COUNT(latency_ms) as latency_count
    FROM usage_log ${w}`)
  stmt.bind(params)
  const row = stmt.step() ? stmt.getAsObject() : {}; stmt.free()
  // Bigints already normalized by getAsObject? No — getAsObject doesn't run allRows coercion.
  const num = (v) => typeof v === 'bigint' ? Number(v) : (v || 0)
  return {
    requests: num(row.requests),
    prompt_tokens: num(row.prompt_tokens),
    completion_tokens: num(row.completion_tokens),
    total_tokens: num(row.total_tokens),
    cache_read_tokens: num(row.cache_read_tokens),
    cache_creation_tokens: num(row.cache_creation_tokens),
    cost: num(row.cost),
    latency_avg: row.latency_count > 0 ? num(row.latency_ms_sum) / num(row.latency_count) : 0,
  }
}
// Per-provider and per-model breakdowns (same range filter).
function getUsageByProvider({ since = null, until = null } = {}) {
  const w = buildRangeWhere(since, until)
  const stmt = db.prepare(`SELECT provider_name, COUNT(*) as requests,
      COALESCE(SUM(total_tokens),0) as total_tokens, COALESCE(SUM(cost),0) as cost
    FROM usage_log ${w.where} GROUP BY provider_name ORDER BY cost DESC`)
  stmt.bind(w.params); const out = allRows(stmt); return out
}
function getUsageByModel({ since = null, until = null } = {}) {
  const w = buildRangeWhere(since, until)
  const stmt = db.prepare(`SELECT model_name, COUNT(*) as requests,
      COALESCE(SUM(total_tokens),0) as total_tokens, COALESCE(SUM(cost),0) as cost
    FROM usage_log ${w.where} GROUP BY model_name ORDER BY cost DESC`)
  stmt.bind(w.params); const out = allRows(stmt); return out
}
// Daily series for the trend chart.
function getUsageDaily({ since = null, until = null } = {}) {
  const w = buildRangeWhere(since, until)
  const stmt = db.prepare(`SELECT date(created_at) as day, COUNT(*) as requests,
      COALESCE(SUM(total_tokens),0) as total_tokens, COALESCE(SUM(cost),0) as cost
    FROM usage_log ${w.where} GROUP BY day ORDER BY day ASC`)
  stmt.bind(w.params); const out = allRows(stmt); return out
}
// Raw request log (most recent first, capped).
function getUsageLog({ limit = 200, since = null, until = null } = {}) {
  const w = buildRangeWhere(since, until)
  const stmt = db.prepare(`SELECT * FROM usage_log ${w.where} ORDER BY id DESC LIMIT ?`)
  stmt.bind([...w.params, limit]); const out = allRows(stmt); return out
}
function buildRangeWhere(since, until) {
  const where = []
  const params = []
  if (since) { where.push('created_at >= ?'); params.push(since) }
  if (until) { where.push('created_at <= ?'); params.push(until) }
  return { where: where.length ? 'WHERE ' + where.join(' AND ') : '', params }
}


// Drop assistant messages that follow the last user message in a session.
// Used by regenerate so the discarded reply doesn't resurface on reload.
function deleteAssistantAfterLastUser(sessionId) {
  const stmt = db.prepare('SELECT id, role FROM message WHERE session_id = ? ORDER BY id ASC')
  stmt.bind([sessionId])
  let lastUserId = 0
  while (stmt.step()) {
    const row = stmt.getAsObject()
    if (String(row.role) === 'user') lastUserId = Number(row.id)
  }
  stmt.free()
  if (lastUserId > 0) {
    db.run('DELETE FROM message WHERE session_id = ? AND role = ? AND id > ?', [sessionId, 'assistant', lastUserId])
    saveDatabase()
  }
}

// ===== MCP server CRUD =====
// Each server: { id, name, command, args (JSON array string), env (JSON object string), enabled }.
function getMcpServers() {
  const stmt = db.prepare('SELECT * FROM mcp_server ORDER BY id')
  return allRows(stmt)
}
function addMcpServer({ name, command, args = [], env = {}, enabled = 1 }) {
  db.run('INSERT INTO mcp_server (name, command, args, env, enabled) VALUES (?, ?, ?, ?, ?)',
    [name, command, JSON.stringify(args), JSON.stringify(env), enabled ? 1 : 0])
  saveDatabase(); return { lastInsertRowid: lastId() }
}
function updateMcpServer(id, data) {
  const keys = Object.keys(data).filter(k => k !== 'id')
  if (!keys.length) return
  // Serialize args/env to JSON strings if given as arrays/objects.
  const serialized = keys.map(k => k === 'args' || k === 'env' ? JSON.stringify(data[k]) : data[k])
  db.run(`UPDATE mcp_server SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...serialized, id])
  saveDatabase()
}
function deleteMcpServer(id) {
  db.run('DELETE FROM mcp_server WHERE id = ?', [id]); saveDatabase()
}

module.exports = {
  initDatabase, getProviders, getProvider, addProvider, updateProvider, deleteProvider,
  getModels, getAllModels, getModel, addModel, updateModel, deleteModel, getFallbackChain,
  getPersonas, getPersona, addPersona, updatePersona, deletePersona,
  getSessions, getSession, createSession, renameSession, pinSession, deleteSession, touchSession,
  getMessages, addMessage, updateMessage,
  getSetting, setSetting, getAllSettings,
  getModelScores, initModelScores, updateElo, recordArenaVote, classifyIntent, autoRoute, saveDatabase, flushDatabase,
  getPrimaryModel, getSessionConfig, setSessionConfig,
  getMemories, addMemory, updateMemory, deleteMemory,
  logUsage, getUsageStats, getUsageByProvider, getUsageByModel, getUsageDaily, getUsageLog,
  deleteAssistantAfterLastUser,
  getMcpServers, addMcpServer, updateMcpServer, deleteMcpServer,
}