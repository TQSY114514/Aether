// ─── AutoMemory unit tests ──────────────────────────────────────────────────
// Tests for electron/llm/autoMemory.js: entity extraction (parseEntry),
// memory search (search), prefetch, conflict detection (detectConflict),
// pruning, and keyword extraction.
//
// We re-import the module fresh per test (vi.resetModules) so the module-level
// prefetch cache (_memCache) never leaks between tests.

import { describe, it, expect, beforeEach, vi } from 'vitest'

let autoMemory
beforeEach(async () => {
  vi.resetModules()
  autoMemory = await import('../electron/llm/autoMemory')
})

// ─── Fake db for search / prefetch / detectConflict / prune ────────────────
function mkDb({ memories = [], fts = null, throwOnGet = false, runSpy = null } = {}) {
  return {
    getMemories: () => { if (throwOnGet) throw new Error('no such table'); return memories },
    searchMemories: () => fts,
    allRows: () => memories,
    exec: () => [],
    incrementMemoryAccess: () => {},
    run: (...args) => { if (runSpy) runSpy(...args) },
  }
}

// ─── parseEntry (entity extraction) ─────────────────────────────────────────
describe('parseEntry', () => {
  it('parses an ENTITY line', () => {
    expect(autoMemory.parseEntry('[ENTITY] Alice|Prefers efficient tooling')).toEqual({
      type: 'entity', content: 'Alice|Prefers efficient tooling',
    })
  })

  it('parses a RELATION line into parts', () => {
    expect(autoMemory.parseEntry('[RELATION] Alice|works_on|ProjectX')).toEqual({
      type: 'relation', content: 'Alice|works_on|ProjectX',
      entity1: 'Alice', relation: 'works_on', entity2: 'ProjectX',
    })
  })

  it('parses a FACT line', () => {
    expect(autoMemory.parseEntry('[FACT] user prefers TypeScript')).toEqual({
      type: 'fact', content: 'user prefers TypeScript',
    })
  })

  it('parses a CONTEXT line', () => {
    expect(autoMemory.parseEntry('[CONTEXT] discussed the refactor plan')).toEqual({
      type: 'context', content: 'discussed the refactor plan',
    })
  })

  it('lowercases the type', () => {
    expect(autoMemory.parseEntry('[ENTITY] Alice').type).toBe('entity')
  })

  it('returns null for malformed lines', () => {
    expect(autoMemory.parseEntry('just a plain line')).toBeNull()
    expect(autoMemory.parseEntry('')).toBeNull()
    expect(autoMemory.parseEntry('[UNKNOWN] x')).toBeNull()
    expect(autoMemory.parseEntry('[ENTITY]')).toBeNull()
  })

  it('returns null for content longer than 300 chars', () => {
    expect(autoMemory.parseEntry('[FACT] ' + 'x'.repeat(301))).toBeNull()
  })

  it('returns null for a RELATION with fewer than 3 parts', () => {
    expect(autoMemory.parseEntry('[RELATION] Alice|works_on')).toBeNull()
  })
})

// ─── keywords ───────────────────────────────────────────────────────────────
describe('keywords', () => {
  it('extracts keywords and strips stop words', () => {
    const kw = autoMemory.keywords('the python project and the data')
    expect(kw.has('python')).toBe(true)
    expect(kw.has('data')).toBe(true)
    expect(kw.has('the')).toBe(false)
    expect(kw.has('and')).toBe(false)
  })

  it('extracts CJK bigrams', () => {
    const kw = autoMemory.keywords('你好世界')
    expect(kw.has('你好')).toBe(true)
    expect(kw.has('世界')).toBe(true)
  })
})

// ─── detectConflict ─────────────────────────────────────────────────────────
describe('detectConflict', () => {
  it('returns null when db has no allRows', () => {
    expect(autoMemory.detectConflict({}, 'new fact', 'fact')).toBeNull()
  })

  it('returns null when there are no existing memories', () => {
    const db = mkDb({ memories: [] })
    expect(autoMemory.detectConflict(db, 'Alice prefers Python', 'fact')).toBeNull()
  })

  it('marks a conflicting memory when overlap >= 2 and content differs', () => {
    const older = { id: 7, content: 'Alice prefers Python project', type: 'fact', created_at: '2020-01-01' }
    const runSpy = vi.fn()
    const db = mkDb({ memories: [older], runSpy })
    const res = autoMemory.detectConflict(db, 'Alice prefers JavaScript project', 'fact')
    expect(res).not.toBeNull()
    expect(res.olderId).toBe(7)
    expect(res.olderContent).toBe(older.content)
    expect(res.reason).toContain('Alice prefers Python project')
    // the older memory should be flagged as conflicting
    expect(runSpy).toHaveBeenCalledWith('UPDATE memory SET conflicts_with = ? WHERE id = ?', [7, 7])
  })

  it('returns null when there is no keyword overlap', () => {
    const older = { id: 1, content: 'Bob likes Java', type: 'fact' }
    const runSpy = vi.fn()
    const db = mkDb({ memories: [older], runSpy })
    expect(autoMemory.detectConflict(db, 'Alice prefers Python', 'fact')).toBeNull()
    expect(runSpy).not.toHaveBeenCalled()
  })

  it('returns null when content is identical', () => {
    const older = { id: 1, content: 'Alice prefers Python', type: 'fact' }
    const db = mkDb({ memories: [older] })
    expect(autoMemory.detectConflict(db, 'Alice prefers Python', 'fact')).toBeNull()
  })
})

