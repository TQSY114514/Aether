# Security Policy

AetherAI is a local-first desktop application. All your data (API keys, chat
history, personas, background image) stays on your machine in
`%APPDATA%/aetherai/` — nothing is uploaded to any AetherAI-operated server.
The only outbound network requests are to the LLM providers **you** configure.

## Reporting a vulnerability

If you find a security issue, please **do not** open a public GitHub issue.

Instead, report it privately via GitHub's advisory feature:

1. Go to the repo's **Security** tab → **Advisories** → **Report a vulnerability**.
2. Or email the maintainer directly if an address is listed on the profile.

Please include:
- A clear description of the issue and its impact.
- Steps to reproduce (minimal if possible).
- The AetherAI version (from Settings → About).

We will acknowledge within 72 hours and aim for a fix within 30 days for
high-severity issues.

## Agent safety model

AetherAI ships an agent that can read/write files and run shell commands. This
is powerful but inherently risky. The defenses, in order of strength:

1. **Permission modes** (Settings + chat bar): `off` · `plan` (read-only) ·
   `ask` (confirm each risky action) · `auto` (sandboxed) · `yolo` (full,
   warned on enable). **Keep `ask` for untrusted models.**
2. **Workspace sandbox**: `write_file`/`edit_file` are refused outside the
   configured workspace root; `run_command` blocks destructive patterns
   (disk format, recursive force-delete, shutdown, download-and-execute).
   `yolo` mode bypasses this — only enable it on a machine you can afford
   to lose.
3. **Session allow-rules**: "Allow & remember" is session-scoped and cleared
   on session delete. It never persists across app restarts.
4. **Loop detection + per-tool timeouts**: a stuck agent stops itself.

**Important limitations** (no true sandbox): tools run with your OS user
privileges. A determined model can still cause harm *within* the workspace,
or via a command the blocklist doesn't catch. The guarantee is the permission
gate, not OS-level isolation. For untrusted models, use `plan` or `ask` mode.

## Data on disk

- `aetherai.db` (SQLite) — sessions, messages, providers (incl. API keys),
  personas, model scores. **Treat this file as a secret.** Do not commit it
  (`.gitignore` excludes `*.db`).
- `background.img` — your custom background, if set.
- `title-debug.log` — diagnostic only, safe to delete.

Before sharing your `app/` folder or filing a bug with logs, confirm none of
these are included.
