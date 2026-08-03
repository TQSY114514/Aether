// ───────────────────────────────────────────────────────────────────────────
// Agent Hooks — extensibility points in the agent loop.
//
// Inspired by Claude Code's hook system: users can define custom scripts
// that run at specific points in the agent lifecycle. Each hook is a JS file
// that exports a function receiving the hook context and returning void.
//
// Shell hooks (<HookEvent>.sh) are also supported and run after JS hooks.
// They receive context via environment variables and a JSON payload on stdin,
// and return structured output as JSON on stdout.
//
// Hook types:
//   PreToolUse    — before a tool executes (can block by throwing or deny)
//   PostToolUse   — after a tool succeeds
//   ToolError     — after a tool fails
//   PreCompact    — before context compaction
//   PostCompact   — after context compaction
//   PreSend       — before the user message is sent to the model
//   PostResponse  — after the final response is generated
//   SessionStart  — when a new chat session begins (OpenClaw pattern)
//   SessionEnd    — when a chat session ends
//   SubagentStop  — before a sub-agent completes (Claude Code pattern)
//
// Hook location (JS):  <workspace>/.aetherai/hooks/<hook-name>.js
// Hook location (SH):  <workspace>/.aetherai/hooks/<hook-name>.sh
// Each JS file exports: module.exports = async function(ctx) { ... }
//   ctx = { toolName, args, result, error, sessionId, messageId, timestamp }
//   SessionStart ctx: { sessionId, timestamp }
//   SessionEnd ctx:   { sessionId, timestamp }
//   SubagentStop ctx: { taskId, output, iterations, sessionId }
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { getWorkspaceRoot } = require('../tools/sandbox')
const log = require('../logger')
const { PermissionOverride } = require('./permissions')

const HOOK_TYPES = new Set([
  'PreToolUse', 'PostToolUse', 'ToolError',
  'PreCompact', 'PostCompact', 'PreSend', 'PostResponse',
  'SessionStart', 'SessionEnd', 'SubagentStop',
])

// ── HookRunResult ─────────────────────────────────────────────────────────
//
// Structured result returned by shell hooks. Contains permission override
// data that can influence the agent loop.

class HookRunResult {
  constructor({ denied = false, failed = false, messages = [], permission_override = null, updated_input = null } = {}) {
    this.denied = denied
    this.failed = failed
    this.messages = messages
    this.permission_override = permission_override
    this.updated_input = updated_input
  }

  static allow(messages = []) {
    return new HookRunResult({ messages })
  }
}

// In-memory cache of loaded hook modules: hookType -> Map(name -> fn)
let _jsHooks = new Map()

// Shell hook cache: hookType -> Map(name -> scriptPath)
let _shellHooks = new Map()

function scanHooks() {
  _jsHooks.clear()
  _shellHooks.clear()
  const ws = getWorkspaceRoot()
  const hooksDir = path.join(ws, '.aetherai', 'hooks')
  if (!fs.existsSync(hooksDir)) return 0
  let count = 0
  try {
    const entries = fs.readdirSync(hooksDir, { withFileTypes: true })
    for (const ent of entries) {
      if (!ent.isFile()) continue

      if (ent.name.endsWith('.js')) {
        const hookType = ent.name.replace(/\.js$/, '')
        if (!HOOK_TYPES.has(hookType)) continue
        const fullPath = path.join(hooksDir, ent.name)
        let fn
        try {
          fn = require(fullPath)
          if (typeof fn !== 'function') continue
        } catch (e) {
          log.warn(`hook load failed: ${fullPath}: ${e.message}`)
          continue
        }
        if (!_jsHooks.has(hookType)) _jsHooks.set(hookType, new Map())
        _jsHooks.get(hookType).set(ent.name, fn)
        count++
      } else if (ent.name.endsWith('.sh')) {
        const hookType = ent.name.replace(/\.sh$/, '')
        if (!HOOK_TYPES.has(hookType)) continue
        const fullPath = path.join(hooksDir, ent.name)
        if (!_shellHooks.has(hookType)) _shellHooks.set(hookType, new Map())
        _shellHooks.get(hookType).set(ent.name, fullPath)
        count++
      }
    }
  } catch {}
  return count
}

// ── JS hook execution ─────────────────────────────────────────────────────

// Run all JS hooks of a given type. If any throws, the error propagates (used by
// PreToolUse to block execution). Non-PreToolUse hooks never block.
async function runJsHooks(type, ctx) {
  if (!_jsHooks.has(type)) return
  for (const [name, fn] of _jsHooks.get(type)) {
    try {
      await fn(ctx)
    } catch (e) {
      log.warn(`hook ${type}.${name} threw: ${e.message}`)
      if (type === 'PreToolUse') throw e // block on PreToolUse failure
    }
  }
}

