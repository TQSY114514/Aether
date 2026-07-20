# Changelog

All notable changes to AetherAI are documented here.

## [0.1.19] — 2026-07-20

### Refactor
- DRY up `chat.send` params — re-applied `chatSendBase()` + `clearStreamingOnError()` after merge dropped them
- ChatWindow search input: 200ms debounce to avoid filter+scroll on every keystroke
- Removed unused `loadModels` import from ChatPage.tsx

### Bug Fixes
- **Critical**: MessageBubble `renderContent` was only called for user messages; assistant messages bypassed search highlight — now ALL messages go through `renderContent`
- Standardized error log prefix to `[AetherAI]` across `sendMessage`/`regenerate`/`editMessage`

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
