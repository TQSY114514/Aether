// ─────────────────────────────────────────────────────────────────────────────
// localBackend.js  — Local spawn ExecutionBackend
//
// Executes commands as child processes on the host machine. No shell
// interpretation (spawn with args array). stdout/stderr are tail-buffered so
// status() can serve progress without holding the full output in memory.
//
// Contract notes:
//   - execute() returns an execId immediately; the process runs detached.
//   - terminate() kills the whole process tree on Windows (taskkill /T),
//     SIGKILL elsewhere.
//   - pause()/resume() are POSIX-only (SIGSTOP/SIGCONT). On Windows they
//     return { ok:false, supported:false } honestly, instead of pretending.
// ─────────────────────────────────────────────────────────────────────────────

const { spawn } = require('child_process')
const os = require('os')

const MAX_TAIL = 64 * 1024      // bytes kept per stream (stdout/stderr)
const DEFAULT_TIMEOUT = 60_000  // ms; 0 = no timeout

const executions = new Map()
let nextExecId = 1

// ─── exec record helpers ────────────────────────────────────────────────────

function capTail(buf, chunk) {
  if (buf.length + chunk.length > MAX_TAIL) {
    return (buf + chunk).slice(-MAX_TAIL)
  }
  return buf + chunk
}

function record(execId, patch) {
  const e = executions.get(execId)
  if (!e) return
  Object.assign(e, patch)
  if (patch.finishedAt) e.state = patch.state || e.state
}

// ─── backend implementation ─────────────────────────────────────────────────

const localBackend = {
  id: 'local',
  name: 'Local Process',
  supportsPause: process.platform !== 'win32',

  async execute({ command, args = [], cwd, env, timeout = DEFAULT_TIMEOUT, maxBuffer = MAX_TAIL }) {
    if (!command || typeof command !== 'string') return { ok: false, error: 'command is required' }
    const execId = nextExecId++
    const startedAt = Date.now()

    let child
    try {
      child = spawn(command, args, {
        cwd: cwd || process.cwd(),
        env: { ...process.env, ...(env || {}) },
        windowsHide: true,
      })
    } catch (err) {
      return { ok: false, error: `spawn failed: ${err.message}` }
    }

    const entry = {
      execId,
      child,
      state: 'running',
      startedAt,
      finishedAt: null,
      exitCode: null,
      stdoutTail: '',
      stderrTail: '',
      killed: false,
    }
    executions.set(execId, entry)

    // Cap the tail on every chunk.
    child.stdout?.on('data', (d) => { entry.stdoutTail = capTail(entry.stdoutTail, d.toString()) })
    child.stderr?.on('data', (d) => { entry.stderrTail = capTail(entry.stderrTail, d.toString()) })

    child.on('error', (err) => {
      entry.state = 'error'
      entry.finishedAt = Date.now()
      entry.exitCode = null
      entry.stderrTail = capTail(entry.stderrTail, `[spawn error] ${err.message}\n`)
    })

    child.on('exit', (code, signal) => {
      entry.state = entry.killed ? 'terminated' : (code === 0 ? 'exited' : 'error')
      entry.exitCode = code
      entry.finishedAt = Date.now()
      if (signal) entry.stderrTail = capTail(entry.stderrTail, `[terminated by signal ${signal}]\n`)
      // Free the child reference; execute() consumers hold the execId only.
      entry.child = null
    })

    if (timeout > 0) {
      setTimeout(() => {
        if (entry.state === 'running') {
          entry.state = 'error'
          entry.stderrTail = capTail(entry.stderrTail, `[timeout after ${timeout}ms]\n`)
          try { child.kill('SIGKILL') } catch {}
        }
      }, timeout).unref?.()
    }

    return { ok: true, execId, pid: child.pid }
  },

  async status(execId) {
    const e = executions.get(execId)
    if (!e) return { ok: false, error: 'unknown execId' }
    return {
      ok: true,
      state: e.state,
      exitCode: e.exitCode,
      stdoutTail: e.stdoutTail,
      stderrTail: e.stderrTail,
      startedAt: e.startedAt,
      finishedAt: e.finishedAt,
    }
  },

  async terminate(execId) {
    const e = executions.get(execId)
    if (!e) return { ok: false, error: 'unknown execId' }
    if (['exited', 'terminated', 'error'].includes(e.state)) return { ok: true, already: true }
    e.killed = true
    const pid = e.child?.pid
    if (!pid) return { ok: true, already: true }
    try {
      if (process.platform === 'win32') {
        // process tree kill via taskkill, then best-effort fallback
        try { spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }) } catch {}
      } else {
        e.child.kill('SIGKILL')
      }
    } catch (err) {
      return { ok: false, error: `terminate failed: ${err.message}` }
    }
    return { ok: true }
  },

  async pause(execId) {
    const e = executions.get(execId)
    if (!e) return { ok: false, error: 'unknown execId' }
    if (e.state !== 'running') return { ok: false, supported: true, error: `cannot pause ${e.state}` }
    if (process.platform === 'win32') return { ok: false, supported: false, error: 'process suspend not supported on Windows' }
    try {
      process.kill(e.child.pid, 'SIGSTOP')
      e.state = 'paused'
      return { ok: true, supported: true }
    } catch (err) {
      return { ok: false, supported: true, error: err.message }
    }
  },

  async resume(execId) {
    const e = executions.get(execId)
    if (!e) return { ok: false, error: 'unknown execId' }
    if (e.state !== 'paused') return { ok: false, supported: true, error: `not paused (${e.state})` }
    if (process.platform === 'win32') return { ok: false, supported: false, error: 'process resume not supported on Windows' }
    try {
      process.kill(e.child.pid, 'SIGCONT')
      e.state = 'running'
      return { ok: true, supported: true }
    } catch (err) {
      return { ok: false, supported: true, error: err.message }
    }
  },

  async dispose(execId) {
    const e = executions.get(execId)
    if (!e) return
    if (e.state === 'running' || e.state === 'paused') {
      await localBackend.terminate(execId)
    }
    executions.delete(execId)
  },
}

module.exports = { localBackend }