// ───────────────────────────────────────────────────────────────────────────
// LSP client — stdio JSON-RPC 2.0 client for a local language server.
//
// Enhances `find_symbol` with precise workspace/symbol lookups. Every failure
// path resolves to null / rejects without crashing the caller, so the tool
// falls back to the regex-based symbol indexer. LSP is an optional accuracy
// upgrade — nothing here is a hard dependency.
//
// Server resolution order (per language):
//   1. configureServer() override (tests / power users)
//   2. locally installed npm bin via require.resolve (cross-platform)
//   3. PATH spawn attempt
// Anything unavailable → degrade to null.
// ───────────────────────────────────────────────────────────────────────────

const { spawn } = require('child_process')
const { fileURLToPath, pathToFileURL } = require('url')
const path = require('path')

const DEFAULT_TIMEOUT_MS = 8000

// Canonical language names — kept in sync with symbolExtractor.detectLanguage.
const EXTS_TO_LANG = {
  '.js': 'javascript', '.jsx': 'javascript', '.ts': 'javascript',
  '.tsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java', '.kt': 'kotlin',
}

// Which languages get a server and how to launch it. Currently only
// javascript/typescript (the dominant codebase languages); other languages
// fall through to the regex indexer unchanged.
const serverOverrides = new Map() // language -> { command, args }

function defaultServerFor(language) {
  if (language !== 'javascript') return null
  // Prefer the locally installed package bin (no shell shim needed, works on
  // Windows). typescript-language-server is an optional install — missing it
  // just means we degrade.
  try {
    const pkgPath = require.resolve('typescript-language-server/package.json', { paths: [__dirname] })
    const pkg = require(pkgPath)
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && pkg.bin['typescript-language-server']
    if (bin) {
      return { command: process.execPath, args: [path.resolve(path.dirname(pkgPath), bin), '--stdio'] }
    }
  } catch { /* not installed locally — fall through to PATH */ }
  return { command: 'typescript-language-server', args: ['--stdio'] }
}

function extToLanguage(filePath) {
  return EXTS_TO_LANG[path.extname(filePath).toLowerCase()] ?? null
}

/**
 * Convert an LSP `file://` URI to a local path. Tolerant where possible:
 * `fileURLToPath` rejects non-drive-absolute URIs (e.g. `file:///workspace/...`)
 * on Windows, so we fall back to a manual decode instead of dropping the
 * symbol from the results.
 * @param {string} uri
 * @returns {string | null}
 */
function uriToFilePath(uri) {
  const raw = String(uri)
  try {
    return fileURLToPath(raw)
  } catch { /* not parseable as an absolute file URL — manual decode below */ }
  if (!raw.startsWith('file://')) return null
  // file:///path  or  file://host/path  -> keep the path portion.
  let p = raw.slice('file://'.length).replace(/^[^/]*/, '')
  // Windows-style drive path (file:///D:/...) — drop the leading slash.
  if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1)
  try { return decodeURIComponent(p) } catch { return p }
}

/**
 * Frame a JSON-RPC message for the LSP Content-Length transport.
 * @param {object} msg
 * @returns {string}
 */