// ── Shell hook execution ──────────────────────────────────────────────────

/**
 * Build the JSON payload sent to a shell hook via stdin.
 */
function buildHookPayload(type, ctx) {
  const payload = {
    hook_event_name: type,
    timestamp: ctx.timestamp || new Date().toISOString(),
  }

  // Add context fields relevant to this hook type
  if (ctx.toolName !== undefined) payload.tool_name = ctx.toolName
  if (ctx.args !== undefined) {
    payload.tool_input = ctx.args
    try {
      payload.tool_input_json = typeof ctx.args === 'string' ? ctx.args : JSON.stringify(ctx.args)
    } catch { /* ignore */ }
  }
  if (ctx.result !== undefined) payload.tool_output = ctx.result
  if (ctx.error !== undefined) {
    payload.tool_error = typeof ctx.error === 'string' ? ctx.error : String(ctx.error)
    payload.tool_result_is_error = true
  }
  if (ctx.sessionId !== undefined) payload.session_id = ctx.sessionId
  if (ctx.messageId !== undefined) payload.message_id = ctx.messageId
  if (ctx.taskId !== undefined) payload.task_id = ctx.taskId
  if (ctx.output !== undefined) payload.output = ctx.output
  if (ctx.iterations !== undefined) payload.iterations = ctx.iterations

  return payload
}

/**
 * Parse the JSON stdout from a shell hook into a HookRunResult.
 */
function parseShellHookOutput(stdout) {
  if (!stdout || stdout.trim().length === 0) {
    return new HookRunResult()
  }

  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch {
    // Non-JSON output is treated as a plain message (allow)
    return new HookRunResult({ messages: [stdout.trim()] })
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return new HookRunResult({ messages: [stdout.trim()] })
  }

  const messages = []
  if (parsed.systemMessage) messages.push(String(parsed.systemMessage))
  if (parsed.reason) messages.push(String(parsed.reason))

  let permission_override = null
  if (parsed.hookSpecificOutput && typeof parsed.hookSpecificOutput === 'object') {
    const hso = parsed.hookSpecificOutput

    // Parse permissionDecision
    if (hso.permissionDecision) {
      const pd = String(hso.permissionDecision).toLowerCase()
      if (pd === 'allow') permission_override = PermissionOverride.Allow
      else if (pd === 'deny') permission_override = PermissionOverride.Deny
      else if (pd === 'ask') permission_override = PermissionOverride.Ask
    }

    // Parse additionalContext
    if (hso.additionalContext) {
      messages.push(String(hso.additionalContext))
    }

    // Parse updatedInput
    if (hso.updatedInput !== undefined) {
      // If it's an object, stringify it; otherwise use as-is
      if (typeof hso.updatedInput === 'object' && hso.updatedInput !== null) {
        return new HookRunResult({
          messages,
          permission_override,
          updated_input: JSON.stringify(hso.updatedInput),
        })
      }
      return new HookRunResult({
        messages,
        permission_override,
        updated_input: String(hso.updatedInput),
      })
    }
  }

  // Fallback: if no structured messages, use the entire stdout
  if (messages.length === 0) {
    messages.push(stdout.trim())
  }

  // Check for deny/block decision
  const denied = parsed.continue === false || parsed.decision === 'block'

  return new HookRunResult({
    denied,
    messages,
    permission_override,
  })
}

/**
 * Execute a single shell hook script.
 *
 * Returns a HookRunResult with:
 *   - denied:    true if exit code == 2, or JSON output has continue:false / decision:block
 *   - failed:    true if exit code != 0/2, or the script couldn't be started
 *   - messages:  collected from JSON stdout (systemMessage, reason, additionalContext, raw stdout)
 *   - permission_override: parsed from hookSpecificOutput.permissionDecision
 *   - updated_input: parsed from hookSpecificOutput.updatedInput
 */
