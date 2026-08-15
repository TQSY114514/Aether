// ─────────────────────────────────────────────────────────────────────────────
// compact.js — /compact 与 /compress-fast 的纯逻辑 + DB 同步（W1-t10）
//
// 审计结论（本文件头部, 随 W1-t10 落盘）：
//   app/electron/llm/compaction.js 及其传递闭包（providerAdapter →
//   openaiAdapter/anthropicAdapter/responsesAdapter → credentialPool/llmShared/
//   retry/cachePolicy; hooks → sandbox/logger/permissions; tokenizer）全部
//   Electron-free：
//     - `node -e "require('./electron/llm/compaction')"` 加载通过（exit 0）
//     - 闭包内唯一的 require('electron') 是 sandbox.js:6 的 try/catch 守卫与
//       logger.js getLogPath() 的惰性加载（均不在模块加载路径上）
//   → /compact 直接复用 maybeCompact（AI 摘要路径）；/compress-fast 用
//     buildCompactPlan 纯裁剪（无 AI）。两者共用本文件的 DB 同步语义：
//     被压缩消息的行从 message 表删除（不留孤儿行），摘要/标记行追加。
//
// Electron-free：本模块只依赖 node 内置 + taskDbAdapter（已 Electron-free）。
// ─────────────────────────────────────────────────────────────────────────────
import { taskDbAdapter } from '../electron/llm/taskDbAdapter.js'

// /compress-fast 保留窗口（对齐桌面 compaction.js 的 RECENT_WINDOW=8）
export const COMPRESS_KEEP_LAST = 8

/**
 * 消息在「user/assistant 子序列」中的 0 基位置（DB 行顺序 = 该子序列顺序,
 * 因为 runSession 只落库 user/assistant 行）。system/tool 行返回 -1。
 * 用于把界面消息 id 映射到 DB 行 id（两者不同源: 界面 id 是本地计数器,
 * DB 行 id 是全局自增）。
 * @param {Array<{id:number,role:string}>} messages
 * @param {number} messageIndex  界面 messages 数组中的下标
 * @returns {number}  -1 = 非 user/assistant
 */
export function userAssistantIndexOf(messages, messageIndex) {
  if (!Array.isArray(messages) || !Number.isInteger(messageIndex) || messageIndex < 0 || messageIndex >= messages.length) return -1
  const target = messages[messageIndex]
  if (!target || (target.role !== 'user' && target.role !== 'assistant')) return -1
  let pos = 0
  for (let i = 0; i < messageIndex; i++) {
    if (messages[i].role === 'user' || messages[i].role === 'assistant') pos++
  }
  return pos
}

/** user/assistant 消息计数（DB 行数的理论值）。 */
export function userAssistantCount(messages) {
  if (!Array.isArray(messages)) return 0
  return messages.reduce((n, m) => n + (m.role === 'user' || m.role === 'assistant' ? 1 : 0), 0)
}

/**
 * 纯裁剪计划（/compress-fast 与 /compact 的降级路径共用）：
 * 保留最近 keepLast 条消息原样, 更早的旧消息由调用方用 marker 行替换。
 * 硬约束：绝不切断一个 user/assistant 回合对——若切口处第一个保留消息是
 * assistant 而其 user 搭档在丢弃区, 则前移切口把整对保留（宁可多留不拆对）。
 *
 * @param {Array<{id:number,role:string,text:string}>} messages
 * @param {number} [keepLast]  保留条数（下限 1）
 * @returns {{ boundary:number, older:Array, kept:Array, canCompact:boolean,
 *             marker:object|null, messages:Array }}
 *   messages = 替换后的完整消息列表（canCompact 时 = [marker, ...kept]）
 */
export function buildCompactPlan(messages, keepLast = COMPRESS_KEEP_LAST) {
  const msgs = Array.isArray(messages) ? messages : []
  if (!msgs.length) return { boundary: 0, older: [], kept: [], canCompact: false, marker: null, messages: [] }
  const n = Math.max(1, Number.isFinite(keepLast) ? Math.floor(keepLast) : COMPRESS_KEEP_LAST)
  let boundary = Math.max(0, msgs.length - n)
  // 回合对守卫：首条保留消息是 assistant 且其前一条是 user（将被丢弃）→ 前移切口
  while (
    boundary > 0 &&
    msgs[boundary] && msgs[boundary].role === 'assistant' &&
    msgs[boundary - 1] && msgs[boundary - 1].role === 'user'
  ) {
    boundary--
  }
  if (!boundary) return { boundary: 0, older: [], kept: msgs, canCompact: false, marker: null, messages: msgs }
  const older = msgs.slice(0, boundary)
  const kept = msgs.slice(boundary)
  const nextId = msgs.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1
  const marker = {
    id: nextId,
    role: 'system',
    text: `[compacted] 已裁剪 ${older.length} 条旧消息（保留最近 ${kept.length} 条）`,
  }
  return { boundary, older, kept, canCompact: true, marker, messages: [marker, ...kept] }
}

