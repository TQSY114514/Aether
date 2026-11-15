// ───────────────────────────────────────────────────────────────────────────
// Parent-side runner for `run_script` (Factory-style programmatic batching).
//
// Spawns an isolated child Node process (`scriptWorker.js`) with a stripped
// environment, executes LLM-supplied JS inside a locked-down `vm` context,
// and mediates every `tools.<name>(args)` RPC call through Aether's normal
// permission gate (`plan`/`review`/`ask`/`act`/`yolo`), `trustEngine`, and
// `toolResultMiddleware`. Electron-free CommonJS.
// ───────────────────────────────────────────────────────────────────────────
'use strict'

const { spawn } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const readline = require('readline')
const { normalizeAgentMode } = require('../llm/toolLoopUtils')

const DEFAULT_TIMEOUT_MS = 30000
const MIN_TIMEOUT_MS = 1000
const MAX_TIMEOUT_MS = 120000
const DEFAULT_MAX_TOOL_CALLS = 50
const MAX_ALLOWED_TOOL_CALLS = 200
const INLINE_OUTPUT_CAP = 16000

const WRITE_TOOLS = new Set([
  'write_file',
  'edit_file',
  'create_or_update_file',
  'apply_patch',
  'delete_file',
])

const BLOCKED_IN_SCRIPT = new Set([
  'run_script',
  'call_extended_tool',
])

function buildSanitizedEnv() {
  const keep = [
    'PATH',
    'Path',
    'SystemRoot',
    'WINDIR',
    'PATHEXT',
    'COMSPEC',
    'HOME',
    'USERPROFILE',
    'LANG',
    'LC_ALL',
  ]
  const env = {
    TEMP: os.tmpdir(),
    TMP: os.tmpdir(),
  }
  for (const key of keep) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key]
    }
  }
  if (process.versions && process.versions.electron) {
    env.ELECTRON_RUN_AS_NODE = '1'
  }
  return env
}

function clampNumber(val, fallback, min, max) {
  const n = Number(val)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function defaultResolveTool(name) {
  try {
    const mcp = require('../mcp/manager')
    const merged = mcp.getMergedTool(name)
    if (merged) return merged
  } catch { /* ignore */ }
  const { getTool } = require('./registry')
  return getTool(name)
}

function defaultCheckToolAllowed(toolName, mode, args, opts) {
  const { checkToolAllowed } = require('./trustEngine')
  return checkToolAllowed(toolName, mode, args, opts)
}

function defaultApplyMiddleware(text, opts) {
  const { applyMiddleware } = require('../llm/toolResultMiddleware')
  return applyMiddleware(text, opts)
}

function spillLargeOutput(fullText) {
  if (!fullText || fullText.length <= INLINE_OUTPUT_CAP) {
    return { text: fullText, spilledPath: null }
  }
  const suffix = crypto.randomBytes(4).toString('hex')
  const filePath = path.join(os.tmpdir(), `aether-script-${Date.now()}-${suffix}.log`)
  try {
    fs.writeFileSync(filePath, fullText, { encoding: 'utf8', mode: 0o600 })
    const head = fullText.slice(0, INLINE_OUTPUT_CAP - 400)
    return {
      text: `${head}\n\n... [truncated ${fullText.length - head.length} chars; full script output saved to ${filePath}]`,
      spilledPath: filePath,
    }
  } catch {
    return {
      text: fullText.slice(0, INLINE_OUTPUT_CAP) + '\n... [truncated]',
      spilledPath: null,
    }
  }
}

async function authorizeAndExecuteTool(name, args, ctx, deps) {
  if (!name || typeof name !== 'string') {
    throw new Error('Tool name must be a non-empty string')
  }
  if (BLOCKED_IN_SCRIPT.has(name)) {
    throw new Error(`Tool "${name}" cannot be called from inside run_script`)
  }

  const tool = deps.getTool(name)
  if (!tool) {
    throw new Error(`Unknown tool: "${name}"`)
  }

  const parsedArgs = args && typeof args === 'object' ? args : {}

  // Disabled tools check
  const disabledRaw = ctx?.disabledTools ?? ctx?.options?.disabledTools
  if (Array.isArray(disabledRaw) && disabledRaw.includes(name)) {
    throw new Error(`Tool "${name}" is disabled in current settings`)
  }
  if (disabledRaw instanceof Set && disabledRaw.has(name)) {
    throw new Error(`Tool "${name}" is disabled in current settings`)
  }

  // Boundary allowlist check
  const boundaryAllowlist = ctx?.allowedTools || ctx?.options?.allowedTools || ctx?.options?.toolBoundaryAllowlist
  if (Array.isArray(boundaryAllowlist) && !boundaryAllowlist.includes(name)) {
    throw new Error(`Tool "${name}" is not permitted by tool boundary allowlist`)
  }

  // Read-only & trustEngine checks
  const rawMode = String(ctx?.agentMode || 'act').toLowerCase()
  const normMode = normalizeAgentMode(rawMode)
  const isReadOnly =
    normMode === 'plan' ||
    rawMode === 'review' ||
    rawMode === 'explore' ||
    rawMode === 'read_only' ||
    rawMode === 'readonly' ||
    rawMode === 'read-only'

  if (isReadOnly && (tool.risk === 'dangerous' || WRITE_TOOLS.has(name))) {
    throw new Error(`Tool "${name}" is blocked in ${rawMode} read-only mode`)
  }

  const check = deps.checkToolAllowed(name, rawMode, parsedArgs, { workspaceRoot: ctx?.workspaceRoot })
  if (!check.allowed) {
    throw new Error(`Tool "${name}" blocked in ${rawMode} mode: ${check.reason || 'permission denied'}`)
  }

  const needsApproval =
    Boolean(check.requiresPrompt || check.promptRequired) ||
    (rawMode === 'ask' && tool.risk === 'dangerous')

  if (needsApproval) {
    if (typeof ctx?.requestPermission === 'function') {
      const allowed = await ctx.requestPermission({
        name,
        args: parsedArgs,
        risk: tool.risk,
        reason: check.reason || `run_script requested ${name}`,
        viaScript: true,
      })
      if (!allowed) {
        throw new Error(`Permission denied for "${name}"`)
      }
    } else if (!ctx?.highRiskApproved) {
      throw new Error(`Permission confirmation required for dangerous tool "${name}"`)
    }
  }

  const rawResult = await tool.run(parsedArgs, ctx)
  const textOut = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult)
  const filtered = deps.applyMiddleware(textOut, { tool: name, db: ctx?.db })
  return filtered && typeof filtered === 'object' && 'text' in filtered ? filtered.text : filtered
}

