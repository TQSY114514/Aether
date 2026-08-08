---
name: release-checklist
description: Prepare a release before tagging and shipping. Use when the user asks to cut a release, bump a version, or verify that the repo is release-ready (changelog, version bumps, build gates, contract checks, secrets).
---

# Release Checklist

Run every item below **in order** before tagging a release. Do not skip
the verification gates: they are the project's hard rules.

## 1. Version & changelog

- [ ] Bump `version` in `app/package.json`.
- [ ] Add a `## [x.y.z] — YYYY-MM-DD` section at the top of `CHANGELOG.md`
      summarizing user-visible changes (features, fixes, chores). Follow the
      style of previous entries — one bullet group per area.

## 2. Verification gates (non-negotiable)

- [ ] `cd app && npm run build` passes (runs `scripts/check-ipc.js` IPC-contract
      check, `tsc --noEmit`, vite build).
- [ ] `npm test` passes (vitest suite).
- [ ] `node -e "require('./electron/ipc/<file>')"` loads for every changed
      main-process handler (catches undefined refs).
- [ ] Sanity-check that no `console.log` debugging leftovers or commented-out
      blocks were committed.

## 3. Repo hygiene

- [ ] `git status` is clean of unintended files: no `*.db`, `*.log`,
      `background.img`, `.env`, `dist/`, `node_modules/`, or secret material.
      Assume the repo will be public.
- [ ] No absolute local paths (`D:\...`, `/Users/...`) in committed docs/comments.
- [ ] i18n: any new user-visible string already exists in `i18n.base.json`
      (en + zh at minimum) and `i18n.ts` was regenerated via `gen-i18n.js`.

## 4. Tag & release

- [ ] Commit with a message in repo style (e.g. `chore: prepare v0.6.1`).
- [ ] Push and tag `v*` (e.g. `git tag v0.6.1 && git push origin v0.6.1`) —
      GitHub Actions `release.yml` builds and publishes the installer from the
      tag.
- [ ] After the release: spot-check the Release page, download the NSIS
      installer, and confirm auto-update reports the new version on launch.

## 5. Post-release

- [ ] Update `README.md` status labels if any feature's maturity changed.
- [ ] Note anything that was deferred to the next version, so it lands in the
      next changelog entry instead of being lost.