/**
 * 把桌面 maybeCompact 的返回结果重建为界面消息列表（纯函数）。
 * 通过对象引用识别原消息（maybeCompact 对保留消息复用传入的对象引用）;
 * 新生成的行（摘要等）转为带 [compacted] 前缀的 system 消息, 取第一条非空
 * system 文本作为 DB 摘要。顺序跟随引擎输出（摘要在前, 保留消息在后）。
 *
 * @param {Array} result  maybeCompact 返回的 API 形状消息 [{role, content}]
 * @param {Array} original  传给 maybeCompact 前的界面消息（与 result 保留项同引用）
 * @returns {{ messages:Array, keptUa:number, droppedUa:number, summaryText:string }}
 */
export function rebuildMessages(result, original) {
  const orig = Array.isArray(original) ? original : []
  // 引用映射：maybeCompact 对保留消息复用传入的对象引用（slice/unshift 同引用）
  const map = new Map()
  for (let i = 0; i < orig.length; i++) map.set(orig[i], orig[i])
  let nextId = orig.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1
  const messages = []
  let keptUa = 0
  let summaryText = ''
  for (const r of Array.isArray(result) ? result : []) {
    const originalMsg = map.get(r)
    if (originalMsg) {
      messages.push(originalMsg)
      if (originalMsg.role === 'user' || originalMsg.role === 'assistant') keptUa++
    } else {
      const text = String(r && typeof r.content === 'string' ? r.content : '')
      if (r && r.role === 'system' && text && !summaryText) summaryText = text
      messages.push({ id: nextId++, role: 'system', text: text ? `[compacted] ${text}` : '[compacted]' })
    }
  }
  return { messages, keptUa, droppedUa: userAssistantCount(orig) - keptUa, summaryText }
}

/**
 * 压缩后 DB 同步：删除被压缩的旧 user/assistant 行（不留孤儿行）, 追加摘要行。
 * 界面消息顺序与 DB 行顺序一致（DB 行 = user/assistant 子序列, 见文件头）,
 * 因此被压缩的行恰好是最早的 droppedUa 行。
 *
 * 说明：taskDbAdapter 只有 deleteMessage(id) 与 deleteMessagesAfter(sessionId,
 * afterId)（后者语义为 id > afterId, taskDbAdapter.js:85-89）——没有
 * "删除 id 之前" 的原子方法, 故对最早的 droppedUa 行逐行 deleteMessage
 * （幂等, TUI 会话行数有限, 单次 <1ms 级）。
 *
 * @param {object} db  better-sqlite3 连接（openSessionDb 产物）
 * @param {number|null} sessionId  DB 会话行 id; null → 未落库会话, 仅跳过 DB 部分
 * @param {object} p
 * @param {number} p.droppedUa  需删除的 user/assistant 行数
 * @param {string} p.summaryText  摘要/标记文本（以 [compacted] 开头）
 * @returns {{ deleted:number, added:boolean, note?:string }}
 */
export function syncCompactToDb(db, sessionId, { droppedUa, summaryText }) {
  if (!db || sessionId == null) return { deleted: 0, added: false, note: 'session not persisted (db unavailable)' }
  const adapter = taskDbAdapter(db)
  // LP1: 只取 user/assistant 行做位置映射——注入 system 行（runSession 落库的
  // [injected:...]）夹在 user/assistant 之间, 全量行会把映射偏移一位。
  const allRows = db.prepare('SELECT id, role FROM message WHERE session_id = ? ORDER BY id').all(sessionId)
  const rows = allRows.filter((r) => r.role === 'user' || r.role === 'assistant')
  const dropCount = Math.max(0, Math.min(Number(droppedUa) || 0, rows.length))
  for (let i = 0; i < dropCount; i++) adapter.deleteMessage(rows[i].id)
  // LP1: 被压缩轮次的注入 system 行（id 介于被删 user/assistant 行之间）一并
  // 删除, 不留孤儿审计行; 保留轮次的行 id 恒大于最后被删行, 不受影响。
  if (dropCount > 0) {
    const maxDroppedId = rows[dropCount - 1].id
    for (const r of allRows) {
      if (r.role !== 'user' && r.role !== 'assistant' && Number(r.id) <= maxDroppedId) adapter.deleteMessage(r.id)
    }
  }
  let added = false
  const text = String(summaryText || '').trim()
  if (text) {
    adapter.addMessage({ session_id: sessionId, role: 'assistant', content: text })
    added = true
  }
  return { deleted: dropCount, added, note: dropCount < (Number(droppedUa) || 0) ? 'db rows fewer than state (aborted turn?)' : undefined }
}
