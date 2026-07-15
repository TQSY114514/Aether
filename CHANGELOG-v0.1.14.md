# AetherAI v0.1.14

UX polish + native Claude support. 5 commits since v0.1.13.

## New

- **Edit & resend a past user message** — hover any of your messages → pencil button → edit inline (Enter to resend, Esc to cancel). The model re-replies to the edited prompt; everything after is discarded. ChatGPT-style.
- **Habit learner** — recurring preferences ("reply concisely", "I prefer Python") are detected across conversations. When a preference repeats, AetherAI asks before applying it (no silent behavior changes) — consent promoted to an auto-applied skill. Hermes-style long-term acquisition, with a confirmation gate.
- **Native Anthropic Messages API** — providers that speak Claude's `/messages` protocol (x-api-key + anthropic-version) now work natively, alongside OpenAI `/chat/completions`. Pick the format when adding a provider. stepfun-style base URLs exposing both endpoints are fully supported. reasoning_effort → thinking.budget_tokens.
- **5 UX micro-features** (from a Hermes/Claude Code/ChatGPT study):
  - Failed-message **Retry** button (prominent, on error/aborted bubbles)
  - **Esc interrupts** streaming
  - **Ctrl+R** regenerates the last reply
  - **Rotating example prompts** in the empty state (8-pool, varies per session/day)
  - Habit-promotion confirmation card (see above)

## Fixes

- `db.prepare is not a function` cascade — the worktree merge shipped modules calling `db.prepare` on the database export, but the export didn't proxy raw sql.js handles. Now does (prepare/run/exec). This fixed blank output, fetch-models errors, title-summary crashes, autoMemory crashes — all downstream of credentialPool running on every request.
- `updater.checkForUpdatesAndNotifications` → `updater.check()` (the old method didn't exist on this electron-updater).
- TokenPage + MemoryPage hardcoded Chinese → i18n (29 new keys, 15 locales).

## Install

```bash
cd app && npm install && npm run build && npm start
```
Or `start.bat` at the repo root on Windows.

Full changelog: https://github.com/TQSY114514/AetherAI/commits/master
