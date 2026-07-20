# Changelog

All notable changes to AetherAI are documented here.

## [0.1.22] — 2026-07-20

### Reliability & UX
- **Credential rotation retry**: 429 / 5xx / network errors automatically retry with the next available API key before falling back to the next model. Up to 3 credential retries per request.
- **Full-app ErrorBoundary**: wraps the entire App (sidebar, dialogs, all pages) so a crash in any section doesn't blank the entire UI.
- **autoMemory sync race fix**: debounced sync now uses a last-args-wins pattern — rapid consecutive messages no longer lose the latest exchange's facts.

### Performance
- CredentialPool module reference cached in openaiAdapter.js and anthropicAdapter.js (eliminates per-request require() lookups)
- user_habit ALTER TABLE migration moved to database.js init (eliminates redundant SQL on every user turn)

## [0.1.21] — 2026-07-20

### Performance
- chat.handler.js: cache 5 rarely-changing settings at handler registration — eliminates repeated synchronous sql.js reads on every message send
- store/index.ts: collapse 8+ scattered get() calls in sendMessage/regenerate/editMessage into a single destructuring — reduces redundant store reads
- ChatWindow.tsx: StreamingBubble receives isAtBottom prop, skips scrollIntoView when user has scrolled up to read history

## [0.1.20] — 2026-07-20

### Performance
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
