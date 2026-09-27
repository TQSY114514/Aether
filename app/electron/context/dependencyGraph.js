// ───────────────────────────────────────────────────────────────────────────
// Dependency Graph — builds and queries an import/export dependency graph.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build a dependency graph from extracted file symbols.
 * @param {Array<{ path: string, imports: string[], exports: string[], symbols: string[], language: string }>} files
 * @returns {{ files: Map<string, object>, edges: Array<{ from: string, to: string, type: string }> }}
 */
function buildGraph(files) {
  const fileMap = new Map()
  const edges = []

  for (const f of files) {
    fileMap.set(f.path, {
      path: f.path,
      imports: f.imports || [],
      exports: f.exports || [],
      symbols: f.symbols || [],
      symbolLocs: f.symbolLocs || [],
      size: f.size || 0,
      language: f.language || 'unknown',
    })
  }

  for (const [filePath, node] of fileMap) {
    for (const imp of node.imports) {
      // Try to match import to a file in the graph
      const target = findImportTarget(imp, filePath, fileMap)
      if (target) {
        edges.push({ from: filePath, to: target, type: 'imports' })
      }
    }
    // Link files that import the same module
    for (const sym of node.exports) {
      const importers = findSymbolImporters(sym, filePath, fileMap)
      for (const imp of importers) {
        edges.push({ from: imp, to: filePath, type: 'imported_by' })
      }
    }
  }

  return { files: fileMap, edges }
}

/**
 * Try to resolve an import name to a file path in the graph.
 */
function findImportTarget(importName, fromPath, fileMap) {
  // Direct match: import name matches a file basename
  const baseName = importName.replace(/^(\.\.\/|\.\/)/, '')
  for (const [fp] of fileMap) {
    const bn = fp.split('/').pop()?.replace(/\.[^.]+$/, '') || ''
    if (bn === baseName || bn === importName) return fp
  }
  // Prefix match: "foo/bar" matches a file under "foo/"
  const parts = importName.split('/').filter(Boolean)
  if (parts.length > 1) {
    const prefix = parts.slice(0, parts.length - 1).join('/')
    const base = parts[parts.length - 1]
    for (const [fp] of fileMap) {
      if (fp.includes(prefix) && (fp.endsWith(base + '.js') || fp.endsWith(base + '.ts'))) return fp
    }
  }
  return null
}

/**
 * Find files that define the given symbol.
 */
function findSymbolImporters(symbolName, excludePath, fileMap) {
  const results = []
  for (const [fp, node] of fileMap) {
    if (fp === excludePath) continue
    if (node.symbols && node.symbols.includes(symbolName)) results.push(fp)
  }
  return results
}

/**
 * Query the graph for files related to a symbol or path.
 * @param {{ files: Map<string, object>, edges: Array<{ from: string, to: string, type: string }> }} graph
 * @param {string} query
 * @returns {{ path: string, relation: string, relevance: number }[]}
 */
function query(graph, query) {
  const results = []
  const q = String(query || '').trim().toLowerCase()
  if (!q) return results

  for (const [filePath, node] of graph.files) {
    // Match by file path
    if (filePath.toLowerCase().includes(q)) {
      results.push({ path: filePath, relation: 'path_match', relevance: 10 })
    }
    // Match by symbol
    for (const sym of node.symbols || []) {
      if (sym.toLowerCase().includes(q)) {
        results.push({ path: filePath, relation: 'defines', relevance: 9 })
      }
    }
    // Match by import
    for (const imp of node.imports || []) {
      if (imp.toLowerCase().includes(q)) {
        results.push({ path: filePath, relation: 'imports', relevance: 7 })
      }
    }
    // Match by export
    for (const exp of node.exports || []) {
      if (exp.toLowerCase().includes(q)) {
        results.push({ path: filePath, relation: 'exports', relevance: 8 })
      }
    }
  }

  // Deduplicate, keeping highest relevance per path
  const seen = new Map()
  for (const r of results) {
    const existing = seen.get(r.path)
    if (!existing || r.relevance > existing.relevance) seen.set(r.path, r)
  }
  return Array.from(seen.values()).sort((a, b) => b.relevance - a.relevance)
}

/**
 * Get graph statistics.
 */
function getStats(graph) {
  const languages = new Set()
  for (const [, node] of graph.files) {
    languages.add(node.language)
  }
  return {
    totalFiles: graph.files.size,
    totalEdges: graph.edges.length,
    languages: Array.from(languages).sort(),
  }
}

/**
 * Compute PageRank centrality scores on the dependency graph.
 * @param {{ files: Map<string, object>, edges: Array<{ from: string, to: string, type: string }> }} graph
 * @param {number} [iterations=20]
 * @param {number} [damping=0.85]
 * @returns {Map<string, number>} Path -> PageRank score
 */
function computePageRank(graph, iterations = 20, damping = 0.85) {
  if (!graph || !graph.files) return new Map()
  const paths = Array.from(graph.files.keys())
  const N = paths.length
  if (N === 0) return new Map()

  const outDegree = new Map()
  const inEdges = new Map()

  for (const p of paths) {
    outDegree.set(p, 0)
    inEdges.set(p, [])
  }

  for (const edge of graph.edges || []) {
    if (edge.type === 'imports' && inEdges.has(edge.to) && outDegree.has(edge.from)) {
      outDegree.set(edge.from, outDegree.get(edge.from) + 1)
      inEdges.get(edge.to).push(edge.from)
    }
  }

  let pr = new Map()
  const initial = 1 / N
  for (const p of paths) pr.set(p, initial)

  for (let it = 0; it < iterations; it++) {
    const nextPr = new Map()
    let danglingSum = 0
    for (const p of paths) {
      if (outDegree.get(p) === 0) danglingSum += pr.get(p)
    }

    for (const p of paths) {
      let incoming = 0
      const sources = inEdges.get(p)
      for (const src of sources) {
        const out = outDegree.get(src)
        if (out > 0) incoming += pr.get(src) / out
      }
      const score = (1 - damping) / N + damping * (incoming + danglingSum / N)
      nextPr.set(p, score)
    }
    pr = nextPr
  }

  return pr
}

module.exports = { buildGraph, query, getStats, computePageRank }
