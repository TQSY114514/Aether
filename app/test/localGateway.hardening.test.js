// ─────────────────────────────────────────────────────────────────────────────
// localGateway.hardening.test.js — M5 (2026-08 安全审计) 网关加固回归
//   1. token 校验 timing-safe（等长错误 token 拒绝、异长 token 不抛错直接拒）
//   2. URL ?token= 查询参数通道已移除（仅 header 鉴权：X-Aether-Token / Bearer）
//   3. CORS：无 Origin（curl/脚本）放行；localhost/127.0.0.1 Origin 放行并回显；
//      其余 Origin（恶意网页 / DNS rebinding）403（含 OPTIONS 预检）
//   4. 请求 body 16MB 上限：超限 413 + 销毁连接，且服务不崩、后续请求正常
//
// 起真实 http server（127.0.0.1 随机端口），electron 用 providerMask.test.js
// 同款 require.cache stub。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'module'
import http from 'http'

const nodeRequire = createRequire(import.meta.url)

const TOKEN = 'gw-hardening-test-token-0001'
let gateway = null
let restoredEntry = null
let port = 0
const agent = new http.Agent({ keepAlive: false })

function request(opts, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, agent, ...opts }, (res) => {
      let data = ''
      res.on('data', (d) => { data += d })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

// >16MB 上传：服务端在 16MB 处回 413 并销毁连接，客户端可能先收到响应再遭遇
// ECONNRESET——以"收到 413"为成功判据，连接错误视为已结束。
function postBigBody(path, headers, totalBytes) {
  return new Promise((resolve) => {
    let status = null
    let settled = false
    const finish = () => { if (!settled) { settled = true; resolve(status) } }
    const req = http.request({
      host: '127.0.0.1', port, agent, method: 'POST', path,
      headers: { ...headers, 'content-length': String(totalBytes) },
    }, (res) => {
      status = res.statusCode
      res.resume()
      res.on('end', finish)
    })
    req.on('error', finish)
    const chunk = Buffer.alloc(1024 * 1024, 0x78)
    let sent = 0
    const writeNext = () => {
      if (settled || sent >= totalBytes) { try { req.end() } catch {} return }
      sent += chunk.length
      if (req.write(chunk)) {
        // 定期让出事件循环，确保 413 响应能被客户端及时处理
        if ((sent / chunk.length) % 4 === 0) setImmediate(writeNext)
        else writeNext()
      } else {
        req.once('drain', writeNext)
      }
    }
    writeNext()
  })
}

beforeAll(async () => {
  const electronPath = nodeRequire.resolve('electron')
  restoredEntry = nodeRequire.cache[electronPath]
  nodeRequire.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: { ipcMain: { listeners: () => [] } },
  }

  gateway = await import('../electron/llm/localGateway')
  const fakeDb = {
    getSetting: (k) => (k === 'gateway_token' ? TOKEN : null),
    setSetting: () => {},
  }
  gateway.start(fakeDb, 0)
  // 等待 listen 完成（start 不返回 promise；随机端口 ≠ 默认端口即已就绪）
  for (let i = 0; i < 100 && gateway.getPort() === gateway.DEFAULT_PORT; i++) {
    await new Promise(r => setTimeout(r, 20))
  }
  port = gateway.getPort()
  expect(port).toBeGreaterThan(0)
  expect(port).not.toBe(gateway.DEFAULT_PORT)
})

afterAll(async () => {
  gateway?.stop()
  if (restoredEntry === undefined) {
    delete nodeRequire.cache[nodeRequire.resolve('electron')]
  }
  agent.destroy()
})

