## What does this PR do?

<!-- One or two sentences. What user-visible behavior changes? -->

## Related issue(s)

<!-- e.g. Closes #123 · Part of #456 · N/A -->

## AI-assisted development

<!-- Did you use an AI tool (Aether, Claude, Cursor, Copilot, etc.) to help author this PR? -->
- [ ] No AI was used
- [ ] Yes, AI-assisted (Tool & Model: ____________________)
  - [ ] I personally reviewed, understood, and verified every line of code; this is not an uninspected AI dump

## Checklist

- [ ] Changes are scoped to a single responsibility (no unrelated refactors or feature creep)
- [ ] If introducing a major new feature, it aligns with `docs/roadmap.md` or was discussed in an issue
- [ ] Desktop (Electron) and/or TUI/CLI behavior verified manually
- [ ] Fast static gate passes: `cd app && npm run check` (IPC 3-file contract, architecture, UI tokens, TypeScript)
- [ ] Tests updated/added and passing: `npx vitest run`
- [ ] No unnecessary new npm dependencies introduced (bundle size and Electron-free boundaries respected)
- [ ] Stray debugging `console.log` statements removed (protects Ink TUI layouts and RPC JSONL stream)
- [ ] Security impact considered (sandbox allowlist, path containment, external-content sanitization, env handling)
- [ ] `CHANGELOG.md` updated under `## [Unreleased]` (if user-visible)
- [ ] UI changes accompanied by a screenshot (or noted as N/A)

## Notes for reviewers

<!-- Anything unusual, decisions taken, or follow-ups planned. -->
