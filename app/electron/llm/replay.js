// ───────────────────────────────────────────────────────────────────────────
// Experience Replay — learn from successful agent trajectories.
//
// After a task completes successfully, record the trajectory (signature +
// tools + params) into the skill_patterns pool. Before a new task, query the
// pool for similar patterns and inject the winning ones back into context so
// the agent repeats what worked.
//
// Gated by the `memory.experienceReplay` feature flag (settings table under
// `feature_flag.memory.experienceReplay`). All entry points are no-ops when
// the flag is off or the db is absent.
//
// Table shape (pre-existing, created by database.js):
//   skill_patterns (signature TEXT PRIMARY KEY, tools TEXT NOT NULL,
//                   params_json TEXT, count INTEGER NOT NULL DEFAULT 1,
//                   last_seen DATETIME DEFAULT CURRENT_TIMESTAMP)
// ───────────────────────────────────────────────────────────────────────────

const log = require('../logger')
const featureFlags = require('../featureFlags')

const FLAG_KEY = 'memory.experienceReplay'

// ─── Flag helpers ───────────────────────────────────────────────────────────

// flag 单一事实来源:存储值或声明默认值。改 featureFlags.js 的 default 才真正生效。
function isReplayEnabled(db) {
  return featureFlags.isEnabled(db, FLAG_KEY)
}

// ─── Signatures / similarity ────────────────────────────────────────────────

/**
 * Normalize a signature string: lowercase, strip punctuation, collapse spaces.
 * Used both for storage keys and similarity comparison.
 */
function normalizeSignature(sig) {
  return String(sig || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/[\u4e00-\u9fff]/g, (c) => `${c} `) // 中文逐字切分,使 Jaccard 能在中文短语间匹配
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Jaccard similarity over word sets. 0 = disjoint, 1 = identical.
 * Filters Chinese function words / high-frequency particles that would
 * otherwise make any two contiguous-Chinese strings intersect (e.g. 的/了/时).
 */
const STOP_WORDS = new Set([
  '的','了','时','是','在','与','和','或','及','我','你','他','她','它','我们','你们','他们',
  '帮','请','把','将','为','给','用','对','从','到','要','这','那','并','且','然后','同时',
  '一个','一些','这个','那个',
])
function wordSimilarity(a, b) {
  const fw = (s) => [...new Set(s.split(' ').filter(Boolean))].filter((w) => !STOP_WORDS.has(w))
  const wa = fw(normalizeSignature(a))
  const wb = fw(normalizeSignature(b))
  if (wa.length === 0 || wb.length === 0) return 0
  let inter = 0
  for (const w of wa) if (wb.includes(w)) inter++
  const union = wa.length + wb.length - inter
  return union === 0 ? 0 : inter / union
}

// ─── Record ────────────────────────────────────────────────────────────────

/**
 * Record a successful trajectory into the pattern pool.
 * Returns the stored row or null when disabled/no-db.
 *
 * @param {object} opts
 * @param {object} opts.db        better-sqlite3 handle (or fake)
 * @param {string} [opts.signature]  description of the task/goal, e.g. user ask
 * @param {string[]} opts.tools      tool names used in the trajectory
 * @param {object} [opts.params]     structured params (model, plan, outcome)
 * @param {string} [opts.sessionId]  session identifier for traceability
 */
function recordPattern({ db, signature, tools = [], params = {}, sessionId = null }) {
  if (!isReplayEnabled(db)) return null
  if (!db || typeof db.run !== 'function') return null
  const sig = normalizeSignature(signature)
  if (!sig && tools.length === 0) return null

  const toolsJson = JSON.stringify(Array.isArray(tools) ? tools : [])
  const paramsJson = JSON.stringify({
    ...(params || {}),
    ...(sessionId ? { sessionId } : {}),
    recordedAt: new Date().toISOString(),
  })

  try {
    // Row already exists → bump count, refresh last_seen.
    const existing = db.allRows
      ? (db.allRows('SELECT signature FROM skill_patterns WHERE signature = ? LIMIT 1', [sig])[0] || null)
      : (db.prepare('SELECT signature FROM skill_patterns WHERE signature = ? LIMIT 1').get(sig) || null)
    if (existing) {
      if (db.run) {
        db.run('UPDATE skill_patterns SET count = count + 1, tools = ?, params_json = ?, last_seen = CURRENT_TIMESTAMP WHERE signature = ?', [toolsJson, paramsJson, sig])
      } else {
        db.prepare('UPDATE skill_patterns SET count = count + 1, tools = ?, params_json = ?, last_seen = CURRENT_TIMESTAMP WHERE signature = ?').run(toolsJson, paramsJson, sig)
      }
    } else {
      if (db.run) {
        db.run('INSERT INTO skill_patterns (signature, tools, params_json, count) VALUES (?, ?, ?, 1)', [sig, toolsJson, paramsJson])
      } else {
        db.prepare('INSERT INTO skill_patterns (signature, tools, params_json, count) VALUES (?, ?, ?, 1)').run(sig, toolsJson, paramsJson)
      }
    }
    const row = { signature: sig, tools: toolsJson, params_json: paramsJson, count: existing ? existing.count + 1 : 1 }
    log.debug('replay: recorded pattern', sig)
    return row
  } catch (e) {
    log.warn('replay: record failed:', e && e.message)
    return null
  }
}

// Alias for backward-friendly naming.
function recordReplay(opts) {
  return recordPattern(opts)
}

// ─── Find / inject ─────────────────────────────────────────────────────────

/**
 * Find patterns similar to `query`. Ranks by word similarity with the query,
 * subjectively boosted by the pattern's use count.
 * Returns [] when disabled.
 * @returns {{ signature: string, tools: string[], count: number, score: number }[]}
 */
function findPatterns(db, query, options = {}) {
  if (!isReplayEnabled(db)) return []
  const rows = db.allRows
    ? db.allRows('SELECT signature, tools, params_json, count FROM skill_patterns')
    : db.prepare('SELECT signature, tools, params_json, count FROM skill_patterns').all()
  if (!rows || rows.length === 0) return []

  const q = String(query || '')
  const limit = options.limit || 3
  const minScore = options.minScore || 0.05

  return rows
    .map(row => {
      const sim = wordSimilarity(q, row.signature)
      // count is stored as int; a 1-count pattern still ranks by content.
      const count = Number(row.count) || 1
      const score = sim * Math.min(2, 1 + Math.log(count))
      let tools = []
      try { tools = JSON.parse(row.tools || '[]') } catch {}
      return { signature: row.signature, tools, count, score }
    })
    .filter(p => p.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * Build a context prompt block from the top matching patterns, suitable for
 * injection into the system message. Returns '' when nothing matches.
 */
function buildReplayContext(db, query, options = {}) {
  const patterns = findPatterns(db, query, options)
  if (patterns.length === 0) return ''
  const lines = [
    '## Experience replay (from previous successful tasks)',
    ...patterns.map((p, i) => {
      const tools = p.tools.length ? ` tools=[${p.tools.join(', ')}]` : ''
      return `${i + 1}. ${p.signature}${tools} (used ${p.count} time${p.count > 1 ? 's' : ''})`
    }),
  ]
  return lines.join('\n')
}

module.exports = {
  FLAG_KEY,
  isReplayEnabled,
  normalizeSignature,
  wordSimilarity,
  recordPattern,
  recordReplay: recordPattern,
  findPatterns,
  buildReplayContext,
}