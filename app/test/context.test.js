// ─────────────────────────────────────────────────────────────────────────────
// context.test.js — persona + 记忆注入（todo 13）
// 验收：mock db 有 persona+记忆 → runAgent 收到 messages 首条含 persona prompt
// 且 secondary 含记忆碎片；未指定 persona 时与现值等价（无回归）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSessionContext } from '../electron/llm/sessionContext.js'

const tmpDirs = []
function seedDb({ withPersona = true, withMemory = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ctx-'))
  tmpDirs.push(dir)
  const dbPath = join(dir, 'test.db')
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE provider (id INTEGER PRIMARY KEY, name TEXT, api_url TEXT, api_format TEXT, enabled INTEGER DEFAULT 1, api_key TEXT);
    CREATE TABLE model (id INTEGER PRIMARY KEY, model_name TEXT, provider_id INTEGER, is_primary INTEGER DEFAULT 0);
    CREATE TABLE persona (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, prompt TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE memory (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, type TEXT DEFAULT 'fact', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  `)
  db.prepare('INSERT INTO provider (id, name, api_url, api_format, enabled, api_key) VALUES (1, ?, ?, ?, 1, ?)').run('mock', 'http://127.0.0.1:9', 'openai', 'k')
  db.prepare('INSERT INTO model (id, model_name, provider_id, is_primary) VALUES (1, ?, 1, 1)').run('mock-model')
  if (withPersona) db.prepare('INSERT INTO persona (name, prompt) VALUES (?, ?)').run('CodeReviewer', 'You are a meticulous code reviewer. Always check tests.')
  if (withMemory) db.prepare('INSERT INTO memory (content, type) VALUES (?, ?)').run('用户偏好用 vitest 写测试', 'preference')
  db.close()
  return dbPath
}
afterAll(() => { for (const d of tmpDirs) { try { rmSync(d, { recursive: true, force: true }) } catch {} } })

describe('buildSessionContext（todo 13）', () => {
  it('personaId + db → prefix 首条含 persona prompt，次条含记忆碎片', () => {
    const dbPath = seedDb()
    const db = new Database(dbPath)
    const { prefix, memoryCount } = buildSessionContext({ db, sessionId: 1, personaId: 1, userMessage: '帮我看看 vitest 测试' })
    expect(prefix.length).toBeGreaterThanOrEqual(2)
    expect(prefix[0].role).toBe('system')
    expect(prefix[0].content).toContain('CodeReviewer')
    expect(prefix[0].content).toContain('meticulous code reviewer')
    expect(prefix[1].content).toContain('vitest')
    expect(memoryCount).toBeGreaterThan(0)
    db.close()
  })

  it('未指定 personaId → prefix 为空（与现值等价，无回归）', () => {
    const dbPath = seedDb()
    const db = new Database(dbPath)
    const { prefix, memoryCount } = buildSessionContext({ db, sessionId: 1, userMessage: 'hi' })
    expect(prefix).toEqual([])
    expect(memoryCount).toBe(0)
    db.close()
  })

  it('db 缺失 → prefix 空、不抛错', () => {
    const { prefix, memoryCount } = buildSessionContext({ db: null, personaId: 1, userMessage: 'x' })
    expect(prefix).toEqual([])
    expect(memoryCount).toBe(0)
  })

  it('persona 行缺失 → 跳过 persona 块（不抛错）', () => {
    const dbPath = seedDb({ withPersona: false })
    const db = new Database(dbPath)
    const { prefix } = buildSessionContext({ db, personaId: 999, userMessage: 'hi' })
    expect(prefix.every((m) => m.content.startsWith('Relevant memories') || !m.content.startsWith('[Persona'))).toBe(true)
    expect(prefix.filter((m) => m.content.includes('[Persona')).length).toBe(0)
    db.close()
  })

  it('裸连接（无 getMemories）经兜底包装仍可注入记忆', () => {
    const dbPath = seedDb({ withPersona: false })
    const db = new Database(dbPath) // 裸 better-sqlite3，无 getMemories 方法
    expect(typeof db.getMemories).not.toBe('function')
    const { prefix, memoryCount } = buildSessionContext({ db, userMessage: 'vitest' })
    expect(memoryCount).toBeGreaterThan(0)
    expect(prefix.some((m) => m.content.includes('vitest'))).toBe(true)
    db.close()
  })
})

describe('CLI --persona 端到端注入（runAgent 收到 messages 首条 persona + 次条记忆）', () => {
  it('mock server 收到的请求体含 persona 首条 + 记忆次条', async () => {
    const dbPath = seedDb()
    // 本地 mock LLM：捕获请求体的 messages
    let captured = null
    const server = createServer((req, res) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        try { captured = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          id: 'x', object: 'chat.completion', created: 0, model: 'mock',
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }))
      })
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${server.address().port}`

    const out = await new Promise((resolve) => {
      const child = spawn(process.execPath, [
        'cli.js', '-p', 'review the vitest tests', '--db', dbPath,
        '--model', 'mock-model', '--api-url', base, '--api-key', 'k', '--persona', '1',
      ], { cwd: join(import.meta.dirname, '..'), stdio: ['pipe', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d) => { stdout += d })
      child.stderr.on('data', (d) => { stderr += d })
      child.on('exit', (code) => resolve({ code, stdout, stderr }))
      child.stdin.end()
    })
    server.close()
    expect(out.code).toBe(0)
    expect(captured).not.toBeNull()
    const sysMsgs = (captured.messages || []).filter((m) => m.role === 'system')
    // 首条 persona（runAgent 把 prefix unshift 到最前）
    expect(sysMsgs[0].content).toContain('[Persona: CodeReviewer]')
    // 存在记忆碎片（vitest 相关）
    expect(sysMsgs.some((m) => m.content.includes('vitest') && m.content.includes('Relevant memories'))).toBe(true)
  }, 30000)
})
