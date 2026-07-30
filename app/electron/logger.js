// ───────────────────────────────────────────────────────────────────────────
// AetherAI centralized logger — replaces scattered console.* calls.
//
// Levels:  debug < info < warn < error
// In dev  : everything passes through to console.
// In prod : debug is silenced (still stored), warn/error also print.
// File    : all levels that reach write() persist to aetherai.log in userData
//           so logs survive a crash. Rotates at 5 MB -> .log.old.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')

const isDev = process.env.VITE_DEV_SERVER_URL !== undefined || process.env.NODE_ENV !== 'production'

const PREFIX = '[AetherAI]'

// In-memory ring buffer for the last N log entries (used by Settings -> Logs).
const MAX_ENTRIES = 500
const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 }
const entries = []

// Lazy-resolved file log path (electron's app may not be available at require
// time, e.g. in unit tests). Rotates at 5 MB to avoid unbounded growth.
let _logPath = null
const MAX_LOG_SIZE = 5 * 1024 * 1024

function getLogPath() {
  if (_logPath) return _logPath
  try {
    const { app } = require('electron')
    _logPath = path.join(app.getPath('userData'), 'aetherai.log')
  } catch { return null }
  return _logPath
}

function appendToFile(level, time, msg) {
  const p = getLogPath()
  if (!p) return
  try {
    // Rotate if the file exceeded the size cap (stat is cheap, no content read).
    try {
      const stat = fs.statSync(p)
      if (stat.size > MAX_LOG_SIZE) {
        const old = p + '.old'
        try { fs.unlinkSync(old) } catch {}
        fs.renameSync(p, old)
      }
    } catch { /* file does not exist yet, fine */ }
    fs.appendFileSync(p, time + ' [' + level.toUpperCase() + '] ' + msg + '\n')
  } catch { /* never let logging crash the app */ }
}

function ts() {
  return new Date().toLocaleTimeString('en-US', { hour12: false })
}

function write(level, ...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
  const time = ts()
  entries.push({ level, time, msg })
  if (entries.length > MAX_ENTRIES) entries.shift()

  if (isDev || LEVEL_ORDER[level] >= LEVEL_ORDER.warn) {
    const fn = console[level] ?? console.log
    fn(PREFIX + ' ' + msg)
  }
  // Persist to file for post-crash diagnosis. debug only reaches write() in
  // dev mode (see log.debug below), so prod files contain info+ only.
  appendToFile(level, time, msg)
}

const log = {
  debug: (...args) => { if (isDev) write('debug', ...args) },
  info:  (...args) => write('info', ...args),
  warn:  (...args) => write('warn', ...args),
  error: (...args) => write('error', ...args),
  getEntries: () => [...entries],
  clear: () => { entries.length = 0 },
}

module.exports = log