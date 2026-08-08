# Changelog

All notable changes to AetherAI are documented here.

## [Unreleased]

### Infrastructure — Phase 0 (feature flags & observability)

- **Centralized feature-flag registry** — new `app/electron/featureFlags.js`
  is the single source of truth for capability gates: flags are declared once
  (key + default + category + description), persisted in the `settings` table
  under `feature_flag.<key>`, and read through `isEnabled(db, key)`. Unknown
  keys and broken DBs are safe no-ops (defaults apply), so old data and old
  DB files keep working. Shipped with flags for the roadmap: repo-map,
  docker/ssh/cloud execution backends, scheduler queue, worktree isolation,
  background review, full LSP, experience replay, skill self-evolution and the
  plugin SDK.
- **Flags IPC contract** — `flags:list` / `flags:set` handlers in
  `app/electron/ipc/flags.handler.js`, exposed on `window.electronAPI.flags`
  (preload) with types in `src/env.d.ts`; changes emit `flags:changed` on
  ipcMain so main-process consumers react without renderer involvement.
- **Renderer flag hooks** — `app/src/utils/featureFlags.ts` provides
  `useFeatureFlag(key)` / `getFeatureFlag(key)` / `setFeatureFlag()` with a
  cached snapshot kept in sync via the `flags:changed` event.
- **Logger upgrades** — `logger.js` gains a runtime file-logging switch
  (`setFileLogging`, driven by the `debug.fileLog` flag) and an
  `addEntryListener` API that forwards `{level,time,msg}` entries to the
  renderer (`main:log`) when the `debug.logForward` flag is on — the basis
  for an in-app debug/log panel. All existing log call sites unchanged.

### Infrastructure — Phase 1 (execution backends & task scheduler)

- **Execution backend registry** — new `app/electron/exec/backend.js`
  abstracts agent task execution behind one contract
  (`execute/status/terminate/pause/resume`): `localBackend.js` (spawn),
  `dockerBackend.js` (docker CLI sandbox), and `sshBackend.js` (remote).
  Assembled once in `exec/index.js`; unknown backend ids fall back to local.
- **Queue-based task scheduler** — `app/electron/llm/backgroundTasks.js`
  rewritten around a real scheduler: tasks get a `priority`-ordered queue
  with automatic retry up to `maxRetry`, persist to the `agent_task` table,
  and are crash-recoverable — `restorePendingTasks()` re-queues running/
  pending tasks on app restart so work survives a kill.
- **Task IPC contract** — `task:start` forwards `priority`/`maxRetry` to the
  scheduler in `app/electron/ipc/task.handler.js`, exposed on
  `window.electronAPI.task` with types in `src/env.d.ts`.

### 记忆 — Wave 5 (knowledge graph 产品化收尾)

- **KG 存取修复(迁移 better-sqlite3)** — `knowledgeGraph.js` 的
  `buildGraph`/`searchGraph` 原用 sql.js 时代 API(`db.exec()[0].values`),
  在 better-sqlite3 下永远返回空 → 图从未真正写入/检索。现改用
  `db.allRows` 参数化查询: buildGraph 以 SELECT-before-INSERT 实现
  kg_nodes 幂等 upsert(重复构建不产生重复节点), relation 记忆写出
  kg_edges(INSERT OR REPLACE);searchGraph 经 1-hop 邻接实体扩展关键词,
  命中图内实体的间接记忆也能被检索。
- **KG 数据接入可视化** — 新增 `kg:graph` IPC 通道
  (`ipc/kg.handler.js` → `window.electronAPI.kg.graph`),LearningGraphPage
  优先渲染后端 kg_nodes/kg_edges 数据(实体/关系节点),后端图为空或不可
  用时回退到原有 memories×skills×sessions 前端 buildGraph — 页面在无图谱
  数据时保持原样。新增 `adaptKgData` 适配器(实体类型落入 memory 桶)。

## [0.6.0] — 2026-08-06