describe('M5 token 校验（timing-safe + 仅 header 通道）', () => {
  it('X-Aether-Token 正确 token → 200', async () => {
    const r = await request(
      { method: 'GET', path: '/health', headers: { 'x-aether-token': TOKEN } },
    )
    expect(r.status).toBe(200)
    expect(r.body).toContain('"ok"')
  })

  it('Authorization: Bearer 正确 token → 200', async () => {
    const r = await request(
      { method: 'GET', path: '/health', headers: { authorization: `Bearer ${TOKEN}` } },
    )
    expect(r.status).toBe(200)
  })

  it('等长错误 token → 401（timingSafeEqual 正确比较）', async () => {
    const bad = 'x' + TOKEN.slice(1) // 同长度、首字符不同
    expect(bad.length).toBe(TOKEN.length)
    const r = await request(
      { method: 'GET', path: '/health', headers: { 'x-aether-token': bad } },
    )
    expect(r.status).toBe(401)
  })

  it('异长错误 token → 401（长度先比较，不抛错）', async () => {
    const r = await request(
      { method: 'GET', path: '/health', headers: { 'x-aether-token': 'short' } },
    )
    expect(r.status).toBe(401)
    const r2 = await request(
      { method: 'GET', path: '/health', headers: { 'x-aether-token': TOKEN + 'extra' } },
    )
    expect(r2.status).toBe(401)
  })

  it('缺失 token → 401', async () => {
    const r = await request({ method: 'GET', path: '/health' })
    expect(r.status).toBe(401)
  })

  it('URL ?token= 通道已移除：查询参数携带正确 token 仍 401', async () => {
    const r = await request(
      { method: 'GET', path: `/health?token=${encodeURIComponent(TOKEN)}` },
    )
    expect(r.status).toBe(401)
  })
})

describe('M5 CORS 收紧', () => {
  it('无 Origin（curl / 脚本）→ 放行', async () => {
    const r = await request(
      { method: 'GET', path: '/health', headers: { 'x-aether-token': TOKEN } },
    )
    expect(r.status).toBe(200)
  })

  it('Origin: http://localhost:3000 → 放行并回显 Origin', async () => {
    const r = await request({
      method: 'GET', path: '/health',
      headers: { 'x-aether-token': TOKEN, origin: 'http://localhost:3000' },
    })
    expect(r.status).toBe(200)
    expect(r.headers['access-control-allow-origin']).toBe('http://localhost:3000')
  })

  it('Origin: http://127.0.0.1:5173 → 放行', async () => {
    const r = await request({
      method: 'GET', path: '/health',
      headers: { 'x-aether-token': TOKEN, origin: 'http://127.0.0.1:5173' },
    })
    expect(r.status).toBe(200)
  })

  it('外部 Origin（恶意网页）→ 403，即使携带正确 token', async () => {
    const r = await request({
      method: 'GET', path: '/health',
      headers: { 'x-aether-token': TOKEN, origin: 'https://evil.example' },
    })
    expect(r.status).toBe(403)
  })

  it('伪 localhost 前缀 Origin（localhost.evil.com）→ 403', async () => {
    const r = await request({
      method: 'GET', path: '/health',
      headers: { 'x-aether-token': TOKEN, origin: 'https://localhost.evil.com' },
    })
    expect(r.status).toBe(403)
  })

  it('OPTIONS 预检：localhost Origin → 204；外部 Origin → 403', async () => {
    const ok = await request({
      method: 'OPTIONS', path: '/health',
      headers: { origin: 'http://localhost:8080', 'access-control-request-method': 'POST' },
    })
    expect(ok.status).toBe(204)
    const bad = await request({
      method: 'OPTIONS', path: '/health',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    })
    expect(bad.status).toBe(403)
  })
})

describe('M5 body 16MB 上限', () => {
  it('小 body POST 正常走代理路径（未超限不误伤）', async () => {
    const r = await request(
      { method: 'POST', path: '/gateway:info', headers: { 'x-aether-token': TOKEN, 'content-type': 'application/json' } },
      JSON.stringify({ hello: 'world' }),
    )
    // 通道未注册 → 404（证明 body 读取与分发正常执行，而非被上限拦截）
    expect(r.status).toBe(404)
  })

  it('超过 16MB → 413 且销毁连接', async () => {
    const status = await postBigBody(
      '/v1/chat/completions',
      { 'x-aether-token': TOKEN, 'content-type': 'application/json' },
      17 * 1024 * 1024,
    )
    expect(status).toBe(413)
  }, 30000)

  it('超限后服务仍存活（未因连接销毁崩溃）', async () => {
    const r = await request(
      { method: 'GET', path: '/health', headers: { 'x-aether-token': TOKEN } },
    )
    expect(r.status).toBe(200)
  })
})
