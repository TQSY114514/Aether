// ───────────────────────────────────────────────────────────────────────────
// Persistent project-index cache — SQLite-backed so a large repo doesn't get
// re-scanned on every app launch. The in-memory Map in projectIndexer.js stays
// the fast path; this module is the disk fallback that survives restarts.
//
// Graph shape: { files: Map<path, {path,imports,exports,symbols,size,language}>,
//                edges: [{from,to,type}] }. files is a Map, so it's serialized
// to an array and rebuilt on load.
// ───────────────────────────────────────────────────────────────────────────

// Lazy require so this module is importable in node-only tests (database.js
// pulls in electron + better-sqlite3 at module load).
function db() { return require('../database') }

function serializeGraph(graph) {
  return {
    files: Array.from(graph.files.values()),
    edges: graph.edges || [],
  }
}

function deserializeGraph(data) {
  const files = new Map()
  for (const node of data.files || []) files.set(node.path, node)
  return { files, edges: data.edges || [] }
}

// Load a cached { graph, mtime } for a workspace, or null when absent/invalid.
function load(workspace) {
  const row = db().getRepoIndexCache(workspace)
  if (!row) return null
  try {
    return { graph: deserializeGraph(JSON.parse(row.graph_json)), mtime: row.mtime_x }
  } catch {
    return null
  }
}

// Persist a graph + its newest-file-mtime for a workspace.
function save(workspace, graph, mtime) {
  db().setRepoIndexCache(workspace, mtime, JSON.stringify(serializeGraph(graph)))
}

// Drop the cached entry for a workspace.
function remove(workspace) {
  db().deleteRepoIndexCache(workspace)
}

module.exports = { serializeGraph, deserializeGraph, load, save, remove }