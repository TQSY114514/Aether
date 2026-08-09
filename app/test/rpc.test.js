// ─────────────────────────────────────────────────────────────────────────────
// rpc.test.js — JSONL RPC 协议层（todo 10）
// 验收：管道喂 list-models 请求 → 仅 result 行；run 请求 → 多事件行 + result，
// 全部 JSON 可解析。方法宿主标注验证（M3：禁止另起炉灶）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import frames from '../electron/llm/rpc/frames.js'
import { createRpcServer } from '../electron/llm/rpc/server.js'

const tmpDirs = []
function seedDb() {
  const dir = mkdtempSync(join(tmpdir(), 'rpc-'))
  tmpDirs.push(dir)
  const dbPath = join(dir, 'test.db')
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE provider (id INTEGER PRIMARY KEY, name TEXT, api_url TEXT, api_format TEXT, enabled INTEGER DEFAULT 1, api_key TEXT);
    CREATE TABLE model (id INTEGER PRIMARY KEY, model_name TEXT, provider_id INTEGER, is_primary INTEGER DEFAULT 0);
    CREATE TABLE session (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT '新会话', persona_id INTEGER, parent_session_id INTEGER, updated_at DATETIME, is_placeholder INTEGER DEFAULT 0);
    CREATE TABLE message (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, role TEXT, content TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  `)
  db.prepare('INSERT INTO provider (id, name, api_url, api_format, enabled, api_key) VALUES (1, ?, ?, ?, 1, ?)').run('mock', 'http://127.0.0.1:9', 'openai', 'k')
  db.prepare('INSERT INTO model (id, model_name, provider_id, is_primary) VALUES (1, ?, 1, 1)').run('mock-model')
  db.close()
  return dbPath
}
afterAll(() => { for (const d of tmpDirs) { try { rmSync(d, { recursive: true, force: true }) } catch {} } })

function openDb(dbPath) {
  return new Database(dbPath)
}

describe('frames 构建/解析（todo 10）', () => {
  it('pushFrame/consumeLine 往返', () => {
    const frame = frames.requestFrame('c1', 'listModels', {})
    const line = frames.pushFrame(frame)
    expect(line.endsWith('\n')).toBe(true)
    expect(frames.consumeLine(line)).toEqual(frame)
  })

  it('consumeLine 对非 JSON/空行返回 null', () => {
    expect(frames.consumeLine('')).toBeNull()
    expect(frames.consumeLine('not json')).toBeNull()
    expect(frames.consumeLine(null)).toBeNull()
  })

  it('isRequest 校验形态', () => {
    expect(frames.isRequest(frames.requestFrame('c1', 'run', {}))).toBe(true)
    expect(frames.isRequest({ type: 'event', reqId: 'c1' })).toBe(false)
    expect(frames.isRequest({ type: 'request', method: 'run' })).toBe(false) // 缺 reqId
    expect(frames.isRequest(null)).toBe(false)
  })

  it('帧形态符合协议（event/result/error）', () => {
    expect(frames.eventFrame('c1', 'text', { delta: 'hi' })).toEqual({ type: 'event', reqId: 'c1', event: 'text', payload: { delta: 'hi' } })
    expect(frames.resultFrame('c1', { ok: 1 })).toEqual({ type: 'result', reqId: 'c1', ok: true, result: { ok: 1 } })
    expect(frames.errorFrame('c1', 'boom')).toEqual({ type: 'error', reqId: 'c1', message: 'boom' })
  })
})

describe('handleFrame（方法宿主标注）', () => {
  it('listModels → 仅 result 行（无事件行），全部 JSON 可解析', async () => {
    const db = openDb(seedDb())
    const server = createRpcServer({ db })
    const emitted = []
    await server.handleFrame(frames.requestFrame('c1', 'listModels', {}), (f) => emitted.push(f))
    expect(emitted).toHaveLength(1)
    expect(emitted[0].type).toBe('result')
    expect(emitted[0].reqId).toBe('c1')
    expect(emitted[0].ok).toBe(true)
    expect(emitted[0].result.models[0].model_name).toBe('mock-model')
    // 每帧可 JSON 序列化
    for (const f of emitted) expect(() => JSON.stringify(f)).not.toThrow()
    db.close()
  })

  it('run（注入 runAgentImpl）→ 多事件行 + result', async () => {
    const db = openDb(seedDb())
    const server = createRpcServer({
      db,
      deps: {
        runAgentImpl: async ({ prompt, onText, onToolCall, onStatus, onPlanStep }) => {
          onText({ text: 'hello', done: false })
          onToolCall({ name: 'read', args: {}, startedAt: Date.now() })
          onToolCall({ name: 'read', result: 'x', startedAt: Date.now() })
          onStatus({ kind: 'step', text: 'working' })
          onPlanStep({ step: 0 })
          onText({ text: ' world', done: true })
          return { text: 'hello world', toolCalls: [] }
        },
      },
    })
    const emitted = []
    await server.handleFrame(frames.requestFrame('c2', 'run', { prompt: 'hi' }), (f) => emitted.push(f))
    const types = emitted.map((f) => f.type)
    expect(types).toContain('event')
    expect(types).toContain('result')
    const events = emitted.filter((f) => f.type === 'event')
    expect(events.some((f) => f.event === 'text')).toBe(true)
    expect(events.some((f) => f.event === 'tool:start')).toBe(true)
    expect(events.some((f) => f.event === 'tool:end')).toBe(true)
    expect(events.some((f) => f.event === 'status')).toBe(true)
    expect(events.some((f) => f.event === 'plan')).toBe(true)
    const result = emitted[emitted.length - 1]
    expect(result).toMatchObject({ type: 'result', reqId: 'c2', ok: true })
    expect(result.result.text).toBe('hello world')
    db.close()
  })

  it('未知方法 → error 帧', async () => {
    const db = openDb(seedDb())
    const server = createRpcServer({ db })
    const emitted = []
    await server.handleFrame(frames.requestFrame('c3', 'no.such.method', {}), (f) => emitted.push(f))
    expect(emitted[0]).toMatchObject({ type: 'error', reqId: 'c3' })
    expect(emitted[0].message).toContain('unknown method')
    db.close()
  })

  it('run 缺 prompt → error 帧', async () => {
    const db = openDb(seedDb())
    const server = createRpcServer({ db })
    const emitted = []
    await server.handleFrame(frames.requestFrame('c4', 'run', {}), (f) => emitted.push(f))
    expect(emitted[0]).toMatchObject({ type: 'error', reqId: 'c4' })
    expect(emitted[0].message).toContain('requires params.prompt')
    db.close()
  })

  it('session.fork → taskDbAdapter.createSession 宿主（写 parent_session_id）', async () => {
    const db = openDb(seedDb())
    const server = createRpcServer({ db })
    const emitted = []
    await server.handleFrame(frames.requestFrame('c5', 'session.fork', { title: 'child', parentSessionId: 1 }), (f) => emitted.push(f))
    expect(emitted[0].type).toBe('result')
    const id = emitted[0].result.sessionId
    const row = db.prepare('SELECT parent_session_id FROM session WHERE id = ?').get(id)
    expect(row.parent_session_id).toBe(1)
    db.close()
  })

  it('task.status 缺失 → ok:false result', async () => {
    const db = openDb(seedDb())
    const server = createRpcServer({ db })
    const emitted = []
    await server.handleFrame(frames.requestFrame('c6', 'task.status', { taskId: 999 }), (f) => emitted.push(f))
    expect(emitted[0]).toMatchObject({ type: 'result', reqId: 'c6', ok: false })
    db.close()
  })
})

describe('管道 spawn（cli.js --mode rpc 全链路，todo 10/11 边界）', () => {
  it('喂 2 个请求 → 全部输出行 JSON 可解析且含 result', async () => {
    const dbPath = seedDb()
    const input = [
      frames.pushFrame(frames.requestFrame('p1', 'listModels', {})),
      frames.pushFrame(frames.requestFrame('p2', 'listProviders', {})),
    ].join('')
    const out = await new Promise((resolve) => {
      const child = spawn(process.execPath, ['cli.js', '--mode', 'rpc', '--db', dbPath], {
        cwd: join(import.meta.dirname, '..'),
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d) => { stdout += d })
      child.stderr.on('data', (d) => { stderr += d })
      child.on('exit', (code) => resolve({ code, stdout, stderr }))
      child.stdin.write(input)
      child.stdin.end()
    })
    expect(out.code).toBe(0)
    const lines = out.stdout.split('\n').filter((l) => l.trim())
    expect(lines.length).toBeGreaterThanOrEqual(2)
    const parsed = lines.map((l) => JSON.parse(l))
    for (const f of parsed) expect(f.reqId).toBeDefined()
    expect(parsed.some((f) => f.reqId === 'p1' && f.type === 'result')).toBe(true)
    expect(parsed.some((f) => f.reqId === 'p2' && f.type === 'result')).toBe(true)
  }, 30000)
})
