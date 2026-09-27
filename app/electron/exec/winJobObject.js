// ─────────────────────────────────────────────────────────────────────────────
// winJobObject.js — Windows Native Kernel Job Object Sandbox Controller
//
// Manages the Win32 Job Object supervisor for local process execution.
// Applies:
//   1. JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE (0x2000): Child processes are
//      forcefully terminated by Windows kernel when Aether exits or crashes,
//      preventing orphaned zombies.
//   2. JOB_OBJECT_LIMIT_PROCESS_MEMORY (0x0100): 2GB hard ceiling per task.
// ─────────────────────────────────────────────────────────────────────────────

const { spawn } = require('child_process')
const path = require('path')
const readline = require('readline')
const log = require('../logger')

const IS_WINDOWS = process.platform === 'win32'
const DEFAULT_MEMORY_LIMIT = 2 * 1024 * 1024 * 1024 // 2GB

let supervisorProcess = null
let supervisorRl = null
let isReady = false
let initPromise = null
const pendingAssigns = new Map()

function isSupported() {
  return IS_WINDOWS
}

async function ensureSupervisor(memoryLimit = DEFAULT_MEMORY_LIMIT) {
  if (!IS_WINDOWS) return false
  if (isReady && supervisorProcess && !supervisorProcess.killed) return true
  if (initPromise) return initPromise

  initPromise = new Promise((resolve) => {
    try {
      const scriptPath = path.join(__dirname, 'jobSupervisor.ps1')
      supervisorProcess = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-File', scriptPath,
          '-MemoryLimitBytes', String(memoryLimit),
        ],
        {
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      )

      supervisorRl = readline.createInterface({
        input: supervisorProcess.stdout,
        crlfDelay: Infinity,
      })

      supervisorRl.on('line', (line) => {
        const text = line.trim()
        if (text === 'READY') {
          isReady = true
          resolve(true)
          return
        }

        if (text.startsWith('OK ')) {
          const pid = parseInt(text.slice(3).trim(), 10)
          const handler = pendingAssigns.get(pid)
          if (handler) {
            pendingAssigns.delete(pid)
            clearTimeout(handler.timer)
            handler.resolve({ ok: true, pid })
          }
        } else if (text.startsWith('ERR ')) {
          const rest = text.slice(4).trim()
          const spaceIdx = rest.indexOf(' ')
          const pidStr = spaceIdx > 0 ? rest.slice(0, spaceIdx) : rest
          const errMsg = spaceIdx > 0 ? rest.slice(spaceIdx + 1) : 'Unknown error'
          const pid = parseInt(pidStr, 10)
          const handler = pendingAssigns.get(pid)
          if (handler) {
            pendingAssigns.delete(pid)
            clearTimeout(handler.timer)
            handler.resolve({ ok: false, pid, error: errMsg })
          }
        }
      })

      supervisorProcess.stderr?.on('data', (d) => {
        log.warn?.('[winJobObject] Supervisor stderr:', d.toString().trim())
      })

      supervisorProcess.on('error', (err) => {
        log.warn?.('[winJobObject] Supervisor spawn error:', err.message)
        cleanup()
        resolve(false)
      })

      supervisorProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          log.warn?.(`[winJobObject] Supervisor exited with code ${code}`)
        }
        cleanup()
      })

      // Timeout for startup readiness (5 seconds)
      setTimeout(() => {
        if (!isReady) {
          log.warn?.('[winJobObject] Supervisor initialization timed out')
          cleanup()
          resolve(false)
        }
      }, 5000).unref?.()

    } catch (err) {
      log.warn?.('[winJobObject] Exception starting supervisor:', err.message)
      cleanup()
      resolve(false)
    }
  })

  return initPromise
}

function cleanup() {
  isReady = false
  initPromise = null
  for (const [pid, handler] of pendingAssigns.entries()) {
    clearTimeout(handler.timer)
    handler.resolve({ ok: false, pid, error: 'Supervisor exited' })
  }
  pendingAssigns.clear()
  if (supervisorRl) {
    try { supervisorRl.close() } catch {}
    supervisorRl = null
  }
  supervisorProcess = null
}

/**
 * Assign a running Windows process to the Job Object sandbox.
 * @param {number} pid - Target Process ID
 * @param {number} [timeoutMs=3000] - Timeout for assignment
 * @returns {Promise<{ ok: boolean, pid?: number, error?: string, supported?: boolean }>}
 */
async function assignProcess(pid, timeoutMs = 3000) {
  if (!IS_WINDOWS) {
    return { ok: false, supported: false, error: 'Windows Job Objects are only supported on Win32' }
  }
  if (!pid || typeof pid !== 'number') {
    return { ok: false, error: 'Invalid PID' }
  }

  const ready = await ensureSupervisor()
  if (!ready || !supervisorProcess || supervisorProcess.killed) {
    return { ok: false, error: 'Supervisor not available' }
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingAssigns.delete(pid)
      resolve({ ok: false, pid, error: 'Assignment timed out' })
    }, timeoutMs)
    timer.unref?.()

    pendingAssigns.set(pid, { resolve, timer })

    try {
      supervisorProcess.stdin.write(`ASSIGN ${pid}\n`)
    } catch (err) {
      pendingAssigns.delete(pid)
      clearTimeout(timer)
      resolve({ ok: false, pid, error: err.message })
    }
  })
}

function shutdown() {
  if (supervisorProcess && !supervisorProcess.killed) {
    try {
      supervisorProcess.stdin.write('QUIT\n')
      supervisorProcess.stdin.end()
    } catch {}
  }
  cleanup()
}

// Graceful cleanup on parent process exit
process.on('exit', () => {
  shutdown()
})

module.exports = {
  isSupported,
  ensureSupervisor,
  assignProcess,
  shutdown,
}
