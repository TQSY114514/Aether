// ─────────────────────────────────────────────────────────────────────────────
// dockerBackend.js  — Docker sandbox ExecutionBackend
//
// Runs commands inside a disposable container via the docker CLI
// (docker run -d / inspect / logs / pause / unpause / kill). Building blocks:
//
//   execute({ image, command, args, env, ... }) → container id as execId
//   status()  → docker inspect + docker logs --tail
//   pause()/resume() → docker pause / docker unpause (natively supported)
//   terminate()      → docker kill <container>
//
// The backend degrades gracefully: if the docker CLI is missing/unusable,
// execute() returns { ok:false, error } — it never throws and never hangs
// (all child processes are spawned with liberal timeouts when possible).
// ─────────────────────────────────────────────────────────────────────────────

const { spawn } = require('child_process')

const LOG_TAIL_LINES = 100
const executions = new Map()
let nextExecId = 1

function runCli(args, timeoutMs = 15_000) {
  // Returns a Promise<{ code, stdout, stderr }>. Timeout kills the CLI child.
  return new Promise((resolve) => {
    let child
    try {
      child = spawn('docker', args, { windowsHide: true })
    } catch (err) {
      resolve({ code: -1, stdout: '', stderr: err.message })
      return
    }
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { child.kill('SIGKILL') } catch {}
      resolve({ code: -1, stdout, stderr: stderr + '\n[timeout]\n' })
    }, timeoutMs)
    timer.unref?.()
    child.stdout?.on('data', (d) => { stdout += d.toString() })
    child.stderr?.on('data', (d) => { stderr += d.toString() })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: err.message })
    })
    child.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

const dockerBackend = {
  id: 'docker',
  name: 'Docker Sandbox',
  supportsPause: true,

  async execute({ image, command = 'sh', args = [], env = {}, network = 'none' }) {
    if (!image) return { ok: false, error: 'image is required' }

    // Probe the docker CLI lazily (cached per call-site; cheap enough).
    const probe = await runCli(['version', '--format', '{{.Server.Version}}'], 8_000)
    if (probe.code !== 0) {
      const hint = /not recognized|no such file/i.test(probe.stderr) ? 'docker CLI not found' : probe.stderr.trim().split('\n')[0] || 'docker daemon unreachable'
      return { ok: false, error: hint }
    }

    const runArgs = ['run', '-d', '--rm', '--network', network]
    for (const [k, v] of Object.entries(env)) {
      runArgs.push('-e', `${k}=${v}`)
    }
    runArgs.push(image, command, ...args)

    const res = await runCli(runArgs, 30_000)
    if (res.code !== 0) {
      return { ok: false, error: res.stderr.trim() || res.stdout.trim() || `docker run exited ${res.code}` }
    }
    const containerId = res.stdout.trim().split('\n')[0]
    if (!containerId) return { ok: false, error: 'docker run returned no container id' }

    const execId = nextExecId++
    executions.set(execId, {
      execId, containerId, image, state: 'running', startedAt: Date.now(), finishedAt: null,
    })
    return { ok: true, execId, containerId }
  },

  async status(execId) {
    const e = executions.get(execId)
    if (!e) return { ok: false, error: 'unknown execId' }
    const inspect = await runCli(['inspect', '-f', '{{.State.Status}}', e.containerId])
    let state
    if (inspect.code !== 0) {
      // Container gone (--rm after exit). Fall back to last known state.
      state = e.finishedAt ? 'exited' : 'error'
    } else {
      const status = inspect.stdout.trim()
      state = status === 'paused' ? 'paused'
        : status === 'running' ? 'running'
        : (e.finishedAt ? 'exited' : status === 'exited' ? 'exited' : 'error')
      if (status === 'exited' && !e.finishedAt) e.finishedAt = Date.now()
    }
    const logs = await runCli(['logs', '--tail', String(LOG_TAIL_LINES), e.containerId])
    return {
      ok: true,
      state,
      stdoutTail: logs.stdout.slice(0, 64 * 1024),
      stderrTail: logs.stderr.slice(0, 64 * 1024),
      startedAt: e.startedAt,
      finishedAt: e.finishedAt,
      containerId: e.containerId,
    }
  },

  async terminate(execId) {
    const e = executions.get(execId)
    if (!e) return { ok: false, error: 'unknown execId' }
    const res = await runCli(['kill', e.containerId])
    e.finishedAt = Date.now()
    return res.code === 0 ? { ok: true } : { ok: false, error: res.stderr.trim() || 'docker kill failed' }
  },

  async pause(execId) {
    const e = executions.get(execId)
    if (!e) return { ok: false, error: 'unknown execId' }
    const res = await runCli(['pause', e.containerId])
    return res.code === 0 ? { ok: true, supported: true } : { ok: false, supported: true, error: res.stderr.trim() || 'docker pause failed' }
  },

  async resume(execId) {
    const e = executions.get(execId)
    if (!e) return { ok: false, error: 'unknown execId' }
    const res = await runCli(['unpause', e.containerId])
    return res.code === 0 ? { ok: true, supported: true } : { ok: false, supported: true, error: res.stderr.trim() || 'docker unpause failed' }
  },

  async dispose(execId) {
    const e = executions.get(execId)
    if (!e) return
    await dockerBackend.terminate(execId)
    executions.delete(execId)
  },
}

module.exports = { dockerBackend }