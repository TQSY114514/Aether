// git.handler.js — IPC surface for git operations used by the /undo command
// and the git auto-commit system. Follows the IPC trio contract (handler +
// preload.js + env.d.ts).
//
// SAFETY: `git reset --hard HEAD~1` is destructive. The renderer must confirm
// with the user before calling `git:undo`. The handler additionally validates
// that the path is a git repo and that at least one commit exists, so a bare
// path or a fresh repo can never trigger a destructive reset.

const gitAutoCommit = require('../llm/gitAutoCommit')
const { getWorkspaceRoot } = require('../tools/sandbox')

function registerGitHandlers(ipcMain, db) {
  // Undo the last commit (git reset --hard HEAD~1) in the git repo that
  // contains the given path (defaults to the agent workspace root).
  ipcMain.handle('git:undo', (_e, cwd) => {
    const root = cwd ? String(cwd) : getWorkspaceRoot()
    if (!root) return { success: false, error: 'no workspace configured' }
    const gitRoot = gitAutoCommit.isGitRepo(root)
    if (!gitRoot) return { success: false, error: 'not a git repository' }
    // Ensure there is at least one commit to undo (HEAD~1 must exist).
    const { runCommandSync } = require('../tools/exec')
    const hasCommit = runCommandSync('git', ['rev-parse', '--verify', 'HEAD~1'], { cwd: gitRoot })
    if (hasCommit.exitCode !== 0) return { success: false, error: 'no commits to undo' }
    // Guard: refuse to reset if the working tree is dirty (would lose edits).
    const dirty = runCommandSync('git', ['status', '--porcelain'], { cwd: gitRoot })
    if (dirty.exitCode === 0 && dirty.stdout.trim()) {
      return { success: false, error: 'working tree has uncommitted changes — commit or stash them first' }
    }
    return gitAutoCommit.gitUndoLast(gitRoot)
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