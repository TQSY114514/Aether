// ───────────────────────────────────────────────────────────────────────────
// Local Gateway — lightweight HTTP server exposing Aether's API for
// external tools (browser extensions, web apps, scripts).
//
// Listens on 127.0.0.1:<port> (default 35791) and proxies calls to the
// Electron main process via ipcMain. Includes a simple auth token check
// so only the local user (or their browser) can reach it.
// ───────────────────────────────────────────────────────────────────────────

const http = require('http')
const { ipcMain } = require('electron')
const crypto = require('crypto')

const DEFAULT_PORT = 35791
const TOKEN_HEADER = 'X-Aether-Token'
// M5 (2026-08 audit): browsers may only call the gateway from loopback pages;
// missing Origin = non-browser client (curl / scripts / SDK) → allowed.
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
// M5: request body cap — stop buffering and drop the connection past this.
const MAX_BODY_BYTES = 16 * 1024 * 1024

let _server = null
let _token = null
let _db = null
// Explicitly registered proxy handlers. ipcMain.handle() channels are NOT
// visible to ipcMain.listeners(), so channels proxied via the gateway must be
// registered here by the module that owns them (see main.js setupIpcHandlers).
const _handlers = new Map()

// Register a handler for a gateway-exposed channel. `handler` has the same
// shape as an ipcMain.handle listener: (event, ...args) => value | Promise.
function registerHandler(channel, handler) {
  _handlers.set(channel, handler)
}

function unregisterHandler(channel) {
  _handlers.delete(channel)
}

// Generate a random token and store it in settings.
function _ensureToken(db) {
  if (_token) return _token
  let t = db.getSetting('gateway_token')
  if (!t) {
    t = crypto.randomBytes(16).toString('hex')
    db.setSetting('gateway_token', t)
  }
  _token = t
  return t
}

