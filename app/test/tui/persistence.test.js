// ─────────────────────────────────────────────────────────────────────────────
// persistence.test.js — runSession 会话落库（W0-t3）+ 自动标题（W2-t17）
// 真实 temp DB（createEmptyDatabase 路径）+ stub runAgentImpl：断言
//   - 每轮 turn 建/复用 DB 会话行并落 user + assistant 消息
//   - 新会话标题 = 首条 prompt 前 40 字（超长截断加 …；空 prompt 回退 'tui'）
//   - 同 dbSessionId 二跑不重复建会话行
//   - agent 抛错轮次只落 user 行、不落 assistant 行
//   - 无 db 时（resolveImpl 未给 db）静默跳过持久化（既有测试路径不回归）
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEmptyDatabase } from '../../electron/database.js'
import { taskDbAdapter } from '../../electron/llm/taskDbAdapter.js'
import { runSession } from '../../tui/runSession.js'

let dbPath = ''
let db = null

function resolveWithDb() {
  return {
    provider: { id: 1, name: 'mock', api_url: 'http://127.0.0.1', api_key: 'k', api_format: 'openai' },
    model: { id: 1, model_name: 'mock-model' },
    db,
  }
}

function count(sql, ...params) {
  return Number(db.prepare(sql).get(...params).n)
}

beforeAll(() => {
  dbPath = join(tmpdir(), `tui-persist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`)
  db = createEmptyDatabase(dbPath)
})

afterAll(() => {
  try { db?.close() } catch {}
  try { rmSync(dbPath, { force: true }) } catch {}
  try { rmSync(`${dbPath}-wal`, { force: true }) } catch {}
  try { rmSync(`${dbPath}-shm`, { force: true }) } catch {}
})

describe('runSession 会话落库（W0-t3）', () => {
  it('一轮成功 turn → 会话行(自动标题) + user/assistant 两条消息', async () => {
    const result = await runSession({
      dbPath: null,
      prompt: 'hello persist',
      dispatch: () => {},
      resolveImpl: resolveWithDb,
      runAgentImpl: async () => ({ text: 'persisted reply', toolCalls: [] }),
    })
    expect(result.dbSessionId).toBeTypeOf('number')

    const session = db.prepare('SELECT * FROM session WHERE id = ?').get(result.dbSessionId)
    expect(session).not.toBeNull()
    // W2-t17: 标题 = 首条 prompt（≤40 字原样）
    expect(session.title).toBe('hello persist')

    const messages = db.prepare('SELECT role, content FROM message WHERE session_id = ? ORDER BY id').all(result.dbSessionId)
    expect(messages).toEqual([
      { role: 'user', content: 'hello persist' },
      { role: 'assistant', content: 'persisted reply' },
    ])
    expect(count('SELECT COUNT(*) AS n FROM session')).toBe(1)
  })

  it('同 dbSessionId 二跑 → 不新建会话行，只追加消息', async () => {
    const sid = Number(taskDbAdapter(db).createSession({ title: 'tui', parentSessionId: null }).lastInsertRowid)
    const sessionsBefore = count('SELECT COUNT(*) AS n FROM session')
    const first = await runSession({
      dbPath: null,
      prompt: 'turn one',
      dispatch: () => {},
      resolveImpl: resolveWithDb,
      dbSessionId: sid,
      runAgentImpl: async () => ({ text: 'reply one', toolCalls: [] }),
    })
    const second = await runSession({
      dbPath: null,
      prompt: 'turn two',
      dispatch: () => {},
      resolveImpl: resolveWithDb,
      dbSessionId: sid,
      runAgentImpl: async () => ({ text: 'reply two', toolCalls: [] }),
    })
    expect(first.dbSessionId).toBe(sid)
    expect(second.dbSessionId).toBe(sid)
    expect(count('SELECT COUNT(*) AS n FROM session')).toBe(sessionsBefore) // 二跑均未新建行
    const msgs = db.prepare('SELECT role, content FROM message WHERE session_id = ? ORDER BY id').all(sid)
    expect(msgs).toHaveLength(4)
    expect(msgs[2]).toEqual({ role: 'user', content: 'turn two' })
    expect(msgs[3]).toEqual({ role: 'assistant', content: 'reply two' })
  })

  it('runAgentImpl 抛错 → 落 user 行，不落 assistant 行', async () => {
    const result = await runSession({
      dbPath: null,
      prompt: 'doomed turn',
      dispatch: () => {},
      resolveImpl: resolveWithDb,
      runAgentImpl: async () => { throw new Error('agent exploded') },
    }).catch((e) => e)
    expect(result.message).toMatch(/agent exploded/)

    // W2-t17: 标题 = 抛错轮次的 prompt（会话行已建、user 行已落）
    const session = db.prepare('SELECT id, title FROM session WHERE title = \'doomed turn\' ORDER BY id DESC').get()
    const rows = db.prepare('SELECT role, content FROM message WHERE session_id = ? ORDER BY id').all(session.id)
    expect(rows.length).toBe(1)
    expect(rows[0]).toEqual({ role: 'user', content: 'doomed turn' })
  })

  it('无 db（resolveImpl 未给 db）→ 静默跳过持久化，dbSessionId null', async () => {
    const result = await runSession({
      dbPath: null,
      prompt: 'no db',
      dispatch: () => {},
      resolveImpl: () => ({
        provider: { id: 1, name: 'mock', api_url: 'http://x', api_key: 'k', api_format: 'openai' },
        model: { id: 1, model_name: 'm' },
      }),
      runAgentImpl: async () => ({ text: 'fine', toolCalls: [] }),
    })
    expect(result.text).toBe('fine')
    expect(result.dbSessionId).toBeNull()
  })
})

