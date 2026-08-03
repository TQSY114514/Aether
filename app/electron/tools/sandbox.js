// sandbox.js with whitelist mode
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

let _workspaceRoot = null
let _sessionWorkspaces = new Map()

function setWorkspaceRoot(p) { _workspaceRoot = p ? path.resolve(p) : null }
function setWorkspaceRootForSession(sessionId, p) {
  if (p && String(p).trim()) { _sessionWorkspaces.set(sessionId, path.resolve(p)) }
  else { _sessionWorkspaces.delete(sessionId) }
}
function clearSessionWorkspaces() { _sessionWorkspaces.clear() }

function getWorkspaceRoot(sessionId) {
  if (sessionId && _sessionWorkspaces.has(sessionId)) return _sessionWorkspaces.get(sessionId)
  return _workspaceRoot || defaultWorkspace()
}

function defaultWorkspace() {
  const dir = path.join(app.getPath('userData'), 'workspace')
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  return dir
}

function resolveInside(target, { mustExist = false } = {}, sessionId) {
  const root = getWorkspaceRoot(sessionId)
  let abs = path.isAbsolute(target) ? target : path.join(root, target)
  let resolved
  try { resolved = fs.realpathSync(abs) }
  catch {
    if (mustExist) return { ok: false, reason: 'path does not exist', abs }
    try {
      const parentReal = fs.realpathSync(path.dirname(abs))
      resolved = path.join(parentReal, path.basename(abs))
    } catch { resolved = path.normalize(abs) }
  }
  const rootResolved = path.normalize(root)
  const inside = resolved === rootResolved || resolved.startsWith(rootResolved + path.sep)
  return { ok: inside, resolved, root: rootResolved, abs }
}

function isInsideWorkspace(target, sessionId) {
  const r = resolveInside(target, {}, sessionId)
  return r.ok === true
}

function checkWritePath(target, sessionId) {
  const r = resolveInside(target, { mustExist: false }, sessionId)
  if (r.ok === true) return { ok: true }
  return { ok: false, reason: 'path outside workspace', abs: r.abs }
}

// Command Whitelist
const SAFE_COMMAND_WHITELIST = new Set([
  'node', 'npm', 'npx', 'yarn', 'pnpm', 'bun',
  'git', 'python', 'python3', 'py', 'pip', 'pip3',
  'dir', 'ls', 'tree', 'type', 'cat', 'head', 'tail', 'more',
  'echo', 'mkdir', 'rmdir', 'cd', 'pwd',
  'where', 'which', 'whoami', 'date', 'time', 'ver',
  'make', 'cmake', 'ninja', 'cargo', 'go', 'rustc',
  'apt', 'apt-get', 'brew', 'choco', 'winget',
  'findstr', 'grep', 'sort', 'uniq', 'wc',
  'ping', 'nslookup', 'tracert', 'netstat', 'tasklist', 'ps',
])

function isWhitelistedCommand(cmd) {
  const c = String(cmd || '').trim()
  if (!c) return false
  const base = c.split(/\s+/)[0].toLowerCase()
  const baseNoExt = base.replace(/\.(exe|cmd|bat|com|ps1)$/i, '')
  let basename = ''
  try { basename = path.basename(base).replace(/\.(exe|cmd|bat|com|ps1)$/i, '') } catch {}
  return SAFE_COMMAND_WHITELIST.has(base) || SAFE_COMMAND_WHITELIST.has(baseNoExt) || SAFE_COMMAND_WHITELIST.has(basename)
}

// Command Blocklist
const BLOCKED_COMMAND_PATTERNS = [
  /\bformat\b\s+[a-z]:/i, /\bformat\b\s+\/fs/i, /\/dev\/(?:sd|nvme|hd)/i,
  /\bdiskpart\b/i, /\brm\s+-rf\s+(?:\/|\/[a-z]+\s|~|C:\\windows|C:\\users\\[^/\\]+\\desktop)/i,
  /\brmdir\s+\/s\b/i, /\bdel\s+\/[fsq]/i,
  /\bshutdown\b/i, /\bshutdown\.exe\b/i, /\breboot\b/i, /\breboot\.exe\b/i, /\bhalt\b/i,
  /\b(?:curl|wget|iwr|invoke-webrequest)\b[^|]*\|\s*(?:sh|bash|powershell|cmd|pwsh)\b/i,
  /\breg\s+delete\s+.*\/f\b/i, /\bchmod\s+-R\s+777\s+\//i,
  /\bSET\s+PATH\s*=/i, /\bNODE_OPTIONS\s*=/i,
]

function splitCommandSegments(cmd) {
  const segments = []
  let current = '', inQuote = false, quoteChar = ''
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]
    if (inQuote) {
      current += ch
      if (ch === quoteChar && cmd[i - 1] !== '\\') inQuote = false
    } else if (ch === '"' || ch === "'") {
      inQuote = true; quoteChar = ch; current += ch
    } else if ('&|;'.includes(ch)) {
      if (current.trim()) segments.push(current.trim()); current = ''
    } else { current += ch }
  }
  if (current.trim()) segments.push(current.trim())
  return segments
}

function checkCommand(cmd) {
  const c = String(cmd || '')
  if (!c.trim()) return { ok: false, reason: 'empty command' }
  if (isWhitelistedCommand(c)) return { ok: true }
  for (const re of BLOCKED_COMMAND_PATTERNS) {
    if (re.test(c)) return { ok: false, reason: 'blocked by sandbox' }
  }
  const segments = splitCommandSegments(c)
  if (segments.length > 1) {
    for (const seg of segments) {
      for (const re of BLOCKED_COMMAND_PATTERNS) {
        if (re.test(seg)) return { ok: false, reason: 'blocked by sandbox' }
      }
    }
  }
  return { ok: true }
}

function isSandboxExecutorEnabled(db) {
  if (!db || typeof db.getSetting !== 'function') return false
  try { const val = db.getSetting('sandbox_executor_enabled'); return val === 'true' || val === true || val === '1' } catch { return false }
}

async function runInSandboxExecutor(command, opts = {}) {
  const { db, ...executorOpts } = opts
  if (!isSandboxExecutorEnabled(db)) {
    const result = checkCommand(command)
    if (!result.ok) return { ok: false, stdout: '', stderr: result.reason, exitCode: null }
    return { ok: true, stdout: '', stderr: 'sandbox executor disabled', exitCode: null }
  }
  try {
    const sandboxExecutor = require('./sandboxExecutor')
    return await sandboxExecutor.runInSandbox(command, executorOpts)
  } catch (err) { return { ok: false, stdout: '', stderr: 'sandbox error: ' + err.message, exitCode: null } }
}

module.exports = { getWorkspaceRoot, setWorkspaceRoot, setWorkspaceRootForSession, clearSessionWorkspaces, isInsideWorkspace, checkWritePath, checkCommand, isWhitelistedCommand, isSandboxExecutorEnabled, runInSandboxExecutor }