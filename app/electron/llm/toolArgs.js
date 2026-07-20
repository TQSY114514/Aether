// ───────────────────────────────────────────────────────────────────────────
// Tool-call argument parsing helpers (ported from Continue's safeParseToolCallArgs).
//
// Streamed tool-call arguments arrive as incremental JSON fragments; even in
// non-streaming mode some providers return args as a string that needs parsing.
// These helpers safely coerce a tool_call's `function.arguments` into an object
// and provide typed getters with clear error messages.
// ───────────────────────────────────────────────────────────────────────────

// Coerce a tool_call's arguments field into a plain object. Handles three shapes:
// already-an-object (some SDKs), a JSON string, or an empty/garbage string.
function safeParseToolCallArgs(args) {
  if (args == null) return {}
  if (typeof args === 'object') return args
  if (typeof args === 'string') {
    const trimmed = args.trim()
    if (!trimmed) return {}
    try { return JSON.parse(trimmed) } catch { return {} }
  }
  return {}
}

function getStringArg(args, key) {
  const v = args[key]
  if (typeof v === 'string') return v
  if (v != null) return String(v)
  throw new Error(`expected string argument "${key}"`)
}

function getNumberArg(args, key) {
  const v = args[key]
  if (typeof v === 'number') return v
  const n = Number(v)
  if (!Number.isNaN(n) && v != null && v !== '') return n
  throw new Error(`expected number argument "${key}"`)
}

module.exports = { safeParseToolCallArgs, getStringArg, getNumberArg }
