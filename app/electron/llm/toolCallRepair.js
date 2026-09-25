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

  // P1-2: Attempt structural closure of truncated JSON (unclosed strings / braces / brackets)
  const closed = closeTruncatedJson(s)
  try { JSON.parse(closed); return closed } catch {}

  return raw // give up — return original
}

/**
 * Deterministically close truncated JSON strings/arrays/objects (LIFO stack).
 */
function closeTruncatedJson(raw) {
  let s = String(raw || '').trim()
  if (!s) return '{}'

  // Strip trailing incomplete escape or dangling comma/colon outside strings
  const stack = []
  let inString = false
  let escaped = false

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\' && inString) {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (!inString) {
      if (ch === '{') stack.push('}')
      else if (ch === '[') stack.push(']')
      else if ((ch === '}' || ch === ']') && stack.length > 0 && stack[stack.length - 1] === ch) {
        stack.pop()
      }
    }
  }

  if (escaped) s = s.slice(0, -1)
  if (inString) s += '"'

  const topCloser = stack.length > 0 ? stack[stack.length - 1] : null
  // Clean up dangling `: ` or `, "partialKey"` at the tail before closing braces
  s = s.replace(/,\s*"[^"]*"\s*:\s*$/, '')
  if (topCloser === '}') {
    // Only strip trailing `, "partialKey"` when inside an object `{ ... }`, NOT inside an array `[ ... ]`
    s = s.replace(/,\s*"[^"]*"\s*$/, '')
  }
  s = s.replace(/:\s*$/, ': null')
  s = s.replace(/,\s*$/, '')

  while (stack.length > 0) {
    s += stack.pop()
  }
  return s
}

function isBalancedJson(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return false
  try {
    JSON.parse(raw)
    return true
  } catch {
    return false
  }
}

/**
 * P1-2 (1) Scavenger: When an assistant response has reasoning_content / reasoning
 * that contains a structured tool call (<tool_call>{...}</tool_call>, ```json {...}```,
 * or function-call pattern) but `msg.tool_calls` is empty, extract and repair it.
 */
function scavengeToolCallsFromReasoning(msg, allowedToolNames = null) {
  if (!msg || (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0)) {
    const existing = msg && Array.isArray(msg.tool_calls) ? msg.tool_calls : []
    existing.scavengedCount = 0
    existing.tool_calls = existing
    return existing
  }
  const reasoning = String(msg.reasoning_content || msg.reasoning || '').trim()
  if (!reasoning) {
    const empty = []
    empty.scavengedCount = 0
    empty.tool_calls = empty
    return empty
  }

  const knownSet = allowedToolNames instanceof Set
    ? allowedToolNames
    : (Array.isArray(allowedToolNames) && allowedToolNames.length > 0 ? new Set(allowedToolNames) : BUILTIN_NAMES)

  const candidates = []

  // Pattern 1: ```json { "name": "...", "arguments": ... } ```
  const fenceRe = /```(?:json|tool_call)?\s*([\s\S]*?)\s*```/gi
  let m
  while ((m = fenceRe.exec(reasoning)) !== null) {
    candidates.push(m[1])
  }

  // Pattern 2: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
  const xmlRe = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi
  while ((m = xmlRe.exec(reasoning)) !== null) {
    candidates.push(m[1])
  }

  // Pattern 3: Direct JSON object containing "name" and "arguments"
  if (candidates.length === 0) {
    const jsonObjRe = /\{\s*"(?:name|tool)"\s*:\s*"([a-zA-Z0-9_]+)"\s*,\s*"(?:arguments|args|parameters)"\s*:\s*(\{[\s\S]*?\})\s*\}/g
    while ((m = jsonObjRe.exec(reasoning)) !== null) {
      candidates.push(JSON.stringify({ name: m[1], arguments: m[2] }))
    }
  }

  const scavenged = []
  for (const raw of candidates) {
    let parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      try { parsed = JSON.parse(closeTruncatedJson(raw)) } catch { parsed = null }
    }
    if (!parsed || typeof parsed !== 'object') continue
    const fnName = String(parsed.name || parsed.tool || (parsed.function && parsed.function.name) || '').trim()
    if (!fnName || !knownSet.has(fnName)) continue

    const rawArgs = parsed.arguments !== undefined
      ? parsed.arguments
      : (parsed.args !== undefined ? parsed.args : (parsed.parameters !== undefined ? parsed.parameters : {}))
    const argStr = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs || {})
    const tc = repairToolCall({
      id: `scavenged_tc_${scavenged.length + 1}`,
      type: 'function',
      function: { name: fnName, arguments: argStr },
    })
    if (tc) scavenged.push(tc)
  }

  scavenged.scavengedCount = scavenged.length
  scavenged.tool_calls = scavenged
  return scavenged
}