function formatScriptReport({ ok, value, error, logs, trace, elapsedMs }) {
  const parts = []
  const status = ok ? 'ok' : 'error'
  parts.push(`[run_script ${status}] (${trace.length} tool call${trace.length === 1 ? '' : 's'}, ${elapsedMs}ms)`)

  if (!ok && error) {
    parts.push(`Error: ${error}`)
  }

  if (value !== undefined && value !== null) {
    const valStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    parts.push(`Return:\n${valStr}`)
  }

  if (logs.length > 0) {
    parts.push(`Console (${logs.length}):\n${logs.join('\n')}`)
  }

  if (trace.length > 0) {
    const traceLines = trace.slice(0, 40).map((t, i) => {
      const tag = t.ok ? 'ok' : `err: ${t.error}`
      return `  ${i + 1}. ${t.name} (${t.durationMs}ms) -> ${tag}`
    })
    if (trace.length > 40) {
      traceLines.push(`  ... (+${trace.length - 40} more calls)`)
    }
    parts.push(`Tool Trace:\n${traceLines.join('\n')}`)
  }

  return spillLargeOutput(parts.join('\n\n'))
}

/**
 * Execute LLM-authored batching script in an isolated child Node VM worker.
 *
 * @param {{
 *   code: string,
 *   inputs?: unknown,
 *   timeoutMs?: number,
 *   maxToolCalls?: number,
 *   ctx?: object,
 *   workerPath?: string,
 *   getTool?: (name: string) => object | undefined,
 *   checkToolAllowed?: Function,
 *   applyMiddleware?: Function,
 * }} opts
 * @returns {Promise<{ ok: boolean, value: unknown, error: string|null, logs: string[], trace: Array<object>, text: string, spilledPath: string|null }>}
 */
