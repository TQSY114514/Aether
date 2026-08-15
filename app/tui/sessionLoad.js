// ─────────────────────────────────────────────────────────────────────────────
// sessionLoad.js — W2-t15 启动 resume 的 DB 读取 helper（纯函数, db 由调用方传入）
// --continue / --session <id> / --fork 的历史加载共用此模块；消息映射为
// reducer 的 {id, role, text} 形状（DB 列 content → 渲染字段 text）。
// Electron-free：只依赖 better-sqlite3 连接句柄，不 import electron。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 载入某会话的全部消息（按 DB 行序 id 升序），映射为 reducer 消息形状。
 * @param {object|null} db    better-sqlite3 连接（openSessionDb 产物）
 * @param {number|string|null} sessionId
 * @returns {{id: number, role: string, text: string}[]}   空/无会话 → []
 */
export function loadSessionMessages(db, sessionId) {
  if (!db || sessionId == null) return []
  let rows = []
  try {
    // LP1: 只取 user/assistant 行——注入上下文（system）留库审计, 不在 UI 渲染。
    rows = db.prepare('SELECT id, role, content FROM message WHERE session_id = ? AND role IN (\'user\',\'assistant\') ORDER BY id').all(Number(sessionId))
  } catch {
    return []
  }
  return rows.map((r) => ({ id: Number(r.id), role: r.role, text: r.content ?? '' }))
}

/**
 * 取会话标题（STATUS 反馈用）。会话不存在 → null。
 * @returns {string|null}
 */
export function loadSessionTitle(db, sessionId) {
  if (!db || sessionId == null) return null
  let row = null
  try {
    row = db.prepare('SELECT title FROM session WHERE id = ?').get(Number(sessionId))
  } catch {
    return null
  }
  return row ? row.title || null : null
}

/**
 * 最近会话（--continue 目标；与 listSessions 同序：id 最大即最新）。
 * @returns {{id: number, title: string|null}|null}   无会话 → null
 */
export function findMostRecentSession(db) {
  if (!db) return null
  let row = null
  try {
    row = db.prepare('SELECT id, title FROM session ORDER BY id DESC LIMIT 1').get()
  } catch {
    return null
  }
  return row ? { id: Number(row.id), title: row.title || null } : null
}
