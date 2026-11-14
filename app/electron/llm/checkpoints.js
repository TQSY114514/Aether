const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

let db = null
function setDb(handle) { db = handle }

const _activeTurnSnapshots = new Map()

function extractAffectedPaths(toolName, args, workspaceRoot = null) {
  const paths = []
  const resolveTarget = (p) => {
    if (!p) return null
    const raw = String(p)
    if (path.isAbsolute(raw)) return path.resolve(raw)
    return path.resolve(workspaceRoot || process.cwd(), raw)
  }
  const add = (p) => { const r = resolveTarget(p); if (r) paths.push(r) }
  if (toolName === 'write_file' || toolName === 'edit_file' || toolName === 'apply_patch') add(args?.path || args?.file_path)
  if (toolName === 'call_extended_tool' && args?.arguments) {
    let inner = args.arguments
    if (typeof inner === 'string') {
      try { inner = JSON.parse(inner) } catch { inner = {} }
    }
    add(inner?.path || inner?.file_path)
  }
  if (toolName === 'run_command' && args?.cwd) add(args.cwd)
  if (toolName === 'git_commit' && args?.cwd) add(args.cwd)
  return [...new Set(paths)]
}

function nearestGitRoot(start) {
  try {
    const cwd = fs.existsSync(start) && fs.statSync(start).isDirectory() ? start : path.dirname(start)
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim()
    if (!out) return null
    try {
      return fs.realpathSync(out)
    } catch {
      return path.resolve(out)
    }
  } catch { return null }
}

