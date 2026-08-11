// ───────────────────────────────────────────────────────────────────────────
// Agent Core — headless, Electron-free execution core.
//
// Task 3.1: extracts a self-contained agent runner from the tool loop so the
// agent can execute in plain Node (CLI, CI/CD, SSH sessions, scripts) without
// an Electron window / BrowserWindow.
//
// It reuses runToolLoop() from toolLoop.js unchanged — no logic is rewritten.
// The only Electron-bound dependency it touches is the sandbox workspace
// root, which is initialized to the working directory so the sandbox never
// falls back to Electron's app.getPath('userData').
//
// The database is read directly with better-sqlite3 (not database.js, which
// requires Electron) so providers/models can be resolved headlessly.
// ───────────────────────────────────────────────────────────────────────────

const path = require('path')
const fs = require('fs')
const os = require('os')
const BetterSqlite3 = require('better-sqlite3')
const { runToolLoop } = require('./toolLoop')
const sandbox = require('../tools/sandbox')

// ─── Database helpers (better-sqlite3, no Electron) ────────────────────────

// Locate the app's userData dir: %APPDATA%/aetherai on Windows,
// ~/.config/aetherai on Linux, ~/Library/Application Support/aetherai on macOS.
function getUserDataDir() {
  const base = process.env.APPDATA
    || (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'))
  return path.join(base, 'aetherai')
}

function defaultDbPath() {
  return path.join(getUserDataDir(), 'aetherai.db')
}

// Open the app database directly with better-sqlite3. Returns null if the
// file does not exist. Read-write so WAL journaling works like the app.
function openDatabase(dbPath = defaultDbPath()) {
  if (!dbPath || !fs.existsSync(dbPath)) return null
  const db = new BetterSqlite3(dbPath)
  try { db.pragma('journal_mode = WAL') } catch {}
  db.pragma('foreign_keys = OFF')
  return db
}

// Decrypt a stored API key. In the app the key may be encrypted with
// Electron's safeStorage; in headless Node that is unavailable, so the key is
// returned as-is. If the provider stores a plaintext key (the common case
// when a keyring is unavailable), this works directly. Otherwise the caller
// can supply --api-key explicitly.
function decryptApiKey(encoded) {
  return encoded
}

// A safeStorage-encrypted value is pure base64 (alphabet + padding); a legacy
// plaintext API key almost always contains characters outside that alphabet
// (e.g. "sk-..."), so this heuristic flags encrypted values that headless
// mode cannot decrypt. Mirrors database.js isBase64String.
function isEncryptedKey(s) {
  if (!s || typeof s !== 'string') return false
  if (s.length % 4 !== 0) return false
  return /^[A-Za-z0-9+/]*={0,2}$/.test(s)
}

function listProviders(db) {
  if (!db) return []
  try {
    return db.prepare('SELECT id, name, api_url, api_format, enabled FROM provider ORDER BY id').all()
  } catch { return [] }
}

function listModels(db) {
  if (!db) return []
  try {
    return db.prepare(
      'SELECT m.id, m.model_name, m.provider_id, m.is_primary, p.name AS provider_name, p.api_format FROM model m JOIN provider p ON m.provider_id = p.id WHERE p.enabled = 1 ORDER BY m.provider_id, m.id'
    ).all()
  } catch { return [] }
}

// Resolve a provider + model row for the adapter. `modelName` may be a bare
// model name or a "provider/model" pair. Falls back to the primary model, then
// the first enabled model. Returns { provider, model } or null.
function resolveProviderModel(db, { providerName, modelName } = {}) {
  if (!db) return null
  const providers = listProviders(db)
  const models = listModels(db)
  if (!models.length) return null

  let target = null
  if (modelName) {
    const parts = String(modelName).split('/').map(s => (s || '').trim()).filter(Boolean)
    const q = parts.length > 1 ? parts[1] : parts[0]
    const prov = parts.length > 1 ? parts[0] : null
    const lower = q.toLowerCase()
    target = models.find(m => m.model_name.toLowerCase() === lower)
      || models.find(m => m.model_name.toLowerCase().includes(lower))
      || null
    if (prov && target) {
      target = models.find(m => m.provider_name === prov && m.model_name === target.model_name) || target
    }
  }
  if (!target) {
    target = models.find(m => m.is_primary) || models[0]
  }
  if (providerName) {
    const p = providers.find(pr => pr.name === providerName)
    if (p) target = models.find(m => m.provider_id === p.id) || target
  }
  if (!target) return null

  const provider = providers.find(p => p.id === target.provider_id)
  // 凭据读取: provider_credential(桌面版现行明文凭据表, 与桌面版一致)优先,
  // 旧 provider.api_key 兜底(可能为 safeStorage 加密值 → decryptApiKey 处理)。
  let storedKey = null
  if (provider) {
    try {
      const cred = db.prepare(
        'SELECT api_key FROM provider_credential WHERE provider_id = ? AND enabled = 1 ORDER BY id DESC LIMIT 1',
      ).get(provider.id)
      storedKey = (cred && cred.api_key) || db.prepare('SELECT api_key FROM provider WHERE id = ?').get(provider.id)?.api_key || null
    } catch {
      // 旧库/测试库无 provider_credential 表 → 退回 provider.api_key
      try { storedKey = db.prepare('SELECT api_key FROM provider WHERE id = ?').get(provider.id)?.api_key || null } catch { storedKey = null }
    }
  }
  return {
    provider: {
      id: provider ? provider.id : target.provider_id,
      name: provider ? provider.name : target.provider_name,
      api_url: provider ? provider.api_url : null,
      api_key: decryptApiKey(storedKey),
      api_format: (provider ? provider.api_format : target.api_format) || 'openai',
    },
    model: { id: target.id, model_name: target.model_name },
  }
}

// ─── Agent execution ───────────────────────────────────────────────────────

// Run the agent headlessly. `provider` is a row like
// { name, api_url, api_key, api_format } and `model` is { model_name } — the
// shapes the provider adapter expects. Reuses runToolLoop unchanged.
//
// Returns { text, toolCalls } where `text` is the final assistant answer and
// `toolCalls` is the ordered trace of executed tools.
async function runAgent({
  prompt,
  provider,
  model,
  messages,
  options = {},
  agentMode = 'auto',
  maxIterations,
  workspace = process.cwd(),
  signal,
  sessionId,
  personaId,
  db,
  injectMemory = true,
  requestPermission,
  onEvent,
  onToolCall,
  onStatus,
  onPlanStep,
  onText,
  onUsage,
}) {
  // Initialize the sandbox workspace so read/write tools resolve against the
  // working directory instead of falling back to Electron's userData.
  sandbox.setWorkspaceRoot(workspace)

  const convo = messages && messages.length
    ? messages.slice()
    : [{ role: 'user', content: String(prompt || '') }]

  // todo 13/20：persona + 记忆注入前缀（CLI/TUI/SDK 三端贯通）。
  // db 在场且 personaId 指定 → persona 块；db 在场且 injectMemory（默认开）→ 记忆块。
  // memoryTrace 供 --memory-trace 展示注入条目数。
  const memoryTrace = { memoryCount: 0 }
  if (db && (personaId != null || injectMemory)) {
    try {
      const { buildSessionContext } = require('./sessionContext')
      const { prefix, memoryCount } = buildSessionContext({ db, sessionId, personaId, userMessage: String(prompt || '') })
      if (prefix.length) convo.unshift(...prefix)
      memoryTrace.memoryCount = memoryCount
    } catch {}
  }

  const toolCalls = []
  const emit = (entry) => {
    toolCalls.push(entry)
    if (onEvent) onEvent({ type: 'tool:end', payload: entry })
  }

  const text = await runToolLoop({
    provider,
    model,
    messages: convo,
    signal,
    // sessionId（可选，todo 6 steering 键控）：TUI 用固定 'tui' 让 steering 模块
    // 的注入按此键被循环消费；DB 绑定路径均以 sessionId&&db 双守卫或 try/catch
    // 包裹（toolLoop.js:582/590/756/766），headless 无 db 时不启用。
    sessionId,
    // No sessionId / db: the loop's best-effort, DB-bound paths
    // (checkpoints, trust engine, trajectory, auto-commit) are all gated on
    // sessionId and are skipped in headless mode.
    onToolCall: (entry) => { emit(entry); if (onToolCall) onToolCall(entry) },
    onStatus,
    onPlanStep,
    onUsage,
    // Relay streamed tool output (stdout of run_command, etc.) so headless
    // consumers (CLI --json-lines, the VS Code extension) can show live text.
    onStream: (chunk) => {
      if (chunk?.text && onText) onText({ text: chunk.text, done: chunk.type === 'done' })
    },
    agentMode,
    maxIterations,
    options: { ...options },
    // 可选权限回调（B2 接线 a 方案，向后兼容）：TUI 提供键盘应答面板；
    // 无回调时 runToolLoop 默认拒绝（toolLoop.js:872-880）。
    requestPermission,
  })

  return { text, toolCalls, memoryTrace }
}

module.exports = {
  runAgent,
  openDatabase,
  defaultDbPath,
  getUserDataDir,
  resolveProviderModel,
  listProviders,
  listModels,
  decryptApiKey,
  isEncryptedKey,
}