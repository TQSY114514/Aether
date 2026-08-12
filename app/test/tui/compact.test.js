// ─────────────────────────────────────────────────────────────────────────────
// compact.test.js — /compact + /compress-fast 纯逻辑与 DB 同步（W1-t10）
// 覆盖：buildCompactPlan（保留最近 N、永不拆 user/assistant 回合对、空输入）、
// rebuildMessages（引用保留/摘要行生成/kept/dropped 计数）、syncCompactToDb
// （真实 temp DB：被压缩行删除不留孤儿、摘要行追加、未落库会话跳过）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEmptyDatabase } from '../../electron/database.js'
import { taskDbAdapter } from '../../electron/llm/taskDbAdapter.js'
import { buildCompactPlan, rebuildMessages, syncCompactToDb, userAssistantIndexOf } from '../../tui/compact.js'

function msg(id, role, text = 'x') {
  return { id, role, text }
}

describe('buildCompactPlan（纯裁剪计划, W1-t10）', () => {
  it('消息数 ≤ 保留窗口 → canCompact=false, 原样返回', () => {
    const msgs = [msg(1, 'user'), msg(2, 'assistant')]
    const plan = buildCompactPlan(msgs, 8)
    expect(plan.canCompact).toBe(false)
    expect(plan.kept).toEqual(msgs)
    expect(plan.older).toEqual([])
  })

  it('保留最近 N 条原样（id/role/text 不变）, 更早的进 older', () => {
    const msgs = [msg(1, 'user'), msg(2, 'assistant'), msg(3, 'user'), msg(4, 'assistant'), msg(5, 'user'), msg(6, 'assistant')]
    const plan = buildCompactPlan(msgs, 2)
    expect(plan.canCompact).toBe(true)
    expect(plan.boundary).toBe(4)
    expect(plan.older.map((m) => m.id)).toEqual([1, 2, 3, 4])
    expect(plan.kept.map((m) => m.id)).toEqual([5, 6])
    expect(plan.messages.length).toBe(3) // marker + 2 保留
    expect(plan.messages[0]).toBe(plan.marker)
    expect(plan.marker.text).toMatch(/4 条旧消息/)
    expect(plan.messages.slice(1)).toEqual(plan.kept)
  })

  it('永不拆分 user/assistant 回合对：切口落在 assistant 且其 user 在丢弃区 → 前移切口', () => {
    const msgs = [msg(1, 'user'), msg(2, 'assistant'), msg(3, 'user'), msg(4, 'assistant'), msg(5, 'user'), msg(6, 'assistant')]
    // keepLast=3 → 原始切口 boundary=3 → 首条保留 = assistant(4), 其 user(3) 将被丢 → 前移
    const plan = buildCompactPlan(msgs, 3)
    expect(plan.boundary).toBe(2)
    expect(plan.older.map((m) => m.id)).toEqual([1, 2])
    expect(plan.kept.map((m) => m.id)).toEqual([3, 4, 5, 6]) // 整对 3/4 保留
  })

  it('空输入 → canCompact=false 不崩溃', () => {
    const plan = buildCompactPlan([])
    expect(plan.canCompact).toBe(false)
    expect(plan.messages).toEqual([])
  })

  it('keepLast < 1 钳制为 1；回合对守卫仍优先（不拆对）', () => {
    const msgs = [msg(1, 'user'), msg(2, 'assistant'), msg(3, 'user'), msg(4, 'assistant')]
    const plan = buildCompactPlan(msgs, 0)
    // n=1 → 原始切口 boundary=3 → 首条保留是 assistant(4) 且其 user(3) 将被丢 → 前移到 2
    expect(plan.boundary).toBe(2)
    expect(plan.kept.map((m) => m.id)).toEqual([3, 4])
    expect(buildCompactPlan(null).canCompact).toBe(false)
  })

  it('marker id 为现有最大 id + 1（不与保留消息 id 冲突）', () => {
    const msgs = [msg(10, 'user'), msg(20, 'assistant'), msg(30, 'user'), msg(40, 'assistant')]
    const plan = buildCompactPlan(msgs, 1)
    expect(plan.marker.id).toBe(41)
  })
})

