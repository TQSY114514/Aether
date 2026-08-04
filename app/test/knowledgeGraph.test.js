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
function mkDb({ nodes = [], edges = [] } = {}) {
  return {
    allRows: (sql, params = []) => {
      const p0 = params[0]
      if (sql.includes('FROM kg_nodes')) {
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
        // Directed neighbour query: "to" AS node (from = ?) or "from" AS node (to = ?).
        const destIsTo = sql.includes('"to" AS node')
        const byFrom = sql.includes('"from" = ?')
        return edges
          .filter(e => e.confidence >= minConf)
          .filter(e => (byFrom ? e.from === p0 : e.to === p0))
          .map(e => ({ node: destIsTo ? e.to : e.from, relation: e.relation }))
      }
      return []
    },
  }
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