function runShellHook(hookPath, type, ctx) {
  return new Promise((resolve) => {
    const payload = buildHookPayload(type, ctx)
    const payloadStr = JSON.stringify(payload)

    const isWindows = process.platform === 'win32'
    const child = isWindows
      ? spawn('cmd', ['/C', hookPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            HOOK_EVENT: type,
            HOOK_TOOL_NAME: ctx.toolName || '',
            HOOK_TOOL_INPUT: typeof ctx.args === 'string' ? ctx.args : JSON.stringify(ctx.args || ''),
            HOOK_TOOL_IS_ERROR: ctx.error ? '1' : '0',
            ...(ctx.result !== undefined ? { HOOK_TOOL_OUTPUT: ctx.result } : {}),
          },
        })
      : spawn('sh', [hookPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            HOOK_EVENT: type,
            HOOK_TOOL_NAME: ctx.toolName || '',
            HOOK_TOOL_INPUT: typeof ctx.args === 'string' ? ctx.args : JSON.stringify(ctx.args || ''),
            HOOK_TOOL_IS_ERROR: ctx.error ? '1' : '0',
            ...(ctx.result !== undefined ? { HOOK_TOOL_OUTPUT: ctx.result } : {}),
          },
        })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })

    child.on('error', (err) => {
      log.warn(`shell hook start failed: ${hookPath}: ${err.message}`)
      resolve(new HookRunResult({
        failed: true,
        messages: [`shell hook failed to start: ${err.message}`],
      }))
    })

    child.on('close', (code) => {
      const stdoutTrimmed = stdout.trim()
      const stderrTrimmed = stderr.trim()

      // Parse stdout for structured output
      const parsed = parseShellHookOutput(stdoutTrimmed)

      // Determine result based on exit code
      const result = new HookRunResult({
        denied: parsed.denied || code === 2,
        failed: code !== 0 && code !== 2 && code !== null,
        messages: parsed.messages.length > 0 ? parsed.messages : (stdoutTrimmed ? [stdoutTrimmed] : []),
        permission_override: parsed.permission_override,
        updated_input: parsed.updated_input,
      })

      if (stderrTrimmed && code !== 0) {
        log.warn(`shell hook stderr: ${hookPath}: ${stderrTrimmed}`)
      }

      // Append stderr to messages if we have a non-zero exit and no stdout messages
      if (result.messages.length === 0 && stderrTrimmed) {
        result.messages.push(stderrTrimmed)
      }

      resolve(result)
    })

    // Send payload via stdin
    try {
      child.stdin.write(payloadStr)
      child.stdin.end()
    } catch (err) {
      // The child may have closed stdin already — that's OK
      log.warn(`shell hook stdin write failed: ${hookPath}: ${err.message}`)
    }
  })
}

/**
 * Run all shell hooks of a given type.
 *
 * Returns an array of HookRunResult, one per hook script.
 */
async function runShellHooks(type, ctx) {
  if (!_shellHooks.has(type)) return []
  const results = []
  for (const [name, hookPath] of _shellHooks.get(type)) {
    try {
      const result = await runShellHook(hookPath, type, ctx)
      results.push(result)

      // Log warnings for failed hooks
      if (result.failed) {
        log.warn(`shell hook ${type}.${name} failed`)
      }
      if (result.denied) {
        log.warn(`shell hook ${type}.${name} denied`)
      }

      // For PreToolUse: if denied or failed, stop processing further hooks
      if (type === 'PreToolUse' && (result.denied || result.failed)) {
        break
      }
    } catch (e) {
      log.warn(`shell hook ${type}.${name} threw: ${e.message}`)
      results.push(new HookRunResult({ failed: true, messages: [e.message] }))
      if (type === 'PreToolUse') break
    }
  }
  return results
}

// ── Combined hook execution ───────────────────────────────────────────────

/**
 * Run all hooks (JS then shell) of a given type.
 *
 * For PreToolUse:
 *   - If a JS hook throws, the error propagates (blocks execution).
 *   - If a shell hook denies or fails, subsequent hooks are skipped.
 *     The caller should inspect the returned HookRunResult for
 *     denied/failed/permission_override/updated_input.
 *
 * Returns an array of HookRunResult from shell hooks (empty if no shell hooks).
 */
async function runHooks(type, ctx) {
  // 1. Run JS hooks first
  await runJsHooks(type, ctx)

  // 2. Run shell hooks after JS hooks
  const shellResults = await runShellHooks(type, ctx)
  return shellResults
}

// Rescan hooks from disk.
function rescan() { return scanHooks() }

// List all loaded hooks.
function listHooks() {
  const result = []
  for (const [type, map] of _jsHooks) {
    for (const [name] of map) {
      result.push({ type, name, kind: 'js' })
    }
  }
  for (const [type, map] of _shellHooks) {
    for (const [name] of map) {
      result.push({ type, name, kind: 'sh' })
    }
  }
  return result
}

module.exports = {
  scanHooks,
  runHooks,
  runJsHooks,
  runShellHook,
  runShellHooks,
  rescan,
  listHooks,
  HOOK_TYPES,
  HookRunResult,
  buildHookPayload,
  parseShellHookOutput,
}