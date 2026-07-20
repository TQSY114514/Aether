# Changelog

All notable changes to AetherAI are documented here.

## [0.1.20] — 2026-07-20

### Performance
- database.js: saveDatabase/flushDatabase now use async writeFile (was writeFileSync blocking main process during streaming)
- autoMemory.js: prefetch uses in-memory cache with version invalidation — avoids repeated full-table scans on consecutive turns
- ContextBar: import shared estimateTextTokens from tokenEstimate.ts (unified 6-range CJK coverage vs local single-range copy)
- chat.handler.js: config.handler.js: await flushDatabase (was fire-and-forget, could lose data on crash)

### Refactor
- database.js: move user_habit CREATE TABLE to init (was re-issued every turn in habitLearner.js)
- reasoning.js: remove dead CLAUDE_BUDGETS constant (exported but never consumed)

## [0.1.19] — 2026-07-18

### Performance
- StreamingBubble: rAF-throttled scrollIntoView + content-length guard (skip <2 char deltas)
- ContextBar: memoize token estimation (O(1) when messages array is stable during streaming)
- ChatPage/ChatInput: useMemo for model-group computation (O(P*M) only recomputes on providers/allModels change)
- Sidebar: date boundaries as timestamps (no new Date() allocation per group)
- i18n `t()`: fast path for English — skip redundant fallback lookup
- reasoning.js: pre-compile regexes at module level (was re-compiled per call)
- toolLoop.js: pre-compute planToolsPayload outside the while loop
- chat.handler.js: import estimateTokens from compaction.js (unified 6-range CJK coverage)
- database.js + habitLearner.js: CREATE TABLE user_habit at init (was called every turn)

## [0.1.18] — 2026-07-18

### Refactor
- DRY up `chat.send` params — extracted `chatSendBase()` helper used by `sendMessage`/`regenerate`/`editMessage`
- Extracted `clearStreamingOnError()` helper — identical streaming buffer cleanup in 3 call sites
- Removed duplicate session config loading in `ChatPage.tsx` (`selectSession` already handles it)
- Cleaned up redundant `console.error` calls; standardized `[AetherAI]` log prefix across all send paths

### Bug Fixes
- MessageBubble search highlight now works for assistant messages (rendered markdown HTML)
- Fixed `editMessage` `finalContent` closure bug

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