describe('rebuildMessages（maybeCompact 结果 → 界面消息, W1-t10）', () => {
  it('保留消息按引用还原（原 id/role/text）, 摘要行带 [compacted] 前缀', () => {
    const orig = [
      msg(1, 'user', 'hello'),
      msg(2, 'assistant', 'hi there'),
      msg(3, 'user', 'bye'),
      msg(4, 'assistant', 'see you'),
    ]
    // 模拟 maybeCompact：保留 [3,4] 引用 + 新摘要 system 行（引用全新建）
    const result = [
      { role: 'system', content: 'Summary of earlier conversation:\nuser said hello' },
      orig[2],
      orig[3],
    ]
    const rebuilt = rebuildMessages(result, orig)
    expect(rebuilt.messages[0]).toEqual({ id: 5, role: 'system', text: '[compacted] Summary of earlier conversation:\nuser said hello' })
    expect(rebuilt.messages[1]).toBe(orig[2])
    expect(rebuilt.messages[2]).toBe(orig[3])
    expect(rebuilt.keptUa).toBe(2)
    expect(rebuilt.droppedUa).toBe(2)
    expect(rebuilt.summaryText).toBe('Summary of earlier conversation:\nuser said hello')
  })

  it('空结果 → 空列表, 计数 0', () => {
    const rebuilt = rebuildMessages([], [msg(1, 'user')])
    expect(rebuilt.messages).toEqual([])
    expect(rebuilt.droppedUa).toBe(1)
  })
})

describe('userAssistantIndexOf（界面消息 → DB 行位置映射, W1-t10/t13）', () => {
  it('system 行不占位, user/assistant 依次计数', () => {
    const msgs = [msg(1, 'user'), msg(2, 'assistant'), msg(3, 'system'), msg(4, 'user'), msg(5, 'assistant')]
    expect(userAssistantIndexOf(msgs, 0)).toBe(0)
    expect(userAssistantIndexOf(msgs, 1)).toBe(1)
    expect(userAssistantIndexOf(msgs, 2)).toBe(-1) // system
    expect(userAssistantIndexOf(msgs, 3)).toBe(2)
    expect(userAssistantIndexOf(msgs, 4)).toBe(3)
  })
  it('越界/非法输入 → -1', () => {
    expect(userAssistantIndexOf([], 0)).toBe(-1)
    expect(userAssistantIndexOf([msg(1, 'user')], 5)).toBe(-1)
    expect(userAssistantIndexOf([msg(1, 'user')], -1)).toBe(-1)
  })
})

describe('syncCompactToDb（真实 temp DB, W1-t10）', () => {
  let dbPath = ''
  let db = null

  beforeAll(() => {
    dbPath = join(tmpdir(), `tui-compact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`)
    db = createEmptyDatabase(dbPath)
  })
  afterAll(() => {
    try { db?.close() } catch {}
    for (const suffix of ['', '-wal', '-shm']) { try { rmSync(`${dbPath}${suffix}`, { force: true }) } catch {} }
  })

  it('删除最早的 droppedUa 行（不留孤儿行）+ 追加摘要行', () => {
    const adapter = taskDbAdapter(db)
    const sid = Number(adapter.createSession({ title: 'tui' }).lastInsertRowid)
    for (const [role, content] of [['user', 'u1'], ['assistant', 'a1'], ['user', 'u2'], ['assistant', 'a2'], ['user', 'u3'], ['assistant', 'a3']]) {
      adapter.addMessage({ session_id: sid, role, content })
    }
    const r = syncCompactToDb(db, sid, { droppedUa: 4, summaryText: '[compacted] 已压缩 4 条' })
    expect(r.deleted).toBe(4)
    const rows = db.prepare('SELECT role, content FROM message WHERE session_id = ? ORDER BY id').all(sid)
    expect(rows).toEqual([
      { role: 'user', content: 'u3' },
      { role: 'assistant', content: 'a3' },
      { role: 'assistant', content: '[compacted] 已压缩 4 条' },
    ])
  })

  it('DB 行少于 droppedUa（中断轮次）→ 只删存在的行, note 标注', () => {
    const adapter = taskDbAdapter(db)
    const sid = Number(adapter.createSession({ title: 'tui' }).lastInsertRowid)
    adapter.addMessage({ session_id: sid, role: 'user', content: 'u1' })
    adapter.addMessage({ session_id: sid, role: 'assistant', content: 'a1' })
    const r = syncCompactToDb(db, sid, { droppedUa: 99, summaryText: '[compacted] x' })
    expect(r.deleted).toBe(2)
    expect(r.note).toMatch(/fewer than state/)
    expect(db.prepare('SELECT COUNT(*) AS n FROM message WHERE session_id = ?').get(sid).n).toBe(1) // 仅摘要行
  })

  it('sessionId null（未落库会话）→ 跳过, note 标注, 不崩溃', () => {
    const r = syncCompactToDb(db, null, { droppedUa: 3, summaryText: '[compacted] x' })
    expect(r.deleted).toBe(0)
    expect(r.added).toBe(false)
    expect(r.note).toMatch(/not persisted/)
  })
})
