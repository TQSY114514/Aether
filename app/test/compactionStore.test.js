// ─── CompactionStore unit tests ─────────────────────────────────────────────
// Memory cache (L1) over the sqlite compaction_state table (L2).
// All db failures must degrade silently to memory-only.

import { describe, it, expect, vi, beforeAll } from 'vitest'

let CompactionStore
beforeAll(async () => {
  ;({ CompactionStore } = await import('../electron/llm/compactionStore'))
})

function stubDb() {
  const rows = new Map()
  return {
    getCompactionState: vi.fn((id) => {
      const r = rows.get(id)
      return r ? { split_index: r[0], summary: r[1] } : undefined
    }),
    saveCompactionState: vi.fn((id, si, sum) => { rows.set(id, [si, sum]) }),
    deleteCompactionState: vi.fn((id) => { rows.delete(id) }),
  }
}

describe('CompactionStore', () => {
  it('无 db（resolveDb 返回 null）：纯内存往返', () => {
    const s = new CompactionStore(() => null)
    expect(s.get('sess')).toBeNull()
    s.set('sess', 3, 'SUM')
    expect(s.get('sess')).toEqual({ splitIndex: 3, summary: 'SUM' })
    s.clear('sess')
    expect(s.get('sess')).toBeNull()
  })

  it('有 db：set 双写，内存 miss 时回落 db 读', () => {
    const db = stubDb()
    const s = new CompactionStore(() => db)
    s.set('a', 5, 'S5')
    expect(db.saveCompactionState).toHaveBeenCalledWith('a', 5, 'S5')
    // 另一个实例（模拟重启后新进程）从 db 读回
    const s2 = new CompactionStore(() => db)
    expect(s2.get('a')).toEqual({ splitIndex: 5, summary: 'S5' })
  })

  it('clear 同时清内存与 db 行', () => {
    const db = stubDb()
    const s = new CompactionStore(() => db)
    s.set('b', 1, 'X')
    s.clear('b')
    expect(db.deleteCompactionState).toHaveBeenCalledWith('b')
    expect(new CompactionStore(() => db).get('b')).toBeNull()
  })

  it('db 访问抛异常时静默降级，不影响内存路径', () => {
    const bad = {
      getCompactionState: () => { throw new Error('boom') },
      saveCompactionState: () => { throw new Error('boom') },
      deleteCompactionState: () => { throw new Error('boom') },
    }
    const s = new CompactionStore(() => bad)
    s.set('c', 2, 'Y')
    expect(s.get('c')).toEqual({ splitIndex: 2, summary: 'Y' })
    s.clear('c')
    expect(s.get('c')).toBeNull()
  })
})
