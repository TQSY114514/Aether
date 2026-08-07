// ───────────────────────────────────────────────────────────────────────────
// LSP fixture server (stdlib stdio JSON-RPC) for lspClient tests.
//
// Plain CommonJS on purpose: this file is spawned as a real child process by
// the tests (not imported by vitest), so it must be loadable with plain node.
//
// Modes (argv flags):
//   (default)  healthy — answers `initialize` and `workspace/symbol`
//   --slow     never answers `workspace/symbol` (exercises request timeout)
//   --crash    exits after `initialize` (exercises mid-request crash)
//   --defunct  exits with code 1 immediately (exercises handshake failure)
// ───────────────────────────────────────────────────────────────────────────

const SLOW = process.argv.includes('--slow')
const CRASH = process.argv.includes('--crash')
const DEFUNCT = process.argv.includes('--defunct')

if (DEFUNCT) {
  process.exit(1)
}

// Canned symbols for query "findMe" — includes a fuzzy extra (findMeAgain)
// that an exact-match client must drop, plus a duplicate same file+line entry
// that a client must dedupe.
const SYMBOLS = [
  { name: 'findMe', kind: 12, location: { uri: 'file:///workspace/src/app.js', range: { start: { line: 2, character: 0 }, end: { line: 4, character: 1 } } } },
  { name: 'findMe', kind: 12, location: { uri: 'file:///workspace/src/util.ts', range: { start: { line: 11, character: 2 }, end: { line: 11, character: 10 } } } },
  // Duplicate of the util.ts entry above (same file+line) — must be merged.
  { name: 'findMe', kind: 12, location: { uri: 'file:///workspace/src/util.ts', range: { start: { line: 11, character: 2 }, end: { line: 11, character: 10 } } } },
  // Fuzzy extra — exact-match filter must drop it.
  { name: 'findMeAgain', kind: 6, location: { uri: 'file:///workspace/src/util.ts', range: { start: { line: 20, character: 0 }, end: { line: 20, character: 9 } } } },
  // Different symbol — must be dropped by exact-name filter.
  { name: 'other', kind: 12, location: { uri: 'file:///workspace/src/app.js', range: { start: { line: 5, character: 0 }, end: { line: 5, character: 7 } } } },
]

function makeParser(onMessage) {
  let buffer = Buffer.alloc(0)
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    for (;;) {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return
      const header = buffer.slice(0, headerEnd).toString('utf8')
      const m = /Content-Length:\s*(\d+)/i.exec(header)
      if (!m) { buffer = buffer.slice(headerEnd + 4); continue }
      const len = parseInt(m[1], 10)
      const bodyStart = headerEnd + 4
      if (buffer.length < bodyStart + len) return
      const body = buffer.slice(bodyStart, bodyStart + len).toString('utf8')
      buffer = buffer.slice(bodyStart + len)
      try { onMessage(JSON.parse(body)) } catch { /* ignore malformed */ }
    }
  }
}

const write = (msg) => {
  const body = JSON.stringify(msg)
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
}

const handle = (msg) => {
  if (msg.method === 'initialize') {
    write({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        capabilities: { workspace: { symbol: { dynamicRegistration: false } } },
        serverInfo: { name: 'fixture-lsp', version: '1.0.0' },
      },
    })
    return
  }
  if (msg.method === 'initialized') return // notification
  if (msg.method === 'shutdown') {
    write({ jsonrpc: '2.0', id: msg.id, result: null })
    return
  }
  if (msg.method === 'exit') {
    process.exit(0)
    return
  }
  if (msg.method === 'workspace/symbol') {
    if (SLOW) return // never respond — exercises timeout
    if (CRASH) { process.exit(0); return }
    // Reply to the requested query with the canned symbols.
    write({ jsonrpc: '2.0', id: msg.id, result: SYMBOLS })
    return
  }
  // Unknown request — reply empty.
  if (msg.id !== undefined && msg.id !== null) {
    write({ jsonrpc: '2.0', id: msg.id, result: null })
  }
}

const onChunk = (chunk) => { const p = parser; p?.(chunk) }
let parser = null
process.stdin.on('data', (chunk) => {
  if (!parser) parser = makeParser(handle)
  parser(chunk)
})
process.stdin.on('end', () => process.exit(0))