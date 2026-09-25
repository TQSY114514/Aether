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
let _memorySeeder = null
// Seam for wiring repo-map rebuilds into long-term memory (Brain). The caller
// (agent.handler) sets it; repoMap stays dependency-free.
function setMemorySeeder(fn) { _memorySeeder = fn }

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
    gitChanged: git ? Array.from(git.changed) : [],
    stats: { totalFiles: files.length, indexedFiles: extractionByAbs.size },
    generatedAt: Date.now(),
  }

  try {
    const { buildGraph } = require('./dependencyGraph')
    const graph = buildGraph(map.files)
    const inDegreeMap = new Map()
    for (const edge of graph.edges) {
      if (edge.type === 'imports' || edge.type === 'imported_by') {
        inDegreeMap.set(edge.to, (inDegreeMap.get(edge.to) || 0) + 1)
      }
    }
    map.inDegreeMap = inDegreeMap
  } catch {
    map.inDegreeMap = new Map()
  }

  let newest = 0
  for (const f of files) if (f.modified > newest) newest = f.modified
  entry.map = map
  if (_memorySeeder) {
    // Only fires on a genuine (re)build — incremental cache hits skip this.
    try { _memorySeeder(buildRepoMapDigest(map), rootDir) } catch {}
  }
  entry.mtime = newest
  return map
}

/**
 * Score a file node for prioritization when budget clamping.
 * Incorporates git changes, critical entry points, in-degree centrality (PageRank), and query relevance.
 */
function scoreFileNode(node, gitChangedSet, inDegreeMap = null, queryKeywords = null) {
  let score = 1
  const rel = toPosix(node.relPath || node.name || node.path || '')
  const base = path.basename(rel).toLowerCase()
  if (gitChangedSet && gitChangedSet.has(rel)) score += 100
  if (/^(package\.json|index\.[jt]sx?|main\.[jt]sx?|app\.[jt]sx?|readme\.md|tsconfig\.json|vite\.config\.[jt]s|cargo\.toml|go\.mod|pyproject\.toml)$/i.test(base)) {
    score += 50
  }
  if (node.exports && node.exports.length) score += Math.min(30, node.exports.length * 5)
  if (node.symbols && node.symbols.length) score += Math.min(20, node.symbols.length * 2)

  // Dependency graph reference centrality boost (up to 80 points)
  if (inDegreeMap) {
    const deg = inDegreeMap.get(node.path) || inDegreeMap.get(rel) || 0
    score += Math.min(80, deg * 12)
  }

  // Task / prompt query relevance boost (up to 90 points)
  if (queryKeywords && queryKeywords.length) {
    const relLower = rel.toLowerCase()
    for (const kw of queryKeywords) {
      if (!kw) continue
      if (relLower.includes(kw)) score += 40
      if (node.symbols && node.symbols.some(s => s.toLowerCase().includes(kw))) score += 50
      if (node.exports && node.exports.some(e => e.toLowerCase().includes(kw))) score += 50
    }
  }

  return score
}

let _tokenizer = null
/** Count tokens with the shared tokenizer, falling back to a character estimate. */
function countTokens(text) {
  if (!text) return 0
  if (_tokenizer === null) {
    try {
      const { getEncoding } = require('js-tiktoken')
      _tokenizer = getEncoding('cl100k_base')
    } catch {
      _tokenizer = false
    }
  }
  if (_tokenizer && typeof _tokenizer.encode === 'function') {
    try { return _tokenizer.encode(text).length } catch {}
  }
  return Math.ceil(text.length / 4)
}

/**
 * Dynamic token budget calculation for RepoMap based on task scope and complexity.
 * Prevents blowing up context on simple bug fixes (1280 tokens), while providing
 * comprehensive project context for major refactors (8192 tokens).
 *
 * @param {string} prompt - The user prompt or task description.
 * @param {number} [baseBudget=2048] - Base default budget.
 * @returns {number}
 */
function computeBudgetForRequest(prompt, baseBudget = 2048) {
  const str = String(prompt || '').trim()
  if (!str) return baseBudget
  const isRefactor = /refactor|重构|架构|整个项目|全库|迁移|全工程|全量|architecture|overhaul/i.test(str)
  if (isRefactor) return 8192
  if (str.length > 500) return 4096
  if (str.length > 60) return Math.max(baseBudget, 2048)
  return 1280
}

/**
 * Format the structured repo map as a markdown-friendly tree block.
 * Clamps output under maxLines / maxTokens and prioritizes git-modified files,
 * entry points, dependency hubs, and exported symbols.
 *
 * @param {object} map - generateRepoMap() output.
 * @param {number|object} [optsOrMaxLines=160] - Options object or maxLines budget.
 * @returns {string}
 */
