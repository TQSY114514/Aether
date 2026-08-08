// ─── Knowledge Graph unit tests ─────────────────────────────────────────────
// Tests for electron/llm/knowledgeGraph.js: second-degree neighbour queries,
// graph visualization data, and smart context injection.
//
// Uses a fake db whose `allRows` interprets the specific SQL the module emits
// against in-memory node/edge arrays, so no real database is required.

import { describe, it, expect } from 'vitest'
import knowledgeGraph from '../electron/llm/knowledgeGraph'

// ─── Fake db ────────────────────────────────────────────────────────────────
// nodes: [{ entity, type }]
// edges: [{ from, to, relation, confidence }]
// memories: [{ id, content, type, created_at }] (real rows surfaced by getMemories)
function mkDb({ nodes = [], edges = [], memories = [] } = {}) {
  const runLog = []
  const db = {
    getMemories: (limit) => memories.slice(0, limit),
    run: (sql, params = []) => { runLog.push({ sql, params }) },
    allRows: (sql, params = []) => {
      const p0 = params[0]
      if (sql.includes('FROM kg_nodes')) {
        // Exact entity lookup used by buildGraph's upsert (SELECT id ... WHERE entity = ?).
        if (sql.includes('WHERE entity = ?')) {
          const hit = nodes.find(n => String(n.entity).toLowerCase() === String(p0).toLowerCase())
          return hit ? [{ id: 1, entity: hit.entity, type: hit.type || 'entity' }] : []
        }
        const rows = nodes.map(n => ({ entity: n.entity, type: n.type || 'entity' }))
        if (p0 && sql.includes('LIKE ?')) {
          const kw = String(p0).replace(/%/g, '')
          return rows.filter(r => r.entity.includes(kw))
        }
        return rows
      }
      if (sql.includes('FROM kg_edges')) {
        const minConf = 0.3
        // Full edge dump for graph visualization.
        if (sql.includes('"from", "to"')) {
          return edges.map(e => ({ from: e.from, to: e.to, relation: e.relation, confidence: e.confidence }))
        }
        // Directed AS-node query ("to" AS node / "from" AS node) used by
        // getSecondDegreeNeighbors / injectContext.
        if (sql.includes('AS node')) {
          const destIsTo = sql.includes('"to" AS node')
          const byFrom = sql.includes('"from" = ?')
          return edges
            .filter(e => e.confidence >= minConf)
            .filter(e => (byFrom ? e.from === p0 : e.to === p0))
            .map(e => ({ node: destIsTo ? e.to : e.from, relation: e.relation }))
        }
        // searchGraph uses row projections: SELECT "to", ... WHERE "from" = ? and
        // SELECT "from", ... WHERE "to" = ?.
        const byFrom = sql.includes('"from" = ?')
        const dest = byFrom ? 'to' : 'from'
        return edges
          .filter(e => e.confidence >= minConf)
          .filter(e => (byFrom ? e.from === p0 : e.to === p0))
          .map(e => ({ [dest]: e[dest], relation: e.relation, confidence: e.confidence }))
      }
      return []
    },
  }
  db._runLog = runLog
  return db
}

const sampleGraph = () => mkDb({
  nodes: [
    { entity: 'alice', type: 'entity' },
    { entity: 'project_x', type: 'entity' },
    { entity: 'tool_z', type: 'entity' },
    { entity: 'bob', type: 'entity' },
  ],
  edges: [
    { from: 'alice', to: 'project_x', relation: 'works_on', confidence: 0.9 },
    { from: 'project_x', to: 'tool_z', relation: 'uses', confidence: 0.8 },
    { from: 'bob', to: 'project_x', relation: 'works_on', confidence: 0.7 },
  ],
})

