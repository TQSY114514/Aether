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
const { normalizeAgentMode, WRITE_TOOLS } = require('../llm/toolLoopUtils')
const { evaluateToolBoundaryAllowlist } = require('../llm/microcompact')

const DEFAULT_TIMEOUT_MS = 30000
const MIN_TIMEOUT_MS = 1000
const MAX_TIMEOUT_MS = 120000
const DEFAULT_MAX_TOOL_CALLS = 50
const MAX_ALLOWED_TOOL_CALLS = 200
const INLINE_OUTPUT_CAP = 8000
const MAX_SPILLED_LOG_FILES = 20
const SPILLED_LOG_REGEX = /^aether-script-(\d+)-[0-9a-f]+\.log$/

const BLOCKED_IN_SCRIPT = new Set([
  'run_script',
  'call_extended_tool',
  'dispatch_subagent',
  'spawn_subagent',
])

function getWorkerPermissionFlags() {
  // Node 22+ supports `--permission` with zero FS/child_process grants so a
  // compromised worker cannot open files or spawn processes directly. Skip
  // when running inside an Electron binary (`ELECTRON_RUN_AS_NODE=1`).
  if (process.versions && process.versions.electron) return []
  try {
    if (process.allowedNodeEnvironmentFlags && process.allowedNodeEnvironmentFlags.has('--permission')) {
      return ['--permission']
    }
  } catch { /* ignore */ }
  return []
}

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

function defaultIsFeatureEnabled(db, key) {
  try {
    const featureFlags = require('../featureFlags')
    return featureFlags.isEnabled(db, key)
  } catch {
    return true
  }
}

function defaultIsProjectToolAllowed(toolName, workspaceRoot) {
  try {
    const { isToolAllowed } = require('../config/projectConfig')
    return isToolAllowed(toolName, workspaceRoot)
  } catch {
    return { allowed: true }
  }
}

function defaultRunHooks(hookType, payload) {
  try {
    const hooks = require('../llm/hooks')
    return hooks.runHooks(hookType, payload)
  } catch {
    return Promise.resolve([])
  }
}

function defaultCreateCheckpoint({ db, ...payload }) {
  const checkpoints = require('../llm/checkpoints')
  if (db && typeof db.addAgentCheckpoint === 'function') {
    checkpoints.setDb(db)
  }
  return checkpoints.createCheckpoint(payload)
}

function resolveWorkspaceRoot(ctx) {
  if (ctx?.workspaceRoot) return ctx.workspaceRoot
  try {
    const sandbox = require('./sandbox')
    return sandbox.getOriginalWorkspaceRoot(ctx?.sessionId) || sandbox.getWorkspaceRoot(ctx?.sessionId)
  } catch {
    return undefined
  }
}

function ensureNotAborted(runGuard, ctx) {
  if (runGuard?.isAborted?.() || ctx?.signal?.aborted) {
    throw new Error('Script execution aborted')
  }
}

function raceWithAbort(promise, signal) {
  if (!signal) return Promise.resolve(promise)
  if (signal.aborted) return Promise.reject(new Error('Script execution aborted'))
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new Error('Script execution aborted'))
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(promise).then(
      (val) => {
        signal.removeEventListener('abort', onAbort)
        resolve(val)
      },
      (err) => {
        signal.removeEventListener('abort', onAbort)
        reject(err)
      }
    )
  })
}