/**
 * P1-2 (2) Truncated Continuation: When finish_reason === 'length' (or 'max_tokens')
 * and a tool call's JSON arguments are unclosed, request continuation via completeFn
 * (if provided) and stitch/close the JSON rather than discarding the tool call.
 */
async function continueTruncatedToolCalls(msg, optsOrFn = null) {
  if (!msg || !Array.isArray(msg.tool_calls) || msg.tool_calls.length === 0) {
    const empty = msg && Array.isArray(msg.tool_calls) ? msg.tool_calls : []
    empty.continuedCount = 0
    empty.tool_calls = empty
    return empty
  }
  const completeFn = typeof optsOrFn === 'function'
    ? optsOrFn
    : (optsOrFn && typeof optsOrFn.completeFn === 'function' ? optsOrFn.completeFn : null)
  const provider = optsOrFn && typeof optsOrFn === 'object' ? optsOrFn.provider : null
  const model = optsOrFn && typeof optsOrFn === 'object' ? optsOrFn.model : null
  const signal = optsOrFn && typeof optsOrFn === 'object' ? optsOrFn.signal : undefined

  const isLengthTruncated = msg.finish_reason === 'length' || msg.stop_reason === 'max_tokens' || msg.finishReason === 'length'
  const out = []
  let continuedCount = 0

  for (const tc of msg.tool_calls) {
    if (!tc || !tc.function) continue
    let argStr = typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments || {})

    if (isLengthTruncated && !isBalancedJson(argStr)) {
      continuedCount++
      if (typeof completeFn === 'function') {
        try {
          const prompt = `Continue ONLY the exact remaining JSON characters to close this truncated tool call argument object for "${tc.function.name}". Do not repeat the prefix:\n${argStr.slice(-300)}`
          const resp = await completeFn({
            provider,
            model,
            signal,
            max_tokens: 512,
            toolName: tc.function.name,
            truncatedArguments: argStr,
            prompt,
            messages: [{ role: 'user', content: prompt }],
          })
          const rawSuffix = resp && typeof resp === 'object' ? (resp.content || '') : String(resp || '')
          const cleanSuffix = String(rawSuffix || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
          if (cleanSuffix) {
            const stitched = argStr + cleanSuffix
            argStr = isBalancedJson(stitched) ? stitched : closeTruncatedJson(stitched)
          } else {
            argStr = closeTruncatedJson(argStr)
          }
        } catch {
          argStr = closeTruncatedJson(argStr)
        }
      } else {
        argStr = closeTruncatedJson(argStr)
      }
    }

    const repaired = repairToolCall({
      ...tc,
      function: { ...tc.function, arguments: argStr },
    })
    if (repaired) out.push(repaired)
  }

  msg.tool_calls = out
  out.continuedCount = continuedCount
  out.tool_calls = out
  return out
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
  const out = toolCalls.map(repairToolCall).filter(Boolean)
  out.toolCalls = out
  return out
}

module.exports = {
  repairToolCall,
  repairToolCalls,
  repairMalformedJson,
  closeTruncatedJson,
  isBalancedJson,
  scavengeToolCallsFromReasoning,
  continueTruncatedToolCalls,
}
