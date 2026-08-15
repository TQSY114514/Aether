# Where New Behavior Goes — Aether extension map

One decision table: "I want to add X — which file do I touch?" Each row names
the exact surface (file + symbol) that defines the addition point. Read
[AGENTS.md](../AGENTS.md) (constitution + hard rules) before changing anything,
and [pitfalls.md](./pitfalls.md) for the known traps.

## Decision table

| You want to add… | Touch this | Notes |
|---|---|---|
| A built-in tool | `app/electron/tools/registry.js` (`TOOLS` array) | Every tool needs `risk: 'safe' \| 'dangerous'`. Tool results pass through `app/electron/llm/toolResultMiddleware.js` — never bypass it. |
| An MCP server | `app/electron/mcp/client.js` (client) / `app/electron/mcp/manager.js` (`connectServer` → merged into `mergedTools`) | TUI/CLI connect via `app/electron/llm/headlessMcp.js` (`connectMcpServers` → `manager.registerTools`); the tool loop sees MCP tools through `getMergedTool(name)` / `getMergedToolsPayload(mode)` in `manager.js` — no special handling. |
| A skill (`SKILL.md`) | drop into `app/skills/` (built-ins) or `<workspace>/.claude/skills/`; loader = `app/electron/llm/skills.js` | Claude-Code-compatible format; injected as an `<available_skills>` XML block. |
| A slash command | `app/tui/sessionCommands.js` (`SLASH_COMMANDS` + `parseSessionCommand`) + dispatch in `app/tui/App.mjs` `handleCommand` | Keep the parser pure — it is unit-tested. |
| A TUI keybind | `app/tui/keyHandlers.js` (`normalizeKey` + `modeHandlers` table) | Document in `docs/tui-keys.md`; users may rebind via `~/.config/aether/keybindings.json` (loader `app/tui/keybindings.js` `loadKeybindings`). |
| A hook | `app/electron/llm/hooks.js` (`HOOK_TYPES`) | 10 lifecycle points: PreToolUse / PostToolUse / ToolError / PreCompact / PostCompact / PreSend / PostResponse / SessionStart / SessionEnd / SubagentStop. |
| An execution backend | `app/electron/exec/backend.js` (`registerBackend`) — implement `execute/status/terminate/pause/resume` | Backends assembled once in `app/electron/exec/index.js`; unknown ids fall back to `local`. |
| An LLM provider format | `app/electron/llm/providerAdapter.js` `DISPATCH` + a new adapter file beside `openaiAdapter.js` / `anthropicAdapter.js` / `responsesAdapter.js` | Dispatch key = `provider.api_format`; unknown formats fall back to `openai`. |
| An IPC channel | 3-file contract: handler `app/electron/ipc/<domain>.handler.js` + exposure `app/electron/preload.js` + type `app/src/env.d.ts` | Changing one means updating all three. |
| A settings/feature flag | `app/electron/featureFlags.js` (registry entry: key + default + category + description) | Persisted in `settings` under `feature_flag.<key>`; read via `featureFlags.isEnabled(db, key)` (main) / `useFeatureFlag(key)` (renderer). |
| An i18n string | `app/src/utils/i18n-en-base.json` (+ `i18n-translations.json`) then run `app/src/utils/gen-i18n.js` | Never hand-edit generated `app/src/utils/i18n.ts`; `{0}` positional placeholders. |
| A DB column/table | `app/electron/database.js` `initDatabase` (CREATE TABLE) + the `addCol` migration block | Add columns in `addCol` so old DBs upgrade. |
| Persist new user data | `settings` table, `feature_flag.<key>` pattern | No new tables for flags/settings (graph memory stays in `kg_nodes`/`kg_edges`). |
| TUI state/behavior | `app/tui/reducer.js` (pure state machine) + `app/tui/keyHandlers.js` (input) + `app/tui/App.mjs` (render) | Keep logic in pure modules — they are unit-tested; components stay thin. |
| A CLI flag | `app/cli.js` `parseArgs` + `HELP` | Defaults/config/env: `app/electron/cli/config.js`. |

## Capability seams — how Aether extends itself

Model borrowed from DeepSeek Harness's three roles:

- **Service definition** — the contract naming a capability (a tool schema, a
  backend's methods, a permission decision's shape).
- **Provider** — a concrete implementation behind a contract (a tool entry, a
  backend, a provider adapter).
- **Consumer** — code that uses the contract without knowing the provider (the
  tool loop, the exec registry, the permission gate).

Aether's existing seams (the closest thing to plugin points):

- Execution backend — `app/electron/exec/backend.js` contract
  (`execute/status/terminate/pause/resume`; local / docker / ssh).
- Provider adapter — `app/electron/llm/providerAdapter.js` `DISPATCH`
  (openai / anthropic / responses).
- Permission decision — `app/tui/allowRules.js` `decideTuiPermission`
  (deny rule > read-only auto-allow > approval mode > rules > ask).
- Sandbox — `app/electron/tools/sandbox.js` (workspace root + traversal guard
  + command blocklist).

Note: Aether is **not** a plugin framework (unlike dsh / Cordis). These seams
are extension points, not a plugin bus — "everything is a plugin" is NOT the
goal. Add a provider behind an existing contract; do not invent a new
registration mechanism unless a contract is missing.