### Agent
- **Test-first (RED→GREEN) workflow** — new `test_first` tool: asks the model to write a failing test for the goal, runs the project's test command, then loops the model through implementation attempts (up to 3 cycles) until the test passes. Skips cleanly (falls back to debug_loop) when the workspace has no test framework. Sandbox-guarded: writes go through the workspace path check, commands through the sandbox command guard.
- **Symbol location tracking (LSP-lite)** — `symbolExtractor` now records brace-balanced `locStart`/`locEnd` line ranges for every symbol across JS/TS/Python/Rust/Go/Java; the dependency graph carries them; new `find_symbol` tool resolves where a function/class/const is defined with file:line results.
- **Tool-loop observability** — new `toolLoopMetrics` module persists one row per agent run (iterations, tokens, duration, error kind) and one per tool call (`tool_loop_run` / `tool_call_sample` tables); TokenPage gains an "Agent Tool Loop" section (run count, avg iterations/duration, error rate, per-tool table); audit log now reports real average tool latency instead of a hardcoded 0.
- **Live tool-call timer + long-result collapse** — the loop emits a "started" placeholder before each tool runs; ToolCallBlock renders a live elapsed timer (0.1s ticks) while running, and long results collapse to a single click-to-expand line instead of flooding the chat.

### Local Gateway & VS Code
- **Local Gateway** — HTTP API on 127.0.0.1 (token-protected, enabled by default) exposing `chat:complete` (synchronous completion for external clients) plus connection info in Settings; the gateway auto-starts with the app and its token is generated once and persisted.
- **CLI `--json-lines`** — headless mode streams NDJSON events (`status` / `plan` / `tool:start` / `tool:end` / `text` / `done`) line-by-line, so external consumers get live status, tool calls and streamed output.
- **VS Code extension (CLI-backed)** — `extension/`: spawns the Aether CLI (`--json-lines`) as a child process and hosts a chat Webview streaming status, tool calls and code live.
- **VS Code extension (gateway-backed)** — `extensions/vscode-aether/`: connects to the desktop app's Local Gateway for inline chat, ask/explain selection, fix file errors, and code generation; host/token configured in VS Code settings.

### Backup & Security
- **Config export/import** — full backup/restore of providers, models, personas, sessions, messages, memory, settings, arena votes, model scores and (optionally) the background image; `merge` mode appends safely, `overwrite` mode rebuilds runtime data; API keys are re-encrypted through the target machine's safeStorage on import.
- **API key encryption migration** — startup migration re-encrypts any legacy plaintext API keys via safeStorage (base64 heuristic detects leftovers); a one-time warning is logged when system encryption is unavailable.

### Skills & MCP
- **Skills directory import** — import a skill folder (or a folder of skills) from disk into the user-global skills root; SkillsPage gains the import UI.
- **MCP market browser** — McpSettings can list, search and install MCP servers from a marketplace registry.

### CI / Chore
- **E2E launch smoke test** — `npm run test:e2e` spawns the real Electron binary against the built renderer in a throwaway user-data dir and asserts it stays alive; wired into CI as a non-blocking step (electron binary fetched explicitly).
- Removed the MOA module; i18n base keys extended; `runOne` exported from `lintTestRepair` (test-first RED run previously crashed on the missing export).

### Bug Fixes
- **testFirst unit tests** — the `providerAdapter` mock now lives at the CJS `Module._load` layer so both the test and `testFirst.js`'s `require('./providerAdapter')` see the same mocked `completeChatMessage` (a `vi.mock` factory output is invisible to native CJS requires, which made RED call the real adapter and fail with a URL parse error).

## [0.5.0] — 2026-07-23

### Agent
- **Parallel tool execution** — each tool call can run in parallel or sequentially (configurable per-tool, OpenClaw pattern)
- **Tool lifecycle hooks** — `prepareArguments` → `beforeToolCall` → execute → `afterToolCall`
- **Tool call repair** — auto-fix malformed JSON, missing args, and truncated calls before execution
- **Extended hook system** — added `SessionStart`, `SessionEnd`, `SubagentStop` hooks
- **Context compaction** — pair-preserving split keeps tool-call/result pairs intact; UUIDs/paths/IPs preserved verbatim

