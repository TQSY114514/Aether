# Changelog

All notable changes to AetherAI are documented here.

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
