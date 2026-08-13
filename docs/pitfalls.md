# Aether pitfalls & lessons

Curated from the developer knowledge base (W28-W32 era, 2026-07..08), verified
current as of 2026-08 against this repo. Each entry: Pitfall / Why / Fix /
Where / Status (`current` | `legacy` | `superseded-by`). AGENTS.md carries the
condensed rules; this is the detailed reference with root causes.

## DB / better-sqlite3

### 1. DB integers can come back as BigInt
**Pitfall:** `===` comparisons silently fail and `JSON.stringify` throws on DB integer reads.
**Why:** The sql.js era returned BigInt for every 64-bit INTEGER; better-sqlite3 still returns BigInt for `lastInsertRowid`.
**Fix:** `Number()` every DB integer before comparing or persisting.
**Where:** `app/electron/database.js` (row mappers, `lastInsertRowid`) | **Status:** current

### 2. `db.exec(sql, [params])` silently ignores params
**Pitfall:** ELO scores never move from baseline, stat pages render empty.
**Why:** sql.js `exec` dropped its second argument; better-sqlite3 `exec()` has no binding support at all.
**Fix:** Parameterize reads/writes with `db.prepare(sql).get/all/run(...)` and `?` bindings; `exec()` is DDL-only.
**Where:** `app/electron/database.js` | **Status:** current rule, legacy root cause

### 3. `CURRENT_TIMESTAMP` is UTC
**Pitfall:** New chats land in the sidebar "earlier" group instead of "today".
**Why:** SQLite `CURRENT_TIMESTAMP` writes UTC; the sidebar groups by local time (`Date.now()`), a UTC+8 shift breaks it.
**Fix:** Use the `localNow()` helper for `updated_at` and any local-time write or comparison.
**Where:** `app/electron/database.js` (`localNow()`, session writes) | **Status:** current

### 4. SQL reserved words as column names
**Pitfall:** `kg_edges` queries fail at runtime.
**Why:** `from` / `to` are reserved words; unquoted they break SQL parsing.
**Fix:** Always quote them: `"from"`, `"to"` (DDL and queries).
**Where:** `app/electron/database.js` (`kg_edges` table) | **Status:** current

### 5. Explicit `NULL` bypasses a column `DEFAULT`
**Pitfall:** NOT NULL columns reject rows the app thought had defaults, or values silently end up null.
**Why:** SQLite applies a column `DEFAULT` only when the column is absent from the INSERT; an explicit `NULL` binding overrides it.
**Fix:** Supply real defaults in the app layer (`?? fallback`) before binding.
**Where:** any `INSERT ... VALUES (?, ...)` in `database.js` | **Status:** current

> Legacy (sql.js era): the `allRows()` wrapper and `saveDatabase()` /
> `flushDatabase()` calls are better-sqlite3 no-op compat shims — see the
> AGENTS.md hard rule. **superseded-by** better-sqlite3.

## Electron / main process

### 6. Electron lifecycle & API removals
**Pitfall:** App crashes on startup, or IPC-heavy features (chat, settings, protocol links) all die at once.
**Why:** `session.defaultSession.setSpellCheckLanguages()` and `protocol.handle()` must run after `app.whenReady()` in Electron v31+; Electron 43 also removed `nativeImage.createFromDataURL`.
**Fix:** Move them into `app.whenReady()` (see `initAppReady()` in `main.js`); guard spellcheck with `typeof`. Use `nativeImage.createFromBuffer(Buffer.from(b64, 'base64'))`.
**Where:** `app/electron/main.js` | **Status:** current

### 7. One IPC channel = one handler
**Pitfall:** Settings, skills, MCP, arena, memory all stop working at once.
**Why:** A duplicate `ipcMain.handle` throws, the throwing `registerXxxHandlers()` returns early, and every handler after it in the sequential chain never registers.
**Fix:** Keep exactly one registration per channel; register new handlers sequentially in `main.js`; grep the channel name first.
**Where:** `app/electron/ipc/*.handler.js`, `app/electron/main.js:251` | **Status:** current

### 8. `path.resolve(dir, '/x')` escapes `dir`
**Pitfall:** "Forbidden" white screen on every resource request.
**Why:** A leading `/` makes `path.resolve` treat the second argument as absolute and drop the base dir, so every asset fails the containment check.
**Fix:** Strip the leading `/` (`p.startsWith('/') ? p.slice(1) : p`) before resolving.
**Where:** `app/electron/main.js` (static server) | **Status:** current

