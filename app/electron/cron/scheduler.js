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
const { IdleGate } = require('./idleGate')

// ─── Idle & Busy Coordination ──────────────────────────────────────────────

const _busyCheckers = new Set()

function registerBusyChecker(fn) {
  if (typeof fn === 'function') _busyCheckers.add(fn)
  return () => _busyCheckers.delete(fn)
}

function isSystemBusy() {
  for (const fn of _busyCheckers) {
    try {
      if (fn() === true) return true
    } catch {}
  }
  try {
    const bg = require('../llm/backgroundTasks')
    if (typeof bg.listTasks === 'function') {
      const active = bg.listTasks().some((t) => t && (t.status === 'running' || t.status === 'plan'))
      if (active) return true
    }
  } catch {}
  try {
    const sup = require('../llm/subagentSupervisor')
    if (sup?.activeSubagents instanceof Map) {
      for (const rec of sup.activeSubagents.values()) {
        if (rec && rec.status !== 'completed' && rec.status !== 'failed' && rec.status !== 'cancelled') {
          return true
        }
      }
    }
  } catch {}
  return false
}

function getLastPassMs(db, name) {
  try {
    const raw = db?.getSetting?.(`cron.last_pass.${name}`)
    if (!raw) return null
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return n
    const parsed = Date.parse(String(raw))
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

function markLastPassMs(db, name, ts = Date.now()) {
  try {
    if (db && typeof db.setSetting === 'function') {
      db.setSetting(`cron.last_pass.${name}`, String(ts))
    }
  } catch {}
}

// ─── Task Registry ─────────────────────────────────────────────────────────

const TASKS = {}

function defineTask(name, intervalMs, fn, opts = {}) {
  const task = {
    name,
    intervalMs,
    fn,
    timer: null,
    running: false,
    idleOptions: opts.idle || null,
    gate: null,
  }
  if (task.idleOptions) {
    task.gate = new IdleGate({
      idleMs: task.idleOptions.idleMs ?? 5 * 60 * 1000,
      cooldownMs: task.idleOptions.cooldownMs ?? intervalMs,
      minRetryMs: task.idleOptions.minRetryMs ?? 60 * 1000,
      enabled: task.idleOptions.enabled ?? true,
      isBusy: () => isSystemBusy(),
      lastFullPassAt: () => getLastPassMs(_db, name),
      hasMaterial: task.idleOptions.hasMaterial ? () => task.idleOptions.hasMaterial(_db) : undefined,
      runPass: async ({ shouldYield }) => {
        const res = await fn(_db, { shouldYield })
        if (!res || res.yielded !== true) {
          markLastPassMs(_db, name, Date.now())
        }
        return res
      },
    })
  }
  TASKS[name] = task
}

function noteUserActivity() {
  for (const task of Object.values(TASKS)) {
    if (task.gate) task.gate.noteActivity()
  }
}

// ─── Built-in Tasks ────────────────────────────────────────────────────────

// Prune/consolidate old memories. Polls on idle, runs at most once per 6 hours.
defineTask('memory-cleanup', 6 * 3600 * 1000, async (db, ctx = {}) => {
  try {
    const autoMemory = require('../llm/autoMemory')
    const featureFlags = require('../featureFlags')
    if (featureFlags.isEnabled(db, 'memory.dreamConsolidation') && typeof autoMemory.consolidate === 'function') {
      const res = await autoMemory.consolidate(db, { shouldYield: ctx.shouldYield })
      let pruned = 0
      if (!res?.yielded) {
        // Always restrict post-consolidation prune to non-consolidatable rows
        // (`origin = 'external'`), because consolidate() processes at most one
        // batch (25 rows) per workspace per run and failed scopes keep candidates
        // queued for subsequent idle passes.
        const pruneRes = autoMemory.prune(db, 90, {
          onlyNonConsolidatable: true,
          preserveDigest: true,
        })
        pruned = (pruneRes?.deleted || 0) + (res?.pruned || 0)
      }
      log.info('cron: memory-cleanup (dreamConsolidation) completed:', JSON.stringify({
        consolidated: res?.consolidated || 0,
        pruned,
        yielded: Boolean(res?.yielded),
      }))
      return res
    }
    autoMemory.prune(db, 90, { preserveDigest: true })
    log.info('cron: memory-cleanup completed')
    return { ok: true }
  } catch (e) {
    log.warn('cron: memory-cleanup failed:', e.message)
    return { ok: false, error: e.message }
  }
}, {
  idle: {
    idleMs: 5 * 60 * 1000,
    cooldownMs: 6 * 3600 * 1000,
    minRetryMs: 60 * 1000,
  },
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

// Scan for repeating usage patterns and auto-draft skills. Runs on idle every 4 hours.
defineTask('skill-autodraft', 4 * 3600 * 1000, async (db, ctx = {}) => {
  try {
    if (typeof ctx.shouldYield === 'function' && ctx.shouldYield()) {
      return { ok: false, yielded: true }
    }
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
    return { ok: true }
  } catch (e) {
    log.warn('cron: skill-autodraft failed:', e.message)
    return { ok: false, error: e.message }
  }
}, {
  idle: {
    idleMs: 5 * 60 * 1000,
    cooldownMs: 4 * 3600 * 1000,
    minRetryMs: 60 * 1000,
  },
})

// 自进化反思：从最近会话轨迹提炼策略条目进有界 STRATEGY.md。
// 空闲门控 + 6 小时冷却；无待处理轨迹且未超容时跳过，用户回归立即让路。
defineTask('strategy-reflect', 6 * 3600 * 1000, async (db, ctx = {}) => {
  try {
    const reflect = require('../evolution/reflect')
    const r = await reflect.reflectNow(db, { shouldYield: ctx.shouldYield })
    if (r.yielded) {
      log.info('cron: strategy-reflect yielded on user activity')
      return { ok: false, yielded: true }
    }
    if (r.ok) log.info(`cron: strategy-reflect done (+${r.added.length} ~${r.replaced.length} -${r.removed.length})`)
    else log.info(`cron: strategy-reflect skipped (${r.reason})`)
    return r
  } catch (e) {
    log.warn('cron: strategy-reflect failed:', e.message)
    return { ok: false, error: e.message }
  }
}, {
  idle: {
    idleMs: 5 * 60 * 1000,
    cooldownMs: 6 * 3600 * 1000,
    minRetryMs: 60 * 1000,
    hasMaterial: () => {
      try {
        const reflect = require('../evolution/reflect')
        const pending = reflect.pendingTraceCount()
        const needsMerge = require('../evolution/strategyStore').stats().needsMerge
        return pending > 0 || needsMerge
      } catch {
        return false
      }
    },
  },
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

const IDLE_POLL_MS = 60 * 1000
const _startupTimers = []

function initScheduler(db) {
  if (_initialized) return
  _db = db
  _initialized = true

  // Run each task once on startup (with a staggered delay to avoid thundering herd).
  // Idle-gated tasks poll coarsely every 60s and only fire once idle + cooldown pass.
  const names = Object.keys(TASKS)
  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    const task = TASKS[name]
    // Skip startup run for user tasks (they register lazily below); they run
    // on their own interval from now on.
    if (task.userTask) continue
    // Stagger startup runs by 30s each
    const t0 = setTimeout(() => {
      runTask(name)
    }, (i + 1) * 30000)
    _startupTimers.push(t0)
    // Schedule recurring runs (coarse poll for idle-gated tasks, raw interval otherwise)
    const pollMs = task.gate ? Math.min(task.intervalMs, IDLE_POLL_MS) : task.intervalMs
    task.timer = setInterval(() => {
      runTask(name)
    }, pollMs)
  }
  log.info(`cron: scheduler initialized with ${names.length} tasks`)

  // Load user-configured scheduled tasks from the DB and register them.
  try {
    try { require('../llm/skillSelfCreate').loadPatterns(db) } catch (e) { log.warn('cron: failed to load self-learning patterns:', e.message) }
    const tasks = db.getScheduledTasks ? db.getScheduledTasks() : []
    for (const t of tasks) {
      if (t.enabled) registerUserTask(t)
    }
    if (tasks.length) log.info(`cron: registered ${tasks.length} user scheduled tasks`)
  } catch (e) {
    log.warn('cron: failed to load user scheduled tasks:', e.message)
  }
}

function runTask(name, opts = {}) {
  const task = TASKS[name]
  if (!task || task.running) return
  task.running = true
  const exec = task.gate
    ? task.gate.tick({ force: Boolean(opts.force) })
    : Promise.resolve(task.fn(_db))
  Promise.resolve(exec)
    .catch(e => log.warn(`cron: ${name} error:`, e.message))
    .finally(() => { task.running = false })
}

// Run a specific task immediately (for manual triggers — bypasses idle/cooldown gates).
function runNow(name) {
  if (!TASKS[name]) return false
  runTask(name, { force: true })
  return true
}

// Cooperatively trigger an idle-gated task through its IdleGate without
// bypassing idle window, busy checks, cooldown, or shouldYield guarantees.
function nudgeIdleTask(name, dbOverride = null) {
  const task = TASKS[name]
  if (!task) return false
  if (!_db && dbOverride) _db = dbOverride
  if (task.running || isSystemBusy()) return false
  runTask(name, { force: false })
  return true
}

// List all registered tasks with their intervals.
function listTasks() {
  return Object.entries(TASKS).map(([name, t]) => ({
    name,
    intervalMs: t.intervalMs,
    running: t.running,
    idleGated: Boolean(t.gate),
  }))
}

// Graceful shutdown: clear all timers.
function shutdown() {
  while (_startupTimers.length > 0) {
    clearTimeout(_startupTimers.pop())
  }
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

module.exports = {
  initScheduler,
  runNow,
  listTasks,
  shutdown,
  registerUserTask,
  removeUserTask,
  listUserTasks,
  runUserTaskNow,
  USER_TASK_TYPES,
  noteUserActivity,
  registerBusyChecker,
  isSystemBusy,
  nudgeIdleTask,
}