function runScript(opts = {}) {
  const code = String(opts.code || '')
  if (!code.trim()) {
    return Promise.reject(new Error('code is required'))
  }

  const ctx = opts.ctx || {}
  const timeoutMs = clampNumber(opts.timeoutMs, DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
  const maxToolCalls = clampNumber(opts.maxToolCalls, DEFAULT_MAX_TOOL_CALLS, 1, MAX_ALLOWED_TOOL_CALLS)
  const workerPath = opts.workerPath || path.join(__dirname, 'scriptWorker.js')
  const deps = {
    getTool: opts.getTool || defaultResolveTool,
    checkToolAllowed: opts.checkToolAllowed || defaultCheckToolAllowed,
    applyMiddleware: opts.applyMiddleware || defaultApplyMiddleware,
  }

  const startedAt = Date.now()
  const trace = []
  let callCount = 0
  let settled = false
  let winJob = null

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [workerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: buildSanitizedEnv(),
    })

    try {
      winJob = require('../exec/winJobObject')
      if (winJob.isSupported()) {
        winJob.ensureSupervisor()
        winJob.assignProcess(child)
      } else {
        winJob = null
      }
    } catch {
      winJob = null
    }

    let stderrBuf = ''
    child.stderr.on('data', (chunk) => {
      if (stderrBuf.length < 2048) stderrBuf += String(chunk)
    })

    const sendToWorker = (frame) => {
      if (child.killed || !child.stdin || child.stdin.destroyed) return
      try {
        child.stdin.write(JSON.stringify(frame) + '\n')
      } catch { /* ignore broken pipe */ }
    }

    const terminateChild = () => {
      if (winJob) {
        try { winJob.terminateProcess(child) } catch { /* ignore */ }
      }
      try {
        if (!child.killed) child.kill('SIGKILL')
      } catch { /* ignore */ }
    }

    let timer = null
    let onAbort = null

    const finish = ({ ok, value = null, error = null, logs = [] }) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (onAbort && ctx?.signal) {
        try { ctx.signal.removeEventListener('abort', onAbort) } catch { /* ignore */ }
      }
      terminateChild()
      const elapsedMs = Date.now() - startedAt
      const { text, spilledPath } = formatScriptReport({ ok, value, error, logs, trace, elapsedMs })
      resolve({ ok, value, error, logs, trace, text, spilledPath })
    }

    timer = setTimeout(() => {
      finish({ ok: false, error: `run_script timed out after ${timeoutMs}ms` })
    }, timeoutMs)
    if (timer.unref) timer.unref()

    if (ctx?.signal) {
      if (ctx.signal.aborted) {
        finish({ ok: false, error: 'run_script aborted' })
        return
      }
      onAbort = () => finish({ ok: false, error: 'run_script aborted' })
      ctx.signal.addEventListener('abort', onAbort, { once: true })
    }

    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })

    rl.on('line', (line) => {
      if (settled) return
      const trimmed = line.trim()
      if (!trimmed) return
      let frame
      try {
        frame = JSON.parse(trimmed)
      } catch {
        return
      }
      if (!frame || typeof frame !== 'object') return

      if (frame.type === 'result') {
        finish({
          ok: Boolean(frame.ok),
          value: frame.value ?? null,
          error: frame.error || null,
          logs: Array.isArray(frame.logs) ? frame.logs : [],
        })
        return
      }

      if (frame.type === 'tool_call') {
        const callId = frame.id
        const toolName = String(frame.name || '')
        const toolArgs = frame.args && typeof frame.args === 'object' ? frame.args : {}
        const t0 = Date.now()

        if (++callCount > maxToolCalls) {
          const msg = `Exceeded max_tool_calls limit (${maxToolCalls})`
          trace.push({ id: callId, name: toolName, ok: false, durationMs: 0, error: msg })
          sendToWorker({ type: 'tool_result', id: callId, ok: false, error: msg })
          return
        }

        authorizeAndExecuteTool(toolName, toolArgs, ctx, deps)
          .then((result) => {
            trace.push({ id: callId, name: toolName, ok: true, durationMs: Date.now() - t0 })
            sendToWorker({ type: 'tool_result', id: callId, ok: true, result })
          })
          .catch((err) => {
            const errMsg = err && err.message ? err.message : String(err)
            trace.push({ id: callId, name: toolName, ok: false, durationMs: Date.now() - t0, error: errMsg })
            sendToWorker({ type: 'tool_result', id: callId, ok: false, error: errMsg })
          })
      }
    })

    child.on('error', (err) => {
      finish({ ok: false, error: `Failed to start script worker: ${err.message}` })
    })

    child.on('exit', (code, signal) => {
      if (!settled) {
        const detail = stderrBuf.trim() ? `: ${stderrBuf.trim()}` : ''
        finish({ ok: false, error: `Script worker exited unexpectedly (code=${code}, signal=${signal})${detail}` })
      }
    })

    sendToWorker({
      type: 'run',
      code,
      inputs: opts.inputs === undefined ? {} : opts.inputs,
    })
  })
}

module.exports = {
  runScript,
  authorizeAndExecuteTool,
  buildSanitizedEnv,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_TOOL_CALLS,
  INLINE_OUTPUT_CAP,
}