### Bug Fixes
- **Double-submit prevention** — disabled the Send button during streaming so rapid clicks don't queue duplicate requests
- **New chat not disappearing** — fixed race condition where `createSession` re-fetched the session list before the new session was persisted, causing it to be pruned immediately
- **Missing pinSession on session:list** — pin status was lost when the renderer received the session list
- **Prune races** — moved empty-session pruning into the `session:list` IPC handler so the renderer never sees placeholder sessions, eliminating startup race conditions
- **Current session dangles after prune** — if the active session was pruned as empty, the selection now clears instead of showing a ghost chat window
- **Timezone-correct timestamps** — replaced `CURRENT_TIMESTAMP` (UTC) with local time so new chats don't appear in the wrong date group
- **Removed TypeScript type annotation** from `localNow()` pad function in a `.js` file
- **Removed useless persona 'use' button** — was wired to a no-op that never applied the persona

### Chore
- README optimization: table of contents, badges, roadmap, categorized acknowledgements, beautified all 13 translated READMEs

## [0.4.5] — 2026-07-23

### Bug Fixes
- **Session timestamps use local time** — replaced UTC `CURRENT_TIMESTAMP` with local-time strings so new sessions appear in the correct date group regardless of timezone
- **Prevent blank chat entries** — `createSession` no longer adds an empty placeholder to the local sessions list; `loadSessions()` fetches the clean pruned list from DB instead

## [0.4.4] — 2026-07-22

### Bug Fixes
- **Fixed streaming display** — output now appears in a proper message bubble that grows with content, instead of only showing after completion
- **Fixed background streaming** — switching to another chat no longer shows "aborted"; the stream continues in the background
- **Fixed sidebar pinned group** — pinned sessions now appear in their own group at the very top (above all date groups), sorted by most recently updated
- **Removed auto-pin on send** — sessions are only pinned when the user manually clicks the Pin button

### Features
- **Visible Pin/Unpin button** — each sidebar session item now has a Pin icon button (amber when pinned, appears on hover)
- **Streaming indicator** — spinning icon on sidebar sessions that are actively generating
- **Completion toast** — clickable notification appears when assistant finishes responding

## [0.4.3] — 2026-07-22

### Bug Fixes
- **Fixed new chat creation** — `createSession` no longer requires a pre-configured model; sessions can now be created even when no provider is set up
- **Fixed JS syntax error in `database.js`** — TypeScript annotation `(s: any)` was present in a `.js` file, crashing the main process on startup
- **Fixed `ErrorBoundary` crash on startup** — `EffortControl`, `StreamingStatusBar`, and `ModelSelector` components were accidentally deleted from `ChatInput.tsx` but still referenced in JSX, causing a runtime `ReferenceError`

### Features
- **Auto-pin on send** — when the user sends a message, the session is automatically pinned to the top of the sidebar during the active exchange
- **Auto-unpin on completion** — when streaming finishes, the session is unpinned so it returns to its time-sorted position (not permanently pinned)
- **Completion toast notification** — a clickable toast appears when the assistant finishes responding; clicking it navigates to that session
- **Sidebar streaming indicator** — a spinning icon appears next to sessions that are currently generating a response

### Improvements
- **Smooth streaming display** — removed the `< 4` character skip threshold that caused laggy CJK text rendering; content now updates on every animation frame for true character-by-character display
- **Fixed streaming bubble rendering** — the chunk listener now stores the real `messageId` in the buffer on the first chunk, so the streaming placeholder renders from the first token (previously only appeared after completion)
- **Sidebar sorting** — removed the separate "Pinned" group; pinned sessions now sort to the top within their date group (today/yesterday/week/older) via `pinned DESC, updated_at DESC`
- **Streamlined session creation** — consolidated `session:create-and-select` into a single IPC handler replacing 7+ sequential calls
- **Cross-session streaming** — messages completed while viewing another session now appear correctly when switching back

## [0.4.2] — 2026-07-21

### Bug Fixes
- **Critical: Fixed modelId assignment bug** in `sendMessage` — `resolveModelId()` returned `{providerId, modelId}` but the destructuring assigned `providerId` to the local `modelId` variable, causing the model to be `null` in API requests when auto-resolving
- **Critical: Implemented `ensureToolCallListener`** — tool-call events from the main process were never consumed by the store, so `toolCallsByMessage` was always empty and tool-call blocks never rendered in the UI
- **Fixed logger `isDev` logic** — the double-negation was correct but had been accidentally reverted in a prior edit
- **Fixed `lastId()` crash** — added optional chaining to prevent `TypeError` when `last_insert_rowid()` returns an empty result set

