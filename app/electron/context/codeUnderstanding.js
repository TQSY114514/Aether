// ───────────────────────────────────────────────────────────────────────────
// Code Understanding — turn a codebase into persistent knowledge-graph memory.
//
// Scans a repo (dir tree + lightweight import/require/symbol extraction),
// produces a directed graph of { nodes, edges }, and persists it into the
// existing kg_nodes / kg_edges tables so the memory layer can answer
// "how does X reach Y" across sessions — the same tables knowledgeGraph.js
// writes. Local-only, no LLM calls: the graph is structural (files, symbols,
// module dependencies). Each node: { entity, type }; each edge:
// { from, to, relation, confidence }.
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const log = require('../logger')

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  'coverage', '.cache', 'target', 'vendor', '.venv', 'venv', '__pycache__',
  '.idea', '.vscode', 'release', 'release-builds', '.codegraph', '.omo',
])

const DEFAULT_EXTENSIONS = [
  '.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
  '.rb', '.php', '.swift', '.kt', '.cs', '.vue', '.svelte',
]

// ─── Directory walk ─────────────────────────────────────────────────────────

/**
 * Recursively walk `rootDir` collecting source file paths (absolute).
 * options: { maxFiles, depth, ignoreDirs, extensions }
 */
function listSourceFiles(rootDir, options = {}) {
  const maxFiles = options.maxFiles || 5000
  const maxDepth = options.depth == null ? 8 : options.depth
  const ignoreDirs = new Set([...DEFAULT_IGNORE_DIRS, ...(options.ignoreDirs || [])])
  const extensions = options.extensions || DEFAULT_EXTENSIONS
  const out = []
  if (!rootDir) return out
  const walk = (dir, depth) => {
    if (depth > maxDepth || out.length >= maxFiles) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (out.length >= maxFiles) return
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name)) walk(full, depth + 1)
      } else if (entry.isFile() && extensions.includes(path.extname(entry.name).toLowerCase())) {
        out.push(full)
      }
    }
  }
  try {
    if (fs.statSync(rootDir).isDirectory()) walk(rootDir, 0)
  } catch (e) { log.warn('codeUnderstanding: walk failed:', e && e.message) }
  return out
}

// ─── Per-language extraction ────────────────────────────────────────────────

