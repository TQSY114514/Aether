# Review Checklist (Aether)

Companion to the `review-design` skill. That skill supplies the stance —
simplest sufficient implementation, ownership/shared-interface/scope challenges.
This file supplies the part it cannot know: which complexity here is deliberate,
and which defects are the recurring ones.

**Precedence: this file and AGENTS.md outrank the skill's generic tendencies.**
When the skill argues that a mechanism is unnecessary, check it against
"Deliberate complexity" below before writing the finding.

## Deliberate complexity — do NOT recommend removing

These look like over-engineering to a generic reviewer. They are not.

| Looks redundant | Why it exists | Where |
|---|---|---|
| Separate handler / `preload.js` / `env.d.ts` triples | The IPC contract is three files by hard rule; all three must match | AGENTS.md Hard rules |
| Plain CommonJS `.js` in `electron/` | Node's CJS loader rejects `import`/`export` and TS annotations | AGENTS.md pitfalls |
| Boundary code keeping SDK modules Electron-free | `aetherai/sdk` aggregation requires it | AGENTS.md, SDK section |
| `react.createElement` instead of JSX in `app/tui/` | Node cannot load `.jsx`; no bundler/loader dependency allowed | AGENTS.md, TUI section |
| Duplicated small text tables in TUI | TUI i18n is a deliberate exception to the i18n pipeline | AGENTS.md, TUI section |
| `featureFlags` registry indirection | One centralized registry, no new tables, flags must never throw | AGENTS.md Hard rules |
| Synchronous better-sqlite3 calls with no `async` | Native driver on the main thread, serialized by construction | AGENTS.md Hard rules |
| `allRows()` / `saveDatabase()` shims | Compat shims for the sql.js era; still referenced by legacy code | AGENTS.md Hard rules |
| `toolResultMiddleware` in the path | Redaction + truncation must not be bypassed | AGENTS.md Hard rules |

If a finding depends on deleting one of these, it is wrong until proven
otherwise — say what breaks instead of proposing the deletion.

## Recurring real defects — check these first

1. **IPC half-wired.** Do not eyeball this — `npm run check` runs
   `scripts/check-ipc.js`, which diffs the handler registry / `preload.js` /
   `src/env.d.ts` triple in both directions. A reported mismatch is a bug; a
   hand-added channel that the script misses is a script bug, not a pass.
2. **SQL built by string interpolation**, or `db.exec()` used for a
   parameterized read/write. `exec` is DDL/migrations only; everything else is
   `prepare(...).get/all/run(...)` with `?` bindings.
3. **`lastInsertRowid` persisted without `Number()`** — better-sqlite3 may hand
   back a BigInt.
4. **`CURRENT_TIMESTAMP` used for a user-facing time** — it is UTC; use
   `localNow()`.
5. **New column without an `addCol` migration entry** — old DBs then fail to
   upgrade silently.
6. **Mutating tool registered as `risk: 'safe'`**, or a new tool without a risk
   level. `plan` mode blocks dangerous tools; `ask` mode prompts.
7. **User-visible string added inline** instead of `i18n-en-base.json` + regen,
   or `i18n.ts` hand-edited (it is generated).
8. **Feature gate invented locally** (ad-hoc setting key, inline boolean)
   instead of a `featureFlags.js` registry entry.
9. **Renderer/main stream contract touched in one place only** — chat send,
   store `sendMessage`, and the `ChatWindow` chunk listener coordinate; also
   check the duplicated stream handling around abort and error paths.
10. **UI that reads as template output** — gradient headlines, indigo/violet,
    glassmorphism, oversized radii, glow shadows, emoji icons, `→` in copy.
    Binding rules live in `docs/ui-design.md`; missing interaction states
    (hover/focus-visible/active/disabled) or a missing
    `prefers-reduced-motion` fallback count as defects. `check-ui-tokens`
    mechanically catches the gradient family, the invalid
    `hsl(var(--…))` wrapper and the component line-count ratchet — it cannot
    catch hierarchy, spacing, or contrast. Those need a render; if nothing was
    rendered, the finding is "unverified", not "clean".
11. **Scope drift against `docs/roadmap.md`** — work that contradicts the
    P0/P1/P2 order or lands on the "明确不做" list.
12. **Main-process semantics that only appear after restart** — if a change
    assumes hot reload in `electron/`, it is untestable as written.

## Do not report

- Formatting, naming taste, comment density, import ordering.
- "Convert to TypeScript" / "add types to this `.js`" in `electron/`.
- Pre-existing problems outside the diff. One line of context maximum; no
  expanded findings, no refactor proposals riding along.
- Test coverage as a checklist item. Name a specific untested branch that the
  diff actually touches, or stay quiet.

## Output

Follow the skill's Deliver format, plus one section it does not ask for:

- **项目约束对照** — for each finding, the Aether rule it maps to
  (AGENTS.md section, `docs/ui-design.md`, `docs/roadmap.md`) or an explicit
  "通用工程判断，非本项目约束" so the reader can weigh it differently.

Verification claims stay literal: `cd app && npm run build` is the only build
gate; `node -e "require('./electron/ipc/<file>')"` proves a main-process module
loads. Source inspection is never reported as a passing test.