### Maintenance
- Removed dead code: `llmShared.js` duplicated `computeCost` and `withRetry` (already in `utils/cost.js` and `utils/retry.js`)
- Removed unused `fallbackModels` variable in chat handler
- Cleaned 500+ MB of cache/build artifacts (`.tmp_fetch`, `release/`, `.electron-builder-cache/`, `dist-out/`)
- Fixed TS errors: added missing `ruby` language import, removed stale `@ts-expect-error`
- Restored empty CI workflow files from git history

## [0.4.0] — 2026-07-20

### Features
- **Auto-detect theme**: new "Auto (system)" option follows OS dark/light preference via `prefers-color-scheme`. Set in Settings → Theme or from the theme switcher.
- **Session context menu**: right-click any session in the sidebar for Rename, Pin/Unpin, Export conversation (JSON), and Delete. No more hunting for the small trash icon.
- **MemoryPage upgrades**: search/filter memories, import from JSON, type badges (entity / fact / context) with color coding, type selector when adding new memories.
- **Vim-style editing shortcuts** in ChatInput: Ctrl+U deletes from cursor to line start, Ctrl+K cuts from cursor to line end (to clipboard).
- **Code block line numbers**: every multi-line code block now shows line numbers via numbered spans — no toggle needed.

### UX Polish
- Session context menu uses fixed positioning with viewport clamping so it never renders off-screen.
- MemoryPage type summary badges with per-type color coding and counts.
- MemoryPage now supports import in addition to export.

### Tests
- **19 new tests** for `compaction.js`: estimateTextTokens (English, CJK, mixed), estimateMessageTokens (string, multimodal, null), estimateMessagesTokens (safety margin), safeSplitIndex (boundary logic), maybeCompact (under-budget pass-through, budget-0 pass-through, system-message preservation, tool-pair integrity on hard-truncate).
- Total test count: 24 (5 existing + 19 new). All passing.

### Maintenance
- Fixed `start.bat` version fallback (was 0.2.0, now correctly reads 0.3.1+).
- Bumped version to 0.4.0 across package.json and electron-builder.yml.
- Vite production build verified (14.7s, 36KB CSS + 450KB JS gzip 134KB).

## [0.3.0] — 2026-07-20

### Security
- **XSS fix**: markdown renderer now strips `on*` event handler attributes from rendered HTML — blocks injected JS via malicious markdown content (defense-in-depth beyond the existing `<script>` tag stripping)

### Syntax Highlighting
- Code blocks now render with syntax highlighting via highlight.js — supports 40+ languages with the atom-one-dark theme
- Language aliases (js→javascript, ts→typescript, py→python, etc.) for common shorthand
- Auto-detection fallback when the language isn't explicitly named

### UX Polish
- **Streaming indicator**: replaced the single blinking cursor with a 3-dot bounce animation during streaming
- **Empty state**: hero icon now has a pulsing glow animation; example cards lift on hover with icon scale; staggered entrance animations
- **Message bubbles**: added `hover:shadow-lg` (user) and `hover:shadow-soft` (AI) for depth on hover; copy feedback now shows "Copied!" instead of localized text; timestamp and action buttons fade in together on hover
- **Keyboard shortcuts overlay**: press `?` or `Shift+/` to see all shortcuts; also accessible via the command palette
- **Sidebar**: session count badge on the header; search result count badge; improved hover states with subtle border transitions; group count labels

### Performance
- highlight.js code-split into its own chunk (code-split at ~940KB gzipped to ~312KB — loaded only when markdown is rendered)

## [0.2.0] — 2026-07-20

### Markdown Rendering
- Task lists: `- [ ]` and `- [x]` render as interactive checkboxes with strikethrough for completed items
- Strikethrough: `~~text~~` now renders as `<del>`
- Lists: consecutive `<li>` elements are wrapped in `<ul>` with proper bullet/numbered styling
- Links: styled with accent color + underline offset for better readability
- Headings: added proper font-weight and margin hierarchy for h2–h5
- Blockquotes: refined border-left accent color
- Code spans: consistent sizing and background
- Images: border-radius and margin for visual breathing room

