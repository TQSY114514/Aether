# TUI / CLI / SDK — DB capability baseline

Capability inventory of the Aether data layer as of 2026-08-12, covering the
electron-bound wrapper (`app/electron/database.js`) and the Electron-free
adapter (`app/electron/llm/taskDbAdapter.js`). The TUI / headless CLI / SDK must
never `require('electron')`; any DB method they need must exist on
`taskDbAdapter` (or be added there, mirroring `database.js`).

## Capability inventory

| Method | File | Signature | Electron-free? | Notes |
|---|---|---|---|---|
| `createSession` | database.js:446 / taskDbAdapter.js:26 | `({title='新会话', persona_id=null, parentSessionId=null}) → {lastInsertRowid}` | ✅ adapter; ❌ database.js (safeStorage) | Adapter identical SQL: inserts `is_placeholder=1` |
| `getSessions` | database.js:435 | `() → rows[]` (last_message subquery) | ❌ database.js only | Not in adapter — not yet needed headless |
| `getSession` | database.js:438 | `(id) → row\|null` | ❌ database.js only | Not in adapter |
| `renameSession` | database.js:455 / **taskDbAdapter.js (added)** | `(id, title) → void` | ✅ adapter | `UPDATE session SET title=?, updated_at=?` |
| `deleteSession` | database.js:461 / **taskDbAdapter.js (added)** | `(id) → void` | ✅ adapter | Transaction: cascade messages_fts → message → agent_checkpoint → agent_execution_log → usage_log, `memory.source_session_id=NULL`, then session |
| `touchSession` | database.js:474 | `(id) → void` | ❌ database.js only | Not in adapter |
| `pinSession` | database.js:458 | `(id, pinned=1) → void` | ❌ database.js only | Not in adapter |
| `pruneEmptySessions` | database.js:452 | `() → void` | ❌ database.js only | Not in adapter |
| `getSessionConfig` / `setSessionConfig` | database.js:477/482 | `(id)` / `(id, config)` | ❌ database.js only | JSON config column; not in adapter |
| `addMessage` | database.js:490 / taskDbAdapter.js:33 | `({session_id, role, content, model_used=null, provider_used=null}) → {lastInsertRowid}` | ✅ adapter | Adapter uses fixed `token_count=NULL, latency_ms=NULL, status='success'`; also mirrors FTS insert + is_placeholder flip |
| `updateMessage` | database.js:497 / taskDbAdapter.js:41 | `(id, data) → void` | ✅ adapter | database.js whitelists columns via `safeKeys('message')`; adapter accepts any key (pre-existing divergence, kept) |
| `getMessages` | database.js:487 | `(sessionId) → rows[]` | ❌ database.js only | Not in adapter |
| **`deleteMessage`** | **taskDbAdapter.js (added)** | `(id) → {changes}` | ✅ adapter | New: delete a single message by id. database.js has no by-id delete; `changes` = rows affected |
| **`deleteMessagesAfter`** | database.js:817 / **taskDbAdapter.js (added)** | `(sessionId, afterId) → {changes}` | ✅ adapter | Truncate-by-idx parity: `DELETE FROM message WHERE session_id=? AND id > ?`. Neither deletes FTS rows (database.js parity) |
| `deleteAssistantAfterLastUser` | database.js:811 | `(sessionId) → void` | ❌ database.js only | Not in adapter |
| `deleteArenaAssistantMessages` | database.js:820 | `(sessionId) → void` | ❌ database.js only | Not in adapter |
| `getProviders` | database.js:364 | `() → rows[]` (decrypts api_key) | ❌ database.js only (safeStorage) | Not in adapter |
| `getProvider` | database.js:367 / taskDbAdapter.js:54 | `(id) → row\|null` | ✅ adapter | Adapter does **not** decrypt (no safeStorage headless) — key returned as stored |
| `addProvider` | database.js:371 | `({name, api_url, api_key, api_format='openai', enabled=1}) → {lastInsertRowid}` | ❌ database.js only | Encrypts api_key via safeStorage; not in adapter |
| `updateProvider` | database.js:376 | `(id, data) → void` | ❌ database.js only | Encrypts api_key; not in adapter |
| `deleteProvider` | database.js:382 | `(id) → void` | ❌ database.js only | Deletes provider's models then the provider; not in adapter |
| **`upsertProvider`** | **taskDbAdapter.js (added)** | `({name, api_url, api_key=null, api_format='openai', enabled=1}) → {lastInsertRowid, upserted}` | ✅ adapter | New. **By-name upsert, not literal `INSERT OR REPLACE`**: `provider.name` has no UNIQUE constraint (database.js:109), so `INSERT OR REPLACE` would silently insert duplicate rows. Upsert = `UPDATE` when a provider with the same name exists, else `INSERT`. Key stored plaintext (no safeStorage headless) |
| `getModel` | database.js:394 / taskDbAdapter.js:49 | `(id) → row\|null` | ✅ adapter | Adapter returns `Number(id)` |
| `getAllModels` / `getModels` / `addModel` / `updateModel` / `deleteModel` | database.js:388–408 | see file | ❌ database.js only | Not in adapter (out of current headless scope) |
| `getSetting` | database.js:504 / taskDbAdapter.js:59 | `(key) → value\|null` | ✅ adapter | Identical SQL |
| **`setSetting`** | database.js:508 / **taskDbAdapter.js (added)** | `(key, value) → void` | ✅ adapter | Adapter: `INSERT OR REPLACE INTO settings` — valid because `settings.key` is PRIMARY KEY (database.js:115). database.js uses `ON CONFLICT(key) DO UPDATE`, semantically identical |
| `getAllSettings` | database.js:511 | `() → {key: value}` | ❌ database.js only | Not in adapter |
| `createAgentTask` / `getAgentTask` / `updateAgentTask` / `listAgentTasks` | database.js:519–541 / taskDbAdapter.js:65–89 | see files | ✅ adapter | TaskEngine surface; adapter mirrors SQL exactly (whitelisted patch cols) |

