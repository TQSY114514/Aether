// ─────────────────────────────────────────────────────────────────────────────
// undo.test.js — /undo 纯逻辑与 DB 同步（W1-t13）
// findUndoBoundary：向后找最后一轮 user、无 user 消息 → null、system 尾行
// 不干扰。syncUndoToDb（真实 temp DB）：seed 会话 + 3 条消息 → 撤销后
// user+assistant 行消失、DB 与界面一致; 防御路径（位置越界/role 不符/无会话）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEmptyDatabase } from '../../electron/database.js'
import { taskDbAdapter } from '../../electron/llm/taskDbAdapter.js'
import { findUndoBoundary, syncUndoToDb } from '../../tui/undo.js'

describe('findUndoBoundary（W1-t13）', () => {
  it('返回最后一轮 user 的界面索引与本地消息 id', () => {
    const msgs = [
      { id: 1, role: 'user', text: 'a' },
      { id: 2, role: 'assistant', text: 'b' },
      { id: 3, role: 'user', text: 'c' },
      { id: 4, role: 'assistant', text: 'd' },
    ]
    expect(findUndoBoundary(msgs)).toEqual({ lastUserIndex: 2, lastUserMsgId: 3 })
  })

  it('尾部 system 行不干扰（仍找到其前的 user）', () => {
    const msgs = [
      { id: 1, role: 'user', text: 'a' },
      { id: 2, role: 'assistant', text: 'b' },
      { id: 3, role: 'system', text: 'error: x' },
    ]
    expect(findUndoBoundary(msgs)).toEqual({ lastUserIndex: 0, lastUserMsgId: 1 })
  })

  it('无 user 消息 / 空数组 → null', () => {
    expect(findUndoBoundary([])).toBeNull()
    expect(findUndoBoundary([{ id: 1, role: 'system', text: 'x' }])).toBeNull()
    expect(findUndoBoundary(null)).toBeNull()
  })
})

describe('syncUndoToDb（真实 temp DB, W1-t13）', () => {
  let dbPath = ''
  let db = null

  beforeAll(() => {
    dbPath = join(tmpdir(), `tui-undo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`)
    db = createEmptyDatabase(dbPath)
  })
  afterAll(() => {
    try { db?.close() } catch {}
    for (const suffix of ['', '-wal', '-shm']) { try { rmSync(`${dbPath}${suffix}`, { force: true }) } catch {} }
  })

  function seed(sessionId, pairs) {
    const adapter = taskDbAdapter(db)
    for (const [role, content] of pairs) {
      adapter.addMessage({ session_id: sessionId, role, content })
    }
  }

  it('撤销后 user+assistant 行删除（DB 与界面一致）', () => {
    const adapter = taskDbAdapter(db)
    const sid = Number(adapter.createSession({ title: 'tui' }).lastInsertRowid)
    seed(sid, [['user', 'u1'], ['assistant', 'a1'], ['user', 'u2'], ['assistant', 'a2']])
    // 界面消息（本地 id 与 DB 行 id 不同源：界面 10/11/12/13 ↔ DB 行 1/2/3/4）
    const stateMsgs = [
      { id: 10, role: 'user', text: 'u1' },
      { id: 11, role: 'assistant', text: 'a1' },
      { id: 12, role: 'user', text: 'u2' },
      { id: 13, role: 'assistant', text: 'a2' },
    ]
    const boundary = findUndoBoundary(stateMsgs)
    const r = syncUndoToDb(db, sid, stateMsgs, boundary)
    expect(r.ok).toBe(true)
    expect(r.deleted).toBe(2)
    const rows = db.prepare('SELECT role, content FROM message WHERE session_id = ? ORDER BY id').all(sid)
    expect(rows).toEqual([
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
    ])
  })

  it('DB 行少于界面（中断轮次只落 user 行）→ 拒绝删除并 note', () => {
    const adapter = taskDbAdapter(db)
    const sid = Number(adapter.createSession({ title: 'tui' }).lastInsertRowid)
    // 中断轮次：界面第 3 条 user 已提交但 DB 无对应行（第一轮正常落库 u1/a1）
    adapter.addMessage({ session_id: sid, role: 'user', content: 'u1' })
    adapter.addMessage({ session_id: sid, role: 'assistant', content: 'a1' })
    const stateMsgs = [
      { id: 1, role: 'user', text: 'u1' },
      { id: 2, role: 'assistant', text: 'a1' },
      { id: 3, role: 'user', text: 'u2' }, // DB 中不存在 → 映射位置越界
    ]
    const boundary = findUndoBoundary(stateMsgs)
    const r = syncUndoToDb(db, sid, stateMsgs, boundary)
    expect(r.ok).toBe(false)
    expect(r.note).toMatch(/fewer than state|aborted/)
    // 数据未被半删
    expect(db.prepare('SELECT COUNT(*) AS n FROM message WHERE session_id = ?').get(sid).n).toBe(2)
  })

  it('映射位置 role 非 user（状态/DB 漂移）→ 拒绝删除', () => {
    const adapter = taskDbAdapter(db)
    const sid = Number(adapter.createSession({ title: 'tui' }).lastInsertRowid)
    // DB 首行是 assistant（漂移）→ user 的映射位置指向 assistant 行
    adapter.addMessage({ session_id: sid, role: 'assistant', content: 'a0' })
    const stateMsgs = [
      { id: 6, role: 'user', text: 'u1' },
    ]
    const boundary = findUndoBoundary(stateMsgs)
    const r = syncUndoToDb(db, sid, stateMsgs, boundary)
    expect(r.ok).toBe(false)
    expect(r.note).toMatch(/not user/)
  })

  it('sessionId null → 跳过并 note', () => {
    const r = syncUndoToDb(db, null, [{ id: 1, role: 'user', text: 'x' }], { lastUserIndex: 0 })
    expect(r.ok).toBe(false)
    expect(r.note).toMatch(/not persisted/)
  })
})
