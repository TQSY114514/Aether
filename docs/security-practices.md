# Security Practices

How Aether keeps agent actions and your data contained. Every claim below
points at the code that enforces it.

## Permission ladder

Agent permission mode (`Settings - Agent & Safety`, per session in the UI):

| Mode | Reads | Writes | Use for |
|---|---|---|---|
| `plan` | allowed | blocked | reviewing what the agent *would* do |
| `ask` (default) | allowed | prompts per action | daily driving |
| `auto` | allowed | workspace writes auto-approved; risky actions still prompt | hands-off tasks inside one folder |
| `auto_confirm` | allowed | like `auto`, fewer prompts | trusted repetitive flows |
| `yolo` | allowed | everything, no prompts | throwaway VMs only |

Mapping lives in `app/electron/llm/toolLoop.js` (`agentModeToPermissionMode`);
policy enforcement in `app/electron/llm/permissionPolicy.js`.

## Tool risk gating

Every tool in `app/electron/tools/registry.js` declares `risk: safe|dangerous`.
`dangerous` tools require explicit confirmation in `ask` mode and are blocked
entirely in `plan` mode. Mutating tools (file write, shell, git push-class
operations) are never registered as `safe` — this is a hard rule in
`AGENTS.md`, locked by tests (`app/test/toolRiskGating.test.js`).

Skill invocation (`use_skill`) only loads prompt text; the skill's declared
permissions are surfaced as an annotation — actual capability always goes
through the real tool's permission gate above.

## Network policy (fail-closed)

`app/electron/tools/networkPolicy.js` evaluates web tool requests against a
user-configured whitelist. Design properties:

- If policy evaluation itself fails, tools receive `[blocked: ...]` rather
  than proceeding (errors propagate, never swallow).
- A malformed whitelist JSON is rejected instead of being read as "allow all".
- Block-mode with an empty whitelist still blocks.
- `web_fetch` runs every URL through `checkUrlPolicy` before fetching
  (`app/electron/tools/registry.js`).

## Tool output hygiene

Tool results pass through `app/electron/llm/toolResultMiddleware.js`
(redaction of secrets + truncation) before reaching the model. Never bypass it.
Memory injection wraps untrusted recalled content in `<untrusted_memory>` tags,
and compaction summary rules treat conversation history as untrusted data —
injected text cannot upgrade itself into instructions
(`app/electron/llm/memorySkillBridge.js`, `compaction.js`).

## Local-first storage

- Everything lives under `%APPDATA%/aetherai/`: `aetherai.db`
  (better-sqlite3, WAL), `background.img`. Nothing syncs anywhere.
- API keys are encrypted with Electron `safeStorage` (DPAPI-bound to your
  Windows user) before hitting the database.
- `.gitignore` excludes `*.db`, `.env*`, `background.img` — assume the repo
  becomes public before committing anything.

## Execution sandboxing (opt-in)

By default shell commands run locally with the permission gate above. Docker
sandboxing exists as an explicit opt-in: with feature flag
`exec.docker.defaultForAuto` enabled, `auto`-mode `run_command` executes inside
a container (`network: none`, exit-code captured via marker) — see
`app/electron/exec/resolveBackend.js` and `dockerBackend.js`. Yolo mode always
runs locally regardless of configuration; unavailable Docker silently falls
back to local. The whole operation is deadline-budgeted so a hung container
cannot stall the loop.

Windows path defenses (long-path `\\?\`, UNC, reparse-point/junction escapes,
dangerous extensions) live in the exec layer — see README "Windows Native".

## Feature flags default conservative

Every capability gate is declared in `app/electron/featureFlags.js`; unknown
keys fall back to defaults and flags never throw. New capabilities ship
disabled until you flip them.
