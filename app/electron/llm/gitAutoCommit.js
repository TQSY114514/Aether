// ───────────────────────────────────────────────────────────────────────────
// Git Auto-Commit module — independent of verification flow.
// Automatically commit after each file change (write_file/edit_file/apply_patch).
// Supports configurable auto-commit and /undo command (git reset --hard HEAD~1).
// ───────────────────────────────────────────────────────────────────────────

const { runCommandSync } = require('../tools/exec')
const { nearestGitRoot } = require('./checkpoints')
const path = require('path')

// Configuration setting key stored in DB
const SETTING_KEY = 'agent_auto_commit_after_file_change'
const DEFAULT_ENABLED = true

/**
 * Check if a path is inside a git repository.
 * @param {string} filePath - Absolute path to file
 * @returns {string|null} Git root directory or null if not a repo
 */
function isGitRepo(filePath) {
  if (!filePath) return null
  return nearestGitRoot(filePath)
}

/**
 * Generate commit message based on operation type and file path.
 * @param {'write'|'edit'|'apply'} operation - Operation type
 * @param {string} filePath - File path relative to git root
 * @returns {string} Conventional commit message
 */
function generateCommitMessage(operation, filePath) {
  const relPath = filePath
  const type = operation === 'write' ? 'feat' : operation === 'edit' ? 'fix' : 'chore'
  return `${type}: update ${relPath}`
}

/**
 * Stage and commit a single file.
 * @param {string} filePath - Absolute path to file
 * @param {'write'|'edit'|'apply'} operation - Operation type
 * @returns {{success: boolean, message: string, commitMessage: string|null}} Result
 */
function gitCommit(filePath, operation = 'edit') {
  const gitRoot = isGitRepo(filePath)
  if (!gitRoot) {
    return { success: false, message: 'not a git repository', commitMessage: null }
  }

  const relPath = path.relative(gitRoot, filePath)
  const commitMessage = generateCommitMessage(operation, relPath)

  // Stage the file
  const addResult = runCommandSync('git', ['add', filePath], { cwd: gitRoot })
  if (addResult.exitCode !== 0) {
    return {
      success: false,
      message: `git add failed: ${addResult.stderr || `exit ${addResult.exitCode}`}`,
      commitMessage: null,
    }
  }

  // Check if there's anything to commit
  const statusResult = runCommandSync('git', ['status', '--porcelain'], { cwd: gitRoot })
  if (statusResult.exitCode === 0 && !statusResult.stdout.trim()) {
    return { success: false, message: 'nothing to commit', commitMessage: null }
  }

  // Commit
  const commitResult = runCommandSync('git', ['commit', '-m', commitMessage], { cwd: gitRoot })
  if (commitResult.exitCode !== 0) {
    return {
      success: false,
      message: `git commit failed: ${commitResult.stderr || `exit ${commitResult.exitCode}`}`,
      commitMessage: null,
    }
  }

  return { success: true, message: 'committed', commitMessage }
}

/**
 * Stage and commit multiple files at once (for checkpoint).
 * @param {string[]} filePaths - Array of absolute file paths
 * @param {string} cwd - Working directory (usually git root)
 * @param {string} message - Custom commit message (optional)
 * @returns {{success: boolean, message: string}} Result
 */
function gitCommitMultiple(filePaths, cwd, message = 'checkpoint: agent changes') {
  // Find git root from first file if cwd not a repo
  let gitRoot = cwd && isGitRepo(cwd) ? cwd : null
  if (!gitRoot && filePaths.length > 0) {
    gitRoot = isGitRepo(filePaths[0])
  }
  if (!gitRoot) {
    return { success: false, message: 'not a git repository' }
  }

  // Add all files
  for (const filePath of filePaths) {
    const addResult = runCommandSync('git', ['add', filePath], { cwd: gitRoot })
    if (addResult.exitCode !== 0) {
      // Continue anyway - best effort
    }
  }

  // Check if anything staged
  const statusResult = runCommandSync('git', ['diff', '--cached', '--name-only'], { cwd: gitRoot })
  if (statusResult.exitCode === 0 && !statusResult.stdout.trim()) {
    return { success: false, message: 'nothing to commit' }
  }

  // Commit
  const commitResult = runCommandSync('git', ['commit', '-m', message], { cwd: gitRoot })
  if (commitResult.exitCode !== 0) {
    return {
      success: false,
      message: `git commit failed: ${commitResult.stderr || `exit ${commitResult.exitCode}`}`,
    }
  }

  return { success: true, message: `committed: ${message}` }
}

/**
 * Undo last commit with git reset --hard HEAD~1.
 * DANGEROUS operation - must confirm with user.
 * @param {string} cwd - Working directory (git repo root)
 * @returns {{success: boolean, message: string, undoneCommit: string|null}} Result
 */
function gitUndoLast(cwd) {
  const gitRoot = isGitRepo(cwd)
  if (!gitRoot) {
    return { success: false, message: 'not a git repository', undoneCommit: null }
  }

  // Get the last commit message before reset
  const logResult = runCommandSync('git', ['log', '--oneline', '-1'], { cwd: gitRoot })
  let lastCommit = null
  if (logResult.exitCode === 0 && logResult.stdout) {
    lastCommit = logResult.stdout.trim()
  }

  // Perform reset --hard
  const resetResult = runCommandSync('git', ['reset', '--hard', 'HEAD~1'], { cwd: gitRoot })
  if (resetResult.exitCode !== 0) {
    return {
      success: false,
      message: `git reset failed: ${resetResult.stderr || `exit ${resetResult.exitCode}`}`,
      undoneCommit: lastCommit,
    }
  }

  return { success: true, message: 'undone last commit', undoneCommit: lastCommit }
}

/**
 * Get the auto-commit enabled setting from database.
 * @param {any} db - Database handle
 * @returns {boolean} Whether auto-commit is enabled
 */
function getAutoCommitEnabled(db) {
  if (!db || typeof db.getSetting !== 'function') {
    return DEFAULT_ENABLED
  }
  const value = db.getSetting(SETTING_KEY)
  // null/undefined → default true, '0' → false, anything else → true
  if (value == null) return DEFAULT_ENABLED
  return String(value) !== '0'
}

/**
 * Set auto-commit enabled setting.
 * @param {any} db - Database handle
 * @param {boolean} enabled - Whether to enable
 */
function setAutoCommitEnabled(db, enabled) {
  if (!db || typeof db.setSetting !== 'function') return
  db.setSetting(SETTING_KEY, enabled ? '1' : '0')
}

module.exports = {
  isGitRepo,
  generateCommitMessage,
  gitCommit,
  gitCommitMultiple,
  gitUndoLast,
  getAutoCommitEnabled,
  setAutoCommitEnabled,
  SETTING_KEY,
  DEFAULT_ENABLED,
}
