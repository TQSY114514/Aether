// ───────────────────────────────────────────────────────────────────────────
// Tool-call argument parsing helpers (ported from Continue's safeParseToolCallArgs).
//
// Streamed tool-call arguments arrive as incremental JSON fragments; even in
// non-streaming mode some providers return args as a string that needs parsing.
// These helpers safely coerce a tool_call's `function.arguments` into an object
// and provide typed getters with clear error messages.
// ───────────────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────────
// Tool-call argument parsing and schema validation helpers.
//
// LLM-generated tool arguments are NEVER trusted blindly. Each call is validated
// against the tool's declared JSON schema before execution — this is the second
// layer of defense after sandbox (first layer: command blocklist + spawn-only).
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

module.exports = { safeParseToolCallArgs, getStringArg, getNumberArg, validateToolArgs }

// ─── JSON Schema validation (lightweight) ──────────────────────────────────
// Validates tool arguments against the OpenAI function-calling JSON Schema
// declared in each tool's `parameters` definition.
// Returns { ok: true } or { ok: false, errors: string[] }.
//
// This is a simple validator — we don't want a heavy dependency like ajv just
// for basic type checking. It handles: type, required, properties, minLength.
function validateToolArgs(args, schema) {
  if (!schema || schema.type !== 'object' || !schema.properties) return { ok: true }
  const errors = []

  // Check required fields
  if (schema.required) {
    for (const key of schema.required) {
      if (args[key] === undefined || args[key] === null || args[key] === '') {
        errors.push(`missing required field: "${key}"`)
      }
    }
  }

  // Check types of provided fields
  for (const [key, value] of Object.entries(args)) {
    const prop = schema.properties[key]
    if (!prop) continue // unknown field — allow (extensible)

    const expectedType = prop.type
    let actualType = typeof value

    // Handle type coercion for string fields
    if (expectedType === 'string' && value != null) {
      if (Array.isArray(value)) {
        errors.push(`"${key}" should be a string, got array`)
        continue
      }
      actualType = 'string' // value is coerced to string for this branch
      // Check minLength
      if (prop.minLength && String(value).length < prop.minLength) {
        errors.push(`"${key}" is too short (min ${prop.minLength} chars)`)
      }
      continue
    }

    if (expectedType === 'number' || expectedType === 'integer') {
      if (value != null && (typeof value !== 'number' || (expectedType === 'integer' && !Number.isInteger(value)))) {
        errors.push(`"${key}" should be ${expectedType}, got ${actualType}`)
      }
      continue
    }

    if (expectedType === 'boolean') {
      if (value != null && typeof value !== 'boolean') {
        errors.push(`"${key}" should be boolean, got ${actualType}`)
      }
      continue
    }

    if (expectedType === 'array') {
      if (!Array.isArray(value)) {
        errors.push(`"${key}" should be an array, got ${actualType}`)
      }
      continue
    }

    if (expectedType === 'object') {
      if (value != null && (typeof value !== 'object' || Array.isArray(value))) {
        errors.push(`"${key}" should be an object, got ${actualType}`)
      }
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true }
}