### 9. MCP connect can hang startup
**Pitfall:** App sits on a blank screen after launch.
**Why:** `mcpManager.connectAll()` connects servers sequentially; one unresponsive server blocks everything.
**Fix:** Race each connect against a timeout (`MCP_CONNECT_TIMEOUT = 5000`).
**Where:** `app/electron/mcp/manager.js` | **Status:** current

## Module system (CJS/ESM)

### 10. TS type annotations in `.js` files
**Pitfall:** `SyntaxError: Unexpected token ':'` at load — the app won't start.
**Why:** `app/electron` runs under Node's CommonJS loader, which cannot parse `: string`, `as X`, or generics in `.js`.
**Fix:** `.js` in `app/electron` is plain JavaScript only — no type annotations, no type imports.
**Where:** all of `app/electron/` | **Status:** current (recurred repeatedly in W29-W30)

### 11. Mixing ESM into a CJS file
**Pitfall:** Module load failure (`require is not defined` or `Unexpected token 'export'`).
**Why:** A single `export` keyword flips the whole file to ESM, so `require` stops existing; conversely `module.exports` in an ESM file is ignored.
**Fix:** `app/electron` is CommonJS-only (`require` / `module.exports`); the renderer (`app/src`) is the ESM+TS side.
**Where:** `app/electron/` | **Status:** current

### 12. Accidentally deleted `module.exports`
**Pitfall:** LLM chat, arena, and model test-connection all fail; even settings look broken.
**Why:** `openaiAdapter.js` had its trailing `module.exports` deleted during an edit; `providerAdapter.js`'s `require()` then got `{}` and every call threw `TypeError`.
**Fix:** Keep the export tail intact; after editing any adapter, verify it still ends in `module.exports = { ... }` (openaiAdapter exports 9 functions).
**Where:** `app/electron/llm/openaiAdapter.js` (and sibling adapters) | **Status:** current

### 13. `yield*` drops dynamic generator properties
**Pitfall:** `.usage` (token counts) silently vanishes through multi-layer `yield*` delegation → `Cannot read properties of undefined`.
**Why:** `yield*` creates a new generator object that does not inherit dynamic properties attached to the delegating generator function.
**Fix:** Pass shared data as values (in the yielded data or module-level state), never as properties on generator function objects.
**Where:** `app/electron/llm/openaiAdapter.js`, `llm/providerAdapter.js` | **Status:** current

## Build & packaging

### 14. Stale `dist/` hides main-process changes
**Pitfall:** "I fixed it, but the bug is still there" — the app runs old logic.
**Why:** Electron loads the built `dist/`; editing `app/electron/*.js` does not rebuild it.
**Fix:** Run `npm run build` (or `npx vite build`) after main-process changes; use `npm run dev` during development.
**Where:** workflow (no single file) | **Status:** current

### 15. electron-builder v26 schema changes
**Pitfall:** CI build fails with "unknown property" validation errors.
**Why:** `darkModeSupport` was removed in electron-builder v26; `win:` must stay at the top level of the config.
**Fix:** Remove deprecated keys; keep platform sections at root; `--publish never` in CI unless a release is intended.
**Where:** `app/electron-builder.yml`, `app/package.json` | **Status:** current

### 16. Windows Defender locks the .exe during packaging
**Pitfall:** `electron-builder` fails with EPERM on `electron.exe`.
**Why:** Real-time AV scans/locks the freshly unpacked binary.
**Fix:** Retry, build the portable target, add an AV exclusion, or run elevated.
**Where:** build environment | **Status:** current (also in README)

### 17. Electron binary download can fail behind proxies
**Pitfall:** `npm install` stalls or errors on the Electron postinstall step.
**Why:** npm downloads the Electron binary from GitHub, which is slow/blocked in some networks.
**Fix:** Local `.npmrc`: `electron_mirror=https://npmmirror.com/mirrors/electron/`.
**Where:** developer `.npmrc` (not committed) | **Status:** current

### 18. Vite `strictPort` + stale dev server
**Pitfall:** App won't start after a crash; Vite exits immediately.
**Why:** Port 5173 is still held by an orphaned dev server and `strictPort: true` forbids auto-fallback.
**Fix:** Kill the old process (`taskkill` or close the terminal) and relaunch.
**Where:** `app/vite.config.ts` | **Status:** current

## Security & CI

