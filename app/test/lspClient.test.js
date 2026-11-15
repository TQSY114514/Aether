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
  resolveCommandOnPath,
  isCommandOnPath,
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
    process.env.PATH = binDir
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

      // Second write in the same session hits cooldown immediately and does not spam onStatus
      const tCooldown0 = Date.now()
      const out2 = await getTool('write_file').run(
        { path: path.join(tmpDir, 'hang2.ts'), content: 'export const y = 2\n' },
        { sessionId: sid, agentMode: 'act', onStatus: (evt) => statusEvents.push(evt) }
      )
      expect(out2).toContain('wrote ')
      expect(Date.now() - tCooldown0).toBeLessThan(500)
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