// ─── search ─────────────────────────────────────────────────────────────────
describe('search', () => {
  it('returns [] when getMemories throws', () => {
    const db = mkDb({ throwOnGet: true })
    expect(autoMemory.search(db, 'python')).toEqual([])
  })

  it('returns all memories when query is empty', () => {
    const memories = [{ id: 1, content: 'a' }, { id: 2, content: 'b' }]
    const db = mkDb({ memories })
    expect(autoMemory.search(db, '', 20)).toEqual(memories)
  })

  it('uses FTS results when available', () => {
    const fts = [{ id: 1, content: 'python result' }]
    const db = mkDb({ memories: [], fts })
    expect(autoMemory.search(db, 'python')).toEqual(fts)
  })

  it('falls back to keyword scoring and ranks by score', () => {
    const memories = [
      { id: 1, content: 'python project data' },
      { id: 2, content: 'garden and flowers' },
    ]
    const db = mkDb({ memories, fts: null })
    const res = autoMemory.search(db, 'python project')
    expect(res.map(r => r.id)).toEqual([1])
  })
})

// ─── prefetch ───────────────────────────────────────────────────────────────
describe('prefetch', () => {
  it("returns '' when there are no memories", () => {
    const db = mkDb({ memories: [] })
    expect(autoMemory.prefetch(db, 'python project')).toBe('')
  })

  it("returns '' when the query has no keywords", () => {
    const db = mkDb({ memories: [{ id: 1, content: 'python project', created_at: new Date().toISOString() }] })
    expect(autoMemory.prefetch(db, 'the')).toBe('')
  })

  it('returns a formatted memory block for matching memories', () => {
    const db = mkDb({
      memories: [{ id: 1, content: 'user prefers python for data analysis', created_at: new Date().toISOString(), access_count: 0, type: 'fact' }],
    })
    const out = autoMemory.prefetch(db, 'python data analysis')
    expect(out.startsWith('Relevant memories from past conversations')).toBe(true)
    expect(out).toContain('python for data analysis')
  })

  it('injects project memories ALWAYS, even with no keywords (project brain)', () => {
    const db = mkDb({
      memories: [
        { id: 1, content: 'Architecture: Electron + React + Zustand + better-sqlite3', created_at: new Date().toISOString(), access_count: 0, type: 'project' },
        { id: 2, content: 'Convention: semicolons yes, Vitest for tests', created_at: new Date().toISOString(), access_count: 0, type: 'project' },
      ],
    })
    // 查询词无实际关键词(停用词) → 普通记忆不会注入, 但 project 恒在
    const out = autoMemory.prefetch(db, 'the')
    expect(out.startsWith('Project knowledge')).toBe(true)
    expect(out).toContain('Electron + React')
    expect(out).toContain('Vitest')
  })

  it('merges project block on top of keyword memories', () => {
    const db = mkDb({
      memories: [
        { id: 1, content: 'Architecture: Electron + React', created_at: new Date().toISOString(), access_count: 0, type: 'project' },
        { id: 2, content: 'user prefers python for data analysis', created_at: new Date().toISOString(), access_count: 0, type: 'fact' },
      ],
    })
    const out = autoMemory.prefetch(db, 'python data analysis')
    expect(out.startsWith('Project knowledge')).toBe(true)
    expect(out).toContain('Relevant memories from past conversations')
    expect(out.indexOf('Project knowledge')).toBeLessThan(out.indexOf('Relevant memories'))
  })

  it('non-project memories without keywords still return empty (regression)', () => {
    const db = mkDb({
      memories: [{ id: 1, content: 'user prefers python', created_at: new Date().toISOString(), access_count: 0, type: 'fact' }],
    })
    expect(autoMemory.prefetch(db, 'the')).toBe('')
  })

  it('injected keyword memories carry a [kw:...] explainability tag', () => {
    const db = mkDb({
      memories: [{ id: 1, content: 'user prefers python for data analysis', created_at: new Date().toISOString(), access_count: 0, type: 'fact' }],
    })
    const out = autoMemory.prefetch(db, 'python data analysis')
    expect(out).toMatch(/\[kw:[^\]]+\]/)
  })
})

// ─── prune ─────────────────────────────────────────────────────────────────
describe('prune', () => {
  it('issues two DELETE statements (access + age)', () => {
    const runSpy = vi.fn()
    const db = mkDb({ runSpy })
    autoMemory.prune(db)
    expect(runSpy).toHaveBeenCalledTimes(2)
    expect(runSpy.mock.calls[0][0]).toContain('DELETE FROM memory WHERE access_count = 0')
    expect(runSpy.mock.calls[1][0]).toContain('DELETE FROM memory WHERE created_at < ?')
  })
})