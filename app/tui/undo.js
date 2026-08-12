// ─────────────────────────────────────────────────────────────────────────────
// undo.js — /undo 消息级撤销的纯逻辑 + DB 同步（W1-t13）
// findUndoBoundary：定位最后一轮 user 消息（界面数组向后扫描）。
// syncUndoToDb：删除最后一轮 user+assistant 的 DB 行（taskDbAdapter 语义
// 已核实：deleteMessagesAfter 为 id > afterId, taskDbAdapter.js:85-89 →
// 需先 deleteMessage(user 行) 再 deleteMessagesAfter 清后续行）。
// ─────────────────────────────────────────────────────────────────────────────
import { taskDbAdapter } from '../electron/llm/taskDbAdapter.js'
import { userAssistantIndexOf } from './compact.js'

/**
 * 定位最后一轮 user 消息（界面 messages 数组, 向后扫描）。
 * @param {Array<{id:number,role:string}>} messages
 * @returns {{ lastUserIndex:number, lastUserMsgId:number } | null}
 *   lastUserMsgId 为界面本地消息 id（DB 行 id 不同源, 需经
 *   userAssistantIndexOf 映射, 见 compact.js 文件头）
 */
export function findUndoBoundary(messages) {
  if (!Array.isArray(messages) || !messages.length) return null
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i] && messages[i].role === 'user') {
      return { lastUserIndex: i, lastUserMsgId: Number(messages[i].id) }
    }
  }
  return null
}

/**
 * 删除最后一轮 user+assistant 的 DB 行（id >= user 行 id）。
 * 界面消息 ↔ DB 行按 user/assistant 子序列位置映射（runSession 只落这两类行）。
 * 防御：位置越界或该行 role 非 user → 拒绝删除并 note（DB 与界面不一致,
 * 不半删）。
 * @param {object} db  better-sqlite3 连接
 * @param {number|null} sessionId
 * @param {Array<{id:number,role:string}>} messages  界面消息
 * @param {{lastUserIndex:number}} boundary  findUndoBoundary 的产物
 * @returns {{ ok:boolean, deleted:number, note?:string }}
 */
export function syncUndoToDb(db, sessionId, messages, boundary) {
  if (!db || sessionId == null) return { ok: false, deleted: 0, note: 'session not persisted' }
  const pos = userAssistantIndexOf(messages, boundary.lastUserIndex)
  if (pos < 0) return { ok: false, deleted: 0, note: 'last user message not mappable to a db row' }
  const adapter = taskDbAdapter(db)
  const rows = db.prepare('SELECT id, role FROM message WHERE session_id = ? ORDER BY id').all(sessionId)
  if (pos >= rows.length) return { ok: false, deleted: 0, note: 'db rows fewer than state (aborted turn?)' }
  if (rows[pos].role !== 'user') return { ok: false, deleted: 0, note: 'db row at mapped position is not user (state/db mismatch)' }
  adapter.deleteMessage(rows[pos].id)          // user 行
  const after = adapter.deleteMessagesAfter(sessionId, rows[pos].id) // id > user 行 id → assistant + 后续
  return { ok: true, deleted: 1 + Number(after.changes || 0) }
}
