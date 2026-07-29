// ───────────────────────────────────────────────────────────────────────────
// Tool Streaming — incremental output for long-running tools.
//
// For tools like run_command that produce extended output, this module
// provides a streaming wrapper that yields chunks as they arrive.
// The tool loop can surface these chunks in real-time via onToolStream.
// ───────────────────────────────────────────────────────────────────────────

const { runCommand } = require('../tools/exec')
const { getWorkspaceRoot } = require('../tools/sandbox')

// Command blocklist patterns (same as sandbox.js — duplicated here because
// toolStream is a low-level module that shouldn't import tools/sandbox).
const BLOCKED_COMMAND_PATTERNS = [
  /\bformat\b\s+[a-z]:/i,
  /\/dev\/(?:sd|nvme|hd)/i,
  /\bdiskpart\b/i,
  /\brm\s+-rf\s+(?:\/|\/[a-z]+\s|~|C:\\windows|C:\\users\\[^/\\]+\\desktop)/i,
  /\brmdir\s+\/s\b/i,
  /\bdel\s+\/[fs]/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bhalt\b/i,
  /\b(?:curl|wget|iwr|invoke-webrequest)\b[^|]*\|\s*(?:sh|bash|powershell|cmd|pwsh)\b/i,
  /\breg\s+delete\s+.*\/f\b/i,
  /\bchmod\s+-R\s+777\s+\//i,
]

function streamCommand(cmd, opts = {}) {
  const { cwd, timeoutMs = 120000, env, sessionId } = opts
  const needsShell = /[|&;`$(){}!\\]/.test(cmd)
  const args = needsShell ? ['/c', cmd] : []
  const shell = needsShell ? true : false
  const command = needsShell ? 'cmd.exe' : cmd

  return new Promise((resolve, reject) => {
    const effectiveCwd = cwd || (sessionId ? getWorkspaceRoot(sessionId) : undefined)
    const mergedEnv = env ? Object.fromEntries(Object.entries(env).filter(([k]) =>
      new Set(['LANG','LC_ALL','NODE_ENV','TERM','DEBUG','CI','VERBOSE']).has(k))) : undefined

    // We still need streaming support (on('data')) which runCommand doesn't expose.
    // So we use spawn directly here with the same safety patterns.
    const { spawn } = require('child_process')
    const child = spawn(command, args, {
      cwd: effectiveCwd,
      env: mergedEnv ? { ...process.env, ...mergedEnv } : undefined,
      shell,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const chunks = []
    let timedOut = false

    child.stdout.on('data', (d) => chunks.push({ type: 'stdout', data: d.toString() }))
    child.stderr.on('data', (d) => chunks.push({ type: 'stderr', data: d.toString() }))

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)

    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ output: chunks, exitCode: code || 0, timedOut })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

// Convert streamed chunks into a text result.
function formatStreamResult(result) {
  if (!result || !result.output) return '(no output)'
  const parts = []
  let lastType = null
  for (const ch of result.output) {
    if (ch.type !== lastType) {
      if (ch.type === 'stdout') parts.push('[stdout]')
      else parts.push('[stderr]')
      lastType = ch.type
    }
    parts.push(ch.data)
  }
  const text = parts.join('').trim()
  const prefix = result.timedOut ? '[timed out] ' : result.exitCode !== 0 ? `[exit code: ${result.exitCode}] ` : ''
  return prefix + text.slice(0, 8192) + (text.length > 8192 ? '\n[truncated]' : '') || '(no output)'
}

module.exports = { streamCommand, formatStreamResult }
