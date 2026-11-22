const fs = require('fs/promises')
const { getWorkspaceRoot, resolveRoamingPath, isForbiddenCwd, getExplicitSessionCwd } = require('../tools/sandbox')

const MAX_ENTRIES = 500
const SKIP = new Set(['.git', 'node_modules'])

function resolveRoot(db, sessionId) {
  if (sessionId != null) {
    const explicit = getExplicitSessionCwd(db, sessionId)
    if (explicit) return explicit
  }
  return getWorkspaceRoot(sessionId)
}

function registerFsHandlers(ipcMain, db) {
  ipcMain.handle('fs:list-dir', async (_event, dir, sessionId) => {
    if (typeof dir !== 'string' || !dir.trim()) return { ok: false, error: 'invalid_dir' }
    const root = resolveRoot(db, sessionId) || process.cwd()
    const resolved = resolveRoamingPath(dir, root)
    if (!resolved || typeof resolved !== 'string') return { ok: false, error: 'unsafe_path' }
    if (isForbiddenCwd(resolved)) {
      return { ok: false, error: 'restricted_path' }
    }
    let canonicalDir
    try {
      canonicalDir = await fs.realpath(resolved)
    } catch {
      return { ok: false, error: 'read_failed' }
    }
    if (isForbiddenCwd(canonicalDir)) {
      return { ok: false, error: 'restricted_path' }
    }
    let entries
    try {
      const dirents = await fs.readdir(canonicalDir, { withFileTypes: true })
      entries = dirents
        .filter((d) => !SKIP.has(d.name))
        .map((d) => ({ name: d.name, isDir: d.isDirectory() }))
        .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
        .slice(0, MAX_ENTRIES)
    } catch {
      return { ok: false, error: 'read_failed' }
    }
    return { ok: true, dir: canonicalDir, entries }
  })
}

module.exports = { registerFsHandlers }