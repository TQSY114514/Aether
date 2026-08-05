// ─── Project-index persistent cache — serialization round-trip ──────────────
// Tests serializeGraph / deserializeGraph (the pure logic in indexCache.js).
// The DB delegation (load/save/remove) is a thin pass-through to database.js,
// which pulls in electron + better-sqlite3, so it's kept out of node tests.

import { describe, it, expect } from 'vitest'
import { serializeGraph, deserializeGraph } from '../electron/context/indexCache'

const sampleGraph = () => ({
  files: new Map([
    ['/repo/a.js', { path: '/repo/a.js', imports: ['b'], exports: ['foo'], symbols: ['foo'], size: 10, language: 'javascript' }],
    ['/repo/b.js', { path: '/repo/b.js', imports: [], exports: ['bar'], symbols: ['bar'], size: 20, language: 'javascript' }],
  ]),
  edges: [{ from: '/repo/a.js', to: '/repo/b.js', type: 'imports' }],
})

describe('serializeGraph / deserializeGraph', () => {
  it('round-trips a graph through JSON preserving files Map and edges', () => {
    const graph = sampleGraph()
    const revived = deserializeGraph(JSON.parse(JSON.stringify(serializeGraph(graph))))

    // files is rebuilt as a Map keyed by path.
    expect(revived.files).toBeInstanceOf(Map)
    expect(revived.files.size).toBe(2)
    expect(revived.files.get('/repo/a.js').exports).toEqual(['foo'])
    expect(revived.files.get('/repo/b.js').language).toBe('javascript')
    // edges preserved.
    expect(revived.edges).toEqual([{ from: '/repo/a.js', to: '/repo/b.js', type: 'imports' }])
  })

  it('handles an empty graph', () => {
    const empty = { files: new Map(), edges: [] }
    const revived = deserializeGraph(JSON.parse(JSON.stringify(serializeGraph(empty))))
    expect(revived.files.size).toBe(0)
    expect(revived.edges).toEqual([])
  })
})