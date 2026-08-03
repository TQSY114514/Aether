// ───────────────────────────────────────────────────────────────────────────
// Memory Graph — entity-relationship graph built on JSONL storage.
//
// Manages a directed graph of nodes (entity, file, session, skill, decision)
// connected by edges (references, modifies, depends_on, triggers). Supports
// multi-hop queries, JSONL persistence, and graph construction from FTS5
// search results.
//
// File format: memory_graph.jsonl (one JSON object per line)
//   Node line: { type: 'node', id, nodeType, data, ts }
//   Edge line: { type: 'edge', id, from, to, edgeType, data, ts }
// ───────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')

const VALID_NODE_TYPES = ['entity', 'file', 'session', 'skill', 'decision']
const VALID_EDGE_TYPES = ['references', 'modifies', 'depends_on', 'triggers']

class MemoryGraph {
  /**
   * @param {string} [filePath] - Path to the JSONL file. Defaults to
   *   memory_graph.jsonl in the current working directory.
   */
  constructor(filePath) {
    this.filePath = filePath || path.join(process.cwd(), 'memory_graph.jsonl')
    this._nodes = new Map() // id -> { id, nodeType, data, ts }
    this._edges = []         // { id, from, to, edgeType, data, ts }
    this._adjacency = new Map() // from -> [{ to, edgeType, data, id }]
    this._reverseAdj = new Map() // to -> [{ from, edgeType, data, id }]
    this._loaded = false
  }

  // ─── Persistence ─────────────────────────────────────────────────────────