function encodeMessage(msg) {
  const body = JSON.stringify(msg)
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`
}

/**
 * Incremental parser for Content-Length framed streams. Feed it Buffer
 * chunks; it returns any complete JSON-RPC messages those chunks completed.
 */
class MessageParser {
  constructor() {
    this.buffer = Buffer.alloc(0)
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const messages = []
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return messages
      const header = this.buffer.slice(0, headerEnd).toString('utf8')
      const m = /Content-Length:\s*(\d+)/i.exec(header)
      if (!m) {
        // Malformed header — skip past it rather than wedging the stream.
        this.buffer = this.buffer.slice(headerEnd + 4)
        continue
      }
      const len = parseInt(m[1], 10)
      const bodyStart = headerEnd + 4
      if (this.buffer.length < bodyStart + len) return messages // wait for more
      const body = this.buffer.slice(bodyStart, bodyStart + len).toString('utf8')
      this.buffer = this.buffer.slice(bodyStart + len)
      try { messages.push(JSON.parse(body)) } catch { /* skip malformed frame */ }
    }
  }
}

class LspClient {
  /**
   * @param {object} opts
   * @param {string} opts.command - Executable to spawn.
   * @param {string[]} [opts.args]
   * @param {string} opts.root - Workspace root (absolute path).
   * @param {number} [opts.timeoutMs] - Per-request timeout.
   */
  constructor({ command, args, root, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    this.command = command
    this.args = args || []
    this.root = root
    this.timeoutMs = timeoutMs
    this._proc = null
    this._parser = new MessageParser()
    this._pending = new Map() // id -> { resolve, reject, timer }
    this._id = 0
    this._disposed = false
    this._startFailed = false
  }

  /** Send a request and await its response. Rejects on timeout / crash. */
  _send(method, params, timeoutMs = this.timeoutMs) {
    if (this._disposed) return Promise.reject(new Error('LSP client disposed'))
    const id = ++this._id
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id)
        this._fail(`LSP request timed out: ${method}`)
        reject(new Error(`LSP request timed out after ${timeoutMs}ms: ${method}`))
      }, timeoutMs)
      this._pending.set(id, { resolve, reject, timer })
      try {
        this._proc.stdin.write(encodeMessage({ jsonrpc: '2.0', id, method, params: params ?? {} }))
      } catch (err) {
        clearTimeout(timer)
        this._pending.delete(id)
        reject(err)
      }
    })
  }

  /** Reject everything in flight and tear the process down. */
  _fail(reason) {
    for (const { reject, timer } of this._pending.values()) {
      clearTimeout(timer)
      reject(new Error(reason))
    }
    this._pending.clear()
    if (this._proc) {
      try { this._proc.kill() } catch { /* already gone */ }
      this._proc = null
    }
  }

  _handleMessage(msg) {
    if (msg.id === undefined || msg.id === null) return // notification
    const pending = this._pending.get(msg.id)
    if (!pending) return
    clearTimeout(pending.timer)
    this._pending.delete(msg.id)
    if (msg.error) pending.reject(new Error(msg.error.message || 'LSP error'))
    else pending.resolve(msg.result)
  }

  /** Spawn + initialize handshake. Returns true when the server is ready. */
  async _ensureStarted() {
    if (this._proc) return true
    if (this._startFailed) return false
    const proc = spawn(this.command, this.args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    this._proc = proc
    proc.stdout.on('data', (chunk) => {
      for (const msg of this._parser.push(chunk)) this._handleMessage(msg)
    })
    proc.stderr.on('data', () => { /* server diagnostics — ignore */ })
    proc.on('error', (err) => {
      this._startFailed = true
      this._fail(`LSP server failed to start: ${err.message}`)
    })
    proc.on('exit', (code, signal) => {
      if (this._proc === proc) this._proc = null
      if (this._pending.size) this._fail(`LSP server exited (code=${code}, signal=${signal})`)
    })
    try {
      const rootUri = pathToFileURL(path.resolve(this.root)).href
      await this._send('initialize', {
        processId: process.pid,
        rootUri,
        capabilities: {},
        workspaceFolders: [{ uri: rootUri, name: path.basename(path.resolve(this.root)) }],
      })
      try {
        this._proc.stdin.write(encodeMessage({ jsonrpc: '2.0', method: 'initialized', params: {} }))
      } catch { /* server already gone — searchSymbols will surface it */ }
      return true
    } catch {
      this._fail('LSP initialize handshake failed')
      return false
    }
  }

  /**
   * Search the workspace for a symbol via `workspace/symbol`.
   * @param {string} query - Exact symbol name.
   * @param {{ limit?: number }} [opts]
   * @returns {Promise<Array<{ file: string, line: number, name: string }>>}
   */
  async searchSymbols(query, { limit = 50 } = {}) {
    if (!(await this._ensureStarted())) throw new Error('LSP server unavailable')
    const raw = await this._send('workspace/symbol', { query })
    if (!Array.isArray(raw)) return []
    const seen = new Set()
    const results = []
    for (const item of raw) {
      // Exact-name filter: workspace/symbol servers return prefix/fuzzy
      // matches; find_symbol semantics are exact.
      if (!item || item.name !== query) continue
      const uri = item.location && item.location.uri
      if (!uri) continue
      const line = (item.location.range && item.location.range.start ? item.location.range.start.line : 0) + 1
      const file = uriToFilePath(uri)
      if (!file) continue
      const key = `${file}:${line}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({ file, line, name: item.name })
    }
    results.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line))
    return results.slice(0, limit)
  }

  dispose() {
    if (this._disposed) return
    this._disposed = true
    const proc = this._proc
    this._proc = null
    for (const { reject, timer } of this._pending.values()) {
      clearTimeout(timer)
      reject(new Error('LSP client disposed'))
    }
    this._pending.clear()
    if (!proc) return
    try { proc.stdin.write(encodeMessage({ jsonrpc: '2.0', id: ++this._id, method: 'shutdown', params: null })) } catch { /* gone */ }
    try { proc.stdin.write(encodeMessage({ jsonrpc: '2.0', method: 'exit', params: null })) } catch { /* gone */ }
    const timer = setTimeout(() => { try { proc.kill() } catch { /* gone */ } }, 300)
    if (timer.unref) timer.unref()
  }
}

/**
 * Construct a client. When command/args are omitted they come from the
 * configured/default server for 'javascript'.
 */
function createClient({ command, args, root, timeoutMs } = {}) {
  let server
  if (command) server = { command, args: args || [] }
  else server = serverOverrides.get('javascript') || defaultServerFor('javascript')
  return new LspClient({ command: server.command, args: server.args, root, timeoutMs })
}

// Per-workspace client cache: `${root}|${lang}` -> LspClient.
const clientCache = new Map()

/**
 * Module-level entry point for tools: search a workspace, or return null on
 * any failure so callers fall back to the regex indexer.
 * @param {string} root - Workspace root (absolute path).
 * @param {string} query - Exact symbol name.
 * @param {{ language?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<Array<{ file: string, line: number, name: string }> | null>}
 */
async function searchWorkspace(root, query, { language = 'javascript', timeoutMs } = {}) {
  const server = serverOverrides.get(language) || defaultServerFor(language)
  if (!server) return null
  const key = `${root}|${language}`
  let client = clientCache.get(key)
  if (!client) {
    client = createClient({ command: server.command, args: server.args, root, timeoutMs })
    clientCache.set(key, client)
  }
  try {
    return await client.searchSymbols(query)
  } catch {
    clientCache.delete(key)
    try { client.dispose() } catch { /* already disposed */ }
    return null
  }
}

/** Override the launch config for a language (tests / power users). */
function configureServer(language, { command, args }) {
  serverOverrides.set(language, { command, args })
}

/** Dispose every cached client (shutdown / test teardown). */
function disposeAll() {
  for (const client of clientCache.values()) {
    try { client.dispose() } catch { /* already disposed */ }
  }
  clientCache.clear()
}

module.exports = {
  encodeMessage,
  MessageParser,
  extToLanguage,
  uriToFilePath,
  LspClient,
  createClient,
  searchWorkspace,
  configureServer,
  disposeAll,
  DEFAULT_TIMEOUT_MS,
}