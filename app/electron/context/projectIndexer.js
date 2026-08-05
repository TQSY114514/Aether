// ───────────────────────────────────────────────────────────────────────────
// Project Indexer — orchestrates scanning → extraction → graph building.
// Caches the graph in memory and persists it to SQLite so a large repo isn't
// re-scanned on every app launch. Invalidate on file changes.
// ───────────────────────────────────────────────────────────────────────────

const { scanWorkspace } = require('./fileScanner')
const { extractBatch } = require('./symbolExtractor')
const { buildGraph } = require('./dependencyGraph')
const indexCache = require('./indexCache')

// Module-level cache: rootDir → { graph, mtime }
const _cache = new Map()

/**
 * Index a workspace: scan files → extract symbols → build graph.
 * Fast path: in-memory cache if fresh; else disk cache if fresh; else rebuild
 * and persist. @param {string} rootDir - Absolute workspace path.
 * @param {{ force?: boolean }} [options]
 * @returns {{ files: Map<string, object>, edges: Array<{ from: string, to: string, type: string }> }}
 */
async function indexWorkspace(rootDir, options = {}) {
  // 1) In-memory cache (fast path).
  if (!options.force) {
    const cached = getCachedGraph(rootDir)
    if (cached && !(await isIndexStale(rootDir))) return cached
  }

  // 2) Disk cache (survives app restarts).
  if (!options.force) {
    const dbEntry = indexCache.load(rootDir)
    if (dbEntry && !(await isDbCacheStale(rootDir, dbEntry.mtime))) {
      _cache.set(rootDir, { graph: dbEntry.graph, mtime: dbEntry.mtime })
      return dbEntry.graph
    }
  }

  // 3) Rebuild.
  const files = await scanWorkspace(rootDir)
  if (!files.length) {
    const empty = buildGraph([])
    _cache.set(rootDir, { graph: empty, mtime: Date.now() })
    return empty
  }

  const extracted = await extractBatch(files)
  const graph = buildGraph(extracted)

  // Cache with the newest file mtime so freshness checks can detect changes.
  let newest = 0
  for (const f of files) if (f.modified > newest) newest = f.modified
  _cache.set(rootDir, { graph, mtime: newest })

  // Persist to disk (best-effort).
  try { indexCache.save(rootDir, graph, newest) } catch {}

  return graph
}

/**
 * Invalidate the cached graph for a workspace (memory + disk).
 */
function invalidateCache(rootDir) {
  _cache.delete(rootDir)
  try { indexCache.remove(rootDir) } catch {}
}

/**
 * Get cached graph if the workspace hasn't changed.
 */
function getCachedGraph(rootDir) {
  const entry = _cache.get(rootDir)
  return entry?.graph || null
}

/**
 * Newest file mtime in a workspace (0 when empty).
 */
async function newestMtime(rootDir) {
  const files = await scanWorkspace(rootDir)
  if (!files.length) return 0
  return files.reduce((max, f) => Math.max(max, f.modified), 0)
}

/**
 * Check if the in-memory cached graph is stale (any file modified since).
 */
async function isIndexStale(rootDir) {
  const entry = _cache.get(rootDir)
  if (!entry) return true
  try {
    const newest = await newestMtime(rootDir)
    if (newest === 0 && entry.graph.files.size === 0) return false
    return newest > entry.mtime
  } catch {
    return true
  }
}

/**
 * Check if a disk-cached entry (keyed by its stored mtime) is stale.
 */
async function isDbCacheStale(rootDir, mtime) {
  try {
    const newest = await newestMtime(rootDir)
    if (newest === 0 && mtime === 0) return false
    return newest > mtime
  } catch {
    return true
  }
}

module.exports = { indexWorkspace, invalidateCache, getCachedGraph, isIndexStale, newestMtime }