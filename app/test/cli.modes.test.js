// ─────────────────────────────────────────────────────────────────────────────
// cli.modes.test.js — CLI 四模式路由验收（todo 9）
// spawn 真实 `node cli.js` 子进程验证：-p 单发 / 管道 stdin 回退 / --stdin 显式 /
// --mode json NDJSON / --help 四模式 / --mode rpc 接线占位。
// LLM 由本地 mock HTTP 服务器模拟（OpenAI 兼容非流式 JSON——toolLoop 走
// completeChatMessage 路径）。注意：Windows 下 spawnSync+fetch(活服务器) 会挂死，
// 故一律用异步 spawn。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'child_process'
import { createServer } from 'http'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const APP_DIR = join(__dirname, '..')
const CLI = join(APP_DIR, 'cli.js')

// ─── mock OpenAI server（非流式 JSON，同 toolLoop completeChatMessage 路径）───
let server
let baseUrl
let lastPrompt = null // 最近一次请求的 user 消息（验证 -p 优先级）

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        const userMsg = (body.messages || []).filter((m) => m.role === 'user').pop()
        lastPrompt = userMsg ? userMsg.content : null
      } catch { lastPrompt = null }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        id: 'chatcmpl-1', object: 'chat.completion', created: 0, model: 'mock',
        choices: [{ index: 0, message: { role: 'assistant', content: 'mock reply' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

// ─── temp DB 种子（provider + model）───────────────────────────────────────
let tmpDir
let dbPath

function seedDb() {
  tmpDir = mkdtempSync(join(tmpdir(), 'aether-cli-modes-'))
  dbPath = join(tmpDir, 'test.db')
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE provider (id INTEGER PRIMARY KEY, name TEXT, api_url TEXT, api_format TEXT, enabled INTEGER DEFAULT 1, api_key TEXT);
    CREATE TABLE model (id INTEGER PRIMARY KEY, model_name TEXT, provider_id INTEGER, is_primary INTEGER DEFAULT 0);
  `)
  db.prepare('INSERT INTO provider (id, name, api_url, api_format, enabled, api_key) VALUES (1, ?, ?, ?, 1, ?)')
    .run('mock', baseUrl, 'openai', 'test-key')
  db.prepare('INSERT INTO model (id, model_name, provider_id, is_primary) VALUES (1, ?, 1, 1)')
    .run('mock-model')
  db.close()
}

function runCli(args, input) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: APP_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ status: null, stdout, stderr, timedOut: true }) }, 30000)
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({ status: code, signal, stdout, stderr, timedOut: false })
    })
    if (input !== undefined) child.stdin.write(input)
    child.stdin.end()
  })
}

function agentArgs() {
  return ['--db', dbPath, '--model', 'mock-model', '--api-key', 'test-key']
}

describe('cli four-mode routing', () => {
  beforeAll(() => seedDb())
  afterAll(() => { if (tmpDir) rmSync(tmpDir, { recursive: true, force: true }) })

  it('--version prints aether <semver> and exits 0 (W5-t27)', { timeout: 30000 }, async () => {
    const r = await runCli(['--version'])
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toMatch(/^aether \d+\.\d+\.\d+$/)
  })

  it('completion bash prints a script with flags + tui + completion + --mode values (W5-t29)', { timeout: 30000 }, async () => {
    const r = await runCli(['completion', 'bash'])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('complete -F _aether aether')
    expect(r.stdout).toContain('--model')
    expect(r.stdout).toContain('--resume')
    expect(r.stdout).toContain('--fork')
    // tui 与 completion 是独立 token（回归：曾因数组插值打成 "tui,completion"）
    expect(r.stdout).toMatch(/\stui completion\b/)
    expect(r.stdout).toMatch(/auto plan ask yolo json rpc/)
  })

  it('completion bogus exits 1 with a clear error (W5-t29)', { timeout: 30000 }, async () => {
    const r = await runCli(['completion', 'bogus'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('unknown shell: bogus')
  })

  it('--help lists the four modes (tui / json / rpc / -p / stdin)', { timeout: 30000 }, async () => {
    const r = await runCli(['--help'])
    expect(r.status).toBe(0)
    const out = r.stdout + r.stderr
    expect(out).toContain('aether tui')
    expect(out).toContain('--mode json')
    expect(out).toContain('--mode rpc')
    expect(out).toContain('-p <prompt>')
    expect(out).toContain('--stdin')
  })

  it('--mode json emits NDJSON even on the error path (no prompt)', { timeout: 30000 }, async () => {
    const r = await runCli(['--mode', 'json'])
    expect(r.status).toBe(1)
    const firstLine = r.stdout.split('\n').find((l) => l.trim())
    expect(firstLine).toMatch(/^\{/)
    expect(JSON.parse(firstLine)).toMatchObject({ type: 'error' })
  })

  it('-p explicit prompt runs the agent and exits 0 (mock server)', { timeout: 30000 }, async () => {
    const r = await runCli(['-p', 'read', ...agentArgs()])
    expect(r.timedOut).toBe(false)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('mock reply')
  })

  it('-p wins over piped stdin', { timeout: 30000 }, async () => {
    await runCli(['-p', 'READ_ME', ...agentArgs()], 'IGNORED_STDIN')
    expect(lastPrompt).toBe('READ_ME')
  })

  it('piped stdin becomes the prompt when no prompt is given', { timeout: 30000 }, async () => {
    const r = await runCli([...agentArgs()], 'summarize from stdin')
    expect(r.timedOut).toBe(false)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('mock reply')
    expect(lastPrompt).toContain('summarize from stdin')
  })

  it('--stdin reads stdin explicitly even with no positional prompt', { timeout: 30000 }, async () => {
    const r = await runCli(['--stdin', ...agentArgs()], 'explicit stdin prompt')
    expect(r.timedOut).toBe(false)
    expect(r.status).toBe(0)
    expect(lastPrompt).toContain('explicit stdin prompt')
  })

  it('--mode rpc routes to the RPC server (todo 10/11): empty stdin → clean exit 0', { timeout: 30000 }, async () => {
    // todo 10 落地后 --mode rpc 进入活服务器：空 stdin 即 EOF → 干净退出 0，不挂起不崩溃。
    const r = await runCli(['--mode', 'rpc', ...agentArgs()], '')
    expect(r.timedOut).toBe(false)
    expect(r.status).toBe(0)
  })

  it('--mode rpc: 2 个请求 → 2 个 result 帧，全部 JSON 可解析（无人类文本）', { timeout: 30000 }, async () => {
    const input = [
      JSON.stringify({ type: 'request', reqId: 'm1', method: 'listModels', params: {} }),
      JSON.stringify({ type: 'request', reqId: 'm2', method: 'listProviders', params: {} }),
    ].join('\n') + '\n'
    const r = await runCli(['--mode', 'rpc', ...agentArgs()], input)
    expect(r.timedOut).toBe(false)
    expect(r.status).toBe(0)
    const lines = r.stdout.split('\n').filter((l) => l.trim())
    expect(lines.length).toBeGreaterThanOrEqual(2)
    const parsed = lines.map((l) => JSON.parse(l))
    for (const f of parsed) {
      expect(['request', 'event', 'result', 'error']).toContain(f.type)
      expect(f.reqId).toBeDefined()
    }
    const results = parsed.filter((f) => f.type === 'result')
    expect(results).toHaveLength(2)
    expect(results.some((f) => f.reqId === 'm1' && f.ok)).toBe(true)
    expect(results.some((f) => f.reqId === 'm2' && f.ok)).toBe(true)
  })
})


