// ─────────────────────────────────────────────────────────────────────────────
// test/cli/resume.test.js — W5-t28 headless CLI resume/fork helpers.
// 验收：loadSessionMessages 映射 {role, content} 且 id 升序、只带 user/assistant；
// findMostRecentSession 取最大 id；resolveResumeTarget 的
// --session > --resume 优先级、缺 id → null、空库 → null、fork 建新行
// 且 parent_session_id 指向源、fork 消息取自源会话。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEmptyDatabase } from '../../electron/database.js'
import { taskDbAdapter } from '../../electron/llm/taskDbAdapter.js'
import { loadSessionMessages, findMostRecentSession, resolveResumeTarget } from '../../electron/cli/resume.js'

let dbPath = ''
let db = null

function seedSession(title, turns, parentId = null) {
  const sid = Number(taskDbAdapter(db).createSession({ title, parentSessionId: parentId }).lastInsertRowid)
  for (const [role, content] of turns) {
    taskDbAdapter(db).addMessage({ session_id: sid, role, content })
  }
  return sid
}

beforeAll(() => {
  dbPath = join(tmpdir(), `cli-resume-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`)
  db = createEmptyDatabase(dbPath)
})

afterAll(() => {
  try { db?.close() } catch {}
  try { rmSync(dbPath, { force: true }) } catch {}
  try { rmSync(`${dbPath}-wal`, { force: true }) } catch {}
  try { rmSync(`${dbPath}-shm`, { force: true }) } catch {}
})

describe('loadSessionMessages（W5-t28）', () => {
  it('映射 {role, content}，id 升序，与 DB 行一致', () => {
    const sid = seedSession('qa', [
      ['user', 'first q'],
      ['assistant', 'first a'],
      ['user', 'second q'],
      ['assistant', 'second a'],
    ])
    expect(loadSessionMessages(db, sid)).toEqual([
      { role: 'user', content: 'first q' },
      { role: 'assistant', content: 'first a' },
      { role: 'user', content: 'second q' },
      { role: 'assistant', content: 'second a' },
    ])
  })

  it('多会话隔离：只返回目标会话消息', () => {
    const a = seedSession('A', [['user', 'a-msg']])
    const b = seedSession('B', [['user', 'b-msg']])
    expect(loadSessionMessages(db, a)).toEqual([{ role: 'user', content: 'a-msg' }])
    expect(loadSessionMessages(db, b)).toEqual([{ role: 'user', content: 'b-msg' }])
  })

  it('空会话 / 无 db → []', () => {
    const sid = seedSession('empty', [])
    expect(loadSessionMessages(db, sid)).toEqual([])
    expect(loadSessionMessages(null, sid)).toEqual([])
    expect(loadSessionMessages(db, null)).toEqual([])
  })
})

describe('findMostRecentSession（W5-t28）', () => {
  it('取最大 id（最新）会话', () => {
    seedSession('old', [['user', 'x']])
    seedSession('new', [['user', 'y']])
    const r = findMostRecentSession(db)
    expect(r).not.toBeNull()
    expect(r.id).toBeGreaterThan(0)
    expect(r.title).toBe('new')
  })

  it('空库 → null', () => {
    expect(findMostRecentSession(null)).toBeNull()
  })
})

describe('resolveResumeTarget（W5-t28）', () => {
  it('--session：命中 → {sessionId, title, messages, forked:false}', () => {
    const sid = seedSession('target', [['user', 'q1'], ['assistant', 'a1']])
    const r = resolveResumeTarget(db, { session: sid })
    expect(r).not.toBeNull()
    expect(r.sessionId).toBe(sid)
    expect(r.title).toBe('target')
    expect(r.forked).toBe(false)
    expect(r.messages).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ])
  })

  it('--session 不存在 → null', () => {
    expect(resolveResumeTarget(db, { session: 99999 })).toBeNull()
  })

  it('--resume：取最近会话', () => {
    const sid = seedSession('most-recent', [['user', 'hi']])
    const r = resolveResumeTarget(db, { resume: true })
    expect(r).not.toBeNull()
    expect(r.sessionId).toBe(sid)
    expect(r.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('空库 --resume → null', () => {
    const fresh = createEmptyDatabase(join(tmpdir(), `cli-resume-empty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`))
    try {
      expect(resolveResumeTarget(fresh, { resume: true })).toBeNull()
    } finally {
      try { fresh.close() } catch {}
    }
  })

  it('--session 优先级高于 --resume', () => {
    const older = seedSession('older', [['user', 'o']])
    seedSession('newer', [['user', 'n']])
    const r = resolveResumeTarget(db, { session: older, resume: true })
    expect(r.sessionId).toBe(older)
    expect(r.messages).toEqual([{ role: 'user', content: 'o' }])
  })

  it('--fork：建新会话行，parent_session_id 指向源，消息取自源', () => {
    const src = seedSession('fork-source', [['user', 'q1'], ['assistant', 'a1']])
    const r = resolveResumeTarget(db, { session: src, fork: true })
    expect(r).not.toBeNull()
    expect(r.forked).toBe(true)
    expect(r.sessionId).not.toBe(src)
    const row = db.prepare('SELECT title, parent_session_id FROM session WHERE id = ?').get(r.sessionId)
    expect(row.parent_session_id).toBe(src)
    expect(row.title).toBe('fork-source')
    // 新会话本身无消息；携带的是源会话消息
    expect(db.prepare('SELECT COUNT(*) AS c FROM message WHERE session_id = ?').get(r.sessionId).c).toBe(0)
    expect(r.messages).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ])
  })

  it('--resume --fork：最近会话为源', () => {
    seedSession('fork-src-2', [['user', 'z']])
    const srcId = findMostRecentSession(db).id // fork 之前捕获源 id
    const r = resolveResumeTarget(db, { resume: true, fork: true })
    expect(r.forked).toBe(true)
    const row = db.prepare('SELECT parent_session_id FROM session WHERE id = ?').get(r.sessionId)
    // parent 指向 fork 前的最近会话（非自身）
    expect(row.parent_session_id).toBe(srcId)
    expect(r.sessionId).not.toBe(srcId)
  })

  it('--fork 无源（无 --session/--resume）→ null', () => {
    expect(resolveResumeTarget(db, { fork: true })).toBeNull()
  })

  it('无 db → null', () => {
    expect(resolveResumeTarget(null, { resume: true })).toBeNull()
  })
})
