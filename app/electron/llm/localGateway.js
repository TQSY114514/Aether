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
  const token = req.headers[TOKEN_HEADER] || req.url.match(/[?&]token=([^&]+)/)?.[1]
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

    // Proxy request to ipcMain
    const url = new URL(req.url, `http://localhost:${port}`)
    const channel = url.pathname.replace(/^\//, '')
    if (!channel) { res.writeHead(404); res.end(JSON.stringify({ error: 'No channel' })); return }

    let body = ''
    req.on('data', (d) => { body += d })
    req.on('end', () => {
      let args = []
      try { args = body ? JSON.parse(body) : [] } catch { args = [body] }

      // Map query params to args for GET requests.
      if (req.method === 'GET') {
        args = Array.from(url.searchParams.entries()).map(([k, v]) => v)
      }

      const handler = ipcMain.listeners(channel)?.[0]
      if (!handler) {
        // Check for channel:action pattern
        const parts = channel.split(':')
        const act = parts.pop()
        const ch = parts.join(':')
        const h2 = ipcMain.listeners(`${ch}:${act}`)?.[0]
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

module.exports = { start, stop, isRunning, getToken, getOrCreateToken, getPort, DEFAULT_PORT }
