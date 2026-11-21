// ─── lspClient tests ────────────────────────────────────────────────────────
// Covers the stdio JSON-RPC LSP client that enhances find_symbol:
//   - pure framing helpers (encodeMessage, MessageParser)
//   - a real child-process fixture LSP server (test/fixtures/lsp-server.js)
//     exercising workspace/symbol normalization, exact-name filtering,
//     deduplication, timeouts, mid-request crash, and graceful degradation
//     to null (so find_symbol falls back to the regex indexer).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  encodeMessage,
  MessageParser,
  extToLanguage,
  uriToFilePath,
  resolveCommandOnPath,
  isCommandOnPath,
  resolveWindowsCmdShim,
  buildSpawnInvocation,
  isLanguageUnavailable,
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
} from '../electron/context/lspClient'

const FIXTURE = path.join(__dirname, 'fixtures', 'lsp-server.js')
const realDateNow = Date.now.bind(Date)

async function waitForCondition(fn, { timeoutMs = 4000, intervalMs = 20 } = {}) {
  const deadline = realDateNow() + timeoutMs
  for (;;) {
    const val = await fn()
    if (val) return val
    if (realDateNow() >= deadline) {
      throw new Error(`waitForCondition timed out after ${timeoutMs}ms`)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

async function waitForLogEntries(logPath, predicate, { timeoutMs = 4000, intervalMs = 20 } = {}) {
  return waitForCondition(() => {
    if (!fs.existsSync(logPath)) return null
    const entries = fs
      .readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l) } catch { return null }
      })
      .filter(Boolean)
    return predicate(entries) ? entries : null
  }, { timeoutMs, intervalMs })
}

function makeFakeLspProc({ onMessage } = {}) {
  const proc = new EventEmitter()
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  const stdin = new EventEmitter()
  stdin.destroyed = false
  stdin.writableEnded = false
  const parser = new MessageParser()
  stdin.write = (chunk) => {
    if (stdin.destroyed || stdin.writableEnded) return false
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8')
    for (const msg of parser.push(buf)) {
      onMessage?.(msg, proc)
    }
    return true
  }
  proc.stdin = stdin
  proc.kill = () => {
    stdin.destroyed = true
    proc.emit('exit', 0, 'SIGTERM')
  }
  return proc
}

let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-client-test-'))
})

afterEach(() => {
  vi.restoreAllMocks()
  disposeAll()
  try { require('../electron/context/lspClient').disposeAll() } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

function pointServerAtFixture(...extraArgs) {
  configureServer('javascript', {
    command: process.execPath,
    args: [FIXTURE, ...extraArgs],
  })
}

describe('encodeMessage (framing)', () => {
  it('prefixes the JSON body with a UTF-8 byte-accurate Content-Length header', () => {
    const body = { jsonrpc: '2.0', method: 'ping' }
    const frame = encodeMessage(body)
    const [header, payload] = frame.split('\r\n\r\n')
    expect(header).toMatch(/^Content-Length: \d+$/i)
    expect(payload).toBe(JSON.stringify(body))
    const len = parseInt(header.split(':')[1], 10)
    expect(len).toBe(Buffer.byteLength(JSON.stringify(body), 'utf8'))
  })

  it('counts multi-byte characters as bytes, not code points', () => {
    const body = { text: '中文→🚀' } // 4 chars, >4 UTF-8 bytes
    const frame = encodeMessage(body)
    const header = frame.split('\r\n\r\n')[0]
    const len = parseInt(header.split(':')[1], 10)
    expect(len).toBe(Buffer.byteLength(JSON.stringify(body), 'utf8'))
    expect(len).toBeGreaterThan(JSON.stringify(body).length)
  })
})

describe('MessageParser', () => {
  it('parses a complete single message', () => {
    const parser = new MessageParser()
    const messages = parser.push(Buffer.from(encodeMessage({ id: 1, result: 'ok' })))
    expect(messages).toEqual([{ id: 1, result: 'ok' }])
  })

  it('parses a message whose frame arrives split across chunks', () => {
    const parser = new MessageParser()
    const frame = encodeMessage({ id: 42, result: ['split'] })
    const mid = Math.floor(frame.length / 2)
    const first = Buffer.from(frame.slice(0, mid))
    const second = Buffer.from(frame.slice(mid))
    expect(parser.push(first)).toEqual([])
    expect(parser.push(second)).toEqual([{ id: 42, result: ['split'] }])
  })

  it('parses two complete messages delivered in a single chunk', () => {
    const parser = new MessageParser()
    const messages = parser.push(Buffer.from(encodeMessage({ id: 1 }) + encodeMessage({ id: 2 })))
    expect(messages.map(m => m.id)).toEqual([1, 2])
  })
})

describe('extToLanguage', () => {
  it('maps the common extensions to canonical language names', () => {
    expect(extToLanguage('a.js')).toBe('javascript')
    expect(extToLanguage('a.tsx')).toBe('javascript')
    expect(extToLanguage('a.py')).toBe('python')
    expect(extToLanguage('a.rs')).toBe('rust')
    expect(extToLanguage('a.go')).toBe('go')
    expect(extToLanguage('a.java')).toBe('java')
    expect(extToLanguage('a.kt')).toBe('kotlin')
    expect(extToLanguage('a.unknown')).toBe(null)
  })
})

describe('uriToFilePath', () => {
  it('resolves a drive-absolute file URI to a local path', () => {
    const p = uriToFilePath('file:///D:/Aether/app/electron/main.js')
    expect(p).not.toBe(null)
    expect(p.endsWith('main.js')).toBe(true)
  })

  it('tolerates posix-style file URIs on any platform (manual decode fallback)', () => {
    // fileURLToPath rejects file:///workspace/... on Windows — the client
    // must not drop such results.
    const p = uriToFilePath('file:///workspace/src/app.js')
    expect(p).toBeDefined()
    expect(p.replace(/\\/g, '/').endsWith('workspace/src/app.js')).toBe(true)
  })

  it('decodes percent-encoded segments and rejects non-file URIs', () => {
    expect(uriToFilePath('file:///tmp/a%20b.ts').replace(/\\/g, '/')).toBe('/tmp/a b.ts')
    expect(uriToFilePath('http://x/y')).toBe(null)
  })
})

describe('createClient + searchSymbols (healthy fixture)', () => {
  it('normalizes workspace/symbol results to {file, line, name} with 1-based lines, exact-name filtered, deduped, and sorted', async () => {
    pointServerAtFixture()
    const client = createClient({ root: tmpDir })
    try {
      const results = await client.searchSymbols('findMe')
      // Exact-name filter drops findMeAgain/other; the duplicate util.ts:12
      // entry is deduped; results sorted by file path then line.
      expect(results).toHaveLength(2)
      for (const r of results) expect(r.name).toBe('findMe')
      const [a, b] = results
      expect(path.basename(a.file)).toBe('app.js')
      expect(a.line).toBe(3) // fixture line 2 → 1-based 3
      expect(path.basename(b.file)).toBe('util.ts')
      expect(b.line).toBe(12) // fixture line 11 → 1-based 12
    } finally {
      client.dispose()
    }
  })

  it('truncates results to the requested limit, keeping sort order', async () => {
    pointServerAtFixture()
    const client = createClient({ root: tmpDir })
    try {
      const results = await client.searchSymbols('findMe', { limit: 1 })
      expect(results).toHaveLength(1)
      expect(path.basename(results[0].file)).toBe('app.js')
    } finally {
      client.dispose()
    }
  })
})

describe('searchWorkspace (module-level, degrade-to-null)', () => {
  it('returns null when the language has no configured LSP server (regex fallback)', async () => {
    const result = await searchWorkspace(tmpDir, 'findMe', { language: 'elixir' })
    expect(result).toBe(null)
  })

  it('returns null when the server binary cannot spawn (ENOENT → regex fallback)', async () => {
    configureServer('javascript', { command: 'definitely-not-a-real-lsp-server-xyz', args: [] })
    const result = await searchWorkspace(tmpDir, 'findMe', { language: 'javascript' })
    expect(result).toBe(null)
  })

  it('returns null when the server exits before initializing (--defunct)', async () => {
    pointServerAtFixture('--defunct')
    const result = await searchWorkspace(tmpDir, 'findMe', { language: 'javascript' })
    expect(result).toBe(null)
  })

  it('returns null when a request exceeds the timeout (--slow)', async () => {
    pointServerAtFixture('--slow')
    const started = Date.now()
    const result = await searchWorkspace(tmpDir, 'findMe', { language: 'javascript', timeoutMs: 200 })
    expect(result).toBe(null)
    expect(Date.now() - started).toBeLessThan(5000) // resolved by timeout, never hangs
  })

  it('returns null when the server dies mid-request (--crash)', async () => {
    pointServerAtFixture('--crash')
    const result = await searchWorkspace(tmpDir, 'findMe', { language: 'javascript' })
    expect(result).toBe(null)
  })

  it('returns normalized results when the server is healthy', async () => {
    pointServerAtFixture()
    const results = await searchWorkspace(tmpDir, 'findMe', { language: 'javascript' })
    expect(results).toHaveLength(2)
  })
})

// ─── Full LSP feature set (definition / references / rename / actions / diag) ──
describe('full LSP workspace API', () => {
  let SAMPLE
  beforeEach(() => {
    pointServerAtFixture()
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true })
    SAMPLE = path.join(tmpDir, 'src', 'app.js')
    fs.writeFileSync(SAMPLE, 'export function findMe() {}\n')
  })

  it('definitionWorkspace returns a single normalized location (1-based)', async () => {
    const res = await definitionWorkspace(tmpDir, SAMPLE, { line: 1, character: 1 })
    expect(res).not.toBeNull()
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ line: 3, character: 1 })
    expect(path.basename(res[0].file)).toBe('app.js')
  })

  it('referencesWorkspace returns all reference locations', async () => {
    const res = await referencesWorkspace(tmpDir, SAMPLE, { line: 1, character: 1 })
    expect(res).toHaveLength(2)
    expect(res.map(r => r.line)).toEqual([3, 41])
  })

  it('renameWorkspace prepares edits without applying them', async () => {
    const res = await renameWorkspace(tmpDir, SAMPLE, 'renamedSym', { line: 1, character: 1 })
    expect(res).not.toBeNull()
    expect(res.changes).toHaveLength(2)
    const appChange = res.changes.find(c => c.file.endsWith('app.js'))
    expect(appChange.edits[0].newText).toBe('renamedSym')
    expect(appChange.edits[0].line).toBe(3)
  })

  it('codeActionsWorkspace lists actionable titles', async () => {
    const res = await codeActionsWorkspace(tmpDir, SAMPLE, { line: 1 })
    expect(res).not.toBeNull()
    const titles = res.map(a => a.title)
    expect(titles).toContain('Extract function')
    expect(titles).toContain('Quick fix: remove unused variable')
  })

  it('diagnosticsWorkspace returns severity/message/line tuples', async () => {
    const res = await diagnosticsWorkspace(tmpDir, SAMPLE)
    expect(res).not.toBeNull()
    expect(res).toHaveLength(2)
    expect(res[0]).toMatchObject({ severity: 1, line: 12 })
    expect(res[0].message).toContain('not assignable')
    expect(res[1].severity).toBe(2)
  })

  it('full-LSP entry points degrade to null when the language has no server', async () => {
    const res = await definitionWorkspace(tmpDir, SAMPLE, { language: 'rust', line: 1 })
    expect(res).toBeNull()
  })

  it('full-LSP entry points degrade to null when the server is defunct', async () => {
    pointServerAtFixture('--defunct')
    const res = await referencesWorkspace(tmpDir, SAMPLE, { line: 1 })
    expect(res).toBeNull()
  })
})

