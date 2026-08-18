// ─────────────────────────────────────────────────────────────────────────────
// interop.test.js — MCP + hooks 贯通（todo 14）
// 验收：spawn 本地 MCP echo server（fixture）→ 断言 CLI 调其工具成功；
// hooks fixture 写日志文件 → 断言 SessionStart 日志。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectMcpServers, disconnectMcpServers, getMcpTool } from '../electron/llm/headlessMcp.js'

const __dirname = join(fileURLToPath(import.meta.url), '..')
const APP_DIR = join(__dirname, '..')
const CLI_PATH = join(APP_DIR, 'cli.js')
const FIXTURE = join(__dirname, 'fixtures', 'mcp-echo-server.cjs')

const tmpDirs = []
afterAll(() => {
  for (const d of tmpDirs) { try { rmSync(d, { recursive: true, force: true }) } catch {} }
})

function makeTmp(prefix = 'interop-') {
  const d = mkdtempSync(join(tmpdir(), prefix))
  tmpDirs.push(d)
  return d
}

function seedDb({ withMcp = true } = {}) {
  const dir = makeTmp()
  const dbPath = join(dir, 'test.db')
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE provider (id INTEGER PRIMARY KEY, name TEXT, api_url TEXT, api_format TEXT, enabled INTEGER DEFAULT 1, api_key TEXT);
    CREATE TABLE model (id INTEGER PRIMARY KEY, model_name TEXT, provider_id INTEGER, is_primary INTEGER DEFAULT 0);
    CREATE TABLE mcp_server (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, command TEXT NOT NULL, args TEXT, env TEXT, enabled INTEGER DEFAULT 1);
  `)
  if (withMcp) {
    db.prepare('INSERT INTO mcp_server (name, command, args, env, enabled) VALUES (?, ?, ?, ?, 1)')
      .run('echo', process.execPath, JSON.stringify([FIXTURE]), '{}')
  }
  db.close()
  return dbPath
}

// 2 轮 mock LLM：第 1 轮返回 tool_call(echo__get_echo)，第 2 轮返回最终文本。
function startToolLoopMock() {
  let calls = 0
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      calls++
      const first = calls === 1
      res.writeHead(200, { 'Content-Type': 'application/json' })
      if (first) {
        res.end(JSON.stringify({
          id: 'x', object: 'chat.completion', created: 0, model: 'mock',
          choices: [{
            index: 0,
            message: {
              role: 'assistant', content: '',
              tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'echo__get_echo', arguments: JSON.stringify({ text: 'hi' }) } }],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }))
      } else {
        res.end(JSON.stringify({
          id: 'y', object: 'chat.completion', created: 0, model: 'mock',
          choices: [{ index: 0, message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }))
      }
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }))
  })
}

function spawnCli(args, { cwd, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: cwd || APP_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1', ...(env || {}) },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('exit', (code) => resolve({ code, stdout, stderr }))
    child.stdin.end()
  })
}

describe('MCP 贯通（todo 14）', () => {
  it('桥单元：connectMcpServers 注入 echo__get_echo，run() 可调用回显', async () => {
    const dbPath = seedDb()
    const db = new Database(dbPath)
    const connected = await connectMcpServers({ db })
    expect(connected.length).toBe(1)
    expect(connected[0]).toMatchObject({ name: 'echo', tools: 1 })
    // 经桥自报面验证工具注入（toolLoop 经 manager.getMergedTool 无差别可见）
    const tool = getMcpTool('echo__get_echo')
    expect(tool).toBeTruthy()
    expect(tool.description).toContain('[MCP:echo]')
    // P2-M1：MCP 工具 risk 一律 dangerous（不再按名字正则猜 safe，防
    // get_browser_cookies 式恶意命名骗过权限门）
    expect(tool.risk).toBe('dangerous')
    const result = await tool.run({ text: 'hi' })
    expect(result).toBe('echo:hi')
    await disconnectMcpServers()
    db.close()
  })

  it('桥单元：无 mcp_server 表/无服务器配置 → 空连接不抛错', async () => {
    const dir = makeTmp()
    const dbPath = join(dir, 't.db')
    const db = new Database(dbPath)
    db.exec('CREATE TABLE provider (id INTEGER PRIMARY KEY)')
    const connected = await connectMcpServers({ db })
    expect(connected).toEqual([])
    db.close()
  })

  it('CLI 端到端：mock LLM 调 echo__get_echo → tool:end 含回显结果', async () => {
    const dbPath = seedDb()
    const db = new Database(dbPath)
    db.prepare('INSERT INTO provider (id, name, api_url, api_format, enabled, api_key) VALUES (1, ?, ?, ?, 1, ?)')
      .run('mock', 'http://127.0.0.1:9', 'openai', 'k')
    db.prepare('INSERT INTO model (id, model_name, provider_id, is_primary) VALUES (1, ?, 1, 1)').run('mock-model')
    db.close()
    const { server, url } = await startToolLoopMock()
    try {
      // MCP 工具名不在权限策略的静态 toolRequirements 白名单 → 默认 DangerFullAccess；
      // headless 无 prompter 即拒绝（与 toolLoop 无回调默认拒绝一致）。用 --mode yolo
      // （PermissionMode.Allow）让工具真正执行——TUI 场景则走权限面板回调。
      const r = await spawnCli(['--json-lines', '-p', 'use echo', '--mode', 'yolo', '--db', dbPath, '--model', 'mock-model', '--api-url', url, '--api-key', 'k'])
      expect(r.code).toBe(0)
      const frames = r.stdout.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
      const toolEnd = frames.find((f) => f.type === 'tool:end' && f.entry && f.entry.name === 'echo__get_echo')
      expect(toolEnd).toBeTruthy()
      expect(toolEnd.entry.result).toBe('echo:hi')
      expect(frames.some((f) => f.type === 'done')).toBe(true)
    } finally {
      server.close()
    }
  }, 30000)
})

describe('hooks 生命周期（todo 14）', () => {
  it('SessionStart hook fixture 写日志', async () => {
    const dbPath = seedDb()
    const db = new Database(dbPath)
    db.prepare('INSERT INTO provider (id, name, api_url, api_format, enabled, api_key) VALUES (1, ?, ?, ?, 1, ?)')
      .run('mock', 'http://127.0.0.1:9', 'openai', 'k')
    db.prepare('INSERT INTO model (id, model_name, provider_id, is_primary) VALUES (1, ?, 1, 1)').run('mock-model')
    db.close()

    const ws = makeTmp('hooks-ws-')
    const hooksDir = join(ws, '.aetherai', 'hooks')
    mkdirSync(hooksDir, { recursive: true })
    const logPath = join(ws, 'hook.log')
    writeFileSync(join(hooksDir, 'SessionStart.js'), `
const fs = require('fs')
module.exports = async (ctx) => {
  fs.appendFileSync(process.env.HOOK_LOG_PATH, 'SessionStart ' + ctx.sessionId + ' ' + ctx.timestamp + '\\n')
}
`)
    const { server, url } = await startToolLoopMock()
    try {
      const r = await spawnCli(['-p', 'hi', '--db', dbPath, '--model', 'mock-model', '--api-url', url, '--api-key', 'k'],
        { cwd: ws, env: { HOOK_LOG_PATH: logPath } })
      expect(r.code).toBe(0)
      expect(existsSync(logPath)).toBe(true)
      const log = readFileSync(logPath, 'utf8')
      expect(log).toContain('SessionStart')
    } finally {
      server.close()
    }
  }, 30000)
})
