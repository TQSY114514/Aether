// ───────────────────────────────────────────────────────────────────────────
// Trust Engine — adaptive permission based on historical agent behaviour.
//
// Inspired by Hermes' progressive capability unlocking and Claude Code's
// permission system. Each session tracks a trust_score (0-100) that
// dynamically adjusts which dangerous tools require user confirmation.
//
// Score adjustment:
//   +5 on user approve for dangerous tool
//   -10 on user deny for dangerous tool
//   -2 on any tool error
//   +3 on verification pass
//   -1 per week of inactivity (natural decay)
//
// Permission mapping:
//   trust > 80  → dangerous tools auto-approve
//   50-80       → ask (default)
//   < 50        → high-risk tools (write_file, run_command) require yolo
// ───────────────────────────────────────────────────────────────────────────

const log = require('../logger')

const TRUST_INITIAL = 50
const TRUST_MAX = 100
const TRUST_MIN = 0
const TRUST_AUTO_APPROVE = 80
const TRUST_YOLO_THRESHOLD = 50
const HIGH_RISK_TOOLS = new Set(['write_file', 'edit_file', 'run_command', 'git_commit', 'apply_patch'])

// ─── Score computation ─────────────────────────────────────────────────────
// Returns current trust score, computing decay from last update.

function getTrustScore(db, sessionId) {
  try {
    // better-sqlite3: 参数化查询必须 db.prepare(sql).get(?) —— db.exec() 不
    // 接受绑定参数, 旧写法在此形态下恒返回 falsy, 信任分永远是初始值 50
    // （审计 Low 项）。session 表的活跃时间列是 updated_at（无 last_update）。
    const row = db.prepare('SELECT trust_score, updated_at FROM session WHERE id = ?').get(sessionId)
    if (!row) return TRUST_INITIAL

    let score = row.trust_score
    if (score === null || score === undefined) return TRUST_INITIAL
    score = Number(score)

    // Natural decay: -1 per week of inactivity.
    const lastUpdate = row.updated_at
    if (lastUpdate) {
      const daysAgo = (Date.now() - new Date(lastUpdate).getTime()) / 86400000
      const weeks = Math.floor(daysAgo / 7)
      if (weeks > 0) {
        score = Math.max(TRUST_MIN, score - weeks)
      }
    }

    return Math.max(TRUST_MIN, Math.min(TRUST_MAX, score))
  } catch (e) {
    log.debug('getTrustScore failed:', e && e.message)
    return TRUST_INITIAL
  }
}

// ─── Adjustment helpers ────────────────────────────────────────────────────

function adjustTrust(db, sessionId, delta, toolName) {
  if (!db || !sessionId) return

  const current = getTrustScore(db, sessionId)
  const newScore = Math.max(TRUST_MIN, Math.min(TRUST_MAX, current + delta))

  try {
    // Check if column exists (may not be created yet on older databases).
    // PRAGMA 的表名是模块内常量（无注入面）；better-sqlite3 下用
    // prepare().all() 取列清单 —— db.exec() 形态恒返回空会让列检查永远
    // 失败, 写入被静默跳过。时间戳用 datetime('now','localtime') 与
    // database.js 的 localNow() 同格式（CURRENT_TIMESTAMP 是 UTC）。
    const cols = db.prepare('PRAGMA table_info(session)').all()
    const hasTrustCol = Array.isArray(cols) && cols.some(c => c && c.name === 'trust_score')
    if (!hasTrustCol) return

    db.prepare(
      `UPDATE session SET trust_score = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`
    ).run(newScore, sessionId)
  } catch (e) {
    // Column may not exist yet — silent ignore.
    log.debug('adjustTrust failed:', e && e.message)
  }

  return newScore
}

// ─── Decision gate ─────────────────────────────────────────────────────────
// Returns { mode: 'auto' | 'ask' | 'yolo' } for a given tool and session.

function getPermissionMode(db, sessionId, toolName) {
  const trust = getTrustScore(db, sessionId)

  // Non-dangerous tools: follow default policy.
  let isDangerous = false
  try {
    const registry = require('../tools/registry')
    const getTool = registry.getTool
    if (getTool) {
      const t = getTool(toolName)
      if (t && t.risk === 'dangerous') isDangerous = true
    }
  } catch {}

  if (!isDangerous) return 'ask'

  // Dangerous tool — apply trust-based logic.
  if (trust >= TRUST_AUTO_APPROVE) {
    if (HIGH_RISK_TOOLS.has(toolName)) {
      return trust >= 95 ? 'yolo' : 'auto' // Very high trust → yolo for high-risk
    }
    return 'auto' // Standard dangerous → auto
  }
  if (trust < TRUST_YOLO_THRESHOLD && HIGH_RISK_TOOLS.has(toolName)) {
    return 'ask' // Low trust + high risk → force manual confirmation
  }
  return 'ask' // Default for medium trust
}

// ─── Pre-computation for tool loop ─────────────────────────────────────────
// Called once per tool call decision. Returns the effective mode.

function getEffectiveMode(agentMode, toolName, db, sessionId) {
  if (agentMode === 'yolo') return 'yolo'
  if (agentMode === 'plan') return 'plan'
  if (agentMode === 'auto_confirm') return 'auto'

  // In manual/ask mode, trust engine can override to auto or yolo.
  if (agentMode === 'ask' && sessionId) {
    return getPermissionMode(db, sessionId, toolName)
  }
  return agentMode
}

// ─── Status badge ──────────────────────────────────────────────────────────
// Returns a status object for the UI trust badge display.

function getTrustBadge(db, sessionId) {
  const trust = getTrustScore(db, sessionId)
  let color, label
  if (trust >= 80) { color = 'green'; label = 'trusted' }
  else if (trust >= 50) { color = 'yellow'; label = 'neutral' }
  else { color = 'red'; label = 'cautious' }
  return { trust, color, label }
}

module.exports = {
  getTrustScore,
  adjustTrust,
  getPermissionMode,
  getEffectiveMode,
  getTrustBadge,
  TRUST_INITIAL,
  HIGH_RISK_TOOLS,
}
