import { describe, it, expect } from 'vitest'
import { buildGraph } from './LearningGraphPage'
import type { Session } from '@/types'

type Mem = { id: number; content: string; created_at: string }
type Skill = { name: string; description: string }

const mem = (id: number, content: string): Mem => ({ id, content, created_at: '2024-01-01' })
const skill = (name: string, description = ''): Skill => ({ name, description })
const sess = (id: number, title: string, last_message = ''): Session => ({
  id, title, last_message, persona_id: null, created_at: '2024-01-01', pinned: 0, updated_at: '2024-01-01',
})

describe('buildGraph', () => {
  it('returns empty nodes/edges for empty inputs (empty-state contract)', () => {
    expect(buildGraph([], [], [])).toEqual({ nodes: [], edges: [] })
  })

  it('creates one node per memory, skill, and session with correct ids and types', () => {
    const g = buildGraph([mem(1, 'A')], [skill('B')], [sess(7, 'C')])
    const ids = g.nodes.map(n => n.id)
    expect(ids).toEqual(['mem-1', 'skill-B', 'sess-7'])
    expect(g.nodes.find(n => n.id === 'mem-1')?.type).toBe('memory')
    expect(g.nodes.find(n => n.id === 'skill-B')?.type).toBe('skill')
    expect(g.nodes.find(n => n.id === 'sess-7')?.type).toBe('session')
  })

  it('links skill to session when the session mentions the skill name (case-insensitive)', () => {
    const g = buildGraph([], [skill('Debugging')], [sess(3, 'Fixed it by debugging')])
    expect(g.edges).toContainEqual({ from: 'skill-Debugging', to: 'sess-3', label: 'used in' })
  })

  it('adds a memory edge when a memory keyword (>3 chars) appears in the session text', () => {
    const g = buildGraph([mem(2, 'prefers terminal workflows')], [], [sess(5, 'use terminal for everything')])
    expect(g.edges.some(e => e.from === 'mem-2' && e.to === 'sess-5')).toBe(true)
    // label carries the matching keywords
    expect(g.edges.find(e => e.from === 'mem-2')?.label).toBe('terminal')
  })

  it('draws no memory edge when keywords are too short or absent', () => {
    const g = buildGraph([mem(2, 'at hi')], [], [sess(5, 'at hi')])
    expect(g.edges).toEqual([])
  })

  it('draws no edge when dates/titles do not overlap', () => {
    const g = buildGraph([mem(2, 'zebra migration')], [skill('JavaScript')], [sess(5, 'no relation')])
    expect(g.edges).toEqual([])
  })

  it('reports total node count across all types', () => {
    const g = buildGraph([mem(1, 'x'), mem(2, 'y')], [skill('a'), skill('b')], [sess(1, 's'), sess(2, 't')])
    expect(g.nodes).toHaveLength(6)
  })
})