## permission* tables

**None.** `grep -i permission app/electron/database.js` returns zero matches. No
`permission*` table is created in `initDatabase` (database.js:103–330), and no
such table is referenced anywhere in the data layer. Permission state for the
TUI / CLI lives in-process (`allowRules.js` / TUI keymap), not in SQLite. If a
`permission*` table is ever added to `database.js`, this adapter must mirror it.

## openDatabase behavior on missing file

`agentCore.js:42` (`app/electron/llm/agentCore.js`):

```js
function openDatabase(dbPath = defaultDbPath()) {
  if (!dbPath || !fs.existsSync(dbPath)) return null   // ← missing file → null
  const db = new BetterSqlite3(dbPath)
  try { db.pragma('journal_mode = WAL') } catch {}
  db.pragma('foreign_keys = OFF')
  return db
}
```

- Missing/nonexistent DB file → returns `null` (caller must handle; headless
  callers treat `null` as "no DB configured").
- Existing file → raw better-sqlite3 connection (WAL, `foreign_keys=OFF`).
  **No `initDatabase()` runs headless** — schema must already exist in the file
  (created by the desktop app). A fresh empty file has no tables; the adapter
  methods assume the app schema.
- Adapter wraps this raw connection: `taskDbAdapter(openDatabase(path))`.

## Electron-free audit notes

- `taskDbAdapter.js` imports nothing — takes the raw connection as its only
  argument. Loads under plain Node: `node -e "require('./electron/llm/taskDbAdapter')"` ✅
- Encryption: `database.js` encrypts `provider.api_key` with Electron
  `safeStorage` (database.js:17–37). Headless Node has no `safeStorage`, so the
  adapter stores/returns keys as-is (same stance as `agentCore.decryptApiKey`,
  agentCore.js:55–57). Keys written via `upsertProvider` from the TUI/CLI are
  plaintext on disk.
- All adapter SQL is parameterized (`?` bindings); no `db.exec` for data
  queries; no new tables (all methods touch the existing app schema).