### UX Improvements
- ToolCallBlock: auto-expands when a tool errors, so the user sees the failure without manual clicking
- ChatInput textarea: auto-resize now reacts to sending state, slash menu visibility, attachments, and snippets (was only on `input` changes)
- ContextBar: uses shared `DEFAULT_CONTEXT_WINDOW` constant instead of magic `128000`

### Maintenance
- Bumped version to 0.2.0 across package.json, electron-builder.yml, and start.bat
- Cleaned up 7 stale local branches and 4 worktrees
- Removed stale `_ref/` directory

## [0.1.27] — 2026-07-20

### DRY & Refactor
- Extracted `computeCost` to shared `electron/utils/cost.js` — eliminates copy-paste between `chat.handler.js` and `arena.handler.js`
- Extracted credential-rotation retry to shared `electron/utils/retry.js` — `retryStream`/`retryPromise` used by both `openaiAdapter.js` and `anthropicAdapter.js`
- Extracted shared LLM utilities (`baseUrl`, `normalizeUsage`) to `electron/utils/llmShared.js` — single source of truth for usage normalization
- Store: DRY'd `setXxx` setters — `setMaxTokens`, `setTemperature`, `setTopP`, `setSystemPrefix`, `setTitleLanguage`, `setBackgroundOpacity`, `setBackgroundBlur` now use a shared `setSetting` helper
- ChatInput: removed hardcoded `TEXT_EXTS` array and `MAX_BYTES`/`PASTE_COLLAPSE_*` constants — imported from shared `src/utils/constants.ts`
- ContextBar: uses shared `DEFAULT_CONTEXT_WINDOW` constant instead of magic `128000`

### Error Handling
- Store: `loadMemories`, `loadSettings`, `resolveModelId`, `dismissHint` catch blocks now log warnings instead of silently swallowing errors
- ChatInput: `handleFileSelect` FileReader errors properly reported via state

### Security
- Markdown `safeUrl`: now explicitly blocks `javascript:` and `vbscript:` URLs — closes a potential XSS vector

### Performance
- ScoresPage: `byIntent` grouping wrapped in `useMemo` — eliminates recompute on every render

### Maintenance
- Updated `electron-builder.yml` copyright year to 2026

## [0.1.26] — 2026-07-20

### Performance & Refactor
- Store: extracted `resolveModelId()` helper — DRY's up the 3-step model fallback (allModels → primary → listAll) that was copy-pasted in `createSession`, `selectSession`, and `sendMessage`
- Store: replaced all inline `console.error/warn` with the centralized `@/utils/logger` ring-buffer logger for consistent log formatting
- ChatInput: memoized slash-command filtering with `useMemo` — stops calling `t()` on every keystroke when the menu is hidden; ID-only filter when querying
- Sidebar: pre-computed `lowerQuery` once outside the `useMemo` dependency chain — avoids calling `.toLowerCase()` per-session per-filter evaluation
- ChatWindow: streaming scroll switched to `behavior: 'auto'` — eliminates animation-frame queue buildup during rapid token streaming (was `smooth`, which queued overlapping scroll animations)

### Maintenance
- Updated `electron-builder.yml` copyright year to 2026

## [0.1.25] — 2026-07-20

### Performance & Fixes
- Markdown renderer: single-slot memoization wrapped in `renderInner()` — avoids redundant re-parses when the same committed bubble re-renders after a sibling update
- App.tsx: keyboard shortcuts effect dependency array corrected to `[]` — eliminates unnecessary re-binding on every store change
- Removed dead LRU cache array (`_cache[]`) and unused `CACHE_SIZE` constant from markdown.ts

## [0.1.24] — 2026-07-20

### Performance & Maintenance
- Centralized logging: all `console.log/warn/error` in `electron/` replaced with `electron/logger.js` ring-buffer logger (500-entry in-memory history, structured levels, dev/prod gating)
- Vitest test infrastructure: 9 passing tests for logger ring buffer and memory keyword extraction
- Re-enabled npm postinstall scripts in `start.bat` (was `--ignore-scripts`, broke `sharp` native module)

