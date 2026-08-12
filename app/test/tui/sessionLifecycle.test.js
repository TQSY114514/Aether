// ─────────────────────────────────────────────────────────────────────────────
// sessionLifecycle.test.js — W2-t16 /rename + /delete 的 DB 层 QA（真实 temp DB）
// 断言：renameSession 改标题；deleteSession 级联删除（会话行 + 其消息 + FTS 行）
// 且不影响其他会话（级联策略写死：删会话即删其消息）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEmptyDatabase } from '../../electron/database.js'
import { taskDbAdapter } from '../../electron/llm/taskDbAdapter.js'

let dbPath = ''
let db = null

function seedSession(title, turns) {
  const sid = Number(taskDbAdapter(db).createSession({ title, parentSessionId: null }).lastInsertRowid)
  for (const [role, content] of turns) {
    taskDbAdapter(db).addMessage({ session_id: sid, role, content })
  }
  return sid
}

function messageCount(sid) {
  return Number(db.prepare('SELECT COUNT(*) AS n FROM message WHERE session_id = ?').get(sid).n)
}

beforeAll(() => {
  dbPath = join(tmpdir(), `tui-lifecycle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`)
  db = createEmptyDatabase(dbPath)
})

afterAll(() => {
  try { db?.close() } catch {}
  try { rmSync(dbPath, { force: true }) } catch {}
  try { rmSync(`${dbPath}-wal`, { force: true }) } catch {}
  try { rmSync(`${dbPath}-shm`, { force: true }) } catch {}
})

describe('renameSession（W2-t16 /rename）', () => {
  it('改标题并保留消息；更新 updated_at', () => {
    const sid = seedSession('old title', [['user', 'hi'], ['assistant', 'yo']])
    taskDbAdapter(db).renameSession(sid, '新标题')
    const row = db.prepare('SELECT title, updated_at FROM session WHERE id = ?').get(sid)
    expect(row.title).toBe('新标题')
    expect(row.updated_at).toBeTruthy()
    expect(messageCount(sid)).toBe(2) // 消息不受影响
  })

  it('id 为 null/undefined → 静默 no-op（不抛错）', () => {
    expect(() => taskDbAdapter(db).renameSession(null, 'x')).not.toThrow()
    expect(() => taskDbAdapter(db).renameSession(undefined, 'x')).not.toThrow()
  })
})

describe('deleteSession 级联（W2-t16 /delete）', () => {
  it('删会话 → 会话行 + 消息 + FTS 行全清, 其他会话完整保留', () => {
    const doomed = seedSession('to-delete', [
      ['user', 'q1'], ['assistant', 'a1'], ['user', 'q2'], ['assistant', 'a2'],
    ])
    const keeper = seedSession('keeper', [['user', 'keep'], ['assistant', 'kept']])
    // FTS 行存在性前提（addMessage 写 FTS）
    expect(Number(db.prepare('SELECT COUNT(*) AS n FROM messages_fts WHERE session_id = ?').get(doomed).n)).toBe(4)

    taskDbAdapter(db).deleteSession(doomed)

    expect(db.prepare('SELECT id FROM session WHERE id = ?').get(doomed)).toBeUndefined()
    expect(messageCount(doomed)).toBe(0)
    expect(Number(db.prepare('SELECT COUNT(*) AS n FROM messages_fts WHERE session_id = ?').get(doomed).n)).toBe(0)

    // 其他会话不受影响
    const keepRow = db.prepare('SELECT title FROM session WHERE id = ?').get(keeper)
    expect(keepRow.title).toBe('keeper')
    expect(messageCount(keeper)).toBe(2)
  })

  it('id 为 null/undefined → 静默 no-op（不抛错）', () => {
    expect(() => taskDbAdapter(db).deleteSession(null)).not.toThrow()
    expect(() => taskDbAdapter(db).deleteSession(undefined)).not.toThrow()
  })
})
