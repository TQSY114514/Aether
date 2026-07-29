# AGENTS.md

Telegraph style. Read this before touching the repo. It is the project
constitution for human and AI contributors alike — what lives where, what the
hard rules are, and where to look before changing anything.

## What this is

AetherAI is a local-first, multi-model desktop AI chat client (Electron + React/TS
+ zustand + Tailwind + sql.js). The product is a single-developer app that treats
the LLM provider as a pluggable backend and keeps all user data on disk.

## Start

- Repo root: `D:\aetherai`. App code lives under `app/` (`app/src` renderer,
  `app/electron` main). Do not create a second app tree.
- Run: `start.bat` at repo root, or `cd app && npm run build && npm start`.
- Build installer: `cd app && npm run build:win` (note: host AV may remove the
  unpacked `electron.exe` during packaging — see README).
- Replies / refs use repo-root paths: `app/electron/ipc/chat.handler.js:53`. No
  absolute `D:\` paths in docs or comments meant for public consumption.

## Architecture map

- **Renderer** `app/src/`: `store/index.ts` (the big zustand store — all state +
  actions), `components/` (chat/sidebar/ui), `pages/` (model/persona/settings/…),
  `utils/` (i18n generated from `gen-i18n.js`, theme, markdown).
- **Main** `app/electron/`: `database.js` (sql.js wrapper, BigInt-normalized via
  `allRows`), `ipc/*.js` (one handler module per domain), `main.js` (window +
  handler registration), `preload.js` (contextBridge surface — the IPC contract).
- **LLM layer** `app/electron/llm/`: `providerAdapter.js` (dispatch by
  `provider.api_format`) → `openaiAdapter.js` (fetch + SSE). `toolLoop.js`
  (Plan→Act→Observe), `toolResultMiddleware.js` (redact+truncate tool output),
  `reasoning.js` (thinking-effort param shapes), `toolArgs.js`.
- **Tools** `app/electron/tools/registry.js` (built-in tools, `risk: safe|dangerous`).
- **MCP** `app/electron/mcp/`: `client.js` + `manager.js` — external stdio tool
  servers; their tools merge with built-ins via `getMergedTool(s)`.

## Hard rules

- **IPC contract is three files**: a handler in `ipc/`, its exposure in
  `preload.js`, and its type in `src/env.d.ts`. Changing one means updating all
  three. A handler that takes params the preload doesn't forward, or returns a
  shape `env.d.ts` doesn't declare, is a bug.
- **BigInt**: sql.js returns BigInt for 64-bit INTEGER. Every read path must go
  through `allRows()` (which coerces) or coerce manually. `db.exec()` does NOT
  bind params — use `prepare().bind()` for parameterized reads. We've been bit
  by both before.
- **Main-process changes require full restart**: `electron/` files are not
  hot-reloaded. The renderer rebuilds via `npm run build`, but the main process
  only picks up changes on a clean app restart (including tray). If a fix
  "doesn't work", confirm the user fully restarted.
- **Tools are permission-gated**: `risk: 'dangerous'` tools require confirmation
  in `ask` mode and are blocked in `plan` mode. Never add a mutating tool as
  `safe`. Tool results pass through `toolResultMiddleware` before reaching the
  model — never bypass it.
- **No secrets in source**: API keys, the DB, background image, and chat history
  live in `%APPDATA%/aetherai/` at runtime, never in the repo. `.gitignore`
  excludes `*.db`, `background.img`, `.env`, `dist/`, `node_modules/`. Before
  any commit, assume the repo will be public.
- **i18n is generated**: base keys live in `app/src/utils/i18n.base.json`;
  `gen-i18n.js` produces `i18n.ts` for all 15 languages. Don't hand-edit
  `i18n.ts`. New user-visible strings → add to `i18n.base.json` (zh + en at
  minimum) then regenerate. The `t()` placeholder syntax is `{0}` (positional);
  the generator wires the replace fn.
- **Storage is SQLite**: settings, sessions, messages, providers, models,
  personas, memory, arena votes, model scores — all in `aetherai.db`. The only
  file-on-disk exception is `background.img` (too large for a TEXT column).
  Don't add JSON/JSONL sidecar stores for runtime state.

## Before changing X, read Y

- Before changing chat send/stream → read `ipc/chat.handler.js` AND
  `store/index.ts` `sendMessage` AND `components/chat/ChatWindow.tsx` (the
  chunk listener) — all three coordinate the stream.
- Before changing tools → read `tools/registry.js`, `llm/toolLoop.js`, AND
  `llm/toolResultMiddleware.js`. A new tool needs `risk` set correctly.
- Before changing the IPC surface → read the handler, `preload.js`, AND
  `src/env.d.ts` (see hard rules).
- Before changing themes/background → read `utils/theme.ts` (it sets CSS vars
  including `--content-bg`) AND `App.tsx` (background layer + main container).
- Before changing DB schema → read `database.js` `initDatabase` (CREATE TABLE)
  AND the `addCol` migration block. Add new columns there so old DBs upgrade.

## Verification

- `cd app && npm run build` must pass before any commit.
- `node -e "require('./electron/ipc/<file>')"` from `app/` to sanity-check a
  main-process file loads (catches undefined refs like the `logTitle` crash).
- After a renderer change, restart is not required (dev server / rebuild). After
  a main-process change, full restart IS required.
