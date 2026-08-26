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
    } = opts

    const nonInteractiveEnv = {
      CI: 'true',
      DEBIAN_FRONTEND: 'noninteractive',
      GIT_TERMINAL_PROMPT: '0',
      npm_config_yes: 'true',
      PIP_NO_INPUT: '1',
    }

    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...nonInteractiveEnv, ...(env || {}) },
      shell,
      windowsHide,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const stdoutParts = []
    const stderrParts = []
    let timedOut = false

    child.stdout.on('data', (d) => {
      stdoutParts.push(d)
      if (Buffer.concat(stdoutParts).byteLength > maxBuffer) {
        killTree(child.pid)
      }
    })
    child.stderr.on('data', (d) => {
      stderrParts.push(d)
      if (Buffer.concat(stderrParts).byteLength > maxBuffer) {
        killTree(child.pid)
      }
    })

    const timer = setTimeout(() => {
      timedOut = true
      killTree(child.pid)
    }, timeout)

    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        stdout: Buffer.concat(stdoutParts).toString('utf-8'),
        stderr: Buffer.concat(stderrParts).toString('utf-8'),
        exitCode: code,
        timedOut,
      })
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ stdout: '', stderr: err.message, exitCode: null, timedOut: false })
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
    shell = false,
    windowsHide = true,
  } = opts

  const { spawnSync } = require('child_process')
  const child = spawnSync(command, args, {
    cwd,
    env: env ? { ...process.env, ...env } : undefined,
    shell,
    windowsHide,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024,
  })

  return {
    stdout: (child.stdout || Buffer.from('')).toString('utf-8'),
    stderr: (child.stderr || Buffer.from('')).toString('utf-8'),
    exitCode: child.status,
  }
}

module.exports = { runCommand, runCommandSync, killTree }