// Module specs from import/require/from lines. Bare package names (no slash,
// no leading dot) are dropped — they're noise for a code-graph.
function extractModuleSpecs(content) {
  const refs = new Set()
  const patterns = [
    /(?:import\s+[\w*\s{},]+\s+from\s+|import\s*\(\s*)?['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const re of patterns) {
    let m
    while ((m = re.exec(content))) {
      const spec = m[1]
      if (!spec) continue
      if (/^[a-zA-Z][\w-]*$/i.test(spec)) continue // bare package name
      refs.add(spec.replace(/^\.{1,2}[\\/]/, ''))
    }
  }
  return [...refs]
}

/** Python: from pkg.mod import name / import pkg.mod */
function extractPythonImports(content) {
  const refs = new Set()
  const re = /^\s*(?:from\s+([.\w]+)\s+import|import\s+([\w.]+))/gm
  let m
  while ((m = re.exec(content))) refs.add((m[1] || m[2] || '').replace(/\./g, '/'))
  return [...refs]
}

/** Capitalized identifiers that appear at least twice → likely symbol references. */
function extractSymbols(content) {
  const counts = new Map()
  const re = /\b([A-Z][A-Za-z0-9_]{2,})\b/g
  let m
  while ((m = re.exec(content))) counts.set(m[1], (counts.get(m[1]) || 0) + 1)
  return [...counts.entries()].filter(([, c]) => c >= 2).map(([name]) => name)
}

/** Combined import extraction for a file (dispatch by extension). */
function moduleImports(content, fileExt) {
  const specs = extractModuleSpecs(content)
  if (String(fileExt || '').toLowerCase() === '.py') {
    for (const s of extractPythonImports(content)) specs.push(s)
  }
  return specs
}

// ─── Resolve an import spec against the on-disk file list ──────────────────

function resolveImportTarget(fileList, fromRelDir, spec) {
  if (!fileList || fileList.length === 0) return null
  const set = new Set(fileList.map(f => f.replace(/\\/g, '/').toLowerCase()))
  const base = spec.replace(/\.[a-z]+$/i, '')
  const candidates = new Set()
  const joined = path.posix.normalize(path.posix.join(fromRelDir, base))
  if (joined && joined !== '.') candidates.add(joined.toLowerCase())
  candidates.add(base.toLowerCase())
  for (const c of candidates) {
    if (set.has(c)) return c
  }
  const exts = ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.vue', '.py', '.go', '.rs', '.java', '.rb', '.php']
  for (const c of [...candidates]) {
    for (const e of exts) {
      if (set.has(c + e)) return c + e
      const indexFile = path.posix.join(c, 'index' + e)
      if (set.has(indexFile)) return indexFile
    }
  }
  return null
}

// ─── Graph build ────────────────────────────────────────────────────────────

/**
 * Build a structural graph from a repo.
 * Returns { nodes: [{entity,type}], edges: [{from,to,relation,confidence}],
 *           fileCount }.
 */
function buildGraphUnderstanding(db, rootDir, options = {}) {
  const files = listSourceFiles(rootDir, options).map(f => f.replace(/\\/g, '/'))
  const relFiles = files.map(f => path.relative(rootDir, f).replace(/\\/g, '/'))

  const nodes = []
  const edges = []
  const nodeSet = new Map() // lower entity → { entity, type }
  const edgeSet = new Set()

  const addNode = (entity, type) => {
    entity = String(entity || '').toLowerCase()
    if (!entity) return
    if (!nodeSet.has(entity)) {
      nodeSet.set(entity, { entity, type })
      nodes.push({ entity, type })
    }
  }
  const addEdge = (from, to, relation, confidence = 0.8) => {
    from = String(from || '').toLowerCase()
    to = String(to || '').toLowerCase()
    if (!from || !to || from === to) return
    const key = `${from}|${to}|${relation}`
    if (edgeSet.has(key)) return
    edgeSet.add(key)
    edges.push({ from, to, relation, confidence })
  }

  const maxFiles = options.maxFiles || 5000
  let scanned = 0
  for (const file of files) {
    if (scanned >= maxFiles) break
    scanned++
    const rel = path.relative(rootDir, file).replace(/\\/g, '/')
    const ext = path.extname(file).toLowerCase()
    if (!ext) continue
    addNode(rel, 'file')

    let content
    try { content = fs.readFileSync(file, 'utf8').slice(0, 200000) } catch { continue }
    const relDir = path.posix.dirname(rel)

    // imports: file → target-file edges
    for (const spec of moduleImports(content, ext)) {
      const target = resolveImportTarget(relFiles, relDir, spec)
      if (target) addEdge(rel, target, 'imports', 0.9)
    }

    // symbol references: file → symbol node edges
    for (const sym of extractSymbols(content)) {
      addNode(sym, 'symbol')
      addEdge(rel, sym, 'references', 0.6)
    }
  }

  return { nodes, edges, fileCount: relFiles.length }
}

// ─── Persistence (kg_nodes / kg_edges) ──────────────────────────────────────

/**
 * Upsert a graph into the knowledge-graph tables. Matches the write pattern
 * used by knowledgeGraph.js (SELECT-before-INSERT node upsert, INSERT OR
 * REPLACE edges) so both modules interoperate on the same tables.
 * Returns { nodes, edges } written counts.
 */
function writeCodeUnderstanding(db, graph) {
  if (!db) return { nodes: 0, edges: 0 }
  const nodes = (graph && graph.nodes) || []
  const edges = (graph && graph.edges) || []
  let nodeCount = 0
  let edgeCount = 0
  const nodeByEntity = (entity) => {
    if (db.allRows) {
      const rows = db.allRows('SELECT id FROM kg_nodes WHERE entity = ? LIMIT 1', [entity])
      return rows && rows[0] ? rows[0] : null
    }
    const row = db.prepare('SELECT id FROM kg_nodes WHERE entity = ? LIMIT 1').get(entity)
    return row || null
  }
  try {
    for (const node of nodes) {
      const entity = String(node.entity || '').trim().toLowerCase()
      if (!entity) continue
      const type = String(node.type || 'entity')
      const existing = nodeByEntity(entity)
      if (existing) {
        if (db.run) db.run('UPDATE kg_nodes SET type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [type, existing.id])
        else db.prepare('UPDATE kg_nodes SET type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(type, existing.id)
      } else {
        if (db.run) db.run('INSERT INTO kg_nodes (entity, type) VALUES (?, ?)', [entity, type])
        else db.prepare('INSERT INTO kg_nodes (entity, type) VALUES (?, ?)').run(entity, type)
      }
      nodeCount++
    }
    for (const edge of edges) {
      const from = String(edge.from || '').toLowerCase()
      const to = String(edge.to || '').toLowerCase()
      const relation = String(edge.relation || 'related')
      if (!from || !to) continue
      const confidence = Math.max(0, Math.min(1, Number(edge.confidence) || 0.8))
      if (db.run) {
        db.run('INSERT OR REPLACE INTO kg_edges ("from", "to", relation, confidence) VALUES (?, ?, ?, ?)', [from, to, relation, confidence])
      } else {
        db.prepare('INSERT OR REPLACE INTO kg_edges ("from", "to", relation, confidence) VALUES (?, ?, ?, ?)').run(from, to, relation, confidence)
      }
      edgeCount++
    }
  } catch (e) {
    log.warn('codeUnderstanding: write failed:', e && e.message)
  }
  return { nodes: nodeCount, edges: edgeCount }
}

// 幂等扫描一个 workspace 并把结构写入 kg 图(fire-and-forget 安全:不抛错)。
// 同一目录在 TTL 内不重复扫,避免每次请求都全库同步扫描导致主进程卡顿。
const _indexed = new Map()
function indexWorkspace(db, rootDir, options = {}) {
  if (!db || !rootDir) return { nodes: 0, edges: 0, skipped: true }
  const key = path.resolve(rootDir).toLowerCase()
  const ttl = options.ttl != null ? options.ttl : 5 * 60 * 1000
  const last = _indexed.get(key)
  if (last && (Date.now() - last) < ttl) return { nodes: 0, edges: 0, skipped: true }
  _indexed.set(key, Date.now())
  try {
    const graph = buildGraphUnderstanding(db, rootDir, options)
    return { ...writeCodeUnderstanding(db, graph), skipped: false }
  } catch (e) {
    log.warn('codeUnderstanding: index failed:', e && e.message)
    return { nodes: 0, edges: 0, skipped: false }
  }
}

module.exports = {
  DEFAULT_IGNORE_DIRS,
  DEFAULT_EXTENSIONS,
  listSourceFiles,
  extractModuleSpecs,
  extractPythonImports,
  extractSymbols,
  moduleImports,
  resolveImportTarget,
  buildGraphUnderstanding,
  buildCodeUnderstanding: buildGraphUnderstanding,
  writeCodeUnderstanding,
  indexWorkspace,
}