## What does this PR do?

<!-- One or two sentences. What user-visible behavior changes? -->

## Related issue(s)

<!-- e.g. Closes #123 · Part of #456 · N/A -->

## Checklist

- [ ] Changes are scoped to the problem (no unrelated refactors)
- [ ] Desktop (Electron) and/or TUI/CLI behavior verified manually
- [ ] IPC contract updated in **all three** places (main `electron/ipc/*` handler · `preload.js` · renderer `src/types`/`env.d.ts`) — run `node scripts/check-ipc.js`
- [ ] TypeScript passes: `npx tsc --noEmit`
- [ ] Tests updated/added and passing: `npx vitest run`
- [ ] Security impact considered (sandbox allowlist, path containment, external-content sanitization, env handling)
- [ ] `CHANGELOG.md` updated under `## [Unreleased]` (if user-visible)
- [ ] UI changes accompanied by a screenshot (or noted as N/A)

## Notes for reviewers

<!-- Anything unusual, decisions taken, or follow-ups planned. -->