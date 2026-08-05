// ───────────────────────────────────────────────────────────────────────────
// Repo Map — builds a project-level structural map (file tree + top-level
// symbols per file) for the agent's "project-level understanding".
//
// This is the lightweight, dependency-free path: it reuses the existing
// regex-based symbolExtractor (no tree-sitter native compile) to produce a
// structured { tree, files } map. tree-sitter could be swapped in later behind
// the same generateRepoMap() surface without changing callers.
//
// Incremental updates: only changed files are re-parsed. Changed-file
// detection prefers `git diff`/`git status` when the workspace is a git repo,
// and falls back to per-file mtime comparison otherwise. Results are cached in
// memory (mirroring projectIndexer's cache pattern).
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { scanWorkspace } = require('./fileScanner')
const { extractFile } = require('./symbolExtractor')

// Module-level cache: rootDir → { map, mtime, fileCache: Map<absPath, { mtime, extraction }> }
const _cache = new Map()

function toPosix(p) {
  return String(p).split(path.sep).join('/')
}

/**
 * Best-effort list of changed files in a git repo.
 * @param {string} rootDir
 * @returns {{ changed: Set<string>, deleted: Set<string> } | null} relPaths (posix),
 *   or null when git is unavailable / rootDir is not a repo.
 */
function getChangedFiles(rootDir) {
  try {
    const opts = { cwd: rootDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 * 1024 * 1024 }
    const changed = new Set()
    const deleted = new Set()
    const out = execSync('git status --porcelain', opts)
    for (const line of String(out).split('\n')) {
      const t = line.trim()
      if (!t) continue
      const status = t.slice(0, 2)
      const rel = t.slice(3).split(' -> ')[0].trim() // renames: "old -> new"
      if (status.startsWith('D')) deleted.add(toPosix(rel))
      else changed.add(toPosix(rel))
    }
    return { changed, deleted }
  } catch {
    return null // not a git repo or git unavailable
  }
}

/**
 * Safely read a file and extract its symbols.
 * @returns {object | null}
 */
function extractOne(absPath) {
  let content = ''
  try { content = fs.readFileSync(absPath, 'utf-8') } catch { return null }
  return extractFile(absPath, content)
}

/**
 * Build a nested directory tree from scanned files, attaching each file's
 * extracted symbols/exports to its node.
 * @param {Array<object>} files - scanWorkspace() output.
 * @param {string} rootDir
 * @param {Map<string, object>} extractionByAbs - absPath → extracted symbol info.
 * @returns {{ name: string, type: 'dir', path: string, children: Array<object> }}
 */
function buildFileTree(files, rootDir, extractionByAbs) {
  const root = { name: path.basename(rootDir) || rootDir, type: 'dir', path: rootDir, children: [] }
  const dirMap = new Map([['', root]])
  const sorted = [...files].sort((a, b) => toPosix(a.relPath).localeCompare(toPosix(b.relPath)))

  for (const f of sorted) {
    const rel = toPosix(f.relPath)
    const parts = rel.split('/')
    const fileName = parts.pop() || rel
    let current = root
    let currentKey = ''
    for (const part of parts) {
      currentKey = currentKey ? `${currentKey}/${part}` : part
      let child = dirMap.get(currentKey)
      if (!child) {
        child = { name: part, type: 'dir', path: path.join(rootDir, ...currentKey.split('/')), children: [] }
        dirMap.set(currentKey, child)
        current.children.push(child)
      }
      current = child
    }
    const ex = extractionByAbs.get(f.absPath)
    current.children.push({
      name: fileName,
      type: 'file',
      path: f.absPath,
      relPath: rel,
      language: ex?.language || '',
      symbols: ex?.symbols || [],
      exports: ex?.exports || [],
    })
  }
  return root
}

/**
 * Generate (or return cached) repo map for a workspace.
 * Only changed files are re-parsed; the rest reuse the cached extraction.
 * @param {string} rootDir - Absolute workspace path.
 * @param {{ force?: boolean }} [options]
 * @returns {{ rootDir: string, tree: object, files: Array<object>, stats: object, generatedAt: number }}
 */
