// ─── dependencyGraph: symbol locations survive graph building ──────────────
// The find_symbol tool relies on the indexed graph; this covers the pure
// buildGraph/query layer so node.symbolLocs survive graph construction and
// query() can locate a symbol by name.

import { describe, it, expect } from 'vitest'
import { buildGraph, query } from '../electron/context/dependencyGraph'

const sampleFiles = () => [
  {
    path: '/repo/a.js',
    imports: ['b'],
    exports: ['foo'],
    symbols: ['foo'],
    symbolLocs: [{ name: 'foo', locStart: 1, locEnd: 3 }],
    language: 'javascript',
  },
  {
    path: '/repo/b.js',
    imports: [],
    exports: ['bar'],
    symbols: ['bar'],
    symbolLocs: [{ name: 'bar', locStart: 4, locEnd: 6 }],
    language: 'javascript',
  },
]

describe('buildGraph', () => {
  it('preserves symbolLocs on the built graph nodes', () => {
    const graph = buildGraph(sampleFiles())
    expect(graph.files.get('/repo/a.js').symbolLocs).toEqual([{ name: 'foo', locStart: 1, locEnd: 3 }])
    expect(graph.files.get('/repo/b.js').symbolLocs).toEqual([{ name: 'bar', locStart: 4, locEnd: 6 }])
  })

  it('builds import edges between files', () => {
    const graph = buildGraph(sampleFiles())
    expect(graph.edges).toContainEqual({ from: '/repo/a.js', to: '/repo/b.js', type: 'imports' })
  })
})

describe('query', () => {
  it('finds a symbol by name and keeps symbolLocs available on the node', () => {
    const graph = buildGraph(sampleFiles())
    const res = query(graph, 'foo')
    expect(res).toContainEqual({ path: '/repo/a.js', relation: 'defines', relevance: 9 })
    expect(graph.files.get('/repo/a.js').symbolLocs).toBeDefined()
  })
})