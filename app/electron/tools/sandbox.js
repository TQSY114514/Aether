// ───────────────────────────────────────────────────────────────────────────
// Agent sandbox — containment for dangerous built-in tools.
//
// AetherAI's tools (write_file, edit_file, run_command, git) run with the
// user's full OS privileges, which is necessary for them to be useful but
// dangerous if the model goes rogue. This module provides three layers of
// defense-in-depth WITHOUT a heavy container/VM (not worth it for a desktop
// chat app):
//
//   1. Workspace root — an optional path the user designates as the agent's
//      play area. Writes inside it are allowed; writes OUTSIDE it are blocked
//      unless explicitly approved. Defaults to the app's userData dir.
//      Supports per-session overrides: each session can have its own workspace.
//
//   2. Path traversal guard — resolves the target path and checks it stays
//      within the workspace root. Catches ../ tricks, symlinks resolved via
//      realpath. Read tools (read_file/list_dir/grep) are NOT walled (the user
//      may point the agent at any file), but writes are.
//
//   3. Command blocklist — run_command refuses patterns that are almost always
//      destructive and never legitimate in an agent context: disk format,
//      recursive force-delete of root/system dirs, shutdown/reboot, raw disk
//      access, and downloading+executing in one pipe. This is a backstop, not
//      a substitute for the ask-mode confirm — the user still approves every
//      command in 'ask' mode. 'auto' mode is the user's explicit opt-in to risk.
//
// None of this is a true sandbox (a determined model could still cause harm
// within the workspace, or via a command we didn't blocklist). The real
// guarantee is the permission model: keep 'ask' on for untrusted models.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { app } = require('electron')

// The workspace root. Supports per-session overrides.
let _workspaceRoot = null
let _sessionWorkspaces = new Map() // sessionId -> resolved path

function setWorkspaceRoot(p) { _workspaceRoot = p ? path.resolve(p) : null }
function setWorkspaceRootForSession(sessionId, p) {
  if (p && String(p).trim()) { _sessionWorkspaces.set(sessionId, path.resolve(p)) }
  else { _sessionWorkspaces.delete(sessionId) }
}
function clearSessionWorkspaces() { _sessionWorkspaces.clear() }

// Resolve which workspace applies: per-session override first, then global.
function getWorkspaceRoot(sessionId) {
  if (sessionId && _sessionWorkspaces.has(sessionId)) return _sessionWorkspaces.get(sessionId)
  return _workspaceRoot || defaultWorkspace()
}

function defaultWorkspace() {
  const dir = path.join(app.getPath('userData'), 'workspace')
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  return dir
}

// Resolve `target` to an absolute path (relative to workspace root if not abs)
// and return its realpath. Returns null if the path can't be resolved.
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
    } catch {
      resolved = path.normalize(abs)
    }
  }
  const rootResolved = path.normalize(root)
  const inside = resolved === rootResolved || resolved.startsWith(rootResolved + path.sep)
  return { ok: inside, resolved, root: rootResolved, abs }
}

// True if `target` path is inside the workspace root.
function isInsideWorkspace(target, sessionId) {
  const r = resolveInside(target, {}, sessionId)
  return r.ok === true
}

// Check a write/edit target. Returns { ok, reason } — ok=false means refuse.
function checkWritePath(target, sessionId) {
  const r = resolveInside(target, { mustExist: false }, sessionId)
  if (r.ok === true) return { ok: true }
  return { ok: false, reason: `path is outside the agent workspace (${r.root}). Use 'ask' mode to approve, or set the workspace root to include this path.`, abs: r.abs }
}

const BLOCKED_COMMAND_PATTERNS = [
  /\bformat\b\s+[a-z]:/i,
  /\/dev\/(?:sd|nvme|hd)/i,
  /\bdiskpart\b/i,
  /\brm\s+-rf\s+(?:\/|\/[a-z]+\s|~|C:\\windows|C:\\users\\[^/\\]+\\desktop)/i,
  /\brmdir\s+\/s\b/i,
  /\bdel\s+\/[fs]/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bhalt\b/i,
  /\b(?:curl|wget|iwr|invoke-webrequest)\b[^|]*\|\s*(?:sh|bash|powershell|cmd|pwsh)\b/i,
  /\breg\s+delete\s+.*\/f\b/i,
  /\bchmod\s+-R\s+777\s+\//i,
]

function checkCommand(cmd) {
  const c = String(cmd || '')
  if (!c.trim()) return { ok: false, reason: 'empty command' }
  for (const re of BLOCKED_COMMAND_PATTERNS) {
    if (re.test(c)) {
      return { ok: false, reason: `blocked by sandbox: command matches destructive pattern (${re.source}). If this is a false positive, run it yourself outside the agent.` }
    }
  }
  return { ok: true }
}

module.exports = {
  getWorkspaceRoot, setWorkspaceRoot, setWorkspaceRootForSession, clearSessionWorkspaces,
  isInsideWorkspace, checkWritePath, checkCommand,
}
