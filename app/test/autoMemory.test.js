// ─── AutoMemory unit tests ──────────────────────────────────────────────────
// Tests for electron/llm/autoMemory.js: entity extraction (parseEntry),
// memory search (search), prefetch, conflict detection (detectConflict),
// pruning, and keyword extraction.
//
// We re-import the module fresh per test (vi.resetModules) so the module-level
// prefetch cache (_memCache) never leaks between tests.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Module from 'node:module'

let autoMemory
beforeEach(async () => {
  vi.resetModules()
  autoMemory = await import('../electron/llm/autoMemory')
})

// _doSync 经 providerAdapter.completeChat 调 LLM 提取 —— mock 掉，不发真实请求。
// 本仓库的 vitest 管道把嵌套 CJS require() 走 Node 原生 loader，vi.mock 拦不住
// autoMemory 内部的 require('./providerAdapter')（同 autoMemoryOrigin.test.js /
// testFirst.test.js 的注释），必须钩 Module._load。此前用 vi.mock 工厂 +
// 测试内重新 import 配置 mock，两侧实例错位导致 completeChat 落空 —— CI 上
// 整组 "0 times" 失败即此因。
const completeChat = vi.fn()
const mockedProviderAdapter = { completeChat }
const origLoad = Module._load
Module._load = function (request, ...args) {
  if (request === './providerAdapter' || request === '../electron/llm/providerAdapter') return mockedProviderAdapter
  return origLoad.apply(this, [request, ...args])
}

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

  it('marks a conflicting memory when overlap ratio >= 0.7 and content differs', () => {
    const older = { id: 7, content: 'Alice prefers Python project', type: 'fact', created_at: '2020-01-01' }
    const runSpy = vi.fn()
    const db = mkDb({ memories: [older], runSpy })
    // 新行 id=8：冲突指针必须 新→旧（8 指向 7），绝不允许旧行指向自己。
    const res = autoMemory.detectConflict(db, 'Alice prefers JavaScript project', 'fact', 8)
    expect(res).not.toBeNull()
    expect(res.olderId).toBe(7)
    expect(res.olderContent).toBe(older.content)
    expect(res.reason).toContain('Alice prefers Python project')
    // the NEW memory points at the OLDER one (regression: was [7, 7] self-reference)
    expect(runSpy).toHaveBeenCalledWith('UPDATE memory SET conflicts_with = ? WHERE id = ?', [7, 8])
  })

  it('never writes a self-referencing conflict when newRowId is missing', () => {
    const older = { id: 7, content: 'Alice prefers Python project', type: 'fact', created_at: '2020-01-01' }
    const runSpy = vi.fn()
    const db = mkDb({ memories: [older], runSpy })
    const res = autoMemory.detectConflict(db, 'Alice prefers JavaScript project', 'fact')
    expect(res).not.toBeNull()
    expect(res.olderId).toBe(7)
    // 拿不到新行 id 时只报告冲突，绝不改写旧行 —— 旧行指向自己就是自指 bug
    expect(runSpy).not.toHaveBeenCalled()
  })

  it('returns null when overlap ratio is below threshold (paraphrase, not conflict)', () => {
    const older = { id: 3, content: 'Alice prefers Python project', type: 'fact' }
    const runSpy = vi.fn()
    const db = mkDb({ memories: [older], runSpy })
    // inter={alice,prefers? no — likes≠prefers} → inter={alice,python}=2, min=4, ratio=0.5 < 0.7
    expect(autoMemory.detectConflict(db, 'Alice likes Python scripting', 'fact', 9)).toBeNull()
    expect(runSpy).not.toHaveBeenCalled()
  })

  it('returns null for a case/whitespace variant of the same content', () => {
    const older = { id: 4, content: 'Alice Prefers PYTHON', type: 'fact' }
    const runSpy = vi.fn()
    const db = mkDb({ memories: [older], runSpy })
    // 规范化后完全一致是去重的职责，不是冲突
    expect(autoMemory.detectConflict(db, 'alice prefers python', 'fact', 10)).toBeNull()
    expect(runSpy).not.toHaveBeenCalled()
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

// ─── _doSync dedup (driven through the sync debounce) ──────────────────────
describe('_doSync dedup', () => {
  afterEach(() => { vi.useRealTimers() })

  // 驱动一次完整 sync：fake timers 快进 5 秒防抖，等 _doSync 跑完。
  async function runSync(db, reply) {
    completeChat.mockReset()
    completeChat.mockResolvedValue(reply)
    vi.useFakeTimers()
    try {
      const promise = autoMemory.sync({ db, provider: {}, model: 'test-model', userMessage: 'hi', assistantReply: 'ok' })
      await vi.advanceTimersByTimeAsync(5000)
      await promise.catch(() => {})
    } finally {
      vi.useRealTimers()
    }
  }

  function dedupDb(memories, runSpy) {
    const insertSpy = vi.fn(() => ({ lastInsertRowid: 99 }))
    const db = Object.assign(mkDb({ memories, runSpy }), { addMemoryWithProvenance: insertSpy })
    return { db, insertSpy }
  }

  it('solidifies an exact re-observation instead of inserting a copy', async () => {
    const existing = { id: 11, content: 'Alice prefers Python project', type: 'fact', created_at: new Date().toISOString(), access_count: 0 }
    const runSpy = vi.fn()
    const { db, insertSpy } = dedupDb([existing], runSpy)
    await runSync(db, '[FACT] Alice prefers Python project')
    expect(insertSpy).not.toHaveBeenCalled()
    expect(runSpy).toHaveBeenCalledWith(
      'UPDATE memory SET confidence = MIN(COALESCE(confidence, 1.0) + 0.1, 1.0) WHERE type = ? AND LOWER(content) = LOWER(?)',
      ['fact', 'Alice prefers Python project'],
    )
  })

  it('solidifies a paraphrased re-observation instead of inserting a copy (Jaccard)', async () => {
    // 关键词集 {user,really,likes,python,data,analysis} vs {user,likes,python,data,analysis}
    // Jaccard = 5/6 ≈ 0.83 ≥ 0.7 → 同一事实的改写，加固已有行而非插入副本
    const existing = { id: 12, content: 'user really likes Python for data analysis', type: 'fact', created_at: new Date().toISOString(), access_count: 0 }
    const runSpy = vi.fn()
    const { db, insertSpy } = dedupDb([existing], runSpy)
    await runSync(db, '[FACT] user likes Python for data analysis')
    expect(insertSpy).not.toHaveBeenCalled()
    expect(runSpy).toHaveBeenCalledWith(
      'UPDATE memory SET confidence = MIN(COALESCE(confidence, 1.0) + 0.1, 1.0) WHERE id = ?',
      [12],
    )
  })

  it('lets a value-swap contradiction through dedup and links new row to old', async () => {
    // Jaccard = 3/5 = 0.6 < 0.7 —— 不是改写，是真矛盾：插入新行并 新→旧 标冲突
    const older = { id: 7, content: 'Alice prefers Python project', type: 'fact', created_at: '2020-01-01', access_count: 0 }
    const runSpy = vi.fn()
    const { db, insertSpy } = dedupDb([older], runSpy)
    await runSync(db, '[FACT] Alice prefers JavaScript project')
    expect(insertSpy).toHaveBeenCalledTimes(1)
    // 新行(99)指向旧行(7) —— regression: was [7, 7]
    expect(runSpy).toHaveBeenCalledWith('UPDATE memory SET conflicts_with = ? WHERE id = ?', [7, 99])
  })

  it('inserts a genuinely new fact without any conflict marking', async () => {
    const older = { id: 5, content: 'Bob likes Java', type: 'fact', created_at: '2020-01-01', access_count: 0 }
    const runSpy = vi.fn()
    const { db, insertSpy } = dedupDb([older], runSpy)
    await runSync(db, '[FACT] Alice prefers Rust language')
    expect(insertSpy).toHaveBeenCalledTimes(1)
    const conflictWrites = runSpy.mock.calls.filter(c => String(c[0]).includes('conflicts_with'))
    expect(conflictWrites).toHaveLength(0)
  })

  it('deduplicates two paraphrased facts returned in the SAME batch', async () => {
    // recentKw 是 sync 开始时的快照：第一条插入后必须对同批后续条目可见，
    // 否则 "user likes X" 和 "user really likes X" 会双双入库。
    const runSpy = vi.fn()
    const { db, insertSpy } = dedupDb([], runSpy)
    await runSync(db, [
      '[FACT] user likes Python for data analysis',
      '[FACT] user really likes Python for data analysis',
    ].join('\n'))
    // 只有第一条落库；第二条命中刚插入的行(id=99)走 solidify
    expect(insertSpy).toHaveBeenCalledTimes(1)
    expect(runSpy).toHaveBeenCalledWith(
      'UPDATE memory SET confidence = MIN(COALESCE(confidence, 1.0) + 0.1, 1.0) WHERE id = ?',
      [99],
    )
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