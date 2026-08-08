// ───────────────────────────────────────────────────────────────────────────
// Background Code Review — post-commit independent review queue.
//
// Architecture: overlay on the existing reviewer.js, driven by the agent_task
// table. After a git commit (or auto-commit) the tool loop calls
// enqueueReview(); the module creates a `pending` agent_task row whose content
// stores the commit's changed-file list. A periodic flush (startup + after
// each enqueue) runs runPendingReviews(), which hands the current file
// contents to reviewer.reviewFiles and stores the structured findings back
// into agent_task.result — "queued → reviewed → persisted" with no inline
// blocking of the agent loop.
//
// Gated by the `agent.backgroundReview` feature flag (featureFlags.js). This
// module never throws: every path degrades to a logged no-op so the host app
// keeps running.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const log = require('../logger')
const featureFlags = require('../featureFlags')
const { runCommandSync } = require('../tools/exec')

const FLAG_KEY = 'agent.backgroundReview'
const TITLE_PREFIX = 'background-review'
const MAX_REVIEW_FILES = 10
const STALE_AFTER_MS = 24 * 60 * 60 * 1000 // review tasks older than 24h are skipped

// ─── Feature flag ──────────────────────────────────────────────────────────

function isReviewEnabled(db) {
  try {
    return featureFlags.isEnabled(db, FLAG_KEY)
  } catch (e) {
    log.debug('backgroundReview.isEnabled failed:', e && e.message)
    return false
  }
}

