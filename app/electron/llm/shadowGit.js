// ─────────────────────────────────────────────────────────────────────────────
// shadowGit.js — Isolated Shadow Git Repository for Sub-20ms Checkpoints
//
// Creates an isolated bare git repository in %APPDATA%/aetherai/shadow_repos/<sessionId>.git
// to record snapshots of the workspace before/after tool executions.
//
// Key architectural guarantees:
//   1. ZERO pollution of user's workspace (user's .git is completely untouched).
//   2. Works on any workspace, even if the user project is NOT a git repo.
//   3. High speed: leverages Git object database for fast tree snapshot & diff.
//   4. Rollback via `git checkout <commitHash> -- <paths>` in milliseconds.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const log = require('../logger')

let gitAvailable = null

function isAvailable() {
  if (gitAvailable !== null) return gitAvailable
  try {
    execFileSync('git', ['--version'], { stdio: ['ignore', 'ignore', 'ignore'], timeout: 3000, windowsHide: true })
    gitAvailable = true
  } catch {
    gitAvailable = false
  }
  return gitAvailable
}

function getShadowRepoDir(sessionId) {
  let base = null
  try {
    const { app } = require('electron')
    if (app && typeof app.getPath === 'function') {
      base = app.getPath('userData')
    }
  } catch {}
  if (!base) {
    base = process.env.APPDATA ? path.join(process.env.APPDATA, 'aetherai') : path.join(os.homedir(), '.aetherai')
  }
  return path.join(base, 'shadow_repos', `${sessionId}.git`)
}

function ensureShadowRepo(sessionId, workspaceRoot) {
  if (!isAvailable() || !workspaceRoot || !fs.existsSync(workspaceRoot)) {
    return { ok: false, error: 'Git not available or invalid workspace' }
  }

  const repoDir = getShadowRepoDir(sessionId)
  try {
    const headFile = path.join(repoDir, 'HEAD')
    if (fs.existsSync(headFile)) {
      return { ok: true, repoDir }
    }

    fs.mkdirSync(repoDir, { recursive: true })
    execFileSync('git', ['init', '--bare'], {
      cwd: repoDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
      windowsHide: true,
    })

    // Configure local committer identity for the bare repo
    execFileSync('git', ['--git-dir=' + repoDir, 'config', 'user.name', 'Aether Shadow'], { windowsHide: true })
    execFileSync('git', ['--git-dir=' + repoDir, 'config', 'user.email', 'aether@local'], { windowsHide: true })
    execFileSync('git', ['--git-dir=' + repoDir, 'config', 'core.autocrlf', 'false'], { windowsHide: true })

    // Create an initial empty baseline commit
    execFileSync(
      'git',
      [
        '--git-dir=' + repoDir,
        '--work-tree=' + workspaceRoot,
        'commit',
        '--allow-empty',
        '-m',
        'shadow_init',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000, windowsHide: true }
    )

    return { ok: true, repoDir }
  } catch (err) {
    log.warn?.('[shadowGit] ensureShadowRepo failed:', err.message)
    return { ok: false, error: err.message }
  }
}

/**
 * Capture a fast git snapshot of the workspace in the shadow repo.
 * @param {number|string} sessionId
 * @param {string} workspaceRoot
 * @param {object} [opts]
 * @param {string[]} [opts.affectedPaths] - Specific files modified
 * @param {string} [opts.message] - Commit message
 * @returns {{ ok: boolean, commitHash?: string, repoDir?: string, durationMs?: number, error?: string }}
 */