function buildRepoMapText(map, optsOrMaxLines = 160) {
  if (!map || !map.tree) return ''

  const opts = typeof optsOrMaxLines === 'number'
    ? { maxLines: optsOrMaxLines }
    : { ...(optsOrMaxLines || {}) }

  const queryStr = String(opts.query || opts.userMessage || '').trim()
  const maxTokens = opts.maxTokens !== undefined
    ? opts.maxTokens
    : computeBudgetForRequest(queryStr, 2048)
  const maxLines = opts.maxLines || Math.min(600, Math.max(160, Math.floor(maxTokens / 12)))
  const queryKeywords = queryStr ? queryStr.toLowerCase().split(/\s+/).filter(k => k.length >= 2) : null

  // Collect all file nodes
  const allFileNodes = []
  const collectFiles = (node) => {
    if (node.type === 'file') allFileNodes.push(node)
    else if (node.children) node.children.forEach(collectFiles)
  }
  collectFiles(map.tree)

  const gitChangedSet = new Set(map.gitChanged || [])
  const inDegreeMap = map.inDegreeMap || null

  // Score all files
  const scored = allFileNodes.map(node => ({
    node,
    score: scoreFileNode(node, gitChangedSet, inDegreeMap, queryKeywords),
  }))
  scored.sort((a, b) => b.score - a.score)

  const renderWithFiles = (selectedNodes, omitted) => {
    const lines = []
    lines.push(`# Repo Map (${map.stats.totalFiles} files, ${map.stats.indexedFiles} indexed)`)
    lines.push('```')
    lines.push('Project structure and top-level symbols (functions/classes/exports):')
    lines.push('')

    const allowedFilePaths = new Set(selectedNodes.map(n => n.path))
    const allowedDirPaths = new Set()
    for (const f of selectedNodes) {
      let cur = path.dirname(f.path)
      while (cur && cur !== path.dirname(map.rootDir)) {
        allowedDirPaths.add(cur)
        const parent = path.dirname(cur)
        if (parent === cur) break
        cur = parent
      }
    }

    const walk = (node, depth) => {
      const indent = '  '.repeat(depth)
      if (node.type === 'dir') {
        if (!allowedDirPaths.has(node.path)) return
        lines.push(`${indent}${node.name}/`)
        for (const child of node.children) walk(child, depth + 1)
        return
      }
      if (!allowedFilePaths.has(node.path)) return
      const extra = []
      if (node.symbols && node.symbols.length) extra.push(`defs: ${node.symbols.slice(0, 15).join(', ')}`)
      if (node.exports && node.exports.length) extra.push(`exports: ${node.exports.slice(0, 15).join(', ')}`)
      lines.push(`${indent}${node.name}${extra.length ? `  [${extra.join('; ')}]` : ''}`)
    }
    walk(map.tree, 0)

    if (omitted > 0) {
      lines.push(`  ... (+${omitted} more files omitted to fit token budget)`)
    }
    lines.push('```')
    return lines.join('\n')
  }

  // Determine initial file count bounded by maxLines
  let low = 1
  let high = Math.min(allFileNodes.length, Math.max(10, maxLines - 15))
  let bestText = renderWithFiles(scored.slice(0, high).map(s => s.node), allFileNodes.length - high)

  // Binary search for token budget if output exceeds maxTokens
  if (countTokens(bestText) > maxTokens && high > 1) {
    let foundFit = false
    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const selected = scored.slice(0, mid).map(s => s.node)
      const candText = renderWithFiles(selected, allFileNodes.length - mid)
      if (countTokens(candText) <= maxTokens) {
        bestText = candText
        foundFit = true
        low = mid + 1 // try to fit more
      } else {
        high = mid - 1 // prune down
      }
    }
    if (!foundFit) {
      const singleFileText = renderWithFiles(scored.slice(0, 1).map(s => s.node), allFileNodes.length - 1)
      if (countTokens(singleFileText) <= maxTokens) {
        bestText = singleFileText
      } else {
        const headerOnlyText = renderWithFiles([], allFileNodes.length)
        bestText = countTokens(headerOnlyText) <= maxTokens
          ? headerOnlyText
          : headerOnlyText.slice(0, Math.max(0, maxTokens * 3))
      }
    }
  }

  return bestText
}

/**
 * Build a system-message object for the current workspace, generating the map
 * on first use (cached thereafter). Returns null when no workspace is set.
 */
async function buildRepoMapMessage(options = {}) {
  const { getWorkspaceRoot } = require('../tools/sandbox')
  const root = options.rootDir || getWorkspaceRoot()
  if (!root) return null
  const userMsg = options.userMessage || options.query || ''
  const budget = options.maxTokens || computeBudgetForRequest(userMsg)
  const map = await generateRepoMap(root, options)
  const text = buildRepoMapText(map, { ...options, maxTokens: budget, query: userMsg })
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

// Compact digest of a repo map for long-term memory (≈40 scored lines,
// well under 0.5k tokens) — enough to recall project topology later.
function buildRepoMapDigest(map) {
  if (!map) return null
  return buildRepoMapText(map, 40)
}

module.exports = {
  generateRepoMap,
  buildRepoMapText,
  buildRepoMapMessage,
  buildRepoMapDigest,
  computeBudgetForRequest,
  setMemorySeeder,
  getChangedFiles,
  getCachedMap,
  isIndexStale,
  invalidateCache,
}
