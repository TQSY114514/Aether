# Changelog

All notable changes to AetherAI are documented here.

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
