// ─────────────────────────────────────────────────────────────────────────────
// Cron Scheduler — Phase 1: Agent Learning Loop
//
// Lightweight cron-like scheduler for recurring agent tasks. Uses setInterval
// to avoid adding node-cron as a dependency. All tasks run asynchronously and
// are fire-and-forget (errors are logged but never propagate).
//
// Task types:
//   memory-cleanup  — prune old low-access memories
//   skill-scan      — apply skill lifecycle transitions (active→stale→archived)
//   skill-autodraft — scan for repeating patterns and auto-draft SKILL.md
//   code-review     — (placeholder) scheduled code review via agent
//   summary         — (placeholder) periodic conversation summary
//
// Integration points:
//   - hooks.js SessionStart: rescan hooks on new session
//   - main.js: initScheduler(db) called on app startup
// ─────────────────────────────────────────────────────────────────────────────

const log = require('../logger')

// ─── Task Registry ─────────────────────────────────────────────────────────

const TASKS = {}

function defineTask(name, intervalMs, fn) {
  TASKS[name] = { intervalMs, fn, timer: null, running: false }
}

// ─── Built-in Tasks ────────────────────────────────────────────────────────

// Prune old memories (>90d unused or >365d old). Runs every 6 hours.
defineTask('memory-cleanup', 6 * 3600 * 1000, async (db) => {
  try {
    const { prune } = require('../llm/autoMemory')
    prune(db, 90)
    log.info('cron: memory-cleanup completed')
  } catch (e) {
    log.warn('cron: memory-cleanup failed:', e.message)
  }
})

// Apply skill lifecycle transitions (active→stale→archived). Runs every 12 hours.
defineTask('skill-scan', 12 * 3600 * 1000, async (db) => {
  try {
    db.applySkillTransitions()
    log.info('cron: skill-scan completed')
  } catch (e) {
    log.warn('cron: skill-scan failed:', e.message)
  }
})

// Scan for repeating usage patterns and auto-draft skills. Runs every 4 hours.
defineTask('skill-autodraft', 4 * 3600 * 1000, async (db) => {
  try {
    const skills = require('../llm/skills')
    const habitLearner = require('../llm/habitLearner')
    const skillSelfCreate = require('../llm/skillSelfCreate')
    // 自进化:检测重复工具序列并 auto-draft SKILL.md(受 skills.selfEvolution 门控)
    const drafted = skillSelfCreate.detectAndDraft(db)
    // Rescan skills to pick up any new drafts
    const count = skills.scanSkills()
    // Check for habits ready to promote
    const habits = habitLearner.getReadyToPromote ? habitLearner.getReadyToPromote(db) : []
    if (habits.length > 0) {
      log.info(`cron: skill-autodraft found ${habits.length} habits ready to promote`)
    }
    log.info(`cron: skill-autodraft completed (${count} skills indexed${drafted.length ? `, ${drafted.length} auto-drafted` : ''})`)
  } catch (e) {
    log.warn('cron: skill-autodraft failed:', e.message)
  }
})

// ─── User-Configurable Tasks (Task 4.3) ────────────────────────────────────
//
// These types are user-schedulable from Settings → Scheduled Tasks. Each runner
// is best-effort: it never throws and logs a summary. The actual deep agent
// integrations (full code review, `npm update` run) are intentionally left as
// lightweight scans so the scheduler stays non-blocking and dependency-free.

const USER_TASK_TYPES = {
  // Daily code review: scan the workspace and summarize what it found.
  'code-review': async (db, config) => {
    const root = config.root || db.getSetting('agent_workspace_root') || ''
    if (!root) { log.info('cron: code-review skipped (no workspace root configured)'); return }
    const { scanWorkspace } = require('../context/fileScanner')
    const files = await scanWorkspace(root)
    log.info(`cron: code-review scanned ${files.length} files in ${root}`)
  },
  // Periodic dependency check: report dependency count from package.json.
  'dependency-check': async (db, config) => {
    const root = config.root || db.getSetting('agent_workspace_root') || ''
    if (!root) { log.info('cron: dependency-check skipped (no workspace root configured)'); return }
    const fs = require('fs')
    const path = require('path')
    const pkg = path.join(root, 'package.json')
    if (fs.existsSync(pkg)) {
      const { dependencies = {}, devDependencies = {} } = JSON.parse(fs.readFileSync(pkg, 'utf8'))
      log.info(`cron: dependency-check found ${Object.keys(dependencies).length + Object.keys(devDependencies).length} dependencies in ${root}`)
    } else {
      log.info('cron: dependency-check found no package.json in ' + root)
    }
  },
  // Scheduled backup: copy the SQLite DB to a timestamped backup file.
  'backup': async (db, config) => {
    const fs = require('fs')
    const path = require('path')
    const { app } = require('electron')
    const src = path.join(app.getPath('userData'), 'aetherai.db')
    const backupDir = path.join(app.getPath('userData'), 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const dest = path.join(backupDir, `aetherai-${stamp}.db`)
    fs.copyFileSync(src, dest)
    log.info(`cron: backup created ${dest}`)
  },
}

// Register (or re-register) a user task from DB row. `id` is the DB row id.
function registerUserTask(t) {
  const fn = USER_TASK_TYPES[t.type]
  if (!fn) return false
  removeUserTask(t.id) // clear any existing timer first
  const taskFn = async (db) => {
    try {
      await fn(db, t.config || {})
      if (_db && _db.markScheduledTaskRun) _db.markScheduledTaskRun(t.id)
      log.info(`cron: user task '${t.name}' (${t.type}) completed`)
    } catch (e) {
      log.warn(`cron: user task '${t.name}' (${t.type}) failed:`, e.message)
    }
  }
  TASKS[String(t.id)] = {
    intervalMs: t.interval_ms,
    fn: taskFn,
    timer: null,
    running: false,
    userTask: { id: t.id, name: t.name, type: t.type, config: t.config || {} },
  }
  if (_initialized) {
    TASKS[String(t.id)].timer = setInterval(() => runTask(String(t.id)), t.interval_ms)
  }
  return true
}

// Remove a user task from the scheduler (timer is cleared).
function removeUserTask(id) {
  const key = String(id)
  const task = TASKS[key]
  if (task && task.timer) {
    clearInterval(task.timer)
    task.timer = null
  }
  delete TASKS[key]
}

// List user tasks with their scheduler runtime status.
function listUserTasks() {
  return Object.entries(TASKS)
    .filter(([, t]) => t.userTask)
    .map(([key, t]) => ({
      id: t.userTask.id,
      name: t.userTask.name,
      type: t.userTask.type,
      intervalMs: t.intervalMs,
      running: t.running,
    }))
}

// Run a user task immediately (manual trigger).
function runUserTaskNow(id) {
  const key = String(id)
  if (!TASKS[key] || !TASKS[key].userTask) return false
  runTask(key)
  return true
}

// ─── Scheduler Engine ──────────────────────────────────────────────────────

let _db = null
let _initialized = false

function initScheduler(db) {
  if (_initialized) return
  _db = db
  _initialized = true

  // Run each task once on startup (with a staggered delay to avoid thundering herd)
  const names = Object.keys(TASKS)
  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    const task = TASKS[name]
    // Skip startup run for user tasks (they register lazily below); they run
    // on their own interval from now on.
    if (task.userTask) continue
    // Stagger startup runs by 30s each
    setTimeout(() => {
      runTask(name)
    }, (i + 1) * 30000)
    // Schedule recurring runs
    task.timer = setInterval(() => {
      runTask(name)
    }, task.intervalMs)
  }
  log.info(`cron: scheduler initialized with ${names.length} tasks`)

  // Load user-configured scheduled tasks from the DB and register them.
  try {
    const tasks = db.getScheduledTasks ? db.getScheduledTasks() : []
    for (const t of tasks) {
      if (t.enabled) registerUserTask(t)
    }
    if (tasks.length) log.info(`cron: registered ${tasks.length} user scheduled tasks`)
  } catch (e) {
    log.warn('cron: failed to load user scheduled tasks:', e.message)
  }
}

function runTask(name) {
  const task = TASKS[name]
  if (!task || task.running) return
  task.running = true
  Promise.resolve(task.fn(_db))
    .catch(e => log.warn(`cron: ${name} error:`, e.message))
    .finally(() => { task.running = false })
}

// Run a specific task immediately (for manual triggers).
function runNow(name) {
  if (!TASKS[name]) return false
  runTask(name)
  return true
}

// List all registered tasks with their intervals.
function listTasks() {
  return Object.entries(TASKS).map(([name, t]) => ({
    name,
    intervalMs: t.intervalMs,
    running: t.running,
  }))
}

// Graceful shutdown: clear all timers.
function shutdown() {
  for (const name of Object.keys(TASKS)) {
    const task = TASKS[name]
    if (task.timer) {
      clearInterval(task.timer)
      task.timer = null
    }
  }
  _initialized = false
  log.info('cron: scheduler shut down')
}

module.exports = { initScheduler, runNow, listTasks, shutdown, registerUserTask, removeUserTask, listUserTasks, runUserTaskNow, USER_TASK_TYPES }