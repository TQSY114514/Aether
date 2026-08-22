// ───────────────────────────────────────────────────────────────────────────
// Typed hashing for tool-call loop detection (inspired by OpenClaw
// tool-loop-detection.ts hashToolCall/hashToolOutcome).
//
// Key lessons encoded here (from OpenClaw #89090):
//   - argsHash and resultHash are computed separately.
//   - resultHash is SEMANTIC per tool kind: exec results hash only
//     {exitCode, timedOut, output-tail}; write results hash only "did it
//     change"; everything else strips volatile keys (fresh ids/timestamps)
//     before hashing — otherwise every send looks like progress and loop
//     detection never fires.
// ───────────────────────────────────────────────────────────────────────────
const crypto = require('crypto')

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  const keys = Object.keys(value).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}'
}

function _sha1(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12) }

function hashToolArgs(toolName, args) {
  let argStr
  try { argStr = stableStringify(typeof args === 'string' ? JSON.parse(args) : (args || {})) }
  catch { argStr = String(args) }
  return `${toolName}:${_sha1(argStr)}`
}

// Volatile keys stripped before hashing generic results (OpenClaw #89090).
const VOLATILE_RESULT_KEYS = new Set([
  'messageId', 'message_id', 'id', 'ts', 'timestamp', 'created_at', 'createdAt',
  'receipt', 'runId', 'run_id', 'idempotencyKey', 'idempotency_key',
  'requestId', 'request_id', 'nonce', 'elapsedMs', 'elapsed_ms',
])

const OUTPUT_TAIL_CHARS = 400 // long noisy output: only the tail identifies failure/success

function _stripVolatile(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(_stripVolatile)
  const out = {}
  for (const k of Object.keys(value).sort()) {
    if (VOLATILE_RESULT_KEYS.has(k)) continue
    out[k] = _stripVolatile(value[k])
  }
  return out
}

function _tail(s) {
  const str = String(s || '')
  return str.length <= OUTPUT_TAIL_CHARS ? str : str.slice(-OUTPUT_TAIL_CHARS)
}

function hashToolResult(toolName, result) {
  const r = result ?? {}
  // exec-like: any result carrying an exit code
  if (r.exitCode !== undefined || r.exit_code !== undefined) {
    const exitCode = r.exitCode ?? r.exit_code
    return `exec:${_sha1(stableStringify({ e: exitCode, t: !!r.timedOut, o: _tail(r.stdout ?? r.output ?? r.stderr) }))}`
  }
  // write-like: mutation tools — only whether state changed matters
  if (r.changed !== undefined) {
    return `write:${_sha1(String(!!r.changed))}`
  }
  // generic: strip volatile keys, hash the rest
  return `generic:${_sha1(stableStringify(_stripVolatile(r)))}`
}

module.exports = { stableStringify, hashToolArgs, hashToolResult, VOLATILE_RESULT_KEYS }