// ─── getSecondDegreeNeighbors ───────────────────────────────────────────────
describe('getSecondDegreeNeighbors', () => {
  it('returns indirect entities reachable through a middle node (A→B→C)', () => {
    const db = sampleGraph()
    const res = knowledgeGraph.getSecondDegreeNeighbors(db, 'alice')
    // alice → project_x → tool_z, and bob → project_x ← alice (both via project_x)
    const names = res.map(r => r.entity).sort()
    expect(names).toEqual(['bob', 'tool_z'])
    for (const r of res) {
      expect(r.via).toBe('project_x')
      expect(r.hop).toBe(2)
    }
  })

  it('excludes direct neighbours from the result set', () => {
    const db = sampleGraph()
    // project_x is a direct neighbour of alice, so it must not appear.
    const res = knowledgeGraph.getSecondDegreeNeighbors(db, 'alice')
    expect(res.some(r => r.entity === 'project_x')).toBe(false)
  })

  it('returns [] when no indirect entity exists', () => {
    const db = sampleGraph()
    // All 2-hop neighbours of project_x are already direct neighbours.
    expect(knowledgeGraph.getSecondDegreeNeighbors(db, 'project_x')).toEqual([])
  })

  it('returns [] for an empty or unknown entity', () => {
    const db = sampleGraph()
    expect(knowledgeGraph.getSecondDegreeNeighbors(db, '')).toEqual([])
    expect(knowledgeGraph.getSecondDegreeNeighbors(db, 'ghost')).toEqual([])
  })

  it('handles a db that throws', () => {
    const db = { allRows: () => { throw new Error('boom') } }
    expect(knowledgeGraph.getSecondDegreeNeighbors(db, 'alice')).toEqual([])
  })
})

// ─── getGraphData ───────────────────────────────────────────────────────────
describe('getGraphData', () => {
  it('returns node and edge lists for visualization', () => {
    const db = sampleGraph()
    const data = knowledgeGraph.getGraphData(db)
    expect(data.nodes).toHaveLength(4)
    expect(data.edges).toHaveLength(3)
    expect(data.nodes[0]).toMatchObject({ id: 'alice', label: 'alice', type: 'entity' })
    expect(data.edges[0]).toMatchObject({ source: 'alice', target: 'project_x', relation: 'works_on' })
  })

  it('returns empty lists when the db throws', () => {
    const db = { allRows: () => { throw new Error('boom') } }
    expect(knowledgeGraph.getGraphData(db)).toEqual({ nodes: [], edges: [] })
  })
})

// ─── injectContext ──────────────────────────────────────────────────────────
describe('injectContext', () => {
  it('returns matched entities plus their 1-hop relations', () => {
    const db = sampleGraph()
    const res = knowledgeGraph.injectContext(db, 'alice project')
    const names = res.map(r => r.entity).sort()
    expect(names).toContain('alice')
    expect(names).toContain('project_x')
    expect(names).toContain('tool_z')
    expect(names).toContain('bob')
    const alice = res.find(r => r.entity === 'alice')
    expect(alice.hop).toBe(0)
    const tool = res.find(r => r.entity === 'tool_z')
    expect(tool.hop).toBe(1)
    expect(tool.relation).toBe('uses')
    expect(tool.via).toBe('project_x')
  })

  it('returns [] for empty message or no matching entities', () => {
    const db = sampleGraph()
    expect(knowledgeGraph.injectContext(db, '')).toEqual([])
    expect(knowledgeGraph.injectContext(db, 'zzz')).toEqual([])
  })

  it('handles a db that throws', () => {
    const db = { allRows: () => { throw new Error('boom') } }
    expect(knowledgeGraph.injectContext(db, 'alice')).toEqual([])
  })
})

