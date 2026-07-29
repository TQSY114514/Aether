// ───────────────────────────────────────────────────────────────────────────
// Tool Call Repair — fixes malformed tool calls from LLMs before execution.
//
// Inspired by OpenClaw's `tool-call-repair` package. LLMs occasionally produce
// malformed tool calls: missing arguments, invalid JSON, truncated calls, or
// wrong parameter names. This module attempts to repair common failures so the
// agent loop doesn't break on a single bad call.
// ───────────────────────────────────────────────────────────────────────────

const builtin = require('../tools/registry')

const BUILTIN_NAMES = new Set(builtin.TOOLS.map(t => t.name))
const REQUIRED_PARAM_WHITELIST = ['path', 'command', 'query', 'content', 'pattern', 'tasks']

// Repair a single tool call object. Returns the repaired call, or null if
// unrecoverable (should be skipped).
function repairToolCall(tc) {
  if (!tc || !tc.function) return tc

  const name = String(tc.function.name || '').trim()
  if (!name) return null // can't repair a nameless call

  const tool = builtin.getTool(name)
  if (!tool) return tc // unknown tool — let the normal "unknown tool" error handle it

  // Repair arguments: if empty or not a string, try to build minimal args.
  let args = tc.function.arguments
  if (!args || typeof args !== 'string') {
    args = buildMinimalArgs(tool)
    if (!args) return null // can't build minimal args — skip
    return { ...tc, function: { ...tc.function, arguments: args } }
  }

  // If it looks like valid JSON, let it through (the model knows what it's doing).
  if (args.trim().startsWith('{') || args.trim().startsWith('[')) {
    try { JSON.parse(args) } catch {
      // Malformed JSON — try to repair common issues.
      args = repairMalformedJson(args, tool)
    }
  }

  return { ...tc, function: { ...tc.function, arguments: args } }
}

// Repair common JSON issues in tool arguments.
function repairMalformedJson(raw, tool) {
  let s = raw.trim()

  // Wrap bare string values: `"text"` → `{ "path": "text" }` for tools
  // that need a single required param.
  if (s.startsWith('"') || s.startsWith("'")) {
    const param = REQUIRED_PARAM_WHITELIST.find(p => tool.parameters.properties[p])
    if (param) return JSON.stringify({ [param]: s.replace(/^['"]|['"]$/g, '') })
  }

  // Fix common issue: missing quotes around keys.
  s = s.replace(/(\w+)\s*:/g, (_, k) => `"${k}":`)

  // Fix trailing comma before closing brace.
  s = s.replace(/,(\s*[}\]])/g, '$1')

  // Fix unquoted string values (word-only values).
  s = s.replace(/"(\w+)":\s*([^"\[\{][^,\]}]*)/g, (_, k, v) => `"${k}": "${v.trim()}"`)

  try { JSON.parse(s); return s } catch {}
  return raw // give up — return original
}

// Build minimal valid arguments for a tool based on its schema.
function buildMinimalArgs(tool) {
  const schema = tool.parameters
  if (!schema || !schema.properties) return null
  const required = schema.required || []
  const args = {}
  for (const key of required) {
    const prop = schema.properties[key]
    if (prop) {
      if (prop.type === 'string') args[key] = ''
      else if (prop.type === 'number') args[key] = 0
      else if (prop.type === 'boolean') args[key] = false
      else if (prop.type === 'array') args[key] = []
      else args[key] = null
    }
  }
  return Object.keys(args).length > 0 ? JSON.stringify(args) : null
}

// Repair an array of tool calls. Filters out unrecoverable ones.
function repairToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) return toolCalls
  return toolCalls.map(repairToolCall).filter(Boolean)
}

module.exports = { repairToolCall, repairToolCalls }
