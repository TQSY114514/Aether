// ─────────────────────────────────────────────────────────────────────────────
// sshBackend.js  — SSH remote ExecutionBackend
//
// Runs commands on a remote host via the system ssh client (OpenSSH).
//   execute({ host, user, port, command, args }) → spawn `ssh host command`
//   terminate() kills the LOCAL ssh client; the remote process may keep
//               running (documented limitation — no remote-side kill without
//               wrapping the command, which we do not do yet).
//   pause()/resume() → not supported (remote process control needs agent
//               tooling on the far side) → { ok:false, supported:false }.
// ─────────────────────────────────────────────────────────────────────────────

const { spawn } = require('child_process')

const MAX_TAIL = 64 * 1024
const executions = new Map()
let nextExecId = 1

// host/user 参数校验（安全审查 Low 项）：两者最终拼进 ssh argv，若以 `-`
// 开头会被 ssh 当作选项解析（如 `-oProxyCommand=...` 的 argv 注入）；
// 空白/引号/反斜杠同样能构造越权参数。只放行严格的 host/user 词法。
function validateSshIdent(value, label) {
  const s = String(value || '').trim()
  if (!s) return { ok: false, error: `${label} is required` }
  if (s.startsWith('-')) return { ok: false, error: `invalid ${label}: must not start with '-' (ssh option injection)` }
  if (/[\s"'\\`]/.test(s)) return { ok: false, error: `invalid ${label}: whitespace/quote characters are not allowed` }
  return { ok: true, value: s }
}

function capTail(buf, chunk) {
  return buf.length + chunk.length > MAX_TAIL ? (buf + chunk).slice(-MAX_TAIL) : buf + chunk
}

const sshBackend = {
  id: 'ssh',
  name: 'SSH Remote',
  supportsPause: false,

  /**
   * @param {object} opts
   * @param {string} opts.host        remote host (required)
   * @param {string} [opts.user]      ssh user (default: current user)
   * @param {number} [opts.port]      ssh port (default: 22)
   * @param {string} opts.command     remote command to run (single argv, no shell pipe on the client side)
   * @param {string[]} [opts.args]    extra args appended to the remote command
   * @param {number}  [opts.timeout]  client-side timeout ms (0 = none)
   */
  async execute({ host, user, port = 22, command = '', args = [], timeout = 0 }) {
    const hostCheck = validateSshIdent(host, 'host')
    if (!hostCheck.ok) return { ok: false, error: hostCheck.error }
    host = hostCheck.value
    if (user) {
      const userCheck = validateSshIdent(user, 'user')
      if (!userCheck.ok) return { ok: false, error: userCheck.error }
      user = userCheck.value
    }

    const sshArgs = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10']
    if (port && port !== 22) sshArgs.push('-p', String(port))
    const target = user ? `${user}@${host}` : host
    sshArgs.push(target)
    // Remote command: join command + args as ONE argv (ssh concatenates
    // remaining args with spaces on the REMOTE side's shell).
    if (command) sshArgs.push([command, ...args].join(' '))

    let child
    try {
      child = spawn('ssh', sshArgs, { windowsHide: true })
    } catch (err) {
      return { ok: false, error: `spawn ssh failed: ${err.message}` }
    }

    const execId = nextExecId++
    const entry = {
      execId, child, host, user, port, state: 'running',
      startedAt: Date.now(), finishedAt: null, exitCode: null,
      stdoutTail: '', stderrTail: '', killed: false,
    }
    executions.set(execId, entry)

    child.stdout?.on('data', (d) => { entry.stdoutTail = capTail(entry.stdoutTail, d.toString()) })
    child.stderr?.on('data', (d) => { entry.stderrTail = capTail(entry.stderrTail, d.toString()) })
    child.on('error', (err) => {
      entry.state = 'error'
      entry.finishedAt = Date.now()
      entry.stderrTail = capTail(entry.stderrTail, `[ssh error] ${err.message}\n`)
    })
    child.on('exit', (code) => {
      entry.state = entry.killed ? 'terminated' : (code === 0 ? 'exited' : 'error')
      entry.exitCode = code
      entry.finishedAt = Date.now()
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
    try {
      if (process.platform === 'win32') {
        if (e.child?.pid) {
          try { spawn('taskkill', ['/pid', String(e.child.pid), '/T', '/F'], { windowsHide: true }) } catch {}
        }
      } else {
        e.child?.kill('SIGKILL')
      }
    } catch (err) {
      return { ok: false, error: `terminate failed: ${err.message}` }
    }
    return { ok: true }
  },

  async pause()   { return { ok: false, supported: false, error: 'pause not supported for ssh backends' } },
  async resume()  { return { ok: false, supported: false, error: 'resume not supported for ssh backends' } },

  async dispose(execId) {
    const e = executions.get(execId)
    if (!e) return
    if (e.state === 'running') await sshBackend.terminate(execId)
    executions.delete(execId)
  },
}

module.exports = { sshBackend }