describe('Post-write push/pull diagnostics & tool integration', () => {
  it('diagnosticsAfterEdit captures push textDocument/publishDiagnostics and formats Error-first', async () => {
    pointServerAtFixture('--push-diag')
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true })
    const file = path.join(tmpDir, 'src', 'broken.ts')
    const content = 'const ok = 1\nconst x = BAD_SYNTAX\n'
    fs.writeFileSync(file, content, 'utf8')

    const diags = await diagnosticsAfterEdit(tmpDir, file, { content, waitMs: 1500 })
    expect(diags).not.toBeNull()
    expect(diags).toHaveLength(2)

    const summary = formatDiagnosticsSummary(file, diags)
    expect(summary).toContain('[LSP Diagnostics] broken.ts (2):')
    // Error severity must sort before Warning severity even if pushed second
    const errIdx = summary.indexOf('[Error] line 2:')
    const warnIdx = summary.indexOf('[Warning] line 1:')
    expect(errIdx).toBeGreaterThan(-1)
    expect(warnIdx).toBeGreaterThan(errIdx)
    expect(summary).toContain('Syntax error near BAD_SYNTAX')
  })

  it('formatDiagnosticsSummary caps output at maxItems (15) and omits the 16th+', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ severity: 1, line: i, message: `err ${i}` }))
    const summary = formatDiagnosticsSummary('big.js', many, { maxItems: 15 })
    expect(summary).toContain('[LSP Diagnostics] big.js (20):')
    const diagLines = summary.split('\n').filter((line) => line.startsWith('  - [Error] line '))
    expect(diagLines).toHaveLength(15)
    expect(summary).toContain('err 14')
    expect(summary).not.toContain('err 15')
    expect(summary).not.toContain('err 19')
    expect(summary).toContain('... (+5 more)')
  })

  it('caches ENOENT unavailable languages across repeated calls and resets on disposeAll()', async () => {
    configureServer('python', { command: '__nonexistent_lsp_bin_aether__', args: [] })
    const pyFile = path.join(tmpDir, 'app.py')
    fs.writeFileSync(pyFile, 'x = 1\n', 'utf8')
    expect(isLanguageUnavailable('python')).toBe(false)

    const degraded = []
    const first = await diagnosticsAfterEdit(tmpDir, pyFile, {
      waitMs: 500,
      onDegraded: (evt) => degraded.push(evt),
    })
    expect(first).toBeNull()
    expect(isLanguageUnavailable('python')).toBe(true)
    expect(degraded).toHaveLength(1)
    expect(degraded[0].reason).toBe('missing')

    // Second call skips spawn immediately via cached unavailable status and does not emit a second missing event
    const t0 = Date.now()
    const second = await diagnosticsAfterEdit(tmpDir, pyFile, {
      waitMs: 500,
      onDegraded: (evt) => degraded.push(evt),
    })
    expect(second).toBeNull()
    expect(Date.now() - t0).toBeLessThan(200)
    expect(degraded).toHaveLength(2)
    expect(degraded[0].message).toContain('ENOENT')
    expect(degraded[1].message).toContain('unavailable')

    disposeAll()
    expect(isLanguageUnavailable('python')).toBe(false)
  })

  it('openDocument is idempotent once opened and syncDocument increments versions', async () => {
    const logFile = path.join(tmpDir, 'lsp-open-sync.jsonl')
    const client = createClient({
      command: process.execPath,
      args: [FIXTURE, `--log-file=${logFile}`],
      root: tmpDir,
    })
    try {
      const target = path.join(tmpDir, 'idemp.js')
      fs.writeFileSync(target, 'const a = 1\n', 'utf8')
      const uri = `file:///${target.replace(/\\/g, '/')}`

      await client.openDocument(uri, 'const a = 1\n', 'javascript')
      await client.openDocument(uri, 'const a = 1\n', 'javascript')
      await client.syncDocument(uri, 'const a = 2\n', 'javascript')
      await client.openDocument(uri, 'const a = 2\n', 'javascript')

      // Allow notification writes on fixture stdin to flush
      await new Promise((r) => setTimeout(r, 100))
      const entries = fs
        .readFileSync(logFile, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))

      const opens = entries.filter((e) => e.method === 'textDocument/didOpen')
      const changes = entries.filter((e) => e.method === 'textDocument/didChange')
      expect(opens).toHaveLength(1)
      expect(opens[0].version).toBe(1)
      expect(changes).toHaveLength(1)
      expect(changes[0].version).toBe(2)
    } finally {
      await client.dispose()
    }
  })

  it('clears cached diagnostics when pull diagnostics returns an empty list on a clean edit', async () => {
    configureServer('javascript', {
      command: process.execPath,
      args: [FIXTURE, '--push-diag', '--empty-pull-on-clean'],
    })
    const target = path.join(tmpDir, 'clean-pull.js')
    fs.writeFileSync(target, 'const a = 1\n// BAD_SYNTAX\n', 'utf8')

    const dirty = await diagnosticsAfterEdit(tmpDir, target, {
      content: 'const a = 1\n// BAD_SYNTAX\n',
      waitMs: 1500,
    })
    expect(Array.isArray(dirty)).toBe(true)
    expect(dirty.length).toBeGreaterThan(0)

    const cleanText = 'const a = 1\n'
    fs.writeFileSync(target, cleanText, 'utf8')
    const cleaned = await diagnosticsAfterEdit(tmpDir, target, {
      content: cleanText,
      waitMs: 300,
    })
    expect(cleaned).toEqual([])

    const cached = await diagnosticsWorkspace(tmpDir, target, { waitMs: 0 })
    expect(cached).toEqual([])
  })

  it('ignores stale publishDiagnostics from an older document version', async () => {
    configureServer('javascript', {
      command: process.execPath,
      args: [FIXTURE, '--push-diag', '--stale-push'],
    })
    const target = path.join(tmpDir, 'stale-ver.js')
    const dirtyText = 'const a = 1\n// BAD_SYNTAX\n'
    fs.writeFileSync(target, dirtyText, 'utf8')

    const v1 = await diagnosticsAfterEdit(tmpDir, target, {
      content: dirtyText,
      waitMs: 1500,
    })
    expect(Array.isArray(v1)).toBe(true)
    expect(v1.length).toBeGreaterThan(0)

    // v2 is clean; fixture emits stale version:1 diagnostic before version:2 empty list
    const cleanText = 'const a = 2\n'
    fs.writeFileSync(target, cleanText, 'utf8')
    const v2 = await diagnosticsAfterEdit(tmpDir, target, {
      content: cleanText,
      waitMs: 1500,
    })
    expect(v2).toEqual([])
  })

  it('resolves Windows executables with PATHEXT extensions and avoids extensionless POSIX shims', async () => {
    const binDir = path.join(tmpDir, 'win bin')
    fs.mkdirSync(binDir, { recursive: true })
    const posixShim = path.join(binDir, 'fake-lsp')
    const cmdShim = path.join(binDir, 'fake-lsp.cmd')
    fs.writeFileSync(posixShim, '#!/bin/sh\necho posix\n', 'utf8')
    fs.writeFileSync(
      cmdShim,
      `@echo off\r\n"${process.execPath}" "${FIXTURE}" --push-diag %*\r\n`,
      'utf8'
    )

    const prevPath = process.env.PATH
    process.env.PATH = prevPath ? `${binDir}${path.delimiter}${prevPath}` : binDir
    try {
      const resolved = resolveCommandOnPath('fake-lsp')
      if (process.platform === 'win32') {
        expect(resolved).toBe(cmdShim)
        expect(isCommandOnPath('fake-lsp')).toBe(true)

        // End-to-end spawn of a .cmd shim inside a path with spaces
        configureServer('javascript', { command: 'fake-lsp', args: [] })
        const target = path.join(tmpDir, 'cmd-shim.js')
        const content = 'const x = 1\n// BAD_SYNTAX\n'
        fs.writeFileSync(target, content, 'utf8')
        const diags = await diagnosticsAfterEdit(tmpDir, target, { content, waitMs: 1500 })
        expect(Array.isArray(diags)).toBe(true)
        expect(diags.some((d) => d.message.includes('BAD_SYNTAX'))).toBe(true)
      } else {
        expect(resolved).toBe(posixShim)
        expect(isCommandOnPath('fake-lsp')).toBe(true)
      }
    } finally {
      if (prevPath === undefined) delete process.env.PATH
      else process.env.PATH = prevPath
    }
  })

  it('bounds hanging server initialization under short deadline and keeps hanging pull non-fatal', async () => {
    const target = path.join(tmpDir, 'hang-diag.js')
    fs.writeFileSync(target, 'function hello() { return 1 }\n', 'utf8')

    // 1. Hanging pull diagnostics should finish within deadlineMs without killing the server
    configureServer('javascript', {
      command: process.execPath,
      args: [FIXTURE, '--hang-diag'],
    })
    // Pre-warm the server process so cold-start spawn doesn't consume the pull deadline
    const warmDefs = await definitionWorkspace(tmpDir, target, { line: 1, character: 1 })
    expect(Array.isArray(warmDefs)).toBe(true)

    const t0 = Date.now()
    const diags = await diagnosticsAfterEdit(tmpDir, target, {
      content: 'function hello() { return 2 }\n',
      waitMs: 150,
      deadlineMs: 450,
    })
    const elapsed = Date.now() - t0
    expect(elapsed).toBeLessThan(1500)
    expect(Array.isArray(diags) ? diags : []).toEqual([])

    // Server must remain alive after pull timeout
    const defs = await definitionWorkspace(tmpDir, target, { line: 1, character: 1 })
    expect(Array.isArray(defs)).toBe(true)
    expect(defs.length).toBeGreaterThan(0)
    disposeAll()

    // 2. Hanging initialization on write_file must return fast (never 8s), emit lsp_degraded once, and trigger cooldown
    const lspCjs = require('../electron/context/lspClient')
    lspCjs.configureServer('javascript', {
      command: process.execPath,
      args: [FIXTURE, '--hang-init'],
    })
    const { getTool } = require('../electron/tools/registry')
    const { setWorkspaceRootForSession, clearSessionWorkspaces } = require('../electron/tools/sandbox')
    const sid = 'lsp-hang-init-sess'
    setWorkspaceRootForSession(sid, tmpDir)
    const statusEvents = []
    try {
      const tInit0 = Date.now()
      const out1 = await getTool('write_file').run(
        { path: path.join(tmpDir, 'hang1.ts'), content: 'export const x = 1\n' },
        { sessionId: sid, agentMode: 'act', onStatus: (evt) => statusEvents.push(evt) }
      )
      const initElapsed = Date.now() - tInit0
      expect(out1).toContain('wrote ')
      expect(out1).not.toContain('[LSP Diagnostics]')
      expect(initElapsed).toBeLessThan(2000)
      expect(statusEvents.filter((e) => e.kind === 'lsp_degraded')).toHaveLength(1)

      // Second write while init is still pending stays bounded under deadline and does not spam onStatus
      const tCooldown0 = Date.now()
      const out2 = await getTool('write_file').run(
        { path: path.join(tmpDir, 'hang2.ts'), content: 'export const y = 2\n' },
        { sessionId: sid, agentMode: 'act', onStatus: (evt) => statusEvents.push(evt) }
      )
      expect(out2).toContain('wrote ')
      expect(Date.now() - tCooldown0).toBeLessThan(1500)
      expect(statusEvents.filter((e) => e.kind === 'lsp_degraded')).toHaveLength(1)

      // Missing binary fallback must NOT emit lsp_degraded to UI status
      lspCjs.configureServer('python', { command: '__nonexistent_lsp_bin_ui__', args: [] })
      const outPy = await getTool('write_file').run(
        { path: path.join(tmpDir, 'silent.py'), content: 'x = 1\n' },
        { sessionId: sid, agentMode: 'act', onStatus: (evt) => statusEvents.push(evt) }
      )
      expect(outPy).toContain('wrote ')
      expect(statusEvents.filter((e) => e.kind === 'lsp_degraded')).toHaveLength(1)
    } finally {
      lspCjs.disposeAll()
      clearSessionWorkspaces(sid)
    }
  })

  it('does not kill a slow-starting healthy server when post-write deadline expires', async () => {
    configureServer('javascript', {
      command: process.execPath,
      args: [FIXTURE, '--push-diag', '--slow-init=900'],
    })
    const target = path.join(tmpDir, 'slow-healthy.js')
    const content = 'const a = 1\n// BAD_SYNTAX\n'
    fs.writeFileSync(target, content, 'utf8')

    // First write expires before 900ms init completes -> returns null fast without killing server
    const t0 = Date.now()
    const first = await diagnosticsAfterEdit(tmpDir, target, {
      content,
      waitMs: 150,
      deadlineMs: 300,
    })
    expect(first).toBeNull()
    expect(Date.now() - t0).toBeLessThan(1000)

    // Allow the background initialize handshake to finish, then verify same client works
    await new Promise((r) => setTimeout(r, 1000))
    const second = await diagnosticsAfterEdit(tmpDir, target, {
      content,
      waitMs: 1000,
    })
    expect(Array.isArray(second)).toBe(true)
    expect(second.some((d) => d.message.includes('BAD_SYNTAX'))).toBe(true)
  })

  it('resolves npm %dp0% .cmd shims directly and rejects unsafe shell-operator shims', async () => {
    const shimDir = path.join(tmpDir, 'shim-cases')
    const nestedDir = path.join(shimDir, 'node_modules', 'pkg')
    fs.mkdirSync(nestedDir, { recursive: true })
    const targetJs = path.join(nestedDir, 'server.js')
    fs.copyFileSync(FIXTURE, targetJs)

    // 1. npm-style %dp0% shim resolves directly to process.execPath + targetJs
    const npmShim = path.join(shimDir, 'pkg-lsp.cmd')
    fs.writeFileSync(
      npmShim,
      `@ECHO off\r\n"%_prog%" "%dp0%\\node_modules\\pkg\\server.js" %*\r\n`,
      'utf8'
    )
    const resolvedNpm = resolveWindowsCmdShim(npmShim, ['--stdio'])
    expect(resolvedNpm).not.toBeNull()
    expect(resolvedNpm.file).toBe(process.execPath)
    expect(resolvedNpm.args).toEqual([targetJs, '--stdio'])

    // 2. Direct-executable shim resolves to exe + static args + forwarded args
    const directShim = path.join(shimDir, 'direct-lsp.cmd')
    fs.writeFileSync(
      directShim,
      `@echo off\r\n"${process.execPath}" "${targetJs}" --push-diag %*\r\n`,
      'utf8'
    )
    const resolvedDirect = resolveWindowsCmdShim(directShim, ['--extra'])
    expect(resolvedDirect).not.toBeNull()
    expect(resolvedDirect.file).toBe(process.execPath)
    expect(resolvedDirect.args).toEqual([targetJs, '--push-diag', '--extra'])

    // 3. Unsafe shell-operator shim is rejected cleanly without spawning cmd.exe
    const unsafeShim = path.join(shimDir, 'unsafe-lsp.cmd')
    fs.writeFileSync(
      unsafeShim,
      `@echo off\r\n"${process.execPath}" "${targetJs}" & echo INJECTED\r\n`,
      'utf8'
    )
    expect(resolveWindowsCmdShim(unsafeShim, ['--stdio'])).toBeNull()

    // 4. ELECTRON_RUN_AS_NODE=1 on process.execPath invocations (and omitted on normal binaries)
    expect(resolvedNpm.options.env?.ELECTRON_RUN_AS_NODE).toBe('1')
    const selfExecInv = buildSpawnInvocation(process.execPath, [FIXTURE, '--stdio'])
    expect(selfExecInv.options.env?.ELECTRON_RUN_AS_NODE).toBe('1')
    const otherBinInv = buildSpawnInvocation('gopls', [])
    expect(otherBinInv.options.env).toBeUndefined()

    // 5. npm shim preserves --require/--enable-source-maps interpreter args and rejects unexpandable %VAR%
    const bootJs = path.join(nestedDir, 'bootstrap.cjs')
    fs.writeFileSync(bootJs, '', 'utf8')
    const interpFlagsShim = path.join(shimDir, 'interp-flags.cmd')
    fs.writeFileSync(
      interpFlagsShim,
      `@ECHO off\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%" --enable-source-maps --require "%dp0%\\node_modules\\pkg\\bootstrap.cjs" "%dp0%\\node_modules\\pkg\\server.js" --stdio %*\r\n`,
      'utf8'
    )
    const resolvedInterp = resolveWindowsCmdShim(interpFlagsShim, ['--extra'])
    expect(resolvedInterp).not.toBeNull()
    expect(resolvedInterp.file).toBe(process.execPath)
    expect(resolvedInterp.args).toEqual(['--enable-source-maps', '--require', bootJs, targetJs, '--stdio', '--extra'])
    expect(resolvedInterp.options.env?.ELECTRON_RUN_AS_NODE).toBe('1')

    const unexpandedVarShim = path.join(shimDir, 'unexpanded-var.cmd')
    fs.writeFileSync(
      unexpandedVarShim,
      `@ECHO off\r\n"%_prog%" --require "%UNEXPANDED_NODE_OPT%" "%dp0%\\node_modules\\pkg\\server.js" %*\r\n`,
      'utf8'
    )
    expect(resolveWindowsCmdShim(unexpandedVarShim, ['--stdio'])).toBeNull()

    // 6. cmd-shim 9.0.2 `set PATHEXT=... &` boilerplate accepted; arbitrary `set EVIL=1 &` rejected
    const shim902 = path.join(shimDir, 'cmd-shim-902.cmd')
    fs.writeFileSync(
      shim902,
      `@ECHO off\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & set PATHEXT=%PATHEXT:;.JS;=;% & "%_prog%" "%dp0%\\node_modules\\pkg\\server.js" %*\r\n`,
      'utf8'
    )
    const resolved902 = resolveWindowsCmdShim(shim902, ['--stdio'])
    expect(resolved902).not.toBeNull()
    expect(resolved902.file).toBe(process.execPath)
    expect(resolved902.args).toEqual([targetJs, '--stdio'])

    const evilSetShim = path.join(shimDir, 'evil-set.cmd')
    fs.writeFileSync(
      evilSetShim,
      `@ECHO off\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & set EVIL=1 & "%_prog%" "%dp0%\\node_modules\\pkg\\server.js" %*\r\n`,
      'utf8'
    )
    expect(resolveWindowsCmdShim(evilSetShim, ['--stdio'])).toBeNull()

    // 7. --require="%dp0%\bootstrap.cjs" and --require "%dp0%\bootstrap.cjs" keep server.js entrypoint; missing entrypoint with --require rejected
    const eqReqShim = path.join(shimDir, 'eq-require.cmd')
    fs.writeFileSync(
      eqReqShim,
      `@ECHO off\r\n"%_prog%" --require="%dp0%\\node_modules\\pkg\\bootstrap.cjs" "%dp0%\\node_modules\\pkg\\server.js" %*\r\n`,
      'utf8'
    )
    const resolvedEq = resolveWindowsCmdShim(eqReqShim, ['--stdio'])
    expect(resolvedEq).not.toBeNull()
    expect(resolvedEq.args).toEqual([`--require=${bootJs}`, targetJs, '--stdio'])

    const missingEntryWithReqShim = path.join(shimDir, 'missing-entry-req.cmd')
    fs.writeFileSync(
      missingEntryWithReqShim,
      `@ECHO off\r\n"%_prog%" --require "%dp0%\\node_modules\\pkg\\bootstrap.cjs"\r\n`,
      'utf8'
    )
    expect(resolveWindowsCmdShim(missingEntryWithReqShim, ['--stdio'])).toBeNull()

    if (process.platform === 'win32') {
      configureServer('javascript', { command: unsafeShim, args: [] })
      const target = path.join(tmpDir, 'unsafe-target.js')
      fs.writeFileSync(target, 'const x = 1\n', 'utf8')
      const res = await diagnosticsAfterEdit(tmpDir, target, { content: 'const x = 1\n', waitMs: 300 })
      expect(res).toBeNull()
    }
  })

  it('syncs pending writes once slow init completes and preserves last write B over A during startup', async () => {
    // 1. Single write during gated init: returns null at deadline yet auto-syncs didOpen once gate opens
    const gate1 = path.join(tmpDir, 'init-gate-1.flag')
    const log1 = path.join(tmpDir, 'slow-single-sync.jsonl')
    configureServer('javascript', {
      command: process.execPath,
      args: [FIXTURE, '--push-diag', `--gate-init-file=${gate1}`, `--log-file=${log1}`],
    })
    const singleFile = path.join(tmpDir, 'single-slow.js')
    const singleText = 'const onlyWrite = 42\n'
    fs.writeFileSync(singleFile, singleText, 'utf8')
    const singleRes = await diagnosticsAfterEdit(tmpDir, singleFile, {
      content: singleText,
      waitMs: 50,
      deadlineMs: 150,
    })
    expect(singleRes).toBeNull()
    fs.writeFileSync(gate1, 'open', 'utf8')
    const log1Entries = await waitForLogEntries(log1, (entries) =>
      entries.some((e) => e.method === 'textDocument/didOpen')
    )
    const singleOpen = log1Entries.find((e) => e.method === 'textDocument/didOpen')
    expect(singleOpen).toBeTruthy()
    expect(singleOpen.text).toBe(singleText)
    disposeAll()

    // 2. Write A (BAD_SYNTAX) during gated init followed by debounced write B (clean) keeps B
    const lspCjs = require('../electron/context/lspClient')
    const gate2 = path.join(tmpDir, 'init-gate-2.flag')
    const log2 = path.join(tmpDir, 'slow-ab-sync.jsonl')
    lspCjs.configureServer('javascript', {
      command: process.execPath,
      args: [FIXTURE, '--push-diag', `--gate-init-file=${gate2}`, `--log-file=${log2}`],
    })
    const { getTool } = require('../electron/tools/registry')
    const { setWorkspaceRootForSession, clearSessionWorkspaces } = require('../electron/tools/sandbox')
    const sid = 'lsp-ab-startup-sess'
    setWorkspaceRootForSession(sid, tmpDir)
    let fakeNow = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeNow)
    const syncSpy = vi.spyOn(lspCjs, 'syncDocumentAfterEdit')
    const diagSpy = vi.spyOn(lspCjs, 'diagnosticsAfterEdit')
    try {
      const abFile = path.join(tmpDir, 'ab-order.ts')
      const textA = 'export const v = 1 // BAD_SYNTAX\n'
      const textB = 'export const v = 2 // CLEAN\n'
      const pA = getTool('write_file').run(
        { path: abFile, content: textA },
        { sessionId: sid, agentMode: 'act', viaScript: true, lspWaitMs: 50, lspDeadlineMs: 150 }
      )
      await waitForLogEntries(log2, (entries) => entries.some((e) => e.method === 'initialize'))
      fakeNow += 50
      const pB = getTool('write_file').run(
        { path: abFile, content: textB },
        { sessionId: sid, agentMode: 'act', viaScript: true, lspWaitMs: 50, lspDeadlineMs: 150 }
      )
      await Promise.all([pA, pB])
      expect(syncSpy).toHaveBeenCalledTimes(1)
      expect(diagSpy).toHaveBeenCalledTimes(1)
      fs.writeFileSync(gate2, 'open', 'utf8')
      const log2Entries = await waitForLogEntries(log2, (entries) =>
        entries.some((e) => e.method === 'textDocument/didOpen' || e.method === 'textDocument/didChange')
      )
      const docSyncs = log2Entries.filter((e) => e.method === 'textDocument/didOpen' || e.method === 'textDocument/didChange')
      expect(docSyncs.length).toBeGreaterThanOrEqual(1)
      expect(docSyncs[docSyncs.length - 1].text).toBe(textB)
    } finally {
      syncSpy.mockRestore()
      diagSpy.mockRestore()
      nowSpy.mockRestore()
      lspCjs.disposeAll()
      clearSessionWorkspaces(sid)
    }
  })

  it('ignores late stdout data from an exited process after client restart', async () => {
    const childProcess = require('child_process')
    const lspCjs = require('../electron/context/lspClient')
    const autoReplyInit = (msg, proc) => {
      if (msg.method === 'initialize') {
        proc.stdout.emit('data', Buffer.from(encodeMessage({ jsonrpc: '2.0', id: msg.id, result: { capabilities: {} } }), 'utf8'))
      }
    }
    const proc1 = makeFakeLspProc({ onMessage: autoReplyInit })
    const proc2 = makeFakeLspProc({ onMessage: autoReplyInit })
    const spawnSpy = vi.spyOn(childProcess, 'spawn')
      .mockImplementationOnce(() => proc1)
      .mockImplementationOnce(() => proc2)

    const client = lspCjs.createClient({ command: process.execPath, args: [FIXTURE], root: tmpDir })
    try {
      const targetUri = `file:///${path.join(tmpDir, 'stale-proc.js').replace(/\\/g, '/')}`
      expect(await client._ensureStarted()).toBe(true)

      // Exit proc1 and restart client onto proc2
      proc1.emit('exit', 0, null)
      expect(await client._ensureStarted()).toBe(true)
      expect(spawnSpy).toHaveBeenCalledTimes(2)

      // Emit late diagnostic on exited proc1.stdout directly through the production listener
      const lateFrame = Buffer.from(encodeMessage({
        jsonrpc: '2.0',
        method: 'textDocument/publishDiagnostics',
        params: {
          uri: targetUri,
          version: 1,
          diagnostics: [{ severity: 1, message: 'LATE_EXITED_PROC_ERR', range: { start: { line: 0, character: 0 } } }],
        },
      }), 'utf8')
      proc1.stdout.emit('data', lateFrame)
      expect(client._diagnosticsByUri.size).toBe(0)
      expect(client._unversionedPushByUri.size).toBe(0)

      // Emit diagnostic on active proc2.stdout -> accepted by production listener
      const freshFrame = Buffer.from(encodeMessage({
        jsonrpc: '2.0',
        method: 'textDocument/publishDiagnostics',
        params: {
          uri: targetUri,
          version: 1,
          diagnostics: [{ severity: 1, message: 'FRESH_PROC2_ERR', range: { start: { line: 0, character: 0 } } }],
        },
      }), 'utf8')
      proc2.stdout.emit('data', freshFrame)
      expect(client._diagnosticsByUri.size).toBe(1)
    } finally {
      client.dispose()
      spawnSpy.mockRestore()
    }
  })

  it('handles proc.stdin async errors cleanly and fails invalidated sync writes', async () => {
    const childProcess = require('child_process')
    const lspCjs = require('../electron/context/lspClient')
    const makeReadyFakeProc = () => makeFakeLspProc({
      onMessage: (msg, p) => {
        if (msg.method === 'initialize') {
          p.stdout.emit('data', Buffer.from(encodeMessage({ jsonrpc: '2.0', id: msg.id, result: { capabilities: {} } }), 'utf8'))
        } else if (msg.method === 'textDocument/definition') {
          p.stdout.emit('data', Buffer.from(encodeMessage({ jsonrpc: '2.0', id: msg.id, result: [] }), 'utf8'))
        }
      },
    })
    const proc1 = makeReadyFakeProc()
    const proc2 = makeReadyFakeProc()
    const spawnSpy = vi.spyOn(childProcess, 'spawn')
      .mockImplementationOnce(() => proc1)
      .mockImplementationOnce(() => proc2)
    lspCjs.configureServer('javascript', { command: process.execPath, args: [FIXTURE] })
    const target = path.join(tmpDir, 'stdin-err.js')
    fs.writeFileSync(target, 'const x = 1\n', 'utf8')
    const uri = `file:///${target.replace(/\\/g, '/')}`

    try {
      // 1. Cached workspace client torn down by async proc1.stdin error -> syncDocumentAfterEdit returns false
      expect(await lspCjs.definitionWorkspace(tmpDir, target, { line: 1, character: 1 })).toEqual([])
      proc1.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
      expect(lspCjs.syncDocumentAfterEdit(tmpDir, target, { content: 'const x = 2\n' })).toBe(false)

      // 2. Direct client torn down by proc2.stdin error -> _syncDocumentSync returns null and _send rejects
      const client = lspCjs.createClient({ command: process.execPath, args: [FIXTURE], root: tmpDir })
      expect(await client._ensureStarted()).toBe(true)
      proc2.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
      expect(client._initialized).toBe(false)
      expect(client._syncDocumentSync(uri, 'const x = 2\n', 'javascript')).toBeNull()
      await expect(client._send('workspace/symbol', { query: 'x' })).rejects.toThrow(/stdin/i)
      client.dispose()
    } finally {
      lspCjs.disposeAll()
      spawnSpy.mockRestore()
    }
  })

  it('settles in-flight push waiter to null when server exits cleanly before responding', async () => {
    const childProcess = require('child_process')
    const lspCjs = require('../electron/context/lspClient')
    let spawnCount = 0
    const proc1 = makeFakeLspProc({
      onMessage: (msg, p) => {
        if (msg.method === 'initialize') {
          p.stdout.emit('data', Buffer.from(encodeMessage({ jsonrpc: '2.0', id: msg.id, result: { capabilities: {} } }), 'utf8'))
        } else if (msg.method === 'textDocument/didSave') {
          // Exit with zero _pending requests right after sync
          setImmediate(() => p.emit('exit', 0, null))
        }
      },
    })
    const proc2 = makeFakeLspProc({
      onMessage: (msg, p) => {
        if (msg.method === 'initialize') {
          p.stdout.emit('data', Buffer.from(encodeMessage({ jsonrpc: '2.0', id: msg.id, result: { capabilities: {} } }), 'utf8'))
        } else if (msg.method === 'textDocument/didOpen' || msg.method === 'textDocument/didChange') {
          const uri = msg.params.textDocument.uri
          const version = msg.params.textDocument.version
          p.stdout.emit('data', Buffer.from(encodeMessage({
            jsonrpc: '2.0',
            method: 'textDocument/publishDiagnostics',
            params: {
              uri,
              version,
              diagnostics: [{ severity: 1, message: 'Syntax error near BAD_SYNTAX', range: { start: { line: 1, character: 0 } } }],
            },
          }), 'utf8'))
        }
      },
    })
    const spawnSpy = vi.spyOn(childProcess, 'spawn').mockImplementation(() => {
      spawnCount++
      return spawnCount === 1 ? proc1 : proc2
    })
    lspCjs.configureServer('javascript', { command: process.execPath, args: [FIXTURE] })
    const target = path.join(tmpDir, 'exit-mid-wait.js')
    const content = 'const x = 1\n// BAD_SYNTAX\n'
    fs.writeFileSync(target, content, 'utf8')

    try {
      // Write 1: proc1 exits cleanly with _pending.size === 0 while push waiter is active -> settles to null promptly
      const t0 = Date.now()
      const res1 = await lspCjs.diagnosticsAfterEdit(tmpDir, target, { content, waitMs: 2500, deadlineMs: 3000 })
      expect(res1).toBeNull()
      expect(Date.now() - t0).toBeLessThan(1500)

      // Write 2: fresh proc2 spawns and returns BAD_SYNTAX
      const res2 = await lspCjs.diagnosticsAfterEdit(tmpDir, target, { content, waitMs: 1500 })
      expect(Array.isArray(res2)).toBe(true)
      expect(res2.some((d) => d.message.includes('BAD_SYNTAX'))).toBe(true)
    } finally {
      lspCjs.disposeAll()
      spawnSpy.mockRestore()
    }
  })

  it('sends ranged didChange for incremental textDocumentSync (2) and full text for Full sync (1)', async () => {
    const childProcess = require('child_process')
    const lspCjs = require('../electron/context/lspClient')
    const recordedChanges = []
    const makeSyncProc = (syncKind) => makeFakeLspProc({
      onMessage: (msg, p) => {
        if (msg.method === 'initialize') {
          p.stdout.emit('data', Buffer.from(encodeMessage({
            jsonrpc: '2.0',
            id: msg.id,
            result: { capabilities: { textDocumentSync: syncKind } },
          }), 'utf8'))
        } else if (msg.method === 'textDocument/didChange') {
          recordedChanges.push({ syncKind, changes: msg.params.contentChanges })
        }
      },
    })
    const incProc = makeSyncProc(2)
    const fullProc = makeSyncProc(1)
    const spawnSpy = vi.spyOn(childProcess, 'spawn')
      .mockImplementationOnce(() => incProc)
      .mockImplementationOnce(() => fullProc)

    const target = path.join(tmpDir, 'sync-kind.js')
    const uri = `file:///${target.replace(/\\/g, '/')}`
    const incClient = lspCjs.createClient({ command: process.execPath, args: [FIXTURE], root: tmpDir })
    const fullClient = lspCjs.createClient({ command: process.execPath, args: [FIXTURE], root: tmpDir })
    try {
      await incClient.syncDocument(uri, 'line0\nline1!', 'javascript')
      await incClient.syncDocument(uri, 'updated', 'javascript')

      await fullClient.syncDocument(uri, 'line0\nline1!', 'javascript')
      await fullClient.syncDocument(uri, 'updated', 'javascript')

      expect(recordedChanges).toHaveLength(2)
      expect(recordedChanges[0]).toEqual({
        syncKind: 2,
        changes: [{
          range: { start: { line: 0, character: 0 }, end: { line: 1, character: 6 } },
          text: 'updated',
        }],
      })
      expect(recordedChanges[1]).toEqual({
        syncKind: 1,
        changes: [{ text: 'updated' }],
      })
    } finally {
      incClient.dispose()
      fullClient.dispose()
      spawnSpy.mockRestore()
    }
  })

  it('returns empty array for superseded write A when write B with BAD_SYNTAX lands mid-wait', async () => {
    const childProcess = require('child_process')
    const lspCjs = require('../electron/context/lspClient')
    const target = path.join(tmpDir, 'superseded-a.js')
    fs.writeFileSync(target, 'const a = 1\n', 'utf8')
    let didOpenSeen = false
    let notifyBReady
    const bReady = new Promise((r) => { notifyBReady = r })

    const proc = makeFakeLspProc({
      onMessage: (msg, p) => {
        if (msg.method === 'initialize') {
          p.stdout.emit('data', Buffer.from(encodeMessage({ jsonrpc: '2.0', id: msg.id, result: { capabilities: {} } }), 'utf8'))
        } else if (msg.method === 'textDocument/didOpen') {
          didOpenSeen = true
        } else if (msg.method === 'textDocument/didChange') {
          // Only push BAD_SYNTAX for version 2 (write B)
          const uri = msg.params.textDocument.uri
          const version = msg.params.textDocument.version
          notifyBReady?.()
          setTimeout(() => {
            p.stdout.emit('data', Buffer.from(encodeMessage({
              jsonrpc: '2.0',
              method: 'textDocument/publishDiagnostics',
              params: {
                uri,
                version,
                diagnostics: [{ severity: 1, message: 'Syntax error near BAD_SYNTAX', range: { start: { line: 0, character: 0 } } }],
              },
            }), 'utf8'))
          }, 20)
        }
      },
    })
    const spawnSpy = vi.spyOn(childProcess, 'spawn').mockImplementationOnce(() => proc)
    lspCjs.configureServer('javascript', { command: process.execPath, args: [FIXTURE] })

    try {
      const pA = lspCjs.diagnosticsAfterEdit(tmpDir, target, {
        content: 'const a = 1\n',
        waitMs: 400,
        deadlineMs: 600,
      })
      // Wait until write A sent didOpen (and is inside pushWaiter), then send write B
      await waitForCondition(() => didOpenSeen)
      expect(lspCjs.syncDocumentAfterEdit(tmpDir, target, { content: '// BAD_SYNTAX\n' })).toBe(true)
      await bReady
      const resA = await pA
      expect(resA).toEqual([])
    } finally {
      lspCjs.disposeAll()
      spawnSpy.mockRestore()
    }
  })

  it('handles unsupported pull (-32601) without closing client or triggering cooldown', async () => {
    const childProcess = require('child_process')
    const lspCjs = require('../electron/context/lspClient')
    const proc = makeFakeLspProc({
      onMessage: (msg, p) => {
        if (msg.method === 'initialize') {
          p.stdout.emit('data', Buffer.from(encodeMessage({ jsonrpc: '2.0', id: msg.id, result: { capabilities: {} } }), 'utf8'))
        } else if (msg.method === 'textDocument/diagnostic') {
          p.stdout.emit('data', Buffer.from(encodeMessage({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32601, message: 'Method not found' },
          }), 'utf8'))
        } else if (msg.method === 'textDocument/definition') {
          p.stdout.emit('data', Buffer.from(encodeMessage({
            jsonrpc: '2.0',
            id: msg.id,
            result: { uri: 'file:///workspace/src/app.js', range: { start: { line: 2, character: 0 } } },
          }), 'utf8'))
        }
      },
    })
    const spawnSpy = vi.spyOn(childProcess, 'spawn').mockImplementation(() => proc)
    lspCjs.configureServer('javascript', { command: process.execPath, args: [FIXTURE] })
    const target = path.join(tmpDir, 'no-pull.js')
    fs.writeFileSync(target, 'const x = 1\n', 'utf8')

    try {
      const diags = await lspCjs.diagnosticsWorkspace(tmpDir, target)
      expect(diags).toEqual([])
      // Client must remain open and NOT in cooldown: definitionWorkspace reuses the same proc
      const defs = await lspCjs.definitionWorkspace(tmpDir, target, { line: 1, character: 1 })
      expect(Array.isArray(defs)).toBe(true)
      expect(defs).toHaveLength(1)
      expect(spawnSpy).toHaveBeenCalledTimes(1)
    } finally {
      lspCjs.disposeAll()
      spawnSpy.mockRestore()
    }
  })

  it('does not write serverCooldowns when withClient catches an error on a disposed client', async () => {
    const childProcess = require('child_process')
    const lspCjs = require('../electron/context/lspClient')
    let spawnCount = 0
    const makeDefProc = () => makeFakeLspProc({
      onMessage: (msg, p) => {
        if (msg.method === 'initialize') {
          p.stdout.emit('data', Buffer.from(encodeMessage({ jsonrpc: '2.0', id: msg.id, result: { capabilities: {} } }), 'utf8'))
        } else if (msg.method === 'textDocument/definition') {
          if (spawnCount === 1) {
            // Dispose while definition request is in flight -> _send rejects with 'LSP client disposed'
            setImmediate(() => lspCjs.disposeAll())
          } else {
            p.stdout.emit('data', Buffer.from(encodeMessage({
              jsonrpc: '2.0',
              id: msg.id,
              result: { uri: 'file:///workspace/src/app.js', range: { start: { line: 4, character: 0 } } },
            }), 'utf8'))
          }
        }
      },
    })
    const spawnSpy = vi.spyOn(childProcess, 'spawn').mockImplementation(() => {
      spawnCount++
      return makeDefProc()
    })
    lspCjs.configureServer('javascript', { command: process.execPath, args: [FIXTURE] })
    const target = path.join(tmpDir, 'disposed-err.js')
    fs.writeFileSync(target, 'const x = 1\n', 'utf8')

    try {
      const first = await lspCjs.definitionWorkspace(tmpDir, target, { line: 1, character: 1 })
      expect(first).toBeNull()

      // Must NOT have entered cooldown: immediate follow-up spawns proc2 and succeeds
      const second = await lspCjs.definitionWorkspace(tmpDir, target, { line: 1, character: 1 })
      expect(Array.isArray(second)).toBe(true)
      expect(second).toHaveLength(1)
      expect(spawnSpy).toHaveBeenCalledTimes(2)
    } finally {
      lspCjs.disposeAll()
      spawnSpy.mockRestore()
    }
  })

  it('reports and clears diagnostics for unversioned-only push servers', async () => {
    configureServer('javascript', {
      command: process.execPath,
      args: [FIXTURE, '--push-unversioned-only'],
    })
    const target = path.join(tmpDir, 'unversioned-only.js')
    const dirty = 'const a = 1\n// BAD_SYNTAX\n'
    fs.writeFileSync(target, dirty, 'utf8')

    const v1 = await diagnosticsAfterEdit(tmpDir, target, { content: dirty, waitMs: 300 })
    expect(Array.isArray(v1)).toBe(true)
    expect(v1.some((d) => d.message.includes('BAD_SYNTAX'))).toBe(true)

    const clean = 'const a = 1\n'
    fs.writeFileSync(target, clean, 'utf8')
    const v2 = await diagnosticsAfterEdit(tmpDir, target, { content: clean, waitMs: 300 })
    expect(v2).toEqual([])
  })

  it('does not settle versioned push waits with an unversioned publishDiagnostics', async () => {
    configureServer('javascript', {
      command: process.execPath,
      args: [FIXTURE, '--push-diag', '--unversioned-stale-push'],
    })
    const target = path.join(tmpDir, 'unversioned-push.js')
    const dirty = 'const a = 1\n// BAD_SYNTAX\n'
    fs.writeFileSync(target, dirty, 'utf8')

    const v1 = await diagnosticsAfterEdit(tmpDir, target, { content: dirty, waitMs: 1500 })
    expect(Array.isArray(v1) && v1.length > 0).toBe(true)

    const clean = 'const a = 2\n'
    fs.writeFileSync(target, clean, 'utf8')
    const v2 = await diagnosticsAfterEdit(tmpDir, target, { content: clean, waitMs: 1500 })
    expect(v2).toEqual([])
  })

  it('clears _docVersions when server process exits so the restarted server receives didOpen', async () => {
    const marker = path.join(tmpDir, 'exited-once.flag')
    const logFile = path.join(tmpDir, 'restart-didopen.jsonl')
    const client = createClient({
      command: process.execPath,
      args: [FIXTURE, `--exit-once-marker=${marker}`, `--log-file=${logFile}`],
      root: tmpDir,
    })
    try {
      const target = path.join(tmpDir, 'restart-sync.js')
      fs.writeFileSync(target, 'const a = 1\n', 'utf8')
      const uri = `file:///${target.replace(/\\/g, '/')}`

      await client.syncDocument(uri, 'const a = 1\n', 'javascript')
      // Wait for first process to exit on didSave
      await waitForCondition(() => fs.existsSync(marker) && !client._proc)

      // Sync again on the same LspClient instance: must restart and send didOpen (version 1)
      await client.syncDocument(uri, 'const a = 2\n', 'javascript')
      const entries = await waitForLogEntries(logFile, (list) =>
        list.filter((e) => e.method === 'textDocument/didOpen').length >= 2
      )

      const opens = entries.filter((e) => e.method === 'textDocument/didOpen')
      const changes = entries.filter((e) => e.method === 'textDocument/didChange')
      expect(opens).toHaveLength(2)
      expect(opens[1].version).toBe(1)
      expect(changes).toHaveLength(0)
    } finally {
      await client.dispose()
    }
  })

  it('ignores stale pull diagnostics responses if the document changed while pulling', async () => {
    const client = createClient({
      command: process.execPath,
      args: [FIXTURE, '--empty-pull-on-clean', '--slow-pull=250'],
      root: tmpDir,
    })
    try {
      const target = path.join(tmpDir, 'stale-pull.js')
      fs.writeFileSync(target, 'const a = 1\n// BAD_SYNTAX\n', 'utf8')
      const uri = `file:///${target.replace(/\\/g, '/')}`

      await client.syncDocument(uri, 'const a = 1\n// BAD_SYNTAX\n', 'javascript')
      // Allow didOpen to arrive at fixture before starting v1 pull
      await new Promise((r) => setTimeout(r, 60))

      const v1PullPromise = client._pullDiagnostics(uri, { timeoutMs: 2000 })
      // Bump document to clean v2 while v1 pull is in flight
      await new Promise((r) => setTimeout(r, 40))
      await client.syncDocument(uri, 'const a = 2\n', 'javascript')

      const v1Res = await v1PullPromise
      expect(v1Res.authoritative).toBe(false)

      // Fresh pull on v2 reflects clean buffer and was never overwritten by v1
      const v2Res = await client.getDiagnostics(uri)
      expect(v2Res).toEqual([])
    } finally {
      await client.dispose()
    }
  })

  it('viaScript debounce skips wait/pull but still syncs latest document text to active LSP', async () => {
    const lspCjs = require('../electron/context/lspClient')
    const logFile = path.join(tmpDir, 'via-script-debounce.jsonl')
    lspCjs.configureServer('javascript', {
      command: process.execPath,
      args: [FIXTURE, '--push-diag', '--empty-pull-on-clean', `--log-file=${logFile}`],
    })
    const { getTool } = require('../electron/tools/registry')
    const { setWorkspaceRootForSession, clearSessionWorkspaces } = require('../electron/tools/sandbox')
    const sid = 'lsp-script-debounce-sess'
    setWorkspaceRootForSession(sid, tmpDir)
    let fakeNow = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeNow)
    try {
      const target = path.join(tmpDir, 'script-debounced.ts')
      // 1st write inside script has BAD_SYNTAX
      const out1 = await getTool('write_file').run(
        { path: target, content: 'export const x = 1\n// BAD_SYNTAX\n' },
        { sessionId: sid, agentMode: 'act', viaScript: true, lspWaitMs: 1500, lspDeadlineMs: 1800 }
      )
      expect(out1).toContain('[LSP Diagnostics] script-debounced.ts')
      const postWrite1Entries = await waitForLogEntries(logFile, (list) =>
        list.some((e) => e.method === 'textDocument/didOpen')
      )
      const pullsAfterWrite1 = postWrite1Entries.filter((e) => e.method === 'textDocument/diagnostic').length

      // 2nd rapid write fixes it deterministically 50ms into the 200ms debounce window:
      // debounced wait skips suffix, yet syncDocumentAfterEdit still sends clean buffer.
      fakeNow += 50
      const out2 = await getTool('write_file').run(
        { path: target, content: 'export const x = 1\n' },
        { sessionId: sid, agentMode: 'act', viaScript: true, lspWaitMs: 1500, lspDeadlineMs: 1800 }
      )
      expect(out2).toContain('wrote ')
      expect(out2).not.toContain('[LSP Diagnostics]')

      // Before explicit diagnosticsWorkspace, fixture log must show didChange from 2nd write
      // and ZERO additional textDocument/diagnostic pull requests caused by the 2nd write.
      const preEntries = await waitForLogEntries(logFile, (list) =>
        list.some((e) => e.method === 'textDocument/didChange')
      )
      expect(preEntries.filter((e) => e.method === 'textDocument/didChange')).toHaveLength(1)
      expect(preEntries.filter((e) => e.method === 'textDocument/diagnostic')).toHaveLength(pullsAfterWrite1)

      const diags = await lspCjs.diagnosticsWorkspace(tmpDir, target)
      expect(diags).toEqual([])
    } finally {
      nowSpy.mockRestore()
      lspCjs.disposeAll()
      clearSessionWorkspaces(sid)
    }
  })

  it('write_file, edit_file, and apply_patch append [LSP Diagnostics] unless lsp.autoDiagnostics is disabled', async () => {
    const lspCjs = require('../electron/context/lspClient')
    lspCjs.configureServer('javascript', {
      command: process.execPath,
      args: [FIXTURE, '--push-diag'],
    })
    const { getTool } = require('../electron/tools/registry')
    const { setWorkspaceRootForSession, clearSessionWorkspaces } = require('../electron/tools/sandbox')
    const sid = 'lsp-post-write-sess'
    setWorkspaceRootForSession(sid, tmpDir)
    try {
      const target = path.join(tmpDir, 'mod.ts')
      const wOut = await getTool('write_file').run(
        { path: target, content: 'export const v = 1\n// BAD_SYNTAX\n' },
        { sessionId: sid, agentMode: 'act', lspWaitMs: 1500 }
      )
      expect(wOut).toContain('wrote ')
      expect(wOut).toContain('[LSP Diagnostics] mod.ts')

      const eOut = await getTool('edit_file').run(
        { path: target, old_string: 'export const v = 1', new_string: 'export const v = 2' },
        { sessionId: sid, agentMode: 'act', lspWaitMs: 1500 }
      )
      expect(eOut).toContain('edited ')
      expect(eOut).toContain('[LSP Diagnostics] mod.ts')

      const pOut = await getTool('apply_patch').run(
        {
          path: target,
          patch: '<<<<<<< SEARCH\nexport const v = 2\n=======\nexport const v = 3\n>>>>>>> REPLACE',
        },
        { sessionId: sid, agentMode: 'act', lspWaitMs: 1500 }
      )
      expect(pOut).toContain('patched ')
      expect(pOut).toContain('[LSP Diagnostics] mod.ts')

      // Disabled via feature flag lsp.autoDiagnostics=0 -> no [LSP Diagnostics] suffix
      const dbDisabled = {
        getSetting: (k) => (k === 'feature_flag.lsp.autoDiagnostics' ? '0' : null),
      }
      const target2 = path.join(tmpDir, 'mod2.ts')
      const offOut = await getTool('write_file').run(
        { path: target2, content: 'export const v = 4\n// BAD_SYNTAX\n' },
        { sessionId: sid, agentMode: 'act', db: dbDisabled, lspWaitMs: 1500 }
      )
      expect(offOut).not.toContain('[LSP Diagnostics]')
    } finally {
      lspCjs.disposeAll()
      clearSessionWorkspaces(sid)
    }
  })
})