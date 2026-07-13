---
name: git-commit
description: Write clear, conventional commit messages and stage the right files. Use when the user asks to commit changes, or when reviewing a diff to craft a commit.
---

# Git Commit Conventions

Follow Conventional Commits. A commit message:

```
<type>(<scope>): <subject>

<body>
<footer>
```

## Types
- `feat` — new feature
- `fix` — bug fix
- `docs` — documentation only
- `refactor` — code change that neither fixes a bug nor adds a feature
- `perf` — performance improvement
- `test` — adding/fixing tests
- `chore` — build, deps, tooling

## Rules
1. **Stage deliberately**: run `git status` + `git diff --staged` before committing. Never `git add -A` blindly — review what's staged.
2. **Subject**: imperative mood ("add" not "added"), ≤72 chars, no trailing period.
3. **Scope**: optional, the affected module (e.g. `feat(agent): ...`).
4. **Body**: explain *why*, not *what* (the diff shows what). Wrap at ~72 chars.
5. **Footer**: `BREAKING CHANGE:` for breaking changes, or `Closes #123` for issue refs.

## Examples
```
feat(skills): add use_skill tool + SKILL.md loader

Adopts the Claude-Code skill format so users can drop public SKILL.md
folders into .claude/skills and reuse them. Only name+description enter
the system prompt; the body loads on demand via use_skill.
```

Before committing, always show the user the staged diff and the proposed message. Let them confirm.
