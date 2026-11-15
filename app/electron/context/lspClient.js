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

// Which languages get a server and how to launch it.
const serverOverrides = new Map() // language -> { command, args }
const unavailableLangs = new Set() // languages whose default binary ENOENT'd

const LANGUAGE_SERVER_CANDIDATES = {
  python: [
    { command: 'pyright-langserver', args: ['--stdio'] },
    { command: 'pylsp', args: [] },
  ],
  go: [
    { command: 'gopls', args: [] },
  ],
  rust: [
    { command: 'rust-analyzer', args: [] },
  ],
}

const LSP_LANGUAGE_IDS = {
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
}

function isCommandOnPath(cmd) {
  if (!cmd) return false
  const fs = require('fs')
  const isWin = process.platform === 'win32'
  const exts = isWin ? ['', '.exe', '.cmd', '.bat'] : ['']
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, cmd.endsWith(ext) ? cmd : cmd + ext)
      try {
        if (fs.statSync(candidate).isFile()) return true
      } catch {}
    }
  }
  return false
}

function defaultServerFor(language) {
  if (language === 'javascript') {
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
  const candidates = LANGUAGE_SERVER_CANDIDATES[language]
  if (!candidates) return null
  for (const cand of candidates) {
    if (isCommandOnPath(cand.command)) return cand
  }
  return null
}

function extToLanguage(filePath) {
  return EXTS_TO_LANG[path.extname(filePath).toLowerCase()] ?? null
}

function normalizeUriKey(uri) {
  const filePath = uriToFilePath(uri)
  if (!filePath) return String(uri || '')
  const resolved = path.resolve(filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
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

// Normalize LSP Location | Location[] | LocationLink[] → { file, line, character }[].
function normalizeLocations(raw) {
  if (!raw) return []
  const list = Array.isArray(raw) ? raw : [raw]
  const out = []
  for (const item of list) {
    const target = item && item.targetUri ? item : item
    const uri = target.targetUri || target.uri
    if (!uri) continue
    const range = target.targetRange || target.range
    const pos = range && range.start ? range.start : null
    const file = uriToFilePath(uri)
    if (!file) continue
    out.push({ file, line: pos ? pos.line : 0, character: pos ? pos.character : 0 })
  }
  return out
}

// Normalize a WorkspaceEdit { changes: { uri: TextEdit[] } } to a flat
// per-file edit list. Returns null when the payload is unrecognized.
function normalizeWorkspaceEdit(raw) {
  if (!raw || typeof raw !== 'object') return null
  const changes = raw.changes && typeof raw.changes === 'object' ? raw.changes : null
  if (!changes) return null
  const out = { changes: [] }
  for (const [uri, edits] of Object.entries(changes)) {
    const file = uriToFilePath(uri)
    if (!file || !Array.isArray(edits)) continue
    out.changes.push({
      file,
      edits: edits.map(e => ({
        line: e.range && e.range.start ? e.range.start.line : 0,
        character: e.range && e.range.start ? e.range.start.character : 0,
        endLine: e.range && e.range.end ? e.range.end.line : 0,
        endCharacter: e.range && e.range.end ? e.range.end.character : 0,
        newText: e.newText || '',
      })),
    })
  }
  return out
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
    this._diagnosticsByUri = new Map() // normalizedUri -> Diagnostic[]
    this._diagnosticWaiters = new Map() // normalizedUri -> Set<{ resolve, timer }>
    this._docVersions = new Map() // uri -> version number
    this._id = 0
    this._disposed = false
    this._startFailed = false
    this._startErrorCode = null
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

  /** Send a one-way notification (no response expected). */
  _notify(method, params) {
    try {
      this._proc.stdin.write(encodeMessage({ jsonrpc: '2.0', method, params: params ?? {} }))
      return true
    } catch { return false }
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
    if (msg.id === undefined || msg.id === null) {
      if (msg.method === 'textDocument/publishDiagnostics' && msg.params && msg.params.uri) {
        const key = normalizeUriKey(msg.params.uri)
        const rawItems = Array.isArray(msg.params.diagnostics) ? msg.params.diagnostics : []
        const normalized = rawItems.map(d => ({
          severity: d.severity ?? 1,
          message: d.message || '',
          line: (d.range && d.range.start && d.range.start.line) ?? 0,
          source: d.source || null,
          code: d.code ?? null,
        }))
        this._diagnosticsByUri.set(key, normalized)
        const waiters = this._diagnosticWaiters.get(key)
        if (waiters && waiters.size > 0) {
          this._diagnosticWaiters.delete(key)
          for (const w of waiters) {
            clearTimeout(w.timer)
            w.resolve(normalized)
          }
        }
      }
      return
    }
    const pending = this._pending.get(msg.id)
    if (!pending) {
      // Server-initiated request (e.g. workspace/configuration, client/registerCapability):
      // acknowledge with null so strict servers do not block waiting on the client.
      if (msg.method && this._proc && this._proc.stdin) {
        try {
          this._proc.stdin.write(encodeMessage({ jsonrpc: '2.0', id: msg.id, result: null }))
        } catch { /* ignore */ }
      }
      return
    }
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
      this._startErrorCode = err && err.code ? err.code : null
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
        capabilities: {
          textDocument: {
            publishDiagnostics: { relatedInformation: false },
            synchronization: { dynamicRegistration: false, didSave: true },
          },
        },
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

  /**
   * Open a document so the server tracks it (needed by diagnostics and some
   * servers before definition/references work on unopened files).
   * @param {string} uri - file:// URI of the file.
   */
  async openDocument(uri) {
    if (!(await this._ensureStarted())) return false
    const ver = (this._docVersions.get(uri) || 0) + 1
    this._docVersions.set(uri, ver)
    this._notify('textDocument/didOpen', { textDocument: { uri, languageId: 'plaintext', version: ver, text: '' } })
    return true
  }

  /**
   * Synchronize full document text (`didOpen` on first sight, `didChange`
   * + `didSave` on subsequent edits) so both pull and push LSP servers analyze
   * the latest disk contents.
   * @param {string} uri
   * @param {string} text
   * @param {string} [languageId]
   * @returns {Promise<boolean>}
   */
  async syncDocument(uri, text, languageId = 'plaintext') {
    if (!(await this._ensureStarted())) return false
    const prev = this._docVersions.get(uri)
    if (prev == null) {
      this._docVersions.set(uri, 1)
      this._notify('textDocument/didOpen', {
        textDocument: { uri, languageId, version: 1, text },
      })
    } else {
      const next = prev + 1
      this._docVersions.set(uri, next)
      this._notify('textDocument/didChange', {
        textDocument: { uri, version: next },
        contentChanges: [{ text }],
      })
    }
    this._notify('textDocument/didSave', {
      textDocument: { uri },
      text,
    })
    return true
  }

  /**
   * Wait up to `waitMs` for a fresh `textDocument/publishDiagnostics` push
   * notification, resolving to `null` on timeout.
   * @private
   */
  _awaitPushDiagnostics(uri, waitMs = 450) {
    const key = normalizeUriKey(uri)
    return new Promise((resolve) => {
      if (waitMs <= 0) {
        resolve(this._diagnosticsByUri.get(key) ?? null)
        return
      }
      let waiters = this._diagnosticWaiters.get(key)
      if (!waiters) {
        waiters = new Set()
        this._diagnosticWaiters.set(key, waiters)
      }
      const entry = {
        resolve,
        timer: setTimeout(() => {
          waiters.delete(entry)
          if (waiters.size === 0) this._diagnosticWaiters.delete(key)
          resolve(null)
        }, waitMs),
      }
      if (entry.timer.unref) entry.timer.unref()
      waiters.add(entry)
    })
  }

  /**
   * Sync document content and collect diagnostics using push first, falling
   * back to LSP 3.17 pull (`textDocument/diagnostic`) if no push arrives.
   * @param {string} uri
   * @param {string} text
   * @param {{ languageId?: string, waitMs?: number }} [opts]
   * @returns {Promise<Array<{ severity: number, message: string, line: number, source?: string|null, code?: string|number|null }> | null>}
   */
  async syncAndCollectDiagnostics(uri, text, { languageId = 'plaintext', waitMs = 450 } = {}) {
    if (!(await this._ensureStarted())) return null
    const key = normalizeUriKey(uri)
    // Register push waiter BEFORE sending notifications to avoid missing fast pushes.
    const pushPromise = this._awaitPushDiagnostics(uri, waitMs)
    await this.syncDocument(uri, text, languageId)
    const pushed = await pushPromise
    if (Array.isArray(pushed)) return pushed

    // Push did not arrive in time; try pull diagnostics if server supports it.
    try {
      const pulled = await this.getDiagnostics(uri)
      if (Array.isArray(pulled) && pulled.length > 0) return pulled
    } catch { /* server may not implement textDocument/diagnostic */ }

    return this._diagnosticsByUri.get(key) || []
  }

  /**
   * Go to the definition of the symbol at a position.
   * @param {string} uri - file:// URI of the file containing the position.
   * @param {number} line - 0-based line.
   * @param {number} character - 0-based character.
   * @returns {Promise<Array<{ file: string, line: number, character: number }>>}
   */
  async goToDefinition(uri, line, character) {
    if (!(await this._ensureStarted())) throw new Error('LSP server unavailable')
    const raw = await this._send('textDocument/definition', {
      textDocument: { uri },
      position: { line, character },
    })
    return normalizeLocations(raw)
  }

  /**
   * Find all references to the symbol at a position.
   * @returns {Promise<Array<{ file: string, line: number, character: number }>>}
   */
  async findReferences(uri, line, character, { includeDeclaration = true } = {}) {
    if (!(await this._ensureStarted())) throw new Error('LSP server unavailable')
    const raw = await this._send('textDocument/references', {
      textDocument: { uri },
      position: { line, character },
      context: { includeDeclaration },
    })
    return normalizeLocations(raw)
  }

  /**
   * Compute a rename WorkspaceEdit for a symbol. Does NOT apply it — the
   * caller decides (permission gate). 
   * @returns {Promise<null | { changes: Array<{ file: string, edits: Array<{ line, character, endLine, endCharacter, newText }> }> }>}
   */
  async prepareRename(uri, line, character, newName) {
    if (!(await this._ensureStarted())) throw new Error('LSP server unavailable')
    const raw = await this._send('textDocument/rename', {
      textDocument: { uri },
      position: { line, character },
      newName,
    })
    return normalizeWorkspaceEdit(raw)
  }

  /**
   * List code actions available at a range.
   * @returns {Promise<Array<{ title: string, kind?: string }>>}
   */
  async listCodeActions(uri, line, character, { diagnostics = [], kind } = {}) {
    if (!(await this._ensureStarted())) throw new Error('LSP server unavailable')
    const raw = await this._send('textDocument/codeAction', {
      textDocument: { uri },
      range: { start: { line, character: 0 }, end: { line, character: 0 } },
      context: {
        diagnostics: diagnostics.map(d => ({
          range: d.range || { start: { line, character: 0 }, end: { line, character: 0 } },
          message: d.message || '',
          severity: d.severity ?? 1,
        })),
        only: kind ? [kind] : undefined,
      },
    })
    if (!Array.isArray(raw)) return []
    return raw
      .filter(a => a && typeof a.title === 'string')
      .map(a => ({ title: a.title, kind: a.kind }))
  }

  /**
   * Pull-style diagnostics for a file (LSP 3.17 `textDocument/diagnostic`).
   * Falls back to `[]` on servers that do not support the pull model.
   * @returns {Promise<Array<{ severity: number, message: string, line: number }>>}
   */
  async getDiagnostics(uri) {
    if (!(await this._ensureStarted())) throw new Error('LSP server unavailable')
    const raw = await this._send('textDocument/diagnostic', {
      textDocument: { uri },
      identifier: 'aether-lsp',
    })
    if (!raw) return []
    const items = raw.kind === 'full' && Array.isArray(raw.items) ? raw.items : []
    return items.map(d => ({
      severity: d.severity ?? 1,
      message: d.message || '',
      line: (d.range && d.range.start && d.range.start.line) ?? 0,
      source: d.source || null,
      code: d.code ?? null,
    }))
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
    for (const waiters of this._diagnosticWaiters.values()) {
      for (const w of waiters) {
        clearTimeout(w.timer)
        w.resolve(null)
      }
    }
    this._diagnosticWaiters.clear()
    this._diagnosticsByUri.clear()
    this._docVersions.clear()
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
  unavailableLangs.delete(language)
  serverOverrides.set(language, { command, args })
}

// ─── Full-LSP workspace entry points ────────────────────────────────────────
// Each mirrors searchWorkspace: resolve a (cached) client, run one request,
// and return null on failure so callers degrade to their fallback. All are
// behind the `lsp.full` feature flag at the tool layer.

/** Get a client for a workspace+language (cached), or null when unavailable. */
function clientFor(root, language = 'javascript') {
  if (!serverOverrides.has(language) && unavailableLangs.has(language)) return null
  const server = serverOverrides.get(language) || defaultServerFor(language)
  if (!server) return null
  const key = `${root}|${language}`
  let client = clientCache.get(key)
  if (!client) {
    client = createClient({ command: server.command, args: server.args, root })
    clientCache.set(key, client)
  }
  return client
}

// One-shot wrapper: run fn on the cached client; on ANY error dispose the
// client, drop the cache entry and return null (never throw).
async function withClient(root, language, fn) {
  const client = clientFor(root, language)
  if (!client) return null
  try {
    const res = await fn(client)
    if (client._startErrorCode === 'ENOENT' && !serverOverrides.has(language)) {
      unavailableLangs.add(language)
      clientCache.delete(`${root}|${language}`)
      try { client.dispose() } catch { /* already disposed */ }
    }
    return res
  } catch {
    if (client._startErrorCode === 'ENOENT' && !serverOverrides.has(language)) {
      unavailableLangs.add(language)
    }
    clientCache.delete(`${root}|${language}`)
    try { client.dispose() } catch { /* already disposed */ }
    return null
  }
}

/**
 * Definition lookup for a position in a file.
 * @param {string} root  workspace root
 * @param {string} file  absolute path to the target file
 * @param {number} line  1-based line
 * @param {number} [character] 1-based character
 * @returns {Promise<null | Array<{ file, line, character }>>}
 */
function definitionWorkspace(root, file, { language, line = 1, character = 1 } = {}) {
  const lang = language || extToLanguage(file) || 'javascript'
  const uri = pathToFileURL(file).href
  return withClient(root, lang, async (client) => {
    const res = await client.goToDefinition(uri, line - 1, character - 1)
    return res || []
  })
}

/** References of the symbol at a position. */
function referencesWorkspace(root, file, { language, line = 1, character = 1, includeDeclaration = true } = {}) {
  const lang = language || extToLanguage(file) || 'javascript'
  const uri = pathToFileURL(file).href
  return withClient(root, lang, async (client) => {
    const res = await client.findReferences(uri, line - 1, character - 1, { includeDeclaration })
    return res || []
  })
}

/** Prepared rename edits (NOT applied). */
function renameWorkspace(root, file, newName, { language, line = 1, character = 1 } = {}) {
  const lang = language || extToLanguage(file) || 'javascript'
  const uri = pathToFileURL(file).href
  return withClient(root, lang, async (client) => client.prepareRename(uri, line - 1, character - 1, newName))
}

/** Available code actions (titles only). */
function codeActionsWorkspace(root, file, { language, line = 1 }) {
  const lang = language || extToLanguage(file) || 'javascript'
  const uri = pathToFileURL(file).href
  return withClient(root, lang, async (client) => client.listCodeActions(uri, line - 1, 0))
}

/** Diagnostics for one file. */
function diagnosticsWorkspace(root, file, { language } = {}) {
  const lang = language || extToLanguage(file) || 'javascript'
  const uri = pathToFileURL(file).href
  return withClient(root, lang, async (client) => client.getDiagnostics(uri))
}

/**
 * Push-first + pull-fallback diagnostics after a file write/edit.
 * Never throws; returns `null` when language has no LSP or server fails.
 * @param {string} root
 * @param {string} file
 * @param {{ content?: string, language?: string, waitMs?: number }} [opts]
 * @returns {Promise<Array<{ severity: number, message: string, line: number, source?: string|null, code?: string|number|null }> | null>}
 */
async function diagnosticsAfterEdit(root, file, { content, language, waitMs = 450 } = {}) {
  const lang = language || extToLanguage(file)
  if (!lang) return null
  const absFile = path.resolve(file)
  const ext = path.extname(absFile).toLowerCase()
  const languageId = LSP_LANGUAGE_IDS[ext] || lang
  const uri = pathToFileURL(absFile).href
  let text = content
  if (typeof text !== 'string') {
    try {
      text = require('fs').readFileSync(absFile, 'utf8')
    } catch {
      return null
    }
  }
  return withClient(root, lang, (client) => client.syncAndCollectDiagnostics(uri, text, { languageId, waitMs }))
}

const SEVERITY_LABELS = { 1: 'Error', 2: 'Warning', 3: 'Info', 4: 'Hint' }

/**
 * Format diagnostics into a compact Error-first summary block for tool output.
 * @param {string} file
 * @param {Array<{ severity: number, message: string, line: number, source?: string|null, code?: string|number|null }>} diagnostics
 * @param {{ maxItems?: number }} [opts]
 * @returns {string}
 */
function formatDiagnosticsSummary(file, diagnostics, { maxItems = 15 } = {}) {
  if (!Array.isArray(diagnostics) || diagnostics.length === 0) return ''
  const sorted = [...diagnostics].sort((a, b) => {
    const sa = a.severity ?? 1
    const sb = b.severity ?? 1
    if (sa !== sb) return sa - sb
    return (a.line ?? 0) - (b.line ?? 0)
  })
  const shown = sorted.slice(0, maxItems)
  const lines = shown.map((d) => {
    const label = SEVERITY_LABELS[d.severity ?? 1] || 'Diag'
    const lineNum = (d.line ?? 0) + 1
    const src = d.source ? `${d.source}: ` : ''
    return `  - [${label}] line ${lineNum}: ${src}${d.message}`
  })
  if (sorted.length > maxItems) {
    lines.push(`  - ... (+${sorted.length - maxItems} more)`)
  }
  return `\n[LSP Diagnostics] ${path.basename(file)} (${sorted.length}):\n${lines.join('\n')}`
}

/** Dispose every cached client (shutdown / test teardown). */
function disposeAll() {
  for (const client of clientCache.values()) {
    try { client.dispose() } catch { /* already disposed */ }
  }
  clientCache.clear()
  unavailableLangs.clear()
}

module.exports = {
  encodeMessage,
  MessageParser,
  extToLanguage,
  uriToFilePath,
  LspClient,
  createClient,
  searchWorkspace,
  definitionWorkspace,
  referencesWorkspace,
  renameWorkspace,
  codeActionsWorkspace,
  diagnosticsWorkspace,
  diagnosticsAfterEdit,
  formatDiagnosticsSummary,
  configureServer,
  disposeAll,
  DEFAULT_TIMEOUT_MS,
}