// ─── Commit → changed files ────────────────────────────────────────────────
// Parse the `git show --name-only` stdout into a clean file list (pure,
// exported for unit tests).
function parseChangedFilesOutput(stdout) {
  return String(stdout || '')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

// Read the file list of the most recent commit in a git repo. Returns [] on
// any failure (no repo, no commits, git missing).

function changedFilesOfCommit(cwd) {
  if (!cwd) return []
  try {
    const res = runCommandSync('git', ['show', '--name-only', '--pretty=format:', 'HEAD'], {
      cwd,
      timeout: 15000,
      maxBuffer: 32 * 1024,
    })
    if (res.exitCode !== 0) return []
    return parseChangedFilesOutput(res.stdout)
  } catch (e) {
    log.debug('backgroundReview.changedFilesOfCommit failed:', e && e.message)
    return []
  }
}

// Build the file descriptors handed to reviewer.reviewFiles. Skips missing,
// binary (>200KB) and non-readable files; caps at MAX_REVIEW_FILES.
function buildReviewFiles(cwd, changedFiles) {
  const out = []
  for (const rel of (changedFiles || []).slice(0, MAX_REVIEW_FILES)) {
    if (!rel) continue
    const abs = path.isAbsolute(rel) ? rel : path.join(cwd || '', rel)
    try {
      const stat = fs.statSync(abs)
      if (!stat.isFile() || stat.size > 200 * 1024) continue
      const content = fs.readFileSync(abs, 'utf-8')
      out.push({ path: rel, content })
    } catch (e) {
      log.debug('backgroundReview skip file:', rel, e && e.message)
    }
  }
  return out
}

// ─── Queue helper (over the agent_task db surface) ─────────────────────────
// Find pending review tasks. Falls back to [] when the db surface is missing.

function pendingReviewRows(db) {
  if (!db || typeof db.listAgentTasks !== 'function') return []
  try {
    const all = db.listAgentTasks(200) || []
    const now = Date.now()
    return all.filter(r => {
      const isReview = String(r.title || '').startsWith(TITLE_PREFIX)
      const pending = String(r.status || '') === 'pending'
      const stale = r.created_at ? now - new Date(r.created_at).getTime() > STALE_AFTER_MS : false
      return isReview && pending && !stale
    })
  } catch (e) {
    log.warn('backgroundReview.listReviewRows failed:', e && e.message)
    return []
  }
}

// Parse the review request stored in an agent_task row. Returns
// { cwd, sessionId, files } with safe defaults.
function parseReviewContent(row) {
  try {
    const parsed = JSON.parse(String(row.content || '{}'))
    return {
      cwd: String(parsed.cwd || ''),
      sessionId: parsed.sessionId != null ? parsed.sessionId : null,
      files: Array.isArray(parsed.files) ? parsed.files : [],
    }
  } catch (e) {
    log.debug('backgroundReview.parseReviewContent failed:', e && e.message)
    return { cwd: '', sessionId: null, files: [] }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Enqueue a background code review for the latest commit in `cwd`.
 * Creates a pending agent_task row once review is enabled and the commit has
 * changed files. Returns the new task id (number) or null when skipped.
 */
function enqueueReview({ db, cwd, sessionId = null, changedFiles = null, titleSuffix = '' }) {
  if (!db) return null
  if (!isReviewEnabled(db)) return null
  if (typeof db.createAgentTask !== 'function') return null

  const files = changedFiles && changedFiles.length ? changedFiles : changedFilesOfCommit(cwd)
  if (!files || files.length === 0) return null

  try {
    const title = `${TITLE_PREFIX}${titleSuffix}`
    const content = JSON.stringify({ cwd: cwd || '', sessionId, files })
    const taskId = db.createAgentTask({
      session_id: sessionId, title, content, model_id: null,
      agent_mode: 'ask', priority: 1, max_retry: 1,
    })
    log.info(`backgroundReview: queued review of ${files.length} file(s) -> task ${taskId}`)
    return taskId
  } catch (e) {
    log.warn('backgroundReview.enqueueReview failed:', e && e.message)
    return null
  }
}

/**
 * Persist a review result back onto the row + mirror a condensed memory entry.
 * Never throws.
 */
function writeTaskResult(db, task, result) {
  if (!db) return
  try {
    if (typeof db.updateAgentTask === 'function') {
      db.updateAgentTask(task.id, {
        status: 'done',
        result: JSON.stringify(result || { issues: [], summary: '' }),
      })
    }
    if (typeof db.addMemoryWithProvenance === 'function') {
      const parsed = parseReviewContent(task)
      const summary = result && result.summary ? String(result.summary) : ''
      const issueCount = Array.isArray(result && result.issues) ? result.issues.length : 0
      if (summary) {
        db.addMemoryWithProvenance(
          `background-review: ${summary} (${issueCount} issue(s))`,
          'review',
          parsed.sessionId || null
        )
      }
    }
  } catch (e) {
    log.warn('backgroundReview.writeTaskResult failed:', e && e.message)
  }
}

/**
 * Process ALL pending background-review tasks sequentially using
 * reviewer.reviewFiles. Never throws; failed tasks are marked `error`.
 *
 * @param {object} db        the app db
 * @param {object} deps      { provider, model, signal, reviewFiles? } —
 *                           reviewFiles defaults to the live reviewer module
 *                           (injectable for tests).
 * @returns {Promise<{ reviewed: number, failed: number }>}
 */
async function runPendingReviews(db, deps = {}) {
  const { provider, model, signal, reviewFiles } = deps
  if (!db) return { reviewed: 0, failed: 0 }

  const rows = pendingReviewRows(db)
  if (rows.length === 0) return { reviewed: 0, failed: 0 }

  // Lazy-require the reviewer only when actually about to review, and only
  // when the caller did not inject their own implementation.
  let reviewer = null
  if (typeof reviewFiles === 'function') {
    reviewer = { reviewFiles }
  } else {
    try {
      reviewer = require('./reviewer')
    } catch (e) {
      log.warn('backgroundReview: reviewer unavailable:', e && e.message)
      return { reviewed: 0, failed: rows.length }
    }
  }

  let reviewed = 0
  let failed = 0
  for (const row of rows) {
    const task = { ...row, id: row.id }
    try {
      const parsed = parseReviewContent(task)
      const files = buildReviewFiles(parsed.cwd, parsed.files)
      if (files.length === 0) {
        if (typeof db.updateAgentTask === 'function') {
          db.updateAgentTask(task.id, { status: 'done', result: JSON.stringify({ issues: [], summary: 'no files available to review' }) })
        }
        reviewed++
        continue
      }
      const result = await reviewer.reviewFiles({ provider, model, files, signal })
      writeTaskResult(db, task, result)
      reviewed++
    } catch (e) {
      failed++
      log.warn(`backgroundReview: review task ${task.id} failed:`, e && e.message)
      try {
        if (typeof db.updateAgentTask === 'function') {
          db.updateAgentTask(task.id, { status: 'error', error: String((e && e.message) || e) })
        }
      } catch {}
    }
  }
  return { reviewed, failed }
}

module.exports = {
  FLAG_KEY,
  TITLE_PREFIX,
  isReviewEnabled,
  parseChangedFilesOutput,
  changedFilesOfCommit,
  buildReviewFiles,
  pendingReviewRows,
  parseReviewContent,
  enqueueReview,
  writeTaskResult,
  runPendingReviews,
}