function commitCheckpoint(sessionId, workspaceRoot, opts = {}) {
  const t0 = Date.now()
  const initRes = ensureShadowRepo(sessionId, workspaceRoot)
  if (!initRes.ok) return initRes

  const repoDir = initRes.repoDir
  const msg = opts.message || `checkpoint_${Date.now()}`

  try {
    const addArgs = ['--git-dir=' + repoDir, '--work-tree=' + workspaceRoot, 'add']
    if (Array.isArray(opts.affectedPaths) && opts.affectedPaths.length > 0) {
      const relPaths = opts.affectedPaths
        .map((p) => {
          try {
            return path.relative(workspaceRoot, path.resolve(p)).replace(/\\/g, '/')
          } catch {
            return null
          }
        })
        .filter((p) => p && !p.startsWith('..'))

      if (relPaths.length > 0) {
        addArgs.push('--', ...relPaths)
        execFileSync('git', addArgs, {
          cwd: workspaceRoot,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 5000,
          windowsHide: true,
        })
      }
    }

    execFileSync(
      'git',
      [
        '--git-dir=' + repoDir,
        '--work-tree=' + workspaceRoot,
        'commit',
        '--allow-empty',
        '-m',
        msg,
      ],
      {
        cwd: workspaceRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
        windowsHide: true,
      }
    )

    const commitHash = execFileSync('git', ['--git-dir=' + repoDir, 'rev-parse', 'HEAD'], {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 3000,
    }).trim()

    return {
      ok: true,
      commitHash,
      repoDir,
      durationMs: Date.now() - t0,
    }
  } catch (err) {
    log.warn?.('[shadowGit] commitCheckpoint failed:', err.message)
    return { ok: false, error: err.message, durationMs: Date.now() - t0 }
  }
}

/**
 * Rollback the workspace to a specific shadow git commit.
 * @param {number|string} sessionId
 * @param {string} workspaceRoot
 * @param {string} commitHash
 * @param {string[]} [paths] - Specific paths to restore, or null for all
 * @returns {{ ok: boolean, restored?: string[], error?: string }}
 */
function rollbackCheckpoint(sessionId, workspaceRoot, commitHash, paths = null) {
  if (!commitHash || !workspaceRoot) return { ok: false, error: 'Missing commitHash or workspaceRoot' }
  const repoDir = getShadowRepoDir(sessionId)
  if (!fs.existsSync(repoDir)) return { ok: false, error: 'Shadow repo does not exist' }

  try {
    const checkoutArgs = ['--git-dir=' + repoDir, '--work-tree=' + workspaceRoot, 'checkout', commitHash, '--']
    if (Array.isArray(paths) && paths.length > 0) {
      const relPaths = paths
        .map((p) => {
          try {
            return path.relative(workspaceRoot, path.resolve(p)).replace(/\\/g, '/')
          } catch {
            return null
          }
        })
        .filter((p) => p && !p.startsWith('..'))

      if (relPaths.length > 0) {
        checkoutArgs.push(...relPaths)
      } else {
        checkoutArgs.push('.')
      }
    } else {
      checkoutArgs.push('.')
    }

    execFileSync('git', checkoutArgs, {
      cwd: workspaceRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
      windowsHide: true,
    })

    return { ok: true, restored: paths || ['*'] }
  } catch (err) {
    log.warn?.('[shadowGit] rollbackCheckpoint failed:', err.message)
    return { ok: false, error: err.message }
  }
}

/**
 * Get diff between two shadow git commits or against HEAD.
 * @param {number|string} sessionId
 * @param {string} workspaceRoot
 * @param {string} commitHashA
 * @param {string} [commitHashB='HEAD']
 * @returns {string} Diff output
 */
function getDiff(sessionId, workspaceRoot, commitHashA, commitHashB = 'HEAD') {
  const repoDir = getShadowRepoDir(sessionId)
  if (!fs.existsSync(repoDir)) return ''
  try {
    return execFileSync(
      'git',
      ['--git-dir=' + repoDir, '--work-tree=' + workspaceRoot, 'diff', commitHashA, commitHashB],
      {
        cwd: workspaceRoot,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 5000,
        windowsHide: true,
      }
    )
  } catch {
    return ''
  }
}

/**
 * Clean up shadow repo on session deletion.
 * @param {number|string} sessionId
 */
function deleteShadowRepo(sessionId) {
  try {
    const dir = getShadowRepoDir(sessionId)
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  } catch {}
}

module.exports = {
  isAvailable,
  getShadowRepoDir,
  ensureShadowRepo,
  commitCheckpoint,
  rollbackCheckpoint,
  getDiff,
  deleteShadowRepo,
}