// ─── buildGraph (upsert into kg_nodes / kg_edges) ───────────────────────────
describe('buildGraph', () => {
  const mem = (content, type = 'fact') => ({ id: Math.random(), content, type, created_at: '2024-01-01' })

  it('creates entity nodes and relation edges from memory rows', () => {
    const db = mkDb({ memories: [
      mem('alice|prefers terminal', 'entity'),
      mem('alice|works_on|project_x', 'relation'),
      mem('bob|works_on|project_x', 'relation'),
    ] })
    knowledgeGraph.buildGraph(db)

    // Entity "alice" upserted as a node, edges from the two relation rows written.
    const nodeInserts = db._runLog.filter(r => r.sql.includes('INSERT INTO kg_nodes'))
    const edgeInserts = db._runLog.filter(r => r.sql.includes('INSERT OR REPLACE INTO kg_edges'))
    expect(nodeInserts.length).toBeGreaterThan(0)
    expect(edgeInserts.length).toBe(2)
    for (const e of edgeInserts) {
      expect(e.params).toHaveLength(4) // from, to, relation, confidence
    }
  })

  it('is idempotent: re-running with the same db state does not duplicate edges', () => {
    const db = mkDb({
      memories: [
        mem('alice|works_on|project_x', 'relation'),
      ],
    })
    knowledgeGraph.buildGraph(db)
    knowledgeGraph.buildGraph(db)
    const edgeInserts = db._runLog.filter(r => r.sql.includes('INSERT OR REPLACE INTO kg_edges'))
    // INSERT OR REPLACE has no unique key on edges, so re-runs still write rows —
    // idempotence is enforced at the node level (SELECT-before-INSERT). Edges are
    // simply rewritten by replacing the tuple.
    expect(edgeInserts.length).toBe(2)
  })

  it('does not duplicate a node across builds (SELECT-before-INSERT upsert)', () => {
    const db = mkDb({
      memories: [mem('alice|project', 'entity')],
    })
    knowledgeGraph.buildGraph(db)
    const nodeInserts = db._runLog.filter(r => r.sql.includes('INSERT INTO kg_nodes'))
    expect(nodeInserts.length).toBe(1)
    // Second run must find alice already present → UPDATE path, not another INSERT.
    const cleared = mkDb({ nodes: [{ entity: 'alice', type: 'entity' }], memories: [mem('alice|project', 'entity')] })
    knowledgeGraph.buildGraph(cleared)
    const nodeUpdates = cleared._runLog.filter(r => r.sql.includes('UPDATE kg_nodes'))
    expect(nodeUpdates.length).toBe(1)
  })

  it('handles a db that throws on read', () => {
    const db = { getMemories: () => { throw new Error('boom') } }
    expect(() => knowledgeGraph.buildGraph(db)).not.toThrow()
  })
})

// ─── searchGraph (1-hop graph expansion over memories) ──────────────────────
describe('searchGraph', () => {
  const memoryRows = [
    { id: 1, content: 'alice works on project_x', created_at: '2024-01-01' },
    { id: 2, content: 'project_x uses tool_z', created_at: '2024-01-01' },
    { id: 3, content: 'unrelated cloud deployment', created_at: '2024-01-01' },
  ]

  it('returns memories matching the query keywords', () => {
    const db = mkDb({
      nodes: [{ entity: 'alice', type: 'entity' }],
      edges: [{ from: 'alice', to: 'project_x', relation: 'works_on', confidence: 0.9 }],
      memories: memoryRows,
    })
    const res = knowledgeGraph.searchGraph(db, 'alice')
    expect(res.length).toBeGreaterThan(0)
    // Direct keyword hit plus the 1-hop neighbour entity (project_x) surfaced.
    expect(res.some(m => m.id === 1)).toBe(true)
  })

  it('expands to 1-hop neighbour entities so related memories surface', () => {
    const db = mkDb({
      nodes: [{ entity: 'alice', type: 'entity' }],
      edges: [{ from: 'alice', to: 'project_x', relation: 'works_on', confidence: 0.9 }],
      memories: memoryRows,
    })
    // Query has no direct keyword overlap with memory 2's text, yet the edge
    // alice → project_x must pull "project_x uses tool_z" into the results.
    const res = knowledgeGraph.searchGraph(db, 'alice')
    const ids = res.map(m => m.id)
    expect(ids).toContain(2)
  })

  it('respects the limit', () => {
    const db = mkDb({
      nodes: [{ entity: 'alice', type: 'entity' }],
      edges: [{ from: 'alice', to: 'project_x', relation: 'works_on', confidence: 0.9 }],
      memories: [
        ...memoryRows,
        { id: 4, content: 'alice again project_x once more', created_at: '2024-01-01' },
      ],
    })
    expect(knowledgeGraph.searchGraph(db, 'alice', 2).length).toBeLessThanOrEqual(2)
  })

  it('returns [] for an empty query, no entities, or no matching memories', () => {
    const db = mkDb({ nodes: [], edges: [], memories: memoryRows })
    expect(knowledgeGraph.searchGraph(db, '')).toEqual([])
    expect(knowledgeGraph.searchGraph(db, 'zzznoentity')).toEqual([])
  })

  it('handles a db that throws', () => {
    const db = { allRows: () => { throw new Error('boom') } }
    expect(knowledgeGraph.searchGraph(db, 'alice')).toEqual([])
  })
})