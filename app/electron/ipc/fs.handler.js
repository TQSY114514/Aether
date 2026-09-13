const path = require('path')
const fs = require('fs/promises')
const { getWorkspaceRoot } = require('../tools/sandbox')

const MAX_ENTRIES = 500
const SKIP = new Set(['.git', 'node_modules'])

function resolveRoot(db, sessionId) {
  if (sessionId != null) {
    const cfg = db.getSessionConfig(sessionId)
    if (cfg && cfg.workspace) return cfg.workspace
  }
  return getWorkspaceRoot()
}

function registerFsHandlers(ipcMain, db) {
  ipcMain.handle('fs:list-dir', async (_event, dir, sessionId) => {
    if (typeof dir !== 'string' || !dir.trim()) return { ok: false, error: 'invalid_dir' }
    const root = resolveRoot(db, sessionId)
    if (!root) return { ok: false, error: 'no_workspace' }
    const resolved = path.resolve(root, dir)
    const rel = path.relative(root, resolved)
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
      return { ok: false, error: 'outside_workspace' }
    }
    let canonicalRoot, canonicalDir
    try {
      canonicalRoot = await fs.realpath(root)
      canonicalDir = await fs.realpath(resolved)
    } catch {
      return { ok: false, error: 'read_failed' }
    }
    const canonicalRel = path.relative(canonicalRoot, canonicalDir)
    if (canonicalRel === '..' || canonicalRel.startsWith(`..${path.sep}`) || path.isAbsolute(canonicalRel)) {
      return { ok: false, error: 'outside_workspace' }
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
    return { ok: true, entries }
  })
}

module.exports = { registerFsHandlers }