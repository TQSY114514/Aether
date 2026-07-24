// ───────────────────────────────────────────────────────────────────────────
// Tool Streaming — incremental output for long-running tools.
//
// For tools like run_command that produce extended output, this module
// provides a streaming wrapper that yields chunks as they arrive.
// The tool loop can surface these chunks in real-time via onToolStream.
// ───────────────────────────────────────────────────────────────────────────

const { exec } = require('child_process')
const { getWorkspaceRoot } = require('../tools/sandbox')

function streamCommand(cmd, opts = {}) {
  const { cwd, timeoutMs = 120000, env, sessionId } = opts
  return new Promise((resolve, reject) => {
    // Apply session workspace as cwd if not specified.
    const effectiveCwd = cwd || (sessionId ? getWorkspaceRootForSession(sessionId) : undefined)
    const mergedEnv = env ? { ...process.env, ...env } : process.env
    const child = exec(cmd, { cwd: effectiveCwd, env: mergedEnv, maxBuffer: 1024 * 1024, timeout: Math.min(timeoutMs, 120000) })

    const chunks = []
    child.stdout.on('data', (d) => chunks.push({ type: 'stdout', data: d.toString() }))
    child.stderr.on('data', (d) => chunks.push({ type: 'stderr', data: d.toString() }))

    const timer = setTimeout(() => {
      child.kill()
      resolve({ output: chunks, exitCode: -1, timedOut: true })
    }, timeoutMs)

    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ output: chunks, exitCode: code || 0, timedOut: false })
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