  /**
   * Load the graph from the JSONL file. Replaces any in-memory state.
   * Returns this for chaining.
   */
  load() {
    this._nodes.clear()
    this._edges = []
    this._adjacency.clear()
    this._reverseAdj.clear()

    if (!fs.existsSync(this.filePath)) {
      this._loaded = true
      return this
    }

    const raw = fs.readFileSync(this.filePath, 'utf8')
    const lines = raw.split('\n').filter(l => l.trim())

    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        if (entry.type === 'node') {
          this._nodes.set(entry.id, {
            id: entry.id,
            nodeType: entry.nodeType,
            data: entry.data || {},
            ts: entry.ts || entry.timestamp || null,
          })
        } else if (entry.type === 'edge') {
          const edge = {
            id: entry.id,
            from: entry.from,
            to: entry.to,
            edgeType: entry.edgeType,
            data: entry.data || {},
            ts: entry.ts || entry.timestamp || null,
          }
          this._edges.push(edge)
          this._addAdjacency(edge)
        }
      } catch {
        // Skip corrupt lines
      }
    }

    this._loaded = true
    return this
  }

  /**
   * Persist the current graph to the JSONL file atomically.
   */
  save() {
    const lines = []

    for (const node of this._nodes.values()) {
      lines.push(JSON.stringify({
        type: 'node',
        id: node.id,
        nodeType: node.nodeType,
        data: node.data,
        ts: node.ts || new Date().toISOString(),
      }))
    }

    for (const edge of this._edges) {
      lines.push(JSON.stringify({
        type: 'edge',
        id: edge.id,
        from: edge.from,
        to: edge.to,
        edgeType: edge.edgeType,
        data: edge.data,
        ts: edge.ts || new Date().toISOString(),
      }))
    }

    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Atomic write via temp file
    const tmp = this.filePath + '.tmp'
    fs.writeFileSync(tmp, lines.join('\n') + '\n', 'utf8')
    fs.renameSync(tmp, this.filePath)
  }

  // ─── Node Operations ─────────────────────────────────────────────────────

  /**
   * Add or update a node.
   * @param {string} nodeType - One of: entity, file, session, skill, decision
   * @param {string} id - Unique node identifier
   * @param {object} [data] - Optional metadata payload
   * @returns {object} The node object
   */
  addNode(nodeType, id, data = {}) {
    if (!VALID_NODE_TYPES.includes(nodeType)) {
      throw new Error(`Invalid node type "${nodeType}". Must be one of: ${VALID_NODE_TYPES.join(', ')}`)
    }
    if (!id || typeof id !== 'string') {
      throw new Error('Node id must be a non-empty string')
    }

    const existing = this._nodes.get(id)
    const now = new Date().toISOString()

    const node = {
      id,
      nodeType,
      data: { ...(existing ? existing.data : {}), ...data },
      ts: existing ? existing.ts : now,
    }

    this._nodes.set(id, node)
    return node
  }

  /**
   * Remove a node and all its incident edges.
   * @param {string} id
   * @returns {boolean} True if the node existed and was removed
   */
  removeNode(id) {
    if (!this._nodes.has(id)) return false
    this._nodes.delete(id)

    // Remove all edges incident to this node
    const remaining = []
    for (const edge of this._edges) {
      if (edge.from === id || edge.to === id) continue
      remaining.push(edge)
    }
    this._edges = remaining

    // Rebuild adjacency
    this._rebuildAdjacency()
    return true
  }

  /**
   * Get a node by id.
   * @param {string} id
   * @returns {object|undefined}
   */
  getNode(id) {
    return this._nodes.get(id)
  }

  /**
   * List all nodes, optionally filtered by type.
   * @param {string} [nodeType]
   * @returns {object[]}
   */
  listNodes(nodeType) {
    const results = []
    for (const node of this._nodes.values()) {
      if (!nodeType || node.nodeType === nodeType) {
        results.push(node)
      }
    }
    return results
  }

  // ─── Edge Operations ─────────────────────────────────────────────────────

  /**
   * Add an edge between two nodes.
   * @param {string} from - Source node id
   * @param {string} to - Target node id
   * @param {string} edgeType - One of: references, modifies, depends_on, triggers
   * @param {object} [data] - Optional metadata
   * @returns {object} The edge object
   */
  addEdge(from, to, edgeType, data = {}) {
    if (!VALID_EDGE_TYPES.includes(edgeType)) {
      throw new Error(`Invalid edge type "${edgeType}". Must be one of: ${VALID_EDGE_TYPES.join(', ')}`)
    }
    if (!this._nodes.has(from)) {
      throw new Error(`Source node "${from}" does not exist`)
    }
    if (!this._nodes.has(to)) {
      throw new Error(`Target node "${to}" does not exist`)
    }

    const edge = {
      id: `${from}->${to}:${edgeType}:${Date.now()}`,
      from,
      to,
      edgeType,
      data,
      ts: new Date().toISOString(),
    }

    this._edges.push(edge)
    this._addAdjacency(edge)
    return edge
  }

  /**
   * Remove edges matching the given criteria.
   * @param {object} criteria - { from?, to?, edgeType? }
   * @returns {number} Number of edges removed
   */
  removeEdges(criteria = {}) {
    const before = this._edges.length
    this._edges = this._edges.filter(e => {
      if (criteria.from && e.from === criteria.from) return false
      if (criteria.to && e.to === criteria.to) return false
      if (criteria.edgeType && e.edgeType === criteria.edgeType) return false
      return true
    })
    const removed = before - this._edges.length
    if (removed > 0) this._rebuildAdjacency()
    return removed
  }

  // ─── Query ───────────────────────────────────────────────────────────────

  /**
   * Multi-hop graph query. Returns all nodes reachable from the entry points
   * via edges matching the given relation, up to the specified depth.
   *
   * @param {string} relation - Edge type to traverse (or '*' for all types)
   * @param {number} [depth=1] - Maximum number of hops
   * @returns {object[]} Array of { node, edge, path, hop } objects
   */
  queryGraph(relation, depth = 1) {
    if (!this._loaded) this.load()

    const results = []
    const visited = new Set()

    // BFS from all nodes that have incident edges matching the relation.
    // If no start nodes are provided, we traverse from all edge endpoints.
    const queue = []

    for (const edge of this._edges) {
      if (relation !== '*' && edge.edgeType !== relation) continue
      const fromNode = this._nodes.get(edge.from)
      const toNode = this._nodes.get(edge.to)
      if (fromNode && !visited.has(edge.from)) {
        queue.push({ nodeId: edge.from, hop: 0 })
        visited.add(edge.from)
      }
      if (toNode && !visited.has(edge.to)) {
        queue.push({ nodeId: edge.to, hop: 0 })
        visited.add(edge.to)
      }
    }

    // If no edges matched, return empty
    if (queue.length === 0) return results

    let idx = 0
    while (idx < queue.length) {
      const { nodeId, hop } = queue[idx++]
      if (hop >= depth) continue

      const adjacency = this._adjacency.get(nodeId) || []
      for (const adj of adjacency) {
        if (relation !== '*' && adj.edgeType !== relation) continue
        if (!visited.has(adj.to)) {
          visited.add(adj.to)
          const node = this._nodes.get(adj.to)
          if (node) {
            results.push({
              node,
              edge: adj,
              path: `${nodeId} --[${adj.edgeType}]--> ${adj.to}`,
              hop: hop + 1,
            })
          }
          queue.push({ nodeId: adj.to, hop: hop + 1 })
        }
      }
    }

    return results
  }

  /**
   * Get entities related to a given entity id, traversing edges of the
   * specified type up to the given depth.
   *
   * @param {string} entityId - Starting node id
   * @param {string} [relation] - Edge type filter (or '*' for all)
   * @param {number} [depth=1] - Maximum hops
   * @returns {object[]} Array of { node, edge, path, hop }
   */
  getRelated(entityId, relation, depth = 1) {
    if (!this._nodes.has(entityId)) return []

    const results = []
    const visited = new Set([entityId])
    const queue = [{ nodeId: entityId, hop: 0 }]

    let idx = 0
    while (idx < queue.length) {
      const { nodeId, hop } = queue[idx++]
      if (hop >= depth) continue

      // Outgoing edges
      const outAdj = this._adjacency.get(nodeId) || []
      for (const adj of outAdj) {
        if (relation && relation !== '*' && adj.edgeType !== relation) continue
        if (!visited.has(adj.to)) {
          visited.add(adj.to)
          const node = this._nodes.get(adj.to)
          if (node) {
            results.push({
              node,
              edge: { from: adj.from, to: adj.to, edgeType: adj.edgeType, data: adj.data },
              path: `${entityId} --[${adj.edgeType}]--> ${adj.to}`,
              hop: hop + 1,
            })
          }
          queue.push({ nodeId: adj.to, hop: hop + 1 })
        }
      }

      // Incoming edges
      const inAdj = this._reverseAdj.get(nodeId) || []
      for (const adj of inAdj) {
        if (relation && relation !== '*' && adj.edgeType !== relation) continue
        if (!visited.has(adj.from)) {
          visited.add(adj.from)
          const node = this._nodes.get(adj.from)
          if (node) {
            results.push({
              node,
              edge: { from: adj.from, to: adj.to, edgeType: adj.edgeType, data: adj.data },
              path: `${adj.from} --[${adj.edgeType}]--> ${entityId}`,
              hop: hop + 1,
            })
          }
          queue.push({ nodeId: adj.from, hop: hop + 1 })
        }
      }
    }

    return results
  }

  /**
   * Get all edges from the graph.
   * @param {object} [filter] - { from?, to?, edgeType? }
   * @returns {object[]}
   */
  getEdges(filter = {}) {
    return this._edges.filter(e => {
      if (filter.from && e.from !== filter.from) return false
      if (filter.to && e.to !== filter.to) return false
      if (filter.edgeType && e.edgeType !== filter.edgeType) return false
      return true
    })
  }

  // ─── FTS5 Integration ────────────────────────────────────────────────────

  /**
   * Build the graph from FTS5 search results. Each result row should contain
   * entity/relationship information that can be mapped to nodes and edges.
   *
   * Expected row format (from an FTS5 search on memory/entity tables):
   *   { id, entity_type, entity_name, related_entity, relation_type, content }
   *
   * @param {object[]} fts5Results - Array of FTS5 result rows
   * @param {object} [opts]
   * @param {string} [opts.idField='id'] - Field name for entity id
   * @param {string} [opts.typeField='entity_type'] - Field name for node type
   * @param {string} [opts.nameField='entity_name'] - Field name for node id/name
   * @param {string} [opts.relatedField='related_entity'] - Field name for related entity id
   * @param {string} [opts.relationField='relation_type'] - Field name for edge type
   * @param {string} [opts.contentField='content'] - Field name for content/data
   */
  buildFromFTS5(fts5Results, opts = {}) {
    if (!Array.isArray(fts5Results) || fts5Results.length === 0) return this

    const {
      idField = 'id',
      typeField = 'entity_type',
      nameField = 'entity_name',
      relatedField = 'related_entity',
      relationField = 'relation_type',
      contentField = 'content',
    } = opts

    for (const row of fts5Results) {
      // Extract entity info
      const entityId = String(row[nameField] || row[idField] || '').trim()
      const entityType = String(row[typeField] || 'entity').trim()
      const content = row[contentField] || ''

      if (!entityId) continue

      // Normalize node type
      const nodeType = VALID_NODE_TYPES.includes(entityType) ? entityType : 'entity'

      // Add or update the node
      if (!this._nodes.has(entityId)) {
        this.addNode(nodeType, entityId, { content })
      }

      // If there's a related entity, add an edge
      const relatedId = String(row[relatedField] || '').trim()
      const relationType = String(row[relationField] || '').trim()

      if (relatedId && relationType) {
        const edgeType = VALID_EDGE_TYPES.includes(relationType) ? relationType : 'references'

        // Ensure target node exists
        if (!this._nodes.has(relatedId)) {
          this.addNode('entity', relatedId, {})
        }

        // Avoid duplicate edges
        const exists = this._edges.some(
          e => e.from === entityId && e.to === relatedId && e.edgeType === edgeType
        )
        if (!exists) {
          this.addEdge(entityId, relatedId, edgeType, { source: 'fts5' })
        }
      }
    }

    return this
  }

  // ─── Statistics ──────────────────────────────────────────────────────────

  /**
   * Get graph statistics.
   * @returns {object}
   */
  stats() {
    const nodeTypeCounts = {}
    const edgeTypeCounts = {}

    for (const node of this._nodes.values()) {
      nodeTypeCounts[node.nodeType] = (nodeTypeCounts[node.nodeType] || 0) + 1
    }

    for (const edge of this._edges) {
      edgeTypeCounts[edge.edgeType] = (edgeTypeCounts[edge.edgeType] || 0) + 1
    }

    return {
      nodeCount: this._nodes.size,
      edgeCount: this._edges.length,
      nodeTypes: nodeTypeCounts,
      edgeTypes: edgeTypeCounts,
      filePath: this.filePath,
    }
  }

  /**
   * Clear all nodes and edges (in-memory only — call save() to persist).
   */
  clear() {
    this._nodes.clear()
    this._edges = []
    this._adjacency.clear()
    this._reverseAdj.clear()
  }

  // ─── Internal Helpers ────────────────────────────────────────────────────

  _addAdjacency(edge) {
    if (!this._adjacency.has(edge.from)) {
      this._adjacency.set(edge.from, [])
    }
    this._adjacency.get(edge.from).push({
      to: edge.to,
      edgeType: edge.edgeType,
      data: edge.data,
      id: edge.id,
      from: edge.from,
    })

    if (!this._reverseAdj.has(edge.to)) {
      this._reverseAdj.set(edge.to, [])
    }
    this._reverseAdj.get(edge.to).push({
      from: edge.from,
      edgeType: edge.edgeType,
      data: edge.data,
      id: edge.id,
      to: edge.to,
    })
  }

  _rebuildAdjacency() {
    this._adjacency.clear()
    this._reverseAdj.clear()
    for (const edge of this._edges) {
      this._addAdjacency(edge)
    }
  }
}

module.exports = { MemoryGraph, VALID_NODE_TYPES, VALID_EDGE_TYPES }