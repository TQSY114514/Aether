// ───────────────────────────────────────────────────────────────────────────
// AetherAI centralized logger — replaces scattered console.* calls.
//
// Levels:  debug < info < warn < error
// In dev  : everything passes through to console.
// In prod : debug is silenced (still stored), warn/error also print.
// ───────────────────────────────────────────────────────────────────────────

const isDev = !(process.env.NODE_ENV === 'production' || process.env.VITE_DEV_SERVER_URL === undefined)

const PREFIX = '[AetherAI]'

// In-memory ring buffer for the last N log entries (used by Settings → Logs).
const MAX_ENTRIES = 500
const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 }
const entries = []

function ts() {
  return new Date().toLocaleTimeString('en-US', { hour12: false })
}

function write(level, ...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
  entries.push({ level, time: ts(), msg })
  if (entries.length > MAX_ENTRIES) entries.shift()

  if (isDev || LEVEL_ORDER[level] >= LEVEL_ORDER.warn) {
    const fn = console[level] ?? console.log
    fn(`${PREFIX} ${msg}`)
  }
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