// Middleware: check auth. M5: the URL ?token= query channel was removed —
// tokens in URLs leak into logs/history; only header auth is accepted.
// Comparison is timing-safe (crypto.timingSafeEqual throws on length
// mismatch, so lengths are compared first — length alone is not secret).
function _auth(req) {
  if (!_token) return false
  // Node lowercases all incoming header names, so look up the token header
  // case-insensitively (TOKEN_HEADER as written would never match).
  let token = req.headers[TOKEN_HEADER.toLowerCase()]
  const authz = req.headers['authorization']
  if (!token && typeof authz === 'string' && authz.slice(0, 7).toLowerCase() === 'bearer ') {
    token = authz.slice(7)
  }
  if (typeof token !== 'string' || token.length === 0) return false
  const a = Buffer.from(token, 'utf8')
  const b = Buffer.from(_token, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// M5: CORS gate. A request carrying an Origin header (i.e. from a browser)
// is only allowed when the origin is a loopback page; everything else —
// arbitrary websites, DNS-rebound hostnames, extension pages — gets 403.
function _originAllowed(req) {
  const origin = req.headers.origin
  if (origin === undefined || origin === '') return true
  return LOCAL_ORIGIN_RE.test(String(origin))
}

// Accumulate the request body with a hard cap (M5). Past MAX_BODY_BYTES the
// server answers 413, stops buffering, and destroys the socket so a
// misbehaving client cannot exhaust memory by uploading forever.
function _readBody(req, res, onBody) {
  let body = ''
  let received = 0
  let overLimit = false
  // We deliberately destroy the socket mid-upload; the resulting client-side
  // reset surfaces here as ECONNRESET and must not crash the process.
  req.on('error', () => {})
  req.on('data', (d) => {
    if (overLimit) return
    received += d.length
    if (received > MAX_BODY_BYTES) {
      overLimit = true
      body = ''
      res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' })
      res.end(JSON.stringify({ error: 'payload too large' }))
      // 销毁连接（任务要求）：等响应 flush 后稍候再断，保证客户端能先读到 413。
      res.once('finish', () => {
        setTimeout(() => { try { req.destroy() } catch {} }, 25)
      })
      return
    }
    body += d
  })
  req.on('end', () => { if (!overLimit) onBody(body) })
}

// Start the gateway.
function start(db, port = DEFAULT_PORT) {
  if (_server) return { started: true, port: _server.address()?.port }
  _db = db
  _token = null

  _server = http.createServer((req, res) => {
    // M5: cross-origin browser requests are rejected outright (403) — only
    // loopback pages and non-browser clients (no Origin) may proceed.
    if (!_originAllowed(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Origin not allowed' }))
      return
    }
    // CORS for allowed browser callers (echo the whitelisted origin).
    const origin = req.headers.origin
    res.setHeader('Access-Control-Allow-Origin', typeof origin === 'string' && origin ? origin : '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Aether-Token, Authorization')
    res.setHeader('Vary', 'Origin')
    res.setHeader('Content-Type', 'application/json')

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
    if (!_auth(req)) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return }

    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200); res.end(JSON.stringify({ status: 'ok', version: '0.5.0' })); return
    }

    // OpenAI-compatible /v1/chat/completions (Wave 4). Reuses the chat:complete
    // model/provider resolution but answers with the OpenAI response shape so
    // OpenAI-compatible clients (scripts, SDKs, tools) can talk to Aether.
    const url = new URL(req.url, `http://localhost:${port}`)
    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
      _readBody(req, res, async (body) => {
        let parsed = null
        try { parsed = body ? JSON.parse(body) : {} } catch {
          res.writeHead(400)
          res.end(JSON.stringify({ error: { message: 'invalid JSON body', type: 'invalid_request_error', code: 400 } }))
          return
        }
        try {
          const openaiHandler = require('./openaiChatHandler')
          const providerAdapter = require('./providerAdapter')
          const out = await openaiHandler.handleChatCompletions({
            db: _db,
            body: parsed,
            completeChatMessage: (args) => providerAdapter.completeChatMessage(args),
            streamChat: (args) => providerAdapter.streamChat(args),
          })
          if (out.status !== 200) { res.writeHead(out.status); res.end(JSON.stringify(out.json)); return }
          if (out.stream) {
            res.writeHead(200, { 'Content-Type': 'text/event-stream' })
            for await (const line of out.stream) res.write(line + '\n\n')
            res.end()
            return
          }
          res.writeHead(200)
          res.end(JSON.stringify(out.json))
        } catch (e) {
          // 不向客户端暴露内部错误细节（CodeQL js/stack-trace-exposure）：
          // 异常消息可能携带内部路径/模块信息，回环 + token 鉴权下攻击面小，
          // 但 127.0.0.1 上的恶意网页/进程仍可读取——统一返回通用文案，
          // 详细错误只进服务端日志。
          const detail = e && e.stack ? e.stack : (e && e.message ? e.message : String(e))
          try { console.error(`[localGateway] /v1/chat/completions failed: ${detail}`) } catch {}
          res.writeHead(500)
          res.end(JSON.stringify({ error: { message: 'Internal server error', type: 'internal_error', code: 500 } }))
        }
      })
      return
    }

    // Proxy request to ipcMain
    const channel = url.pathname.replace(/^\//, '')
    if (!channel) { res.writeHead(404); res.end(JSON.stringify({ error: 'No channel' })); return }

    _readBody(req, res, (body) => {
      let args = []
      try {
        const parsed = body ? JSON.parse(body) : null
        // Normalize the body to an args array: a JSON array maps to positional
        // args, a JSON object is passed as a single (first) positional arg so
        // handlers can destructure it — e.g. chat:complete's (event, { content }).
        args = parsed == null ? [] : (Array.isArray(parsed) ? parsed : [parsed])
      } catch { args = [body] }

      // Map query params to args for GET requests.
      if (req.method === 'GET') {
        args = Array.from(url.searchParams.entries()).map(([k, v]) => v)
      }

      // Prefer the explicitly-registered proxy handlers (handle() channels are
      // not visible to ipcMain.listeners), then fall back to .on() listeners.
      const handler = _handlers.get(channel) || ipcMain.listeners(channel)?.[0]
      if (!handler) {
        // Check for channel:action pattern
        const parts = channel.split(':')
        const act = parts.pop()
        const ch = parts.join(':')
        const h2 = _handlers.get(`${ch}:${act}`) || ipcMain.listeners(`${ch}:${act}`)?.[0]
        if (!h2) { res.writeHead(404); res.end(JSON.stringify({ error: `Channel not found: ${channel}` })); return }
        Promise.resolve(h2(null, ...args)).then(r => { res.writeHead(200); res.end(JSON.stringify(r || { ok: true })) }).catch(e => {
          // 同 /v1/chat/completions：不向客户端暴露异常细节（js/stack-trace-exposure）
          const detail = e && e.stack ? e.stack : (e && e.message ? e.message : String(e))
          try { console.error(`[localGateway] ${channel} failed: ${detail}`) } catch {}
          res.writeHead(500); res.end(JSON.stringify({ error: 'Internal server error' }))
        })
        return
      }
      Promise.resolve(handler(null, ...args)).then(r => { res.writeHead(200); res.end(JSON.stringify(r || { ok: true })) }).catch(e => {
        // 同 /v1/chat/completions：不向客户端暴露异常细节（js/stack-trace-exposure）
        const detail = e && e.stack ? e.stack : (e && e.message ? e.message : String(e))
        try { console.error(`[localGateway] ${channel} failed: ${detail}`) } catch {}
        res.writeHead(500); res.end(JSON.stringify({ error: 'Internal server error' }))
      })
    })
  })

  _server.listen(port, '127.0.0.1', () => {
    _ensureToken(_db)
    return { started: true, port: _server.address()?.port, token: _token }
  })
}

function stop() {
  if (_server) { _server.close(); _server = null; _token = null }
  return { stopped: true }
}

function isRunning() { return !!_server }

function getToken() { return _token }

// Ensure a token exists (generate + persist if missing) and return it. Safe to
// call before start() so the settings UI can show connection info even when the
// gateway is currently disabled.
function getOrCreateToken(db) {
  if (_token) return _token
  if (!db) return null
  _token = _ensureToken(db)
  return _token
}

function getPort() { return _server?.address()?.port || DEFAULT_PORT }

module.exports = { start, stop, isRunning, getToken, getOrCreateToken, getPort, registerHandler, unregisterHandler, DEFAULT_PORT }
