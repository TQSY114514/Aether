// ─────────────────────────────────────────────────────────────────────────────
// worktreeManager.js  —  per-agent git worktree isolation (Claude Code style).
//
// Each background task / agent run can work in its OWN git worktree checked
// out from the workspace repo. The agent's file changes stay isolated; when
// the task finishes the worktree changes are committed to the feature branch
// and merged back (or left for the user when conflicts occur).
//
// Git facts used (all read-only on the main checkout):
//   - `git worktree add --quiet --detach <dir> <branch>`  creates the worktree
//     WITHOUT touching the agent's current branch (detached at branch tip).
//   - `git worktree list --porcelain` reports every worktree (path + branch).
//   - `git -C <wt> status --porcelain` detects uncommitted changes inside.
//   - Merge: `git -C <root> merge <branch> --no-edit` — conflicts are surfaced
//     as a non-zero exit + CONFLICT lines; we abort and report, never resolve.
//
// Design rules:
//   - Every function returns { ok:boolean, ... } on the git failure path; it
//     never throws for git failures (the caller decides severity).
//   - Worktree locations are namespace'd under `<root>/.aether/worktrees/`
//     so `git status` noise / .gitignore can exclude them later.
//   - Pure Node (no electron imports) — unit-testable without an app.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

// ─── Raw git plumbing ───────────────────────────────────────────────────────

// Run git synchronously; returns { ok, exitCode, stdout, stderr }. Never throws
// (spawn errors surface as { ok:false, error }). ok === (exitCode === 0).
function git(root, args) {
  try {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 30000, windowsHide: true })
    if (r.error) return { ok: false, exitCode: null, error: `git spawn failed: ${r.error.message}`, stdout: '', stderr: '' }
    return { ok: r.status === 0, exitCode: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() }
  } catch (e) {
    return { ok: false, exitCode: null, error: `git spawn failed: ${e.message}`, stdout: '', stderr: '' }
  }
}

