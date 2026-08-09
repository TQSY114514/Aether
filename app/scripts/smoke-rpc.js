#!/usr/bin/env node
/**
 * RPC smoke test（todo 11，CI 冒烟）：管道喂 `cli.js --mode rpc` 两个请求，
 * 断言退出码 0 且收到 ≥2 个 result 帧（全部输出为 JSONL 帧，无人类文本）。
 *
 * Usage: node scripts/smoke-rpc.js   (或 npm run smoke:rpc)
 */
const Database = require('better-sqlite3')
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-smoke-rpc-'))
  const dbPath = path.join(tmp, 't.db')
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE provider (id INTEGER PRIMARY KEY, name TEXT, api_url TEXT, api_format TEXT, enabled INTEGER DEFAULT 1, api_key TEXT);
    CREATE TABLE model (id INTEGER PRIMARY KEY, model_name TEXT, provider_id INTEGER, is_primary INTEGER DEFAULT 0);
  `)
  db.prepare('INSERT INTO provider (id, name, api_url, api_format, enabled, api_key) VALUES (1, ?, ?, ?, 1, ?)')
    .run('mock', 'http://127.0.0.1:9', 'openai', 'k')
  db.prepare('INSERT INTO model (id, model_name, provider_id, is_primary) VALUES (1, ?, 1, 1)').run('mock-model')
  db.close()

  const cli = path.join(__dirname, '..', 'cli.js')
  const input = [
    `${JSON.stringify({ type: 'request', reqId: 'smoke-1', method: 'listModels', params: {} })}\n`,
    `${JSON.stringify({ type: 'request', reqId: 'smoke-2', method: 'listProviders', params: {} })}\n`,
  ].join('')

  const res = await new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, '--mode', 'rpc', '--db', dbPath], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('exit', (code) => resolve({ code, out, err }))
    child.stdin.write(input)
    child.stdin.end()
  })

  const lines = res.out.split('\n').filter((l) => l.trim())
  const results = lines.filter((l) => {
    try { return JSON.parse(l).type === 'result' } catch { return false }
  })
  fs.rmSync(tmp, { recursive: true, force: true })

  if (res.code !== 0 || results.length < 2) {
    console.error(`smoke-rpc FAIL: code=${res.code} results=${results.length} stderr=${res.err.trim()}\n${res.out.slice(0, 400)}`)
    process.exit(1)
  }
  console.log(`smoke-rpc OK: ${results.length} result frames`)
}

main().catch((e) => { console.error('smoke-rpc FAIL:', e && e.message ? e.message : String(e)); process.exit(1) })
