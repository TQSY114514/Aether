// ─── lspClient tests ────────────────────────────────────────────────────────
// Covers the stdio JSON-RPC LSP client that enhances find_symbol:
//   - pure framing helpers (encodeMessage, MessageParser)
//   - a real child-process fixture LSP server (test/fixtures/lsp-server.js)
//     exercising workspace/symbol normalization, exact-name filtering,
//     deduplication, timeouts, mid-request crash, and graceful degradation
//     to null (so find_symbol falls back to the regex indexer).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  encodeMessage,
  MessageParser,
  extToLanguage,
  uriToFilePath,
  createClient,
  searchWorkspace,
  configureServer,
  disposeAll,
} from '../electron/context/lspClient'

const FIXTURE = path.join(__dirname, 'fixtures', 'lsp-server.js')

let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-client-test-'))
})

afterEach(() => {
  disposeAll()
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
    const result = await searchWorkspace(tmpDir, 'findMe', { language: 'python' })
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