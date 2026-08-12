// ─────────────────────────────────────────────────────────────────────────────
// sessionLoad.test.js — W2-t15 启动 resume 的 DB 读取 helper（真实 temp DB）
// 断言：loadSessionMessages 与 DB 行一致（content→text 映射、id 升序）、
// loadSessionTitle / findMostRecentSession 语义、异常输入防御。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEmptyDatabase } from '../../electron/database.js'
import { taskDbAdapter } from '../../electron/llm/taskDbAdapter.js'
import { loadSessionMessages, loadSessionTitle, findMostRecentSession } from '../../tui/sessionLoad.js'

let dbPath = ''
let db = null

function seedSession(title, turns) {
  const sid = Number(taskDbAdapter(db).createSession({ title, parentSessionId: null }).lastInsertRowid)
  for (const [role, content] of turns) {
    taskDbAdapter(db).addMessage({ session_id: sid, role, content })
  }
  return sid
}

beforeAll(() => {
  dbPath = join(tmpdir(), `tui-sessionload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`)
  db = createEmptyDatabase(dbPath)
})

afterAll(() => {
  try { db?.close() } catch {}
  try { rmSync(dbPath, { force: true }) } catch {}
  try { rmSync(`${dbPath}-wal`, { force: true }) } catch {}
  try { rmSync(`${dbPath}-shm`, { force: true }) } catch {}
})

describe('loadSessionMessages（W2-t15）', () => {
  it('seed 2 轮 → 消息与 DB 行一致（content→text, id 升序）', () => {
    const sid = seedSession('qa-session', [
      ['user', '第一问'],
      ['assistant', '第一答'],
      ['user', '第二问'],
      ['assistant', '第二答'],
    ])
    const loaded = loadSessionMessages(db, sid)
    const rows = db.prepare('SELECT id, role, content FROM message WHERE session_id = ? ORDER BY id').all(sid)
    expect(loaded).toHaveLength(rows.length)
    expect(loaded).toEqual(rows.map((r) => ({ id: Number(r.id), role: r.role, text: r.content })))
    expect(loaded[0].text).toBe('第一问')
    expect(loaded[3].text).toBe('第二答')
  })

  it('多会话隔离：只返回目标会话的消息', () => {
    const a = seedSession('A', [['user', 'a-msg']])
    const b = seedSession('B', [['user', 'b-msg']])
    expect(loadSessionMessages(db, a)).toHaveLength(1)
    expect(loadSessionMessages(db, a)[0].text).toBe('a-msg')
    expect(loadSessionMessages(db, b)[0].text).toBe('b-msg')
  })

  it('无消息会话 → []', () => {
    const sid = seedSession('empty', [])
    expect(loadSessionMessages(db, sid)).toEqual([])
  })

  it('防御：null db / null id / 未知 id → []（不抛错）', () => {
    expect(loadSessionMessages(null, 1)).toEqual([])
    expect(loadSessionMessages(db, null)).toEqual([])
    expect(loadSessionMessages(db, undefined)).toEqual([])
    expect(loadSessionMessages(db, 999999)).toEqual([])
  })
})

describe('loadSessionTitle / findMostRecentSession（W2-t15）', () => {
  it('loadSessionTitle 返回标题；未知会话 → null', () => {
    const sid = seedSession('titled', [])
    expect(loadSessionTitle(db, sid)).toBe('titled')
    expect(loadSessionTitle(db, 999999)).toBeNull()
    expect(loadSessionTitle(null, sid)).toBeNull()
  })

  it('findMostRecentSession 返回 id 最大的会话', () => {
    const a = seedSession('old', [])
    const b = seedSession('new', [])
    expect(findMostRecentSession(db)).toEqual({ id: b, title: 'new' })
    expect(b).toBeGreaterThan(a)
  })

  it('findMostRecentSession 空库 → null', () => {
    expect(findMostRecentSession(null)).toBeNull()
  })
})