function pruneSpilledLogs(currentFilePath) {
  try {
    const tmpDir = os.tmpdir()
    const entries = fs.readdirSync(tmpDir)
    const matching = []
    for (const entry of entries) {
      const m = SPILLED_LOG_REGEX.exec(entry)
      if (m) matching.push({ name: entry, ts: Number(m[1]) || 0 })
    }
    if (matching.length <= MAX_SPILLED_LOG_FILES) return
    matching.sort((a, b) => b.ts - a.ts || b.name.localeCompare(a.name))
    const currentBase = currentFilePath ? path.basename(currentFilePath) : ''
    for (const item of matching.slice(MAX_SPILLED_LOG_FILES)) {
      if (item.name === currentBase) continue
      try { fs.unlinkSync(path.join(tmpDir, item.name)) } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

function spillLargeOutput(fullText) {
  if (!fullText || fullText.length <= INLINE_OUTPUT_CAP) {
    return { text: fullText, spilledPath: null }
  }
  const suffix = crypto.randomBytes(4).toString('hex')
  const filePath = path.join(os.tmpdir(), `aether-script-${Date.now()}-${suffix}.log`)
  try {
    fs.writeFileSync(filePath, fullText, { encoding: 'utf8', mode: 0o600 })
    pruneSpilledLogs(filePath)
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

async function authorizeAndExecuteTool(name, args, ctx, deps, runGuard = null) {
  ensureNotAborted(runGuard, ctx)

  if (!name || typeof name !== 'string') {
    throw new Error('Tool name must be a non-empty string')
  }
  if (BLOCKED_IN_SCRIPT.has(name)) {
    throw new Error(`Tool "${name}" cannot be called from inside run_script`)
  }

  const parsedArgs = args && typeof args === 'object' ? { ...args } : {}
  const isFeatureEnabled = deps?.isFeatureEnabled || defaultIsFeatureEnabled
  const isProjectToolAllowed = deps?.isProjectToolAllowed || defaultIsProjectToolAllowed
  const runHooks = deps?.runHooks || defaultRunHooks
  const createCheckpoint = deps?.createCheckpoint || defaultCreateCheckpoint

  if (name === 'agent_browser' && parsedArgs.action !== 'close' && !isFeatureEnabled(ctx?.db, 'agent.browser')) {
    throw new Error('Tool "agent_browser" is disabled by feature flag')
  }

  const tool = deps.getTool(name)
  if (!tool) {
    throw new Error(`Unknown tool: "${name}"`)
  }

  // Disabled tools check
  const disabledRaw = ctx?.disabledTools ?? ctx?.options?.disabledTools
  if (Array.isArray(disabledRaw) && disabledRaw.includes(name)) {
    throw new Error(`Tool "${name}" is disabled in current settings`)
  }
  if (disabledRaw instanceof Set && disabledRaw.has(name)) {
    throw new Error(`Tool "${name}" is disabled in current settings`)
  }

  // Boundary allowlist check (supports Array and Set via microcompact helper)
  const boundaryAllowlist = ctx?.allowedTools ?? ctx?.options?.allowedTools ?? ctx?.options?.toolBoundaryAllowlist
  if (boundaryAllowlist !== undefined && boundaryAllowlist !== null) {
    const boundaryCheck = evaluateToolBoundaryAllowlist(name, boundaryAllowlist)
    if (!boundaryCheck.allowed) {
      throw new Error(boundaryCheck.reason || `Tool "${name}" is not permitted by tool boundary allowlist`)
    }
  }

  // Project-level config gate (.aether/config.json, .aether.json, opencode.json)
  const workspaceRoot = resolveWorkspaceRoot(ctx)
  if (workspaceRoot) {
    const projCheck = isProjectToolAllowed(name, workspaceRoot)
    if (projCheck && !projCheck.allowed) {
      throw new Error(projCheck.reason || `Tool "${name}" blocked by project config`)
    }
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

  let execArgs = parsedArgs
  if (typeof tool.prepareArguments === 'function') {
    const modified = await raceWithAbort(Promise.resolve(tool.prepareArguments(execArgs)), runGuard?.signal)
    ensureNotAborted(runGuard, ctx)
    if (modified && typeof modified === 'object') {
      execArgs = { ...execArgs, ...modified }
    }
  }

  if (typeof tool.beforeToolCall === 'function') {
    await raceWithAbort(
      Promise.resolve(tool.beforeToolCall({
        toolName: name,
        args: execArgs,
        sessionId: ctx?.sessionId,
        messageId: ctx?.messageId,
      })),
      runGuard?.signal
    )
    ensureNotAborted(runGuard, ctx)
  }

  let permissionOverride = null
  let overrideReason = null
  const hookResults = await raceWithAbort(
    runHooks('PreToolUse', {
      toolName: name,
      args: execArgs,
      sessionId: ctx?.sessionId,
      messageId: ctx?.messageId,
    }),
    runGuard?.signal
  )
  ensureNotAborted(runGuard, ctx)
  if (Array.isArray(hookResults)) {
    for (const hr of hookResults) {
      if (!hr) continue
      if (hr.permission_override) {
        permissionOverride = hr.permission_override
        if (Array.isArray(hr.messages) && hr.messages.length > 0) {
          overrideReason = hr.messages[0]
        }
      }
      if (hr.denied) {
        const detail = Array.isArray(hr.messages) && hr.messages.length ? `: ${hr.messages.join('; ')}` : ''
        throw new Error(`Tool "${name}" blocked by PreToolUse hook${detail}`)
      }
    }
  }

  const check = deps.checkToolAllowed(name, rawMode, execArgs, { workspaceRoot })
  if (!check.allowed) {
    throw new Error(`Tool "${name}" blocked in ${rawMode} mode: ${check.reason || 'permission denied'}`)
  }

  const permissions = require('../llm/permissions')
  if (permissionOverride === permissions.PermissionOverride.Deny) {
    throw new Error(overrideReason || `Permission denied for "${name}" by hook`)
  }

  const needsApproval =
    permissionOverride !== permissions.PermissionOverride.Allow &&
    (
      Boolean(check.requiresPrompt || check.promptRequired) ||
      (rawMode === 'ask' && tool.risk === 'dangerous') ||
      permissionOverride === permissions.PermissionOverride.Ask ||
      permissionOverride === permissions.PermissionOverride.AlwaysAsk
    )

  let userDecision = null
  if (needsApproval) {
    ensureNotAborted(runGuard, ctx)
    if (typeof ctx?.requestPermission === 'function') {
      userDecision = await raceWithAbort(
        ctx.requestPermission({
          name,
          args: execArgs,
          risk: tool.risk,
          reason: check.reason || overrideReason || `run_script requested ${name}`,
          viaScript: true,
          signal: runGuard?.signal,
        }),
        runGuard?.signal
      )
      ensureNotAborted(runGuard, ctx)
      if (!userDecision) {
        throw new Error(`Permission denied for "${name}"`)
      }
    } else if (!ctx?.highRiskApproved) {
      throw new Error(`Permission confirmation required for dangerous tool "${name}"`)
    }
  }

  if (ctx?.permissionPolicy && typeof ctx.permissionPolicy.authorizeWithContext === 'function') {
    const policyContext = permissionOverride ? { permissionOverride, overrideReason } : null
    const prompter = userDecision !== null
      ? {
        decide: () => (userDecision
          ? permissions.PermissionPromptDecision.Allow
          : permissions.PermissionPromptDecision.Deny),
      }
      : null
    const outcome = ctx.permissionPolicy.authorizeWithContext(name, JSON.stringify(execArgs), policyContext, prompter)
    if (outcome && !outcome.allowed) {
      throw new Error(outcome.reason || `Tool "${name}" blocked by permission policy`)
    }
  }

  // Re-verify script is still active immediately before running any side-effectful tool.
  ensureNotAborted(runGuard, ctx)

  if (WRITE_TOOLS.has(name) || tool.risk === 'dangerous') {
    try {
      createCheckpoint({
        db: ctx?.db,
        sessionId: ctx?.sessionId,
        messageId: ctx?.messageId,
        turnId: ctx?.turnId,
        workspaceRoot,
        toolName: name,
        args: execArgs,
      })
    } catch { /* best-effort checkpoint */ }
  }

  const nestedCtx = {
    ...ctx,
    signal: runGuard?.signal || ctx?.signal,
    sessionSignal: runGuard?.signal || ctx?.sessionSignal,
    viaScript: true,
  }
  const rawResult = await raceWithAbort(tool.run(execArgs, nestedCtx), runGuard?.signal)
  ensureNotAborted(runGuard, ctx)
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
    isFeatureEnabled: opts.isFeatureEnabled || defaultIsFeatureEnabled,
    isProjectToolAllowed: opts.isProjectToolAllowed || defaultIsProjectToolAllowed,
    runHooks: opts.runHooks || defaultRunHooks,
    createCheckpoint: opts.createCheckpoint || defaultCreateCheckpoint,
  }

  const startedAt = Date.now()
  const trace = []
  let callCount = 0
  let settled = false
  let winJob = null
  const runAbortCtrl = new AbortController()
  const runGuard = {
    signal: runAbortCtrl.signal,
    isAborted: () => settled || runAbortCtrl.signal.aborted,
  }

  return new Promise((resolve) => {
    const workerArgs = [...getWorkerPermissionFlags(), workerPath]
    const child = spawn(process.execPath, workerArgs, {
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
      try { runAbortCtrl.abort() } catch { /* ignore */ }
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
          finish({ ok: false, error: msg })
          return
        }

        authorizeAndExecuteTool(toolName, toolArgs, ctx, deps, runGuard)
          .then((result) => {
            if (settled) return
            trace.push({ id: callId, name: toolName, ok: true, durationMs: Date.now() - t0 })
            sendToWorker({ type: 'tool_result', id: callId, ok: true, result })
          })
          .catch((err) => {
            if (settled) return
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
  spillLargeOutput,
  getWorkerPermissionFlags,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_TOOL_CALLS,
  INLINE_OUTPUT_CAP,
  MAX_SPILLED_LOG_FILES,
}
