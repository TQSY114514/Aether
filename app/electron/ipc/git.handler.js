// git.handler.js — IPC surface for git operations used by the /undo command
// and the git auto-commit system. Follows the IPC trio contract (handler +
// preload.js + env.d.ts).
//
// SECURITY FIX (audit P1-H8): `git:undo` used to run `git reset --hard HEAD~1`,
// which destroys every uncommitted change in the working tree. It now restores
// exactly the files recorded in the newest not-yet-rolled-back checkpoint for
// the repo (per-file snapshots in llm/checkpoints.js) and then records a normal
// revert commit — no force, no reset --hard. If no checkpoint exists we refuse
// with an explanation instead of falling back to anything destructive.

const gitAutoCommit = require('../llm/gitAutoCommit')
const checkpoints = require('../llm/checkpoints')
const { getWorkspaceRoot } = require('../tools/sandbox')

function registerGitHandlers(ipcMain, db) {
  // Undo the most recent agent change in the git repo that contains the given
  // path (defaults to the agent workspace root), via checkpoint file snapshots.
  // Return shape is unchanged: { success, message?, undoneCommit?, error? }.
  ipcMain.handle('git:undo', (_e, cwd) => {
    const root = cwd ? String(cwd) : getWorkspaceRoot()
    if (!root) return { success: false, error: 'no workspace configured' }
    const gitRoot = gitAutoCommit.isGitRepo(root)
    if (!gitRoot) return { success: false, error: 'not a git repository' }
    // Find the newest checkpoint whose affected paths live in this repo.
    // Without a snapshot there is nothing precise to restore — refuse.
    const cp = checkpoints.findLatestCheckpointForRoot(gitRoot)
    if (!cp || cp.id == null) {
      return { success: false, error: 'no checkpoint record for this repository — undo refused (destructive git reset is disabled; restore files manually with git if needed)' }
    }
    // Per-file restore from the pre-tool snapshot (see checkpoints.js).
    const result = checkpoints.rollbackCheckpoint(cp.id)
    if (!result.success) {
      return { success: false, error: result.error || 'checkpoint restore failed', restored: result.restored || [], failed: result.failed || [] }
    }
    const restored = result.restored || []
    if (restored.length === 0) {
      return { success: true, message: `checkpoint #${cp.id} restored (no file changes needed)`, undoneCommit: null }
    }
    // Record the restoration as a normal revert-style commit (no force, no
    // reset). Secret-like/gitignored files are filtered out by gitCommitMultiple.
    const commit = gitAutoCommit.gitCommitMultiple(restored, gitRoot, `revert: undo agent changes (checkpoint #${cp.id})`)
    if (commit.success) {
      return { success: true, message: `checkpoint #${cp.id} restored, revert commit created`, undoneCommit: commit.message }
    }
    if (commit.nothingToCommit) {
      return { success: true, message: `checkpoint #${cp.id} restored (no git-visible changes to commit)`, undoneCommit: null }
    }
    // Files are already restored on disk — report success but surface the failure.
    return { success: true, message: `checkpoint #${cp.id} restored, but revert commit failed: ${commit.message}`, undoneCommit: null }
  })

  // Get the current git status of the git repo containing the given path.
  ipcMain.handle('git:status', (_e, cwd) => {
    const root = cwd ? String(cwd) : getWorkspaceRoot()
    const gitRoot = root ? gitAutoCommit.isGitRepo(root) : null
    if (!gitRoot) return { success: false, error: 'not a git repository', root: null }
    const { runCommandSync } = require('../tools/exec')
    const status = runCommandSync('git', ['status', '--short'], { cwd: gitRoot })
    const log = runCommandSync('git', ['log', '--oneline', '-3'], { cwd: gitRoot })
    return {
      success: true,
      root: gitRoot,
      status: status.stdout || '(clean)',
      recent: log.stdout || '(no commits)',
    }
  })

  // Set the auto-commit-after-file-change setting.
  ipcMain.handle('git:setAutoCommit', (_e, enabled) => {
    gitAutoCommit.setAutoCommitEnabled(db, !!enabled)
    return { success: true, enabled: !!enabled }
  })

  // Get the auto-commit-after-file-change setting.
  ipcMain.handle('git:getAutoCommit', () => {
    return { enabled: gitAutoCommit.getAutoCommitEnabled(db) }
  })
}

module.exports = { registerGitHandlers }