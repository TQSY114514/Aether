const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

let db = null
function setDb(handle) { db = handle }

function extractAffectedPaths(toolName, args) {
  const paths = []
  const add = (p) => { if (p) paths.push(path.resolve(String(p))) }
  if (toolName === 'write_file' || toolName === 'edit_file') add(args?.path)
  if (toolName === 'run_command' && args?.cwd) add(args.cwd)
  if (toolName === 'git_commit' && args?.cwd) add(args.cwd)
  return [...new Set(paths)]
}

function nearestGitRoot(start) {
  try {
    const cwd = fs.existsSync(start) && fs.statSync(start).isDirectory() ? start : path.dirname(start)
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch { return null }
}

function captureGitDiff(paths) {
  const roots = [...new Set(paths.map(nearestGitRoot).filter(Boolean))]
  const out = {}
  for (const root of roots) {
    try {
      out[root] = execFileSync('git', ['diff', '--', '.'], { cwd: root, encoding: 'utf-8', maxBuffer: 1024 * 1024, timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      out[root] = `[git diff failed: ${e.message}]`
    }
  }
  return out
}

function captureFiles(paths) {
  return paths.map(p => {
    try {
      const stat = fs.existsSync(p) ? fs.statSync(p) : null
      if (!stat) return { path: p, existed: false, isDirectory: false, content: null }
      if (stat.isDirectory()) return { path: p, existed: true, isDirectory: true, content: null }
      return { path: p, existed: true, isDirectory: false, content: fs.readFileSync(p, 'utf-8') }
    } catch (e) {
      return { path: p, existed: false, isDirectory: false, content: null, error: e.message }
    }
  })
}

function createCheckpoint({ sessionId, messageId, toolName, args }) {
  if (!db) return null
  const affectedPaths = extractAffectedPaths(toolName, args)
  const snapshot = {
    version: 1,
    files: captureFiles(affectedPaths),
    gitDiff: captureGitDiff(affectedPaths),
  }
  const row = db.addAgentCheckpoint({ sessionId, messageId, toolName, args, affectedPaths, snapshot })
  return row?.lastInsertRowid || null
}

function rollbackCheckpoint(id) {
  if (!db) return { success: false, error: 'database unavailable' }
  const cp = db.getAgentCheckpoint(id)
  if (!cp) return { success: false, error: 'checkpoint not found' }
  if (cp.rolled_back_at) return { success: false, error: 'checkpoint already rolled back' }
  const snapshot = cp.snapshot || {}
  const restored = []
  for (const f of snapshot.files || []) {
    if (f.isDirectory) continue
    if (f.existed) {
      fs.mkdirSync(path.dirname(f.path), { recursive: true })
      fs.writeFileSync(f.path, f.content ?? '', 'utf-8')
      restored.push(f.path)
    } else if (fs.existsSync(f.path)) {
      fs.rmSync(f.path, { force: true, recursive: true })
      restored.push(f.path)
    }
  }
  db.markAgentCheckpointRolledBack(id)
  return { success: true, restored }
}

module.exports = { setDb, createCheckpoint, rollbackCheckpoint, extractAffectedPaths }