### 19. `exec` → `spawn` (command injection)
**Pitfall:** A tool argument containing shell metacharacters executes extra commands.
**Why:** `child_process.exec` concatenates through a shell.
**Fix:** All tool execution uses `spawn` with an argument array (no shell).
**Where:** `app/electron/tools/exec.js`, `tools/registry.js`, `llm/toolLoop.js` | **Status:** current

### 20. SSRF: web tools hitting internal addresses
**Pitfall:** `web_fetch` / `web_search` can be steered at localhost / intranet.
**Why:** No DNS pre-check and no redirect control.
**Fix:** Shared `ssrf.js` guard: DNS resolve + private-IP check, and `redirect: 'error'` on fetches.
**Where:** `app/electron/tools/ssrf.js` | **Status:** current

### 21. Markdown XSS via event-handler attributes
**Pitfall:** Model output with `onclick=` / `onerror=` runs script in the renderer.
**Why:** Script tags were stripped but `on*` attributes (and `<style>`) were not.
**Fix:** Strip `on*` attributes and `<style>`/`<script>` with case-insensitive regexes, plus DOMPurify.
**Where:** `app/src/utils/markdown.ts` | **Status:** current

### 22. `fetch` does not honor AbortSignal during DNS
**Pitfall:** CI tests hang past the framework timeout on a bad URL.
**Why:** Node `fetch` only aborts after DNS resolves; an unresolvable host hangs to the OS TCP timeout.
**Fix:** Wrap in `Promise.race` with a hard timeout (compaction uses 3s).
**Where:** `app/electron/llm/compaction.js` | **Status:** current

### 23. `npm audit` transitive-CVE CI noise
**Pitfall:** A zero-change CI run goes red because a transitive dependency's CVE advisory was published overnight.
**Why:** `npm audit` reports current advisories, including transitive deps the repo never directly pins.
**Fix:** Triage advisories; gate on known/exploitable ones rather than failing on every advisory; keep CI permissions minimal.
**Where:** `.github/workflows/ci.yml`, dependabot config | **Status:** current

## TUI / Ink / terminal

### 24. TUI has its own module rules
**Pitfall:** `aether tui` fails to load components or pulls in Electron.
**Why:** `app/tui` is a bare-Node Ink v5 app with a local `{"type":"module"}` package.json and no bundler — Node does not load `.jsx`, and Electron APIs do not exist under plain Node.
**Fix:** Write components with `react.createElement` (no JSX, no bundler); keep pure logic in `reducer.js` / `keymap.js` / etc.; never `require('electron')` in TUI or SDK; run with Node ≥ 22.
**Where:** `app/tui/`, `app/electron/sdk/` | **Status:** current

## Workflow lessons

### 25. Zustand helpers must live inside `create()`
**Pitfall:** Runtime crash calling a helper, or silently dead store actions.
**Why:** `get()` / `set()` only exist inside `create()`'s closure; a helper defined at module scope that references them throws.
**Fix:** Define helper functions inside `create()`, or pass `get`/`set` explicitly.
**Where:** `app/src/store/index.ts` | **Status:** current

### 26. `useMemo` missing the `language` dependency
**Pitfall:** Sidebar labels stay in the old language after switching.
**Why:** A `useMemo` that calls `t()` without `language` in its deps keeps the stale cached value.
**Fix:** Include `language` in every `useMemo` dependency array that renders translated text.
**Where:** `app/src/components/sidebar/Sidebar.tsx` | **Status:** current

### 27. Worktree merges must copy base modules
**Pitfall:** Merging a branch produces cascade crashes across unrelated modules (chat, arena, memory).
**Why:** A worktree updated consumer modules (e.g. `credentialPool.js`) against a newer `database.js`; merging only the consumers left them calling the old export shape.
**Fix:** Merge dependency sets together; after a merge, sanity-load changed modules with `node -e "require('./electron/...')"` from `app/`.
**Where:** workflow (git worktrees) | **Status:** current

### 28. i18n source filenames
**Pitfall:** Looking for `i18n.base.json` (referenced in AGENTS.md) and not finding it.
**Why:** The actual generator inputs are `i18n-en-base.json` (English base) + `i18n-translations.json` (13 languages); `gen-i18n.js` emits `i18n.ts`.
**Fix:** Edit those two JSON inputs, then run `node src/utils/gen-i18n.js`. Never hand-edit the generated `i18n.ts`.
**Where:** `app/src/utils/i18n-en-base.json`, `app/src/utils/i18n-translations.json`, `app/src/utils/gen-i18n.js` | **Status:** current
