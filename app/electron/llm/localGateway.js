// ───────────────────────────────────────────────────────────────────────────
// Local Gateway — lightweight HTTP server exposing AetherAI's API for
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
const TOKEN_HEADER = 'X-AetherAI-Token'

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

// Middleware: check auth.
function _auth(req) {
  // Node lowercases all incoming header names, so look up the token header
  // case-insensitively (TOKEN_HEADER as written would never match).
  const token = req.headers[TOKEN_HEADER.toLowerCase()] || req.url.match(/[?&]token=([^&]+)/)?.[1]
  return token === _token
}

// Start the gateway.
function start(db, port = DEFAULT_PORT) {
  if (_server) return { started: true, port: _server.address()?.port }
  _db = db
  _token = null

  _server = http.createServer((req, res) => {
    // CORS for browser extensions
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-AetherAI-Token')
    res.setHeader('Content-Type', 'application/json')

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
    if (!_auth(req)) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return }

    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200); res.end(JSON.stringify({ status: 'ok', version: '0.5.0' })); return
    }

    // OpenAI-compatible /v1/chat/completions (Wave 4). Reuses the chat:complete
    // model/provider resolution but answers with the OpenAI response shape so
    // OpenAI-compatible clients (scripts, SDKs, tools) can talk to AetherAI.
    const url = new URL(req.url, `http://localhost:${port}`)
    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
      let body = ''
      req.on('data', (d) => { body += d })
      req.on('end', async () => {
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
          res.writeHead(500)
          res.end(JSON.stringify({ error: { message: e && e.message ? e.message : String(e), type: 'internal_error', code: 500 } }))
        }
      })
      return
    }

    // Proxy request to ipcMain
    const channel = url.pathname.replace(/^\//, '')
    if (!channel) { res.writeHead(404); res.end(JSON.stringify({ error: 'No channel' })); return }

    let body = ''
    req.on('data', (d) => { body += d })
    req.on('end', () => {
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
        Promise.resolve(h2(null, ...args)).then(r => { res.writeHead(200); res.end(JSON.stringify(r || { ok: true })) }).catch(e => { res.writeHead(500); res.end(JSON.stringify({ error: e.message })) })
        return
      }
      Promise.resolve(handler(null, ...args)).then(r => { res.writeHead(200); res.end(JSON.stringify(r || { ok: true })) }).catch(e => { res.writeHead(500); res.end(JSON.stringify({ error: e.message })) })
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
