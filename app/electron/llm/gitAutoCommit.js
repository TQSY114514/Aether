// ───────────────────────────────────────────────────────────────────────────
// Git Auto-Commit module — independent of verification flow.
// Automatically commit after each file change (write_file/edit_file/apply_patch).
// Supports configurable auto-commit. /undo lives in ipc/git.handler.js and is
// checkpoint-driven (see llm/checkpoints.js) — no `git reset --hard` anymore.
//
// SECURITY (audit P1-H8): files that are gitignored or whose names look like
// secrets/credentials are never staged by auto-commit. Committing a key file
// is a one-way leak (history rewrite required to fix), so we skip and warn.
// ───────────────────────────────────────────────────────────────────────────

const { runCommandSync } = require('../tools/exec')
const { nearestGitRoot } = require('./checkpoints')
const log = require('../logger')
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
 * Secret-like filename check (case-insensitive). Matches .env*, *.pem, *.key,
 * id_rsa*, id_ed25519*, *credential*, *secret*.
 * @param {string} filePath - Any path; only the basename is inspected
 * @returns {boolean}
 */
function isSecretLike(filePath) {
  const base = path.basename(String(filePath || '')).toLowerCase()
  if (!base) return false
  if (base.startsWith('.env')) return true
  if (base.endsWith('.pem') || base.endsWith('.key')) return true
  if (base.startsWith('id_rsa') || base.startsWith('id_ed25519')) return true
  if (base.includes('credential') || base.includes('secret')) return true
  return false
}

/**
 * Check whether a file is ignored by the repo's .gitignore rules via
 * `git check-ignore` (exit 0 = ignored). Errors are treated as "not ignored"
 * so a transient git failure can't silently disable auto-commit entirely —
 * the secret-pattern gate above still applies.
 * @param {string} filePath - Absolute path to file
 * @param {string} gitRoot - Repo root (cwd for the git call)
 * @returns {boolean}
 */
function isGitIgnored(filePath, gitRoot) {
  try {
    const r = runCommandSync('git', ['check-ignore', '--quiet', '--', String(filePath)], { cwd: gitRoot || path.dirname(String(filePath)) })
    return r.exitCode === 0
  } catch {
    return false
  }
}

/**
 * Why this file must not be auto-committed, or null if it may be staged.
 * @param {string} filePath
 * @param {string} gitRoot
 * @returns {string|null} skip reason
 */
function skipReason(filePath, gitRoot) {
  if (isSecretLike(filePath)) return 'secret-like filename'
  if (isGitIgnored(filePath, gitRoot)) return 'ignored by .gitignore'
  return null
}

function warnSkipped(filePath, gitRoot, reason) {
  const rel = gitRoot ? path.relative(gitRoot, String(filePath)) : String(filePath)
  log.warn(`[gitAutoCommit] skip ${rel || filePath}: ${reason} — file NOT staged/committed`)
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

  // SECURITY (P1-H8): never stage secret-like or gitignored files.
  const reason = skipReason(filePath, gitRoot)
  if (reason) {
    warnSkipped(filePath, gitRoot, reason)
    return { success: false, message: `skipped: ${reason}`, commitMessage: null, skipped: true, skipReason: reason }
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

  // SECURITY (P1-H8): filter out gitignored / secret-like files before staging.
  // If every candidate is skipped there is nothing to commit — return without
  // creating an empty commit.
  const toAdd = []
  const skipped = []
  for (const filePath of filePaths || []) {
    const reason = skipReason(filePath, gitRoot)
    if (reason) {
      skipped.push({ file: filePath, reason })
      warnSkipped(filePath, gitRoot, reason)
    } else {
      toAdd.push(filePath)
    }
  }
  if ((filePaths || []).length > 0 && toAdd.length === 0) {
    return {
      success: false,
      message: `nothing to commit (${skipped.length} file(s) skipped: secret-like or gitignored)`,
      nothingToCommit: true,
      skipped,
    }
  }

  // Add remaining files
  for (const filePath of toAdd) {
    const addResult = runCommandSync('git', ['add', filePath], { cwd: gitRoot })
    if (addResult.exitCode !== 0) {
      // Continue anyway - best effort
    }
  }

  // Check if anything staged
  const statusResult = runCommandSync('git', ['diff', '--cached', '--name-only'], { cwd: gitRoot })
  if (statusResult.exitCode === 0 && !statusResult.stdout.trim()) {
    return { success: false, message: 'nothing to commit', nothingToCommit: true, skipped }
  }

  // Commit
  const commitResult = runCommandSync('git', ['commit', '-m', message], { cwd: gitRoot })
  if (commitResult.exitCode !== 0) {
    return {
      success: false,
      message: `git commit failed: ${commitResult.stderr || `exit ${commitResult.exitCode}`}`,
      skipped,
    }
  }

  return { success: true, message: `committed: ${message}`, skipped }
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
  isSecretLike,
  isGitIgnored,
  skipReason,
  generateCommitMessage,
  gitCommit,
  gitCommitMultiple,
  getAutoCommitEnabled,
  setAutoCommitEnabled,
  SETTING_KEY,
  DEFAULT_ENABLED,
}
