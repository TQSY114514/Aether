// ─────────────────────────────────────────────────────────────────────────────
// memory-loop.test.js — 记忆闭环（todo 20）
// 验收：mock 记忆命中 → --memory-trace 输出注入条目；技能提案 JSON 产出。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSessionCommand } from '../tui/sessionCommands.js'
import { tuiReducer, initialTuiState } from '../tui/reducer.js'

const __dirname = join(fileURLToPath(import.meta.url), '..')
const CLI = join(__dirname, '..', 'cli.js')

const tmpDirs = []
function makeTmp(prefix = 'memloop-') {
  const d = mkdtempSync(join(tmpdir(), prefix))
  tmpDirs.push(d)
  return d
}
afterAll(() => { for (const d of tmpDirs) { try { rmSync(d, { recursive: true, force: true }) } catch {} } })

function seedDb({ withMemory = true, withHabits = false } = {}) {
  const dir = makeTmp()
  const dbPath = join(dir, 'test.db')
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE provider (id INTEGER PRIMARY KEY, name TEXT, api_url TEXT, api_format TEXT, enabled INTEGER DEFAULT 1, api_key TEXT);
    CREATE TABLE model (id INTEGER PRIMARY KEY, model_name TEXT, provider_id INTEGER, is_primary INTEGER DEFAULT 0);
    CREATE TABLE memory (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, type TEXT DEFAULT 'fact', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE user_habit (key TEXT PRIMARY KEY, imperative TEXT, reason TEXT, occurrences INTEGER DEFAULT 1, proposed INTEGER DEFAULT 0, last_seen DATETIME);
  `)
  db.prepare('INSERT INTO provider (id, name, api_url, api_format, enabled, api_key) VALUES (1, ?, ?, ?, 1, ?)').run('mock', 'http://127.0.0.1:9', 'openai', 'k')
  db.prepare('INSERT INTO model (id, model_name, provider_id, is_primary) VALUES (1, ?, 1, 1)').run('mock-model')
  if (withMemory) db.prepare('INSERT INTO memory (content, type) VALUES (?, ?)').run('用户偏好用 vitest 写测试', 'preference')
  if (withHabits) {
    db.prepare('INSERT INTO user_habit (key, imperative, reason, occurrences, proposed) VALUES (?, ?, ?, ?, ?)')
      .run('always_use_vitest', 'Always use vitest for new tests', 'user preference repeated', 2, 1)
  }
  db.close()
  return dbPath
}

function startMockLlm() {
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        id: 'x', object: 'chat.completion', created: 0, model: 'mock',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }))
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }))
  })
}

function spawnCli(args, { cwd } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: cwd || join(__dirname, '..'), stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('exit', (code) => resolve({ code, stdout, stderr }))
    child.stdin.end()
  })
}

describe('--memory-trace（todo 20）', () => {
  it('mock 记忆命中 → json-lines 输出 memory-trace 帧 count>0', async () => {
    const dbPath = seedDb()
    const { server, url } = await startMockLlm()
    try {
      const r = await spawnCli(['--json-lines', '--memory-trace', '-p', 'help me with vitest tests', '--db', dbPath, '--model', 'mock-model', '--api-url', url, '--api-key', 'k'])
      expect(r.code).toBe(0)
      const frames = r.stdout.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
      const trace = frames.find((f) => f.type === 'memory-trace')
      expect(trace).toBeTruthy()
      expect(trace.count).toBeGreaterThan(0)
    } finally {
      server.close()
    }
  }, 30000)

  it('无记忆命中 → memory-trace count=0（不报错）', async () => {
    const dbPath = seedDb({ withMemory: false })
    const { server, url } = await startMockLlm()
    try {
      const r = await spawnCli(['--json-lines', '--memory-trace', '-p', 'hello world', '--db', dbPath, '--model', 'mock-model', '--api-url', url, '--api-key', 'k'])
      expect(r.code).toBe(0)
      const frames = r.stdout.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
      const trace = frames.find((f) => f.type === 'memory-trace')
      expect(trace.count).toBe(0)
    } finally {
      server.close()
    }
  }, 30000)
})

describe('技能提案 JSON（todo 20）', () => {
  it('--skills → 输出 habit 提案 JSON（key/imperative/occurrences）', async () => {
    const dbPath = seedDb({ withHabits: true })
    const r = await spawnCli(['--skills', '--db', dbPath])
    expect(r.code).toBe(0)
    const parsed = JSON.parse(r.stdout)
    expect(parsed.skills.length).toBeGreaterThan(0)
    const s = parsed.skills[0]
    expect(s.key).toBe('always_use_vitest')
    expect(s.imperative).toContain('vitest')
    expect(s.occurrences).toBe(2)
  }, 30000)
})

describe('TUI /skills 与 /skill accept（todo 20）', () => {
  it('命令解析', () => {
    expect(parseSessionCommand('/skills')).toEqual({ type: 'skills' })
    expect(parseSessionCommand('/skill accept always_use_vitest')).toEqual({ type: 'skill-accept', key: 'always_use_vitest' })
    expect(parseSessionCommand('/skill dismiss some_habit')).toEqual({ type: 'skill-dismiss', key: 'some_habit' })
    expect(parseSessionCommand('/skill accept')).toBeNull()
    expect(parseSessionCommand('/skill')).toBeNull()
  })

  it('reducer SKILLS_SET 维护技能提案列表', () => {
    let s = tuiReducer(initialTuiState, { type: 'SKILLS_SET', skills: [{ key: 'k1', imperative: 'i1', occurrences: 2 }] })
    expect(s.skills).toHaveLength(1)
    expect(s.skills[0].key).toBe('k1')
    s = tuiReducer(s, { type: 'SKILLS_SET', skills: null })
    expect(s.skills).toEqual([])
  })
})
