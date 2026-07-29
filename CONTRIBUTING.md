# Contributing to AetherAI

AetherAI is a personal/hobby project, currently in early beta. Contributions
are welcome but the bar is "it works and doesn't break existing features" —
not "production-grade review process".

## Before you start

- AetherAI is **Electron + React/TypeScript + zustand + Tailwind + sql.js**.
  Read `README.md` → Project structure first.
- All runtime data (API keys, chat history) lives in `%APPDATA%/aetherai/`,
  **not** in the repo. `.gitignore` excludes `*.db`, `background.img`, `.env`,
  `dist/`, `node_modules/`. **Never commit any of these.**

## Setup

```bash
cd app
npm install
npm run build      # build the React frontend into dist/
npm start          # or run ../start.bat on Windows
```

For development with hot reload, set `VITE_DEV_SERVER_URL` and run `npm run dev`
in a second terminal.

## Making changes

1. **Small, focused PRs.** One feature or one bug per PR.
2. **Build before pushing:** `npm run build` must pass. There's no test suite
   yet — if you fix a bug, describe the reproduction in the PR so it can be
   verified by hand.
3. **i18n:** if you add user-facing text, add the key to
   `app/src/utils/i18n-en-base.json` and run `node app/src/utils/gen-i18n.js`
   to regenerate the 15-language file. Don't edit `i18n.ts` by hand.
4. **IPC contract:** if you add/change an IPC handler, update **all three**:
   `electron/ipc/<x>.handler.js`, `electron/preload.js`, and `src/env.d.ts`.
   A mismatch here is the most common bug class.
5. **Agent tools:** new tools go in `electron/tools/registry.js` as
   `{ name, description, parameters, risk, run }`. Mark `risk: 'dangerous'`
   for anything that mutates state — the permission gate depends on it.

## Commit messages

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, …). See the git log
for the tone. Keep the subject ≤72 chars; explain *why* in the body.

## Reporting bugs

Open a GitHub issue with:
- AetherAI version (Settings → About).
- OS.
- Steps to reproduce.
- Expected vs actual behavior.
- Any error text (from the dev console if you can open it, or from
  `%APPDATA%/aetherai/title-debug.log` for agent/title issues).

**Do not paste your API keys or chat history.** Screenshots are fine if they
don't contain secrets.

## Security issues

See `SECURITY.md` — report privately, not as a public issue.

## Code style

- TypeScript for the renderer; plain Node CJS for the main process.
- Match the surrounding file's style. Comments explaining *why* are welcome;
  comments restating *what* the code does are not.
- No new heavy dependencies without discussion. The project deliberately stays
  lean (no Radix/cmdk/react-markdown — components are hand-rolled).