function captureGitDiff(paths) {
  const roots = [...new Set(paths.map(nearestGitRoot).filter(Boolean))]
  const out = {}
  for (const root of roots) {
    try {
      out[root] = execFileSync('git', ['diff', '--', '.'], { cwd: root, encoding: 'utf-8', maxBuffer: 1024 * 1024, timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
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

function sanitizeTurnId(turnId) {
  return String(turnId || `turn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`).replace(/[^a-zA-Z0-9._-]/g, '_')
}

/**
 * Lightweight pre-write snapshot before edit_file / write_file / apply_patch:
 * - In Git repositories: records a lightweight tree/commit object via `git stash create`
 *   (falling back to `HEAD` when working tree has no tracked edits) without touching stash reflog or HEAD.
 *   Uses `-c user.name=Aether -c user.email=aether@local` so CI/headless environments without global git config
 *   reliably generate tree/commit hashes.
 * - In non-Git directories: saves incremental file backups under `<workspaceRoot>/.aether/snapshots/<turnId>/files/`
 *   without creating a JSON sidecar manifest (metadata is kept in the returned snapshot object and SQLite).
 * Always deduplicates per `(turnId, path)` so multiple writes to the same file in a turn
 * preserve the true pre-turn state.
 */
function createPreWriteSnapshot({ workspaceRoot, turnId, affectedPaths = [], toolName = 'edit' } = {}) {
  const root = workspaceRoot ? path.resolve(String(workspaceRoot)) : (affectedPaths[0] ? path.dirname(affectedPaths[0]) : process.cwd())
  const safeTurnId = sanitizeTurnId(turnId)
  const filesMeta = captureFiles(affectedPaths)

  const probeDir = affectedPaths[0] || root
  const gitRoot = nearestGitRoot(probeDir)
  if (gitRoot) {
    let stashHash = null
    let treeHash = null
    let headHash = null
    try {
      const out = execFileSync(
        'git',
        ['-c', 'user.name=Aether', '-c', 'user.email=aether@local', 'stash', 'create'],
        { cwd: gitRoot, encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
      ).trim()
      if (out) stashHash = out
    } catch {}
    try {
      headHash = execFileSync(
        'git',
        ['rev-parse', 'HEAD'],
        { cwd: gitRoot, encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
      ).trim() || null
    } catch {}
    const refToTree = stashHash || headHash
    if (refToTree) {
      try {
        treeHash = execFileSync(
          'git',
          ['rev-parse', `${refToTree}^{tree}`],
          { cwd: gitRoot, encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
        ).trim() || null
      } catch {}
      return {
        method: 'git_stash_create',
        turnId: safeTurnId,
        gitRoot,
        stashHash: stashHash || headHash,
        treeHash,
        hadDirtyStash: Boolean(stashHash),
        files: filesMeta.map(f => ({ path: f.path, existed: f.existed, isDirectory: f.isDirectory, content: f.content })),
      }
    }
  }

  // Non-Git directory: incremental backup in memory & disk file backups (no sidecar manifest.json)
  const snapshotDir = path.join(root, '.aether', 'snapshots', safeTurnId)
  const filesBackupDir = path.join(snapshotDir, 'files')
  let currentSnap = _activeTurnSnapshots.get(safeTurnId)
  if (!currentSnap) {
    currentSnap = {
      method: 'dir_incremental',
      turnId: safeTurnId,
      snapshotDir,
      entries: {},
      files: [],
    }
    _activeTurnSnapshots.set(safeTurnId, currentSnap)
  }

  try {
    fs.mkdirSync(filesBackupDir, { recursive: true })
    for (let i = 0; i < filesMeta.length; i++) {
      const f = filesMeta[i]
      if (f.isDirectory) continue
      const key = process.platform === 'win32' ? f.path.toLowerCase() : f.path
      if (Object.hasOwn(currentSnap.entries, key)) continue // preserve earliest pre-turn state!

      let backupPath = null
      if (f.existed) {
        const idx = Object.keys(currentSnap.entries).length
        const ext = path.extname(f.path) || '.bak'
        const fname = `${idx}_${path.basename(f.path).replace(/[^a-zA-Z0-9._-]/g, '_')}${ext}`
        backupPath = path.join(filesBackupDir, fname)
        if (!fs.existsSync(backupPath)) {
          fs.writeFileSync(backupPath, f.content ?? '', 'utf-8')
        }
      }
      currentSnap.entries[key] = {
        path: f.path,
        existed: f.existed,
        backupPath,
        content: f.content,
        toolName,
      }
    }
    currentSnap.files = Object.values(currentSnap.entries).map(e => ({
      path: e.path,
      existed: e.existed,
      isDirectory: false,
      content: e.content,
    }))
    return currentSnap
  } catch (e) {
    return {
      method: 'memory_fallback',
      turnId: safeTurnId,
      error: e.message,
      entries: currentSnap.entries,
      files: filesMeta,
    }
  }
}

function rollbackPreWriteSnapshot(meta, targetPaths = null) {
  if (!meta) return { success: false, error: 'missing snapshot metadata', restored: [], failed: [] }
  const restored = []
  const failed = []

  if (meta.method === 'dir_incremental' || meta.method === 'memory_fallback') {
    try {
      const active = meta.turnId ? _activeTurnSnapshots.get(meta.turnId) : null
      const mergedEntries = { ...(active?.entries || {}), ...(meta.entries || {}) }
      let entries = Object.values(mergedEntries)
      if (entries.length === 0 && meta.manifestPath && fs.existsSync(meta.manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(meta.manifestPath, 'utf-8'))
          entries = Object.values(manifest.entries || {})
        } catch {}
      }
      const filterSet = targetPaths && targetPaths.length
        ? new Set(targetPaths.map(p => process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p)))
        : null
      for (const ent of entries) {
        const normPath = process.platform === 'win32' ? path.resolve(ent.path).toLowerCase() : path.resolve(ent.path)
        if (filterSet && !filterSet.has(normPath)) continue
        try {
          if (ent.existed) {
            let content = ent.content
            if (content == null && ent.backupPath && fs.existsSync(ent.backupPath)) {
              content = fs.readFileSync(ent.backupPath, 'utf-8')
            } else if (content == null && ent.backupRel && meta.snapshotDir) {
              const relPath = path.join(meta.snapshotDir, ent.backupRel)
              if (fs.existsSync(relPath)) content = fs.readFileSync(relPath, 'utf-8')
            }
            if (content != null) {
              fs.mkdirSync(path.dirname(ent.path), { recursive: true })
              fs.writeFileSync(ent.path, content, 'utf-8')
              restored.push(ent.path)
            }
          } else if (!ent.existed && fs.existsSync(ent.path)) {
            fs.rmSync(ent.path, { force: true, recursive: true })
            restored.push(ent.path)
          }
        } catch (e) {
          failed.push({ path: ent.path, error: e.message })
        }
      }
      if (meta.turnId) _activeTurnSnapshots.delete(meta.turnId)
      return { success: failed.length === 0, restored, failed, method: meta.method }
    } catch (e) {
      return { success: false, error: e.message, restored, failed }
    }
  }

  if (meta.method === 'git_stash_create' && meta.gitRoot && meta.stashHash) {
    let resolvedGitRoot = meta.gitRoot
    try {
      resolvedGitRoot = fs.realpathSync(meta.gitRoot)
    } catch {
      resolvedGitRoot = path.resolve(meta.gitRoot)
    }
    const entries = Array.isArray(meta.files) ? meta.files : []
    for (const ent of entries) {
      try {
        if (!ent.existed) {
          if (fs.existsSync(ent.path)) {
            fs.rmSync(ent.path, { force: true, recursive: true })
            restored.push(ent.path)
          }
          continue
        }
        let resolvedEntPath = ent.path
        try {
          resolvedEntPath = fs.realpathSync(ent.path)
        } catch {
          resolvedEntPath = path.resolve(ent.path)
        }
        let rel = path.relative(resolvedGitRoot, resolvedEntPath).replace(/\\/g, '/')
        if (!rel || rel.startsWith('..')) {
          const normRoot = resolvedGitRoot.toLowerCase().replace(/\\/g, '/')
          const normEnt = resolvedEntPath.toLowerCase().replace(/\\/g, '/')
          if (normEnt.startsWith(normRoot)) {
            rel = resolvedEntPath.slice(resolvedGitRoot.length).replace(/^[/\\]+/, '').replace(/\\/g, '/')
          }
        }
        if (rel && !rel.startsWith('..')) {
          try {
            execFileSync('git', ['checkout', meta.stashHash, '--', rel], { cwd: resolvedGitRoot, timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
            restored.push(ent.path)
          } catch (gitErr) {
            if (ent.content != null) {
              fs.mkdirSync(path.dirname(ent.path), { recursive: true })
              fs.writeFileSync(ent.path, ent.content, 'utf-8')
              restored.push(ent.path)
            } else {
              throw gitErr
            }
          }
        } else if (ent.content != null) {
          fs.mkdirSync(path.dirname(ent.path), { recursive: true })
          fs.writeFileSync(ent.path, ent.content, 'utf-8')
          restored.push(ent.path)
        }
      } catch (e) {
        failed.push({ path: ent.path, error: e.message })
      }
    }
    if (failed.length === 0 && (restored.length > 0 || entries.length === 0)) {
      return { success: true, restored, failed, method: 'git_stash_create' }
    }
  }

  return { success: false, error: 'no restorable entries', restored, failed }
}

function createCheckpoint({ sessionId, messageId, turnId, workspaceRoot, toolName, args }) {
  const resolvedRoot = workspaceRoot || (() => {
    try { return require('../tools/sandbox').getWorkspaceRoot(sessionId) } catch { return null }
  })()
  const affectedPaths = extractAffectedPaths(toolName, args, resolvedRoot)
  const filesMeta = captureFiles(affectedPaths)
  const preWrite = createPreWriteSnapshot({ workspaceRoot: resolvedRoot, turnId: turnId || messageId, affectedPaths, toolName })

  if (!db) return null

  const gitCaptured = Boolean(preWrite && preWrite.method === 'git_stash_create' && (preWrite.stashHash || preWrite.treeHash))
  // When Git snapshot captures the revision, avoid redundantly storing full file contents in SQLite
  const capturedFiles = gitCaptured
    ? filesMeta.map(f => ({ path: f.path, existed: f.existed, isDirectory: f.isDirectory, content: null }))
    : filesMeta

  const snapshot = {
    version: 2,
    turnId: preWrite?.turnId || null,
    preWrite,
    files: capturedFiles,
    gitDiff: captureGitDiff(affectedPaths),
  }

  const row = db.addAgentCheckpoint({ sessionId, messageId, toolName, args, affectedPaths, snapshot })
  return row?.lastInsertRowid ? Number(row.lastInsertRowid) : null
}

function isInsideGitRoot(p, root) {
  const norm = (s) => {
    let x = path.normalize(String(s))
    if (process.platform === 'win32') x = x.toLowerCase()
    return x
  }
  const a = norm(p)
  const b = norm(root)
  return a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep)
}

function findLatestCheckpointForRoot(gitRoot) {
  if (!db || typeof db.prepare !== 'function' || !gitRoot) return null
  try {
    const rows = db.prepare('SELECT id, affected_paths FROM agent_checkpoint WHERE rolled_back_at IS NULL ORDER BY id DESC LIMIT 200').all()
    for (const row of rows) {
      let paths = []
      try { paths = JSON.parse(row.affected_paths || '[]') } catch { paths = [] }
      if (!Array.isArray(paths)) paths = []
      if (paths.some((p) => isInsideGitRoot(p, gitRoot))) {
        return typeof db.getAgentCheckpoint === 'function' ? db.getAgentCheckpoint(row.id) : null
      }
    }
  } catch { return null }
  return null
}

function rollbackCheckpoint(id, opts = {}) {
  if (!db) return { success: false, error: 'database unavailable' }
  const cp = db.getAgentCheckpoint(id)
  if (!cp) return { success: false, error: 'checkpoint not found' }
  if (cp.rolled_back_at) return { success: false, error: 'checkpoint already rolled back' }

  if (!opts.force && db.prepare && cp.session_id) {
    try {
      const newer = db.prepare(`
        SELECT id, tool_name, created_at FROM agent_checkpoint
        WHERE session_id = ? AND id > ? AND rolled_back_at IS NULL
      `).all(cp.session_id, id)
      if (newer && newer.length > 0) {
        return {
          success: false,
          conflict: true,
          error: `检测到存在更新的未回滚检查点 (#${newer.map(n => n.id).join(', #')})。回滚当前快照将覆盖后续修改。`,
          newerIds: newer.map(n => n.id),
        }
      }
    } catch {}
  }

  const snapshot = cp.snapshot || {}

  // If git stash snapshot exists, restore via git checkout from stash/tree object
  if (snapshot.preWrite && snapshot.preWrite.method === 'git_stash_create') {
    const preRes = rollbackPreWriteSnapshot(snapshot.preWrite)
    if (preRes.success) {
      db.markAgentCheckpointRolledBack(id)
      return { success: true, restored: preRes.restored, sessionId: cp.session_id, method: preRes.method }
    }
  }

  // Restore exact captured pre-write file contents (when content is stored, e.g. non-git)
  const restored = []
  const failed = []
  const hasCapturedContents = (snapshot.files || []).some(f => !f.isDirectory && f.content !== null && f.content !== undefined)
  if (hasCapturedContents) {
    for (const f of snapshot.files || []) {
      if (f.isDirectory) continue
      if (f.content === null || f.content === undefined) continue
      try {
        if (f.existed) {
          fs.mkdirSync(path.dirname(f.path), { recursive: true })
          fs.writeFileSync(f.path, f.content ?? '', 'utf-8')
          restored.push(f.path)
        } else if (fs.existsSync(f.path)) {
          fs.rmSync(f.path, { force: true, recursive: true })
          restored.push(f.path)
        }
      } catch (e) {
        failed.push({ path: f.path, error: e.message })
      }
    }

    if (failed.length === 0 && (restored.length > 0 || (snapshot.files || []).length > 0)) {
      db.markAgentCheckpointRolledBack(id)
      return { success: true, restored, sessionId: cp.session_id, method: snapshot.preWrite?.method || 'file_snapshot' }
    }
  }

  if (snapshot.preWrite) {
    const preRes = rollbackPreWriteSnapshot(snapshot.preWrite)
    if (preRes.success) {
      db.markAgentCheckpointRolledBack(id)
      return { success: true, restored: preRes.restored, sessionId: cp.session_id, method: preRes.method }
    }
  }

  if (failed.length === 0) {
    db.markAgentCheckpointRolledBack(id)
    return { success: true, restored, sessionId: cp.session_id }
  }
  return { success: false, error: 'some files failed to restore', restored, failed }
}

module.exports = {
  setDb,
  createCheckpoint,
  rollbackCheckpoint,
  createPreWriteSnapshot,
  rollbackPreWriteSnapshot,
  extractAffectedPaths,
  findLatestCheckpointForRoot,
  isInsideGitRoot,
  nearestGitRoot,
}
