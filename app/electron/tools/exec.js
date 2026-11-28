// ───────────────────────────────────────────────────────────────────────────
// Safe command execution — spawn-based wrapper replacing child_process.exec().
//
// Unlike exec(), spawn() does NOT invoke a shell by default, so $(), backticks,
// pipes, and semicolons in the command string are treated as literal characters.
// This prevents command injection when the command string comes from an LLM.
//
// Usage:
//   // No shell needed (most tools):
//   const result = await runCommand('git', ['status', '--short'], { cwd })
//
//   // Shell features required (pipes, redirects, &&):
//   const result = await runCommand('cmd.exe', ['/c', 'echo hello | find "hel"'], {
//     shell: true, cwd, windowsHide: true
//   })
//
// Returns { stdout, stderr, exitCode, timedOut } or throws on spawn failure.
// ───────────────────────────────────────────────────────────────────────────

const { spawn } = require('child_process')
const { sanitizeProcessEnv } = require('./envSanitizer')

// Windows 进程树终止（对标 Codex 沙箱的 Job Object 隔离）:
// child.kill() 只杀主进程, cmd.exe /c 派生的孙进程会变孤儿继续跑。
// 用 taskkill /T /F 递归杀整棵树——零依赖的 Job Object 等效方案。
function killTree(pid) {
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } else {
      // POSIX: 杀进程组
      try { process.kill(-pid, 'SIGKILL') } catch {}
    }
    // 主进程本身也补一发
    try { process.kill(pid, 'SIGKILL') } catch {}
  } catch {}
}

/**
 * @param {string} command - Program to execute (e.g. 'git', 'cmd.exe', 'ls')
 * @param {string[]} args - Array of arguments (NOT a single shell string)
 * @param {object} [opts]
 * @param {string} [opts.cwd] - Working directory
 * @param {object} [opts.env] - Environment variables
 * @param {number} [opts.timeout=30000] - Kill timeout in ms
 * @param {number} [opts.maxBuffer=32*1024] - Max stdout+stderr buffer
 * @param {boolean} [opts.shell=false] - Run via shell (cmd.exe on Windows)
 * @param {boolean} [opts.windowsHide=true] - Hide console window on Windows
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number|null, timedOut: boolean}>}
 */
function runCommand(command, args, opts = {}) {
  return new Promise((resolve) => {
    const {
      cwd,
      env,
      timeout = 30000,
      maxBuffer = 32 * 1024,
      shell = false,
      windowsHide = true,
      signal = null,
    } = opts

    if (signal?.aborted) {
      resolve({ stdout: '', stderr: 'aborted', exitCode: null, timedOut: false, aborted: true })
      return
    }

    const nonInteractiveEnv = {
      CI: 'true',
      DEBIAN_FRONTEND: 'noninteractive',
      GIT_TERMINAL_PROMPT: '0',
      npm_config_yes: 'true',
      PIP_NO_INPUT: '1',
    }

    const child = spawn(command, args, {
      cwd,
      env: sanitizeProcessEnv(process.env, { ...nonInteractiveEnv, ...(env || {}) }),
      shell,
      windowsHide,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const stdoutParts = []
    const stderrParts = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let maxBufferTriggered = false
    let timedOut = false
    let aborted = false
    let settled = false

    const cleanupSignal = () => {
      if (signal) signal.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      aborted = true
      killTree(child.pid)
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })

    const handleChunk = (parts, isStderr, d) => {
      const nextBytes = (isStderr ? stderrBytes : stdoutBytes) + d.byteLength
      if (isStderr) stderrBytes = nextBytes
      else stdoutBytes = nextBytes
      if (!maxBufferTriggered) {
        parts.push(d)
        if (nextBytes > maxBuffer) {
          maxBufferTriggered = true
          killTree(child.pid)
        }
      }
    }

    child.stdout.on('data', (d) => handleChunk(stdoutParts, false, d))
    child.stderr.on('data', (d) => handleChunk(stderrParts, true, d))

    const timer = setTimeout(() => {
      timedOut = true
      killTree(child.pid)
    }, timeout)

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cleanupSignal()
      resolve({
        stdout: Buffer.concat(stdoutParts).toString('utf-8'),
        stderr: Buffer.concat(stderrParts).toString('utf-8'),
        exitCode: code,
        timedOut,
        aborted,
      })
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cleanupSignal()
      resolve({ stdout: '', stderr: err.message, exitCode: null, timedOut: false, aborted })
    })
  })
}

/**
 * Synchronous variant — useful for git commands in verification/commit paths.
 * @returns {{stdout: string, stderr: string, exitCode: number|null}}
 */
function runCommandSync(command, args, opts = {}) {
  const {
    cwd,
    env,
    windowsHide = true,
  } = opts

  if (typeof command !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(command) || command === 'cmd.exe' || command === 'sh' || command === 'bash') {
    throw new Error(`Disallowed or invalid binary: ${command}`)
  }

  const fs = require('fs')
  const safeCwd = cwd && typeof cwd === 'string' && !/[;&|`$><\r\n\0]/.test(cwd) && fs.existsSync(cwd) ? cwd : undefined
  const safeArgs = (Array.isArray(args) ? args : []).filter(a => typeof a === 'string' && !/[\r\n\0]/.test(a))

  const { execFileSync } = require('child_process')
  try {
    const stdout = execFileSync(command, safeArgs, {
      cwd: safeCwd,
      env: sanitizeProcessEnv(process.env, env || {}),
      windowsHide,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: opts.maxBuffer || 1024 * 1024,
      timeout: opts.timeout,
      encoding: 'utf-8',
    })
    return {
      stdout: stdout || '',
      stderr: '',
      exitCode: 0,
      error: null,
      truncated: false,
      timedOut: false,
    }
  } catch (child) {
    const isTruncated = child.code === 'ENOBUFS' || false
    const isTimedOut = child.code === 'ETIMEDOUT' || false
    return {
      stdout: (child.stdout ? child.stdout.toString('utf-8') : ''),
      stderr: (child.stderr ? child.stderr.toString('utf-8') : child.message || ''),
      exitCode: child.status != null ? child.status : (child.code ? 1 : 0),
      error: child.message || null,
      truncated: isTruncated,
      timedOut: isTimedOut,
    }
  }
}

module.exports = { runCommand, runCommandSync, killTree }
