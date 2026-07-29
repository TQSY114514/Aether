// ───────────────────────────────────────────────────────────────────────────
// Browser-side logger for the renderer. Uses console under the hood but
// provides a unified prefix and a ring buffer so the renderer can expose
// a "logs" view in Settings if desired.
// ───────────────────────────────────────────────────────────────────────────

type Level = 'debug' | 'info' | 'warn' | 'error'
const LEVEL_ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const PREFIX = '[AetherAI]'
const MAX_ENTRIES = 300

const entries: { level: Level; time: string; msg: string }[] = []

function write(level: Level, ...args: unknown[]) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
  entries.push({ level, time: new Date().toLocaleTimeString('en-US', { hour12: false }), msg })
  if (entries.length > MAX_ENTRIES) entries.shift()

  const fn = console[level] ?? console.log
  fn(`${PREFIX} ${msg}`)
}

export const log = {
  debug: (...args: unknown[]) => write('debug', ...args),
  info:  (...args: unknown[]) => write('info', ...args),
  warn:  (...args: unknown[]) => write('warn', ...args),
  error: (...args: unknown[]) => write('error', ...args),
  getEntries: () => [...entries],
  clear: () => { entries.length = 0 },
}

export default log
