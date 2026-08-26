# Migration Guide

Bringing providers, data, and habits over from other tools — and keeping your
data safe across upgrades and machines.

## Import providers from Claude Code / OpenCode

The first-run wizard offers **Import existing configuration** (also reachable
from the wizard's first choice screen). It reads:

- Claude Code: `~/.claude.json` and/or `~/.claude/settings.json`
- OpenCode: `~/.config/opencode/opencode.json` (+ `auth.json` for API keys)

Import results report what was created, skipped (already present, matched by
provider name), and any parse errors. API formats are normalized to Aether's
three supported values (`openai` / `anthropic` / `responses`); unknown formats
fall back to `openai`.

Prefer doing it manually? `Models → Add provider` (name / API URL / key),
then **Fetch models**. That is the entire setup.

## Where your data lives

Everything is under `%APPDATA%/aetherai/`:

| File | Contents |
|---|---|
| `aetherai.db` (+ `-wal`/`-shm`) | providers, models, sessions, messages, memory, personas, settings |
| `background.img` | custom background image |

No cloud copy exists. Back up by closing **all** Aether clients (desktop app
*and* any `aether tui` / CLI session — they share the same database and WAL
files; copying while one runs can produce an incomplete backup), then copying
this folder.

Note: the terminal TUI keeps its own lightweight key store at
`~/.config/aether/auth.json` (`/apikey` command) — separate from the desktop
database by design.

## Upgrading Aether

Schema migrations run automatically on first launch of a new version (the
`addCol` migration block in `app/electron/database.js` adds missing columns to
existing tables). No manual export/import is needed between releases.

## Moving to another machine (or Windows user)

1. Close Aether on the old machine.
2. Copy `%APPDATA%/aetherai/` to the same location on the new machine.
3. Re-enter your API keys once: they were encrypted with Windows DPAPI bound
   to the old user profile, so `safeStorage` cannot decrypt them elsewhere.
   Providers/models/sessions/history carry over untouched.

## Leaving Aether

Delete `%APPDATA%/aetherai/` and (if you used the TUI) `~/.config/aether/`.
That removes everything, including the database.