### Reliability
- Fixed stale version string in `start.bat` (was v0.1.15, now reads package.json)

## [0.1.23] — 2026-07-20

### Performance
- rAF-batched streaming updates: chunk listener accumulates deltas and flushes at most 60Hz via requestAnimationFrame instead of triggering a zustand setState per token (~100+ Hz)
- Habit promotion skips disk rescan: direct in-memory index update instead of re-reading all skill dirs (O(skills) stat calls eliminated)
- Search highlight RegExp memoized in MessageBubble (was re-created per render per bubble)

### Security & UX
- Strip `<script>` tags in markdown renderer (defense-in-depth XSS prevention)
- ErrorBoundary localized + dev-mode stack trace display

### Reliability
- autoMemory sync: last-args-wins debounce (rapid messages no longer lose latest exchange facts)
- Full-app ErrorBoundary wraps sidebar + dialogs (crashes don't blank the entire UI)
- Credential rotation retry: 429/5xx/network → retry with next key (max 3 per request)
- CredentialPool require cached in both adapters (one lookup per process)
- user_habit ALTER TABLE moved to database.js init

## [0.1.22] — 2026-07-20

### Performance
- chat.handler.js: cache 5 rarely-changing settings at handler registration — eliminates repeated synchronous sql.js reads on every message send
- store/index.ts: collapse 8+ scattered get() calls in sendMessage/regenerate/editMessage into a single destructuring — reduces redundant store reads
- ChatWindow.tsx: StreamingBubble receives isAtBottom prop, skips scrollIntoView when user has scrolled up to read history
- database.js: saveDatabase/flushDatabase now use async writeFile (was writeFileSync blocking main process during streaming)
- autoMemory.js: prefetch uses in-memory cache with version invalidation — avoids repeated full-table scans on consecutive turns
- ContextBar: import shared estimateTextTokens from tokenEstimate.ts (unified 6-range CJK coverage vs local single-range copy)
- chat.handler.js: await flushDatabase (was fire-and-forget, could lose data on crash)

### Refactor
- database.js: move user_habit CREATE TABLE to init (was re-issued every turn in habitLearner.js)
- reasoning.js: remove dead CLAUDE_BUDGETS constant (exported but never consumed)

## [0.1.19] — 2026-07-20

### Bug fixes & refactor
- **Critical**: MessageBubble search highlight now works for assistant messages (rendered markdown HTML)
- ChatWindow search: 200ms debounce to avoid filter+scroll on every keystroke
- DRY up chat.send params — extracted chatSendBase() + clearStreamingOnError() helpers
- Removed duplicate session config loading in ChatPage.tsx
- Standardized error log prefix to `[AetherAI]` across sendMessage/regenerate/editMessage

## [0.1.18] — 2026-07-18

### Performance
- StreamingBubble: rAF-throttled scrollIntoView + content-length guard (skip <2 char deltas)
- ContextBar: memoize token estimation (O(1) when messages array is stable during streaming)
- ChatPage/ChatInput: useMemo for model-group computation (O(P*M) only recomputes on providers/allModels change)
- Sidebar: date boundaries as timestamps (no new Date() allocation per group)
- i18n `t()`: fast path for English — skip redundant fallback lookup
- reasoning.js: pre-compile regexes at module level (was re-compiled per call)
- toolLoop.js: pre-compute planToolsPayload outside the while loop

### Bug Fixes
- Fixed editMessage finalContent closure bug
- Removed duplicate config loading in ChatPage.tsx
- Cleaned up redundant console.error calls

## [0.1.17] — 2026-07-18

### Features
- Auto long-term memory: fire-and-forget fact extraction after each turn (Hermes-style)
- Habit learner: proposes repeatable actions as inline cards
- ChatWindow streaming perf bypass: direct DOM writes instead of React re-render per chunk
- toolLoop heartbeat + error classify improvements
- Parallel startup: load providers/models/sessions concurrently

## [0.1.16] — 2026-07-18

### Fixes
- Purged diagnostic log files and cleanup code
- Fixed 12 bugs (context compaction, tool-loop, session navigation, etc.)
