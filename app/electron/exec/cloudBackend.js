// ─────────────────────────────────────────────────────────────────────────────
// cloudBackend.js  —  Cloud Sandbox ExecutionBackend
//
// A cloud backend executes commands on a REMOTE managed sandbox (or a
// self-hosted remote runner) and streams status back through the SAME
// ExecutionBackend contract as local/docker/ssh, so the TaskScheduler and
// agent tooling work unchanged.
//
// Two transport modes (chosen per execute() call):
//   1. `ssh`   — delegate to the existing sshBackend (any host reachable by
//                OpenSSH works as a "cloud sandbox": GitHub Actions runner,
//                CI VPS, dev box, ...).
//   2. `http`  — a managed sandbox API: POST {endpoint}/exec to start a job,
//                GET {endpoint}/exec/{id} to poll, POST .../terminate to kill.
//                The response shape is the same registry contract.
//
// Design rules:
//   - A cloud target must be EXPLICITLY configured per execute call (host or
//     endpoint). No configuration → { ok:false, error } — never a crash, so
//     the flag exec.cloud can be on without a configured provider.
//   - pause/resume are not supported (remote process control) — honest
//     { ok:false, supported:false } like sshBackend.
// ─────────────────────────────────────────────────────────────────────────────

const { sshBackend } = require('./sshBackend')

// In-memory registry of running HTTP jobs: execId → { endpoint, token, jobId, state, ... }
const jobs = new Map()
let nextExecId = 1

// Timeout for a single HTTP call to the sandbox API.
const HTTP_TIMEOUT_MS = 15000

// ─── HTTP transport ──────────────────────────────────────────────────────────

// One-shot fetch with timeout; returns { ok, status, data, error }.
async function httpJson(endpoint, path, { method = 'GET', token, body } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS)
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(`${endpoint}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    if (!res.ok) return { ok: false, status: res.status, data, error: `sandbox API ${res.status}: ${String(data).slice(0, 200)}` }
    return { ok: true, status: res.status, data }
  } catch (e) {
    const msg = e && e.name === 'AbortError' ? 'sandbox API timeout' : (e && e.message) || String(e)
    return { ok: false, error: msg }
  } finally {
    clearTimeout(timer)
  }
}

// ─── Cloud backend ───────────────────────────────────────────────────────────

const cloudBackend = {
  id: 'cloud',
  name: 'Cloud Sandbox',
  supportsPause: false,

  /**
   * @param {object} opts
   * @param {string} opts.command   command to run on the remote sandbox
   * @param {string[]} [opts.args]
   * @param {object} [opts.ssh]     { host, user, port } — delegate to sshBackend
   * @param {object} [opts.http]    { endpoint, token } — managed sandbox API
   * @param {number} [opts.timeout]
   */
  async execute({ command, args = [], ssh, http, timeout = 0 }) {
    // 1. SSH transport (OpenSSH reachable host as the sandbox) — an empty
    //    object still means "I chose ssh"; its own validation reports a
    //    missing host.
    if (ssh) {
      return sshBackend.execute({ host: ssh.host, user: ssh.user, port: ssh.port, command, args, timeout })
    }
    // 2. HTTP transport (managed sandbox API).
    if (http && http.endpoint) {
      const r = await httpJson(http.endpoint, '/exec', {
        method: 'POST',
        token: http.token,
        body: { command, args, timeout },
      })
      if (!r.ok) return { ok: false, error: r.error }
      const jobId = r.data && (r.data.jobId || r.data.id)
      if (!jobId) return { ok: false, error: 'sandbox API did not return a job id' }
      const execId = nextExecId++
      jobs.set(execId, {
        execId, endpoint: http.endpoint, token: http.token, jobId,
        state: 'running', startedAt: Date.now(), finishedAt: null, exitCode: null,
        stdoutTail: '', stderrTail: '',
      })
      // Kick off a background poll loop so status() has fresh tails.
      pollJob(execId).catch(() => {})
      return { ok: true, execId, jobId }
    }
    // 3. Nothing configured — honest failure, never a crash.
    return { ok: false, error: 'cloud backend not configured: pass { ssh: { host } } or { http: { endpoint } } to execute()' }
  },

  async status(execId) {
    const e = jobs.get(execId)
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
    const e = jobs.get(execId)
    if (!e) return { ok: false, error: 'unknown execId' }
    if (['exited', 'terminated', 'error'].includes(e.state)) return { ok: true, already: true }
    e.state = 'terminated'
    e.finishedAt = Date.now()
    // Best-effort remote kill.
    if (e.endpoint) {
      await httpJson(e.endpoint, `/exec/${e.jobId}/terminate`, { method: 'POST', token: e.token })
    }
    return { ok: true }
  },

  async pause()  { return { ok: false, supported: false, error: 'pause not supported for cloud backends' } },
  async resume() { return { ok: false, supported: false, error: 'resume not supported for cloud backends' } },

  async dispose(execId) {
    const e = jobs.get(execId)
    if (!e) return
    if (e.state === 'running') await cloudBackend.terminate(execId)
    jobs.delete(execId)
  },
}

// ─── Background polling ─────────────────────────────────────────────────────

// Poll a remote job until it exits, folding state+tails into the local record.
async function pollJob(execId) {
  const e = jobs.get(execId)
  if (!e || !e.endpoint) return
  for (let i = 0; i < 600; i++) { // up to ~10 min of polling
    const cur = jobs.get(execId)
    if (!cur || cur.state !== 'running') return
    const r = await httpJson(e.endpoint, `/exec/${e.jobId}`, { token: e.token })
    // Re-check after the await — terminate() may have flipped the state while
    // the HTTP call was in flight; never overwrite a terminal state.
    const live = jobs.get(execId)
    if (!live || live.state !== 'running') return
    if (!r.ok) {
      // Transient failure — keep polling (the sandbox may be busy).
      await sleep(1000)
      continue
    }
    const d = r.data || {}
    if (typeof d.state === 'string' && d.state !== 'running') live.state = d.state
    if (d.stdout) live.stdoutTail = capTail(live.stdoutTail, String(d.stdout))
    if (d.stderr) live.stderrTail = capTail(live.stderrTail, String(d.stderr))
    if (d.exitCode !== undefined && d.exitCode !== null) {
      live.exitCode = d.exitCode
      live.finishedAt = Date.now()
      if (live.state === 'running') live.state = d.exitCode === 0 ? 'exited' : 'error'
      return
    }
    await sleep(1000)
  }
}

function capTail(buf, chunk) {
  const MAX = 64 * 1024
  return buf.length + chunk.length > MAX ? (buf + chunk).slice(-MAX) : buf + chunk
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)) }

module.exports = { cloudBackend, httpJson, pollJob }
