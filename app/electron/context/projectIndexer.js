// ───────────────────────────────────────────────────────────────────────────
// Project Indexer — orchestrates scanning → extraction → graph building.
// Caches the graph and invalidates on file changes.
// ───────────────────────────────────────────────────────────────────────────

const { scanWorkspace } = require('./fileScanner')
const { extractBatch } = require('./symbolExtractor')
const { buildGraph } = require('./dependencyGraph')

// Module-level cache: rootDir → { graph, mtime }
const _cache = new Map()

/**
 * Index a workspace: scan files → extract symbols → build graph.
 * @param {string} rootDir - Absolute workspace path.
 * @returns {{ files: Map<string, object>, edges: Array<{ from: string, to: string, type: string }> }}
 */
async function indexWorkspace(rootDir) {
  const files = scanWorkspace(rootDir)
  if (!files.length) return buildGraph([])

  const extracted = await extractBatch(files)
  return buildGraph(extracted)
}

/**
 * Invalidate the cached graph for a workspace.
 */
function invalidateCache(rootDir) {
  _cache.delete(rootDir)
}

/**
 * Get cached graph if the workspace hasn't changed.
 */
function getCachedGraph(rootDir) {
  const entry = _cache.get(rootDir)
  return entry?.graph || null
}

/**
 * Check if the cached graph is stale (any file modified since last index).
 */
function isIndexStale(rootDir) {
  const entry = _cache.get(rootDir)
  if (!entry) return true
  try {
    const files = scanWorkspace(rootDir)
    if (files.length === 0 && entry.graph.files.size === 0) return false
    const newest = files.reduce((max, f) => Math.max(max, f.modified), 0)
    return newest > entry.mtime
  } catch {
    return true
  }
}

module.exports = { indexWorkspace, invalidateCache, getCachedGraph, isIndexStale }