async function generateRepoMap(rootDir, options = {}) {
  if (!options.force && !(await isIndexStale(rootDir))) {
    const cached = getCachedMap(rootDir)
    if (cached) return cached
  }

  const files = await scanWorkspace(rootDir)
  const entry = ensureEntry(rootDir)
  const currentAbs = new Set(files.map(f => f.absPath))

  // Prune cache entries for files that no longer exist.
  for (const [absPath] of entry.fileCache) {
    if (!currentAbs.has(absPath)) entry.fileCache.delete(absPath)
  }

  // Determine changed files (git first, fall back to mtime).
  const git = getChangedFiles(rootDir)
  const extractionByAbs = new Map()

  for (const f of files) {
    const rel = toPosix(f.relPath)
    const cached = entry.fileCache.get(f.absPath)
    const isChanged = git
      ? git.changed.has(rel) || git.deleted.has(rel)
      : !cached || cached.mtime !== f.modified

    if (cached && cached.extraction && !isChanged) {
      extractionByAbs.set(f.absPath, cached.extraction)
    } else {
      const extraction = extractOne(f.absPath)
      if (extraction) {
        entry.fileCache.set(f.absPath, { mtime: f.modified, extraction })
        extractionByAbs.set(f.absPath, extraction)
      }
    }
  }

  const tree = buildFileTree(files, rootDir, extractionByAbs)
  const map = {
    rootDir,
    tree,
    files: Array.from(extractionByAbs.values()),
    stats: { totalFiles: files.length, indexedFiles: extractionByAbs.size },
    generatedAt: Date.now(),
  }

  let newest = 0
  for (const f of files) if (f.modified > newest) newest = f.modified
  entry.map = map
  entry.mtime = newest
  return map
}

/**
 * Render the repo map as a compact system-prompt block.
 * @param {object} map - generateRepoMap() output.
 * @returns {string}
 */
function buildRepoMapText(map) {
  if (!map || !map.tree) return ''
  const lines = []
  lines.push(`# Repo Map (${map.stats.totalFiles} files, ${map.stats.indexedFiles} indexed)`)
  lines.push('```')
  lines.push('Project structure and top-level symbols (functions/classes/exports):')
  lines.push('')

  const walk = (node, depth) => {
    const indent = '  '.repeat(depth)
    if (node.type === 'dir') {
      lines.push(`${indent}${node.name}/`)
      for (const child of node.children) walk(child, depth + 1)
      return
    }
    const extra = []
    if (node.symbols && node.symbols.length) extra.push(`defs: ${node.symbols.join(', ')}`)
    if (node.exports && node.exports.length) extra.push(`exports: ${node.exports.join(', ')}`)
    lines.push(`${indent}${node.name}${extra.length ? `  [${extra.join('; ')}]` : ''}`)
  }
  walk(map.tree, 0)

  lines.push('```')
  return lines.join('\n')
}

/**
 * Build a system-message object for the current workspace, generating the map
 * on first use (cached thereafter). Returns null when no workspace is set.
 */
async function buildRepoMapMessage(options = {}) {
  const { getWorkspaceRoot } = require('../tools/sandbox')
  const root = getWorkspaceRoot()
  if (!root) return null
  const text = buildRepoMapText(await generateRepoMap(root, options))
  if (!text) return null
  return { role: 'system', content: text }
}

function ensureEntry(rootDir) {
  let entry = _cache.get(rootDir)
  if (!entry) {
    entry = { map: null, mtime: 0, fileCache: new Map() }
    _cache.set(rootDir, entry)
  }
  return entry
}

function getCachedMap(rootDir) {
  return _cache.get(rootDir)?.map || null
}

async function isIndexStale(rootDir) {
  const entry = _cache.get(rootDir)
  if (!entry) return true
  // If git reports no changes, the cached map is still valid.
  const git = getChangedFiles(rootDir)
  if (git && git.changed.size === 0 && git.deleted.size === 0) return false
  try {
    const files = await scanWorkspace(rootDir)
    if (files.length === 0 && entry.map.files.length === 0) return false
    const newest = files.reduce((max, f) => Math.max(max, f.modified), 0)
    return newest > entry.mtime
  } catch {
    return true
  }
}

function invalidateCache(rootDir) { _cache.delete(rootDir) }

module.exports = {
  generateRepoMap,
  buildRepoMapText,
  buildRepoMapMessage,
  getChangedFiles,
  getCachedMap,
  isIndexStale,
  invalidateCache,
}