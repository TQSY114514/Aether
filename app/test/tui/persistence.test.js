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
import { loadSessionMessages } from '../../tui/sessionLoad.js'

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

// ── 自动标题（首条 prompt 完整保留, 上限 200 字; 空 prompt 回退 'tui'）──
describe('runSession 自动标题', () => {
  it('首条 prompt ≤200 字 → 标题 = prompt 原样(不再 40 字截断)', async () => {
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

  it('首条 prompt 100 字 → 完整保留(寒暄开头不丢主题)', async () => {
    const prompt = '你好，谢谢你的帮助！' + '请问生产部署失败的问题如何排查。'.repeat(5)
    expect(prompt.length).toBeGreaterThan(40)
    const result = await runSession({
      dbPath: null,
      prompt,
      dispatch: () => {},
      resolveImpl: resolveWithDb,
      runAgentImpl: async () => ({ text: 'ok', toolCalls: [] }),
    })
    const row = db.prepare('SELECT title FROM session WHERE id = ?').get(result.dbSessionId)
    expect(row.title).toBe(prompt)
  })

  it('首条 prompt >200 字(粘贴代码/日志) → 标题 = 前 200 字 + …', async () => {
    const longPrompt = 'a'.repeat(250)
    const result = await runSession({
      dbPath: null,
      prompt: longPrompt,
      dispatch: () => {},
      resolveImpl: resolveWithDb,
      runAgentImpl: async () => ({ text: 'ok', toolCalls: [] }),
    })
    const row = db.prepare('SELECT title FROM session WHERE id = ?').get(result.dbSessionId)
    expect(row.title).toBe(`${'a'.repeat(200)}…`)
    expect(row.title).toHaveLength(201)
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

// ── LP1: 注入上下文落库（模型可见 ⟺ 日志可重建）────────────────────────
// runSession 收到 injectedContext（@文件 / !shell 块）→ 每条独立 system 行,
// 顺序 = user 行之后、数组序（与模型实际看到的一致）, assistant 行之前。
describe('runSession 注入上下文落库（LP1）', () => {
  function newSid() {
    return Number(taskDbAdapter(db).createSession({ title: 'tui', parentSessionId: null }).lastInsertRowid)
  }

  it('注入上下文 → user 行后按数组序落 system 行, 再落 assistant 行', async () => {
    const sid = newSid()
    await runSession({
      dbPath: null,
      prompt: '带注入的一轮',
      dispatch: () => {},
      resolveImpl: resolveWithDb,
      dbSessionId: sid,
      runAgentImpl: async () => ({ text: 'reply', toolCalls: [] }),
      injectedContext: [
        { kind: 'file', label: '@a.txt', content: 'file body' },
        { kind: 'shell', label: '!ls', content: 'out' },
      ],
    })
    const rows = db.prepare('SELECT role, content FROM message WHERE session_id = ? ORDER BY id').all(sid)
    expect(rows).toHaveLength(4) // user + 2 injected system + assistant
    expect(rows[0]).toEqual({ role: 'user', content: '带注入的一轮' })
    expect(rows[1]).toEqual({ role: 'system', content: '[injected:file:@a.txt]\nfile body' })
    expect(rows[2]).toEqual({ role: 'system', content: '[injected:shell:!ls]\nout' })
    expect(rows[3]).toEqual({ role: 'assistant', content: 'reply' })
  })

  it('loadSessionMessages 只返回 user/assistant 行（注入行留库不渲染）', async () => {
    const sid = newSid()
    await runSession({
      dbPath: null,
      prompt: '注入轮次',
      dispatch: () => {},
      resolveImpl: resolveWithDb,
      dbSessionId: sid,
      runAgentImpl: async () => ({ text: 'ok', toolCalls: [] }),
      injectedContext: [{ kind: 'file', label: '@x.txt', content: 'x' }],
    })
    const loaded = loadSessionMessages(db, sid)
    expect(loaded.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(loaded).toHaveLength(2)
  })

  it('injectedContext 空数组 → 不落任何注入行（既有行为不变）', async () => {
    const sid = newSid()
    await runSession({
      dbPath: null,
      prompt: '无注入',
      dispatch: () => {},
      resolveImpl: resolveWithDb,
      dbSessionId: sid,
      runAgentImpl: async () => ({ text: 'ok', toolCalls: [] }),
      injectedContext: [],
    })
    const rows = db.prepare('SELECT role FROM message WHERE session_id = ? ORDER BY id').all(sid)
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant'])
  })

  it('非数组 injectedContext → 防御为空数组, 不崩溃', async () => {
    const sid = newSid()
    const result = await runSession({
      dbPath: null,
      prompt: '防御',
      dispatch: () => {},
      resolveImpl: resolveWithDb,
      dbSessionId: sid,
      runAgentImpl: async () => ({ text: 'ok', toolCalls: [] }),
      injectedContext: 'not-an-array',
    })
    expect(result.text).toBe('ok')
    const rows = db.prepare('SELECT role FROM message WHERE session_id = ? ORDER BY id').all(sid)
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant'])
  })

  it('label/content 含换行/怪字符 → 原样存储, 不崩溃', async () => {
    const sid = newSid()
    await runSession({
      dbPath: null,
      prompt: '怪字符',
      dispatch: () => {},
      resolveImpl: resolveWithDb,
      dbSessionId: sid,
      runAgentImpl: async () => ({ text: 'ok', toolCalls: [] }),
      injectedContext: [{ kind: 'steering', label: 'multi\nline', content: 'a\nb\r\nc' }],
    })
    const rows = db.prepare('SELECT content FROM message WHERE session_id = ? AND role = \'system\' ORDER BY id').all(sid)
    expect(rows).toHaveLength(1)
    expect(rows[0].content).toBe('[injected:steering:multi\nline]\na\nb\r\nc')
  })

  it('content 超 8000 字 → 截断为 8000 + \\n… (truncated)', async () => {
    const sid = newSid()
    await runSession({
      dbPath: null,
      prompt: '长内容',
      dispatch: () => {},
      resolveImpl: resolveWithDb,
      dbSessionId: sid,
      runAgentImpl: async () => ({ text: 'ok', toolCalls: [] }),
      injectedContext: [{ kind: 'file', label: '@big.txt', content: 'x'.repeat(9000) }],
    })
    const row = db.prepare('SELECT content FROM message WHERE session_id = ? AND role = \'system\' ORDER BY id').all(sid)[0]
    const prefix = '[injected:file:@big.txt]\n'
    expect(row.content.startsWith(prefix)).toBe(true)
    const body = row.content.slice(prefix.length)
    expect(body.length).toBe(8000 + '\n… (truncated)'.length)
    expect(body.endsWith('\n… (truncated)')).toBe(true)
  })

  it('空/非法条目（null/非对象）→ 跳过, 不崩溃', async () => {
    const sid = newSid()
    await runSession({
      dbPath: null,
      prompt: '坏条目',
      dispatch: () => {},
      resolveImpl: resolveWithDb,
      dbSessionId: sid,
      runAgentImpl: async () => ({ text: 'ok', toolCalls: [] }),
      injectedContext: [null, 'junk', { kind: 'file', label: '@ok.txt', content: 'fine' }],
    })
    const rows = db.prepare('SELECT role, content FROM message WHERE session_id = ? ORDER BY id').all(sid)
    expect(rows).toHaveLength(3)
    expect(rows[1].content).toBe('[injected:file:@ok.txt]\nfine')
  })
})
