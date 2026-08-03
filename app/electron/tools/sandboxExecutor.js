// ───────────────────────────────────────────────────────────────────────────
// Sandbox Executor — safe JavaScript subset execution with process isolation.
//
// Provides a restricted execution environment for running untrusted commands
// by:
//   - Whitelisting allowed binaries (node, npm, npx only)
//   - Blocking shell metacharacters to prevent command injection
//   - Creating isolated temp directories per execution
//   - Enforcing output size limits (4000 chars)
//   - Enforcing timeouts (60s per command)
//   - Sanitizing environment variables
//
// Returns { ok, stdout, stderr, exitCode }
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')

// ─── Configuration ─────────────────────────────────────────────────────────

const ALLOWED_COMMANDS = ['node', 'npm', 'npx']
const SHELL_META_PATTERN = /[;|&$`<>]/ // Shell metacharacters to block
const MAX_OUTPUT_CHARS = 4000
const DEFAULT_TIMEOUT_MS = 60_000
const CLEAN_ENV_KEYS = ['PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Resolve the full path of a whitelisted command.
 * @param {string} cmd - Command name (node, npm, npx)
 * @returns {string|null} Full path if found, null otherwise
 */
function resolveCommand(cmd) {
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.exe' : ''
  const paths = (process.env.PATH || '').split(path.delimiter)

  for (const p of paths) {
    const full = path.join(p, cmd + ext)
    try {
      if (fs.statSync(full).isFile()) return full
    } catch {
      // Not found in this path entry
    }
  }
  return null
}

/**
 * Validate that a command string is safe to execute.
 * Throws if validation fails.
 * @param {string} command - The command to validate
 * @returns {string} The resolved full path of the command
 */
function validateCommand(command) {
  if (!command || typeof command !== 'string') {
    throw new Error('Command must be a non-empty string')
  }

  const trimmed = command.trim().toLowerCase()

  // Check if the command is on the whitelist
  const allowed = ALLOWED_COMMANDS.find(a => trimmed === a || trimmed.startsWith(a + ' '))
  if (!allowed) {
    throw new Error(`Command "${command}" is not allowed. Only ${ALLOWED_COMMANDS.join(', ')} are permitted.`)
  }

  // Extract the base command name (first word)
  const baseCmd = trimmed.split(/\s+/)[0]

  // Resolve the full path
  const resolved = resolveCommand(baseCmd)
  if (!resolved) {
    throw new Error(`Could not resolve "${baseCmd}" in PATH`)
  }

  return resolved
}

/**
 * Check if a string contains shell metacharacters.
 * @param {string} str
 * @returns {boolean}
 */
function hasShellMetacharacters(str) {
  return SHELL_META_PATTERN.test(str)
}

/**
 * Create a sanitized environment object for the child process.
 * Strips sensitive variables and sets minimal required vars.
 * @returns {object}
 */
function createSanitizedEnv() {
  const env = { ...process.env }

  // Keep only essential vars, strip the rest
  const cleanEnv = {}
  for (const key of CLEAN_ENV_KEYS) {
    if (env[key] !== undefined) {
      cleanEnv[key] = env[key]
    }
  }

  // Ensure TEMP/TMP exist for npm/node to work
  if (!cleanEnv.TEMP) cleanEnv.TEMP = os.tmpdir()
  if (!cleanEnv.TMP) cleanEnv.TMP = os.tmpdir()

  return cleanEnv
}

/**
 * Create a temporary working directory.
 * @returns {string} Path to the created temp directory
 */
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aether-sandbox-'))
}

/**
 * Clean up a temporary directory.
 * @param {string} dirPath
 */
function cleanupTempDir(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true })
  } catch {
    // Best-effort cleanup
  }
}

// ─── Main Executor ─────────────────────────────────────────────────────────

/**
 * Execute a command in the sandbox.
 *
 * @param {string} command - The command to run (e.g. "node script.js")
 * @param {object} [opts]
 * @param {string[]} [opts.args] - Additional arguments (will be appended after parsing command)
 * @param {string} [opts.cwd] - Working directory (if not set, a temp dir is created)
 * @param {number} [opts.timeout] - Timeout in ms (default 60000)
 * @param {object} [opts.env] - Additional environment variables to merge
 * @param {boolean} [opts.cleanup] - Auto-cleanup temp dir on completion (default true)
 * @returns {Promise<{ok: boolean, stdout: string, stderr: string, exitCode: number|null}>}
 */
async function runInSandbox(command, opts = {}) {
  const {
    args: extraArgs = [],
    cwd: explicitCwd,
    timeout = DEFAULT_TIMEOUT_MS,
    env: extraEnv = {},
    cleanup = true,
  } = opts

  // Validate the command
  let resolvedPath
  let cmdArgs = []
  try {
    resolvedPath = validateCommand(command)

    // Parse remaining args from the command string
    const parts = command.trim().split(/\s+/)
    cmdArgs = parts.slice(1).concat(extraArgs).filter(Boolean)

    // Check all arguments for shell metacharacters
    for (const arg of cmdArgs) {
      if (hasShellMetacharacters(arg)) {
        return {
          ok: false,
          stdout: '',
          stderr: `Blocked: argument contains shell metacharacters: "${arg}"`,
          exitCode: null,
        }
      }
    }
  } catch (err) {
    return {
      ok: false,
      stdout: '',
      stderr: err.message,
      exitCode: null,
    }
  }

  // Create temp directory if no explicit cwd
  const tempDir = explicitCwd || createTempDir()
  const workDir = explicitCwd || tempDir

  // Ensure work directory exists
  if (!fs.existsSync(workDir)) {
    fs.mkdirSync(workDir, { recursive: true })
  }

  // Create sanitized environment
  const env = { ...createSanitizedEnv(), ...extraEnv }

  return new Promise((resolve) => {
    const child = spawn(resolvedPath, cmdArgs, {
      cwd: workDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false, // Never use shell — prevents injection
    })

    const stdoutChunks = []
    const stderrChunks = []
    let stdoutLen = 0
    let stderrLen = 0
    let timedOut = false
    child.stdout.on('data', (d) => {
      if (stdoutLen < MAX_OUTPUT_CHARS) {
        const str = d.toString('utf-8')
        const available = MAX_OUTPUT_CHARS - stdoutLen
        stdoutChunks.push(str.slice(0, available))
        stdoutLen += Math.min(str.length, available)
      }
    })

    child.stderr.on('data', (d) => {
      if (stderrLen < MAX_OUTPUT_CHARS) {
        const str = d.toString('utf-8')
        const available = MAX_OUTPUT_CHARS - stderrLen
        stderrChunks.push(str.slice(0, available))
        stderrLen += Math.min(str.length, available)
      }
    })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      // Give it a moment, then force kill
      setTimeout(() => {
        try { child.kill('SIGKILL') } catch {}
      }, 2000)
    }, timeout)

    child.on('error', (err) => {
      clearTimeout(timer)
      if (cleanup && !explicitCwd) cleanupTempDir(tempDir)
      resolve({
        ok: false,
        stdout: stdoutChunks.join(''),
        stderr: err.message,
        exitCode: null,
      })
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (cleanup && !explicitCwd) cleanupTempDir(tempDir)

      const stdout = stdoutChunks.join('')
      const stderr = stderrChunks.join('')
      const truncated = stdoutLen >= MAX_OUTPUT_CHARS || stderrLen >= MAX_OUTPUT_CHARS
      const ok = code === 0 && !timedOut

      resolve({
        ok,
        stdout: stdout + (truncated && stdoutLen >= MAX_OUTPUT_CHARS ? '\n[output truncated]' : ''),
        stderr: stderr + (truncated && stderrLen >= MAX_OUTPUT_CHARS ? '\n[output truncated]' : ''),
        exitCode: timedOut ? null : code,
      })
    })
  })
}

/**
 * Check if a given command string passes the sandbox validator.
 * Useful for pre-flight checks.
 *
 * @param {string} command
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkCommand(command) {
  if (!command || typeof command !== 'string') {
    return { allowed: false, reason: 'Command must be a non-empty string' }
  }

  const trimmed = command.trim()
  if (!trimmed) {
    return { allowed: false, reason: 'Command is empty' }
  }

  const baseCmd = trimmed.split(/\s+/)[0].toLowerCase()

  if (!ALLOWED_COMMANDS.includes(baseCmd)) {
    return {
      allowed: false,
      reason: `"${baseCmd}" is not allowed. Only ${ALLOWED_COMMANDS.join(', ')} are permitted.`,
    }
  }

  // Check for shell metacharacters in the full command string
  if (hasShellMetacharacters(trimmed)) {
    return { allowed: false, reason: 'Command contains shell metacharacters' }
  }

  return { allowed: true }
}

module.exports = {
  runInSandbox,
  checkCommand,
  ALLOWED_COMMANDS,
  MAX_OUTPUT_CHARS,
  DEFAULT_TIMEOUT_MS,
}