// ── W2-t17: 自动标题（首条 prompt 前 40 字; 超长截断加 …; 空 prompt 回退 'tui'）──
describe('runSession 自动标题（W2-t17）', () => {
  it('首条 prompt ≤40 字 → 标题 = prompt 原样', async () => {
    const result = await runSession({
      dbPath: null,
      prompt: '修复这个 bug 并写测试',
      dispatch: () => {},
      resolveImpl: resolveWithDb,
      runAgentImpl: async () => ({ text: 'ok', toolCalls: [] }),
    })
    const row = db.prepare('SELECT title FROM session WHERE id = ?').get(result.dbSessionId)
    expect(row.title).toBe('修复这个 bug 并写测试')
  })

  it('首条 prompt >40 字 → 标题 = 前 40 字 + …', async () => {
    const longPrompt = 'a'.repeat(50)
    const result = await runSession({
      dbPath: null,
      prompt: longPrompt,
      dispatch: () => {},
      resolveImpl: resolveWithDb,
      runAgentImpl: async () => ({ text: 'ok', toolCalls: [] }),
    })
    const row = db.prepare('SELECT title FROM session WHERE id = ?').get(result.dbSessionId)
    expect(row.title).toBe(`${'a'.repeat(40)}…`)
    expect(row.title).toHaveLength(41)
  })

  it('空 prompt（仅空白）→ 标题回退占位 tui', async () => {
    const result = await runSession({
      dbPath: null,
      prompt: '   ',
      dispatch: () => {},
      resolveImpl: resolveWithDb,
      runAgentImpl: async () => ({ text: 'ok', toolCalls: [] }),
    })
    const row = db.prepare('SELECT title FROM session WHERE id = ?').get(result.dbSessionId)
    expect(row.title).toBe('tui')
  })

  it('既有 dbSessionId 复用 → 标题不变（不覆盖手动重命名）', async () => {
    const sid = Number(taskDbAdapter(db).createSession({ title: 'manual-name', parentSessionId: null }).lastInsertRowid)
    await runSession({
      dbPath: null,
      prompt: '新的一轮',
      dispatch: () => {},
      resolveImpl: resolveWithDb,
      dbSessionId: sid,
      runAgentImpl: async () => ({ text: 'ok', toolCalls: [] }),
    })
    const row = db.prepare('SELECT title FROM session WHERE id = ?').get(sid)
    expect(row.title).toBe('manual-name')
  })
})