// Windows 路径归一：大小写不敏感（git porcelain 输出的 drive 字母/目录大小写
// 可能与 path.join 生成的不同，CI runner 上尤其如此——大小写敏感比较会漏匹配）。
function normPath(p) {
  const resolved = path.resolve(p).replace(/\//g, path.sep)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

// Match a porcelain "worktree <path>" line against an expected dir, tolerant
// of Windows `/` vs `\` separator differences and case folding.
function filenameMatches(porcelain, dir) {
  const target = normPath(dir)
  for (const line of porcelain.split('\n')) {
    if (!line.startsWith('worktree ')) continue
    const wt = line.slice('worktree '.length).trim()
    if (normPath(wt) === target) return true
  }
  return false
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Worktree directory namespace under the repo root. */
function worktreeDirFor(root, taskId) {
  return path.join(root, '.aether', 'worktrees', `task-${taskId}`)
}

// Is the repo root valid? Returns { ok, error }.
function assertRepo(root) {
  if (!root || typeof root !== 'string') return { ok: false, error: 'worktree: repo root required' }
  const r = git(root, ['rev-parse', '--is-inside-work-tree'])
  if (!r.ok) return { ok: false, error: 'worktree: not a git repository' }
  return { ok: true }
}

/**
 * Create an isolated worktree for a task at a branch tip.
 * @param {object} opts
 * @param {string} opts.root     repo root (absolute)
 * @param {number|string} opts.taskId  agent_task id — namespaces the worktree
 * @returns {{ ok, dir?: string, branch?: string, reused?: boolean, error?: string }}
 */
function createWorktree({ root, taskId }) {
  const repo = assertRepo(root)
  if (!repo.ok) return repo
  const dir = worktreeDirFor(root, taskId)
  const branch = `aether-task-${taskId}`

  // Worktree already exists? Reuse it (idempotent start after crash/retry).
  const existing = git(root, ['worktree', 'list', '--porcelain'])
  if (existing.ok && filenameMatches(existing.stdout, dir)) {
    return { ok: true, dir, branch, reused: true }
  }

  // -B force-checks out the branch (creating it when missing, re-pointing a
  // stale one), so a single command covers both the fresh and the stale case.
  const r = git(root, ['worktree', 'add', '-B', branch, dir])
  if (!r.ok) {
    // `git worktree add -B` fails when the directory already exists (e.g. the
    // porcelain list missed it due to path formatting differences on Windows
    // runners). If the worktree dir is on disk, treat it as an existing reuse.
    if (fs.existsSync(dir)) return { ok: true, dir, branch, reused: true }
    return { ok: false, error: `worktree create failed: ${r.stderr || 'unknown git error'}` }
  }
  return { ok: true, dir, branch }
}

/**
 * Full state of one worktree: dir + branch + whether it has uncommitted changes.
 */
function worktreeStatus(root, taskId) {
  const dir = worktreeDirFor(root, taskId)
  const porcelain = git(root, ['worktree', 'list', '--porcelain'])
  if (!porcelain.ok) return null
  // Windows git 输出 CRLF 行尾：先剥离 \r，否则 split('\n\n') 失效（整个输出
  // 成一个块，只匹配到主 worktree 路径 → 返回 null）。
  const blocks = porcelain.stdout.replace(/\r/g, '').split('\n\n').filter(Boolean)
  for (const block of blocks) {
    const lines = block.split('\n')
    const wtPath = (lines.find(l => l.startsWith('worktree ')) || '').slice('worktree '.length).trim()
    if (normPath(wtPath) !== normPath(dir)) continue
    const branchLine = lines.find(l => l.startsWith('branch '))
    const branch = branchLine ? branchLine.slice('branch refs/heads/'.length) : null
    const info = { dir: wtPath, branch, detached: !branchLine, exists: true }
    if (branch) {
      const st = git(wtPath, ['status', '--porcelain'])
      info.dirty = st.ok && st.stdout.length > 0
      info.changedFiles = st.ok ? st.stdout.split('\n').filter(Boolean).length : 0
    }
    return info
  }
  return null
}

/**
 * Commit all uncommitted changes inside the worktree under a generated message.
 * Returns the commit sha (or null when nothing to commit).
 */
function commitWorktreeChanges(root, taskId, message = 'aether: worktree changes') {
  const dir = worktreeDirFor(root, taskId)
  const st = git(dir, ['status', '--porcelain'])
  if (!st.ok || !st.stdout) return { ok: true, committed: false, sha: null }
  git(dir, ['add', '-A'])
  const c = git(dir, ['commit', '-q', '-m', message])
  if (!c.ok) return { ok: false, error: `worktree commit failed: ${c.stderr}` }
  const sha = git(dir, ['rev-parse', 'HEAD'])
  return { ok: true, committed: true, sha: sha.stdout || null }
}

/**
 * Merge the worktree feature branch back into the main working branch.
 * Returns conflicts (paths) when the merge cannot apply cleanly — the caller
 * decides whether to abort (default) or keep the branch unmerged.
 */
function mergeWorktree(root, taskId, { autoCommit = true, mergeMessage } = {}) {
  const repo = assertRepo(root)
  if (!repo.ok) return repo
  const branch = `aether-task-${taskId}`

  if (autoCommit) {
    const committed = commitWorktreeChanges(root, taskId)
    if (!committed.ok) return committed
  }

  // Merge the feature branch into the CURRENT branch (not necessarily main —
  // we merge where the user is, matching their working state).
  const m = git(root, ['merge', '--no-edit', branch])
  if (m.ok) return { ok: true, conflicts: [], message: mergeMessage || 'merged' }

  // Conflict (or other failure): extract conflict paths, abort the merge so the
  // caller's repo stays clean, and report which files need manual resolution.
  // git writes CONFLICT lines to stdout ("CONFLICT (content): Merge conflict in
  // src/foo.ts"), while "Automatic merge failed" lands on stderr — search both.
  const conflictText = `${m.stdout}\n${m.stderr}`
  const conflicts = (conflictText.match(/CONFLICT[^\n]*?:\s*(?:Merge conflict in\s+)?([^\n]+)/g) || [])
    .map(l => l.replace(/^CONFLICT[^\n]*?:\s*(?:Merge conflict in\s+)?/, '').trim())
    .filter(Boolean)
  git(root, ['merge', '--abort'])
  return { ok: false, conflicts, error: m.stderr || `merge ${branch} failed` }
}

/** Remove a worktree binding (uncommitted work is discarded — call merge first). */
function removeWorktree(root, taskId, { pruneBranch = false } = {}) {
  const dir = worktreeDirFor(root, taskId)
  const r = git(root, ['worktree', 'remove', '--force', dir])
  if (!r.ok) return { ok: false, error: r.stderr || 'worktree remove failed' }
  if (pruneBranch) git(root, ['branch', '-D', `aether-task-${taskId}`])
  // Clean stale admin files for good measure.
  git(root, ['worktree', 'prune'])
  return { ok: true, branch: `aether-task-${taskId}` }
}

/** Git status summary inside the worktree — used by status() IPC. */
function worktreeDiffStats(root, taskId) {
  const dir = worktreeDirFor(root, taskId)
  const r = git(dir, ['diff', '--stat'])
  return r.ok ? { stats: r.stdout.split('\n').filter(Boolean) } : { stats: [] }
}

module.exports = {
  assertRepo,
  worktreeDirFor,
  createWorktree,
  worktreeStatus,
  commitWorktreeChanges,
  mergeWorktree,
  removeWorktree,
  worktreeDiffStats,
}