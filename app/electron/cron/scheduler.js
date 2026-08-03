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
    // Rescan skills to pick up any new drafts
    const count = skills.scanSkills()
    // Check for habits ready to promote
    const habits = habitLearner.getReadyToPromote ? habitLearner.getReadyToPromote(db) : []
    if (habits.length > 0) {
      log.info(`cron: skill-autodraft found ${habits.length} habits ready to promote`)
    }
    log.info(`cron: skill-autodraft completed (${count} skills indexed)`)
  } catch (e) {
    log.warn('cron: skill-autodraft failed:', e.message)
  }
})

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

module.exports = { initScheduler, runNow, listTasks, shutdown }