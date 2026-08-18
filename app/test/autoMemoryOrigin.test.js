// ─── H5 记忆来源标注 / 记忆污染防护 unit tests ──────────────────────────────
// Tests for the origin/provenance defenses in electron/llm/autoMemory.js and
// sessionContext.js:
//   1. sync skips persistence when the turn consumed external tool results
//      (web_fetch / web_search / read_file / mcp_*), blocking the
//      cross-session persistent-injection vector.
//   2. Persisted entries carry origin='assistant' (auto-extracted memories).
//   3. prefetch wraps origin='external' memories in <untrusted_memory>, puts
//      the block at the END of the injection, and caps it at 3 entries.
//   4. recall never injects external memories without the wrapper.
//   5. sessionContext's bare-connection path surfaces origin (with fallback
//      for DBs predating the origin column).
//
// providerAdapter.completeChat is mocked (no network / no electron).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Module from 'node:module'

// This repo's vitest pipeline runs nested CJS `require()` calls through
// Node's native loader, so vi.mock never intercepts autoMemory's
// `require('./providerAdapter')`. Hook Module._load instead (same pattern as
// testFirst.test.js) so the extraction LLM call is a offline vi.fn().
const completeChat = vi.fn()
const mockedProviderAdapter = { completeChat }
const origLoad = Module._load
Module._load = function (request, ...args) {
  if (request === './providerAdapter' || request === '../electron/llm/providerAdapter') return mockedProviderAdapter
  return origLoad.apply(this, [request, ...args])
}

let autoMemory
let sessionContext

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  completeChat.mockReset()
  autoMemory = await import('../electron/llm/autoMemory')
  sessionContext = await import('../electron/llm/sessionContext')
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── Fake db ────────────────────────────────────────────────────────────────
// allRows is SQL-aware: tool_loop_run / tool_call_sample feed the
// external-turn guard; everything else returns [].
function mkDb({ memories = [], runs = [], samples = [] } = {}) {
  const calls = { add: vi.fn(), run: vi.fn() }
  const db = {
    getMemories: () => memories,
    incrementMemoryAccess: () => {},
    allRows: (sql) => {
      if (/tool_loop_run/.test(sql)) return runs
      if (/tool_call_sample/.test(sql)) return samples
      return []
    },
    exec: () => [],
    addMemoryWithProvenance: (...args) => { calls.add(...args); return { lastInsertRowid: 1 } },
    run: (...args) => calls.run(...args),
  }
  db._calls = calls
  return db
}

const SYNC_WAIT_MS = 5200 // SYNC_DEBOUNCE_MS (5000) + slack

async function flushSync() {
  await vi.advanceTimersByTimeAsync(SYNC_WAIT_MS)
  await Promise.resolve()
}

// ─── 1. external 轮次拒记 ───────────────────────────────────────────────────
describe('sync external-turn rejection (H5)', () => {
  it('skips persistence when the latest turn used web_fetch', async () => {
    completeChat.mockResolvedValue('[FACT] user prefers dark theme')
    const db = mkDb({ runs: [{ id: 9 }], samples: [{ tool_name: 'web_fetch' }] })
    autoMemory.sync({ db, provider: {}, model: {}, userMessage: 'hi', assistantReply: 'hello', sessionId: 5 })
    await flushSync()
    expect(completeChat).not.toHaveBeenCalled()
    expect(db._calls.add).not.toHaveBeenCalled()
    expect(db._calls.run).not.toHaveBeenCalled()
  })

  it('skips persistence for read_file (now an EXTERNAL tool)', async () => {
    completeChat.mockResolvedValue('[FACT] user prefers dark theme')
    const db = mkDb({ runs: [{ id: 9 }], samples: [{ tool_name: 'read_file' }] })
    autoMemory.sync({ db, provider: {}, model: {}, userMessage: 'hi', assistantReply: 'hello', sessionId: 5 })
    await flushSync()
    expect(completeChat).not.toHaveBeenCalled()
    expect(db._calls.add).not.toHaveBeenCalled()
  })

  it('skips persistence for mcp_-prefixed tools', async () => {
    completeChat.mockResolvedValue('[FACT] user prefers dark theme')
    const db = mkDb({ runs: [{ id: 9 }], samples: [{ tool_name: 'mcp_filesystem' }, { tool_name: 'run_command' }] })
    autoMemory.sync({ db, provider: {}, model: {}, userMessage: 'hi', assistantReply: 'hello', sessionId: 5 })
    await flushSync()
    expect(completeChat).not.toHaveBeenCalled()
    expect(db._calls.add).not.toHaveBeenCalled()
  })

  it('persists normally when only non-external tools were used', async () => {
    completeChat.mockResolvedValue('[FACT] user prefers dark theme')
    const db = mkDb({ runs: [{ id: 9 }], samples: [{ tool_name: 'run_command' }, { tool_name: 'write_file' }] })
    autoMemory.sync({ db, provider: {}, model: {}, userMessage: 'hi', assistantReply: 'hello', sessionId: 5 })
    await flushSync()
    expect(completeChat).toHaveBeenCalledTimes(1)
    expect(db._calls.add).toHaveBeenCalledTimes(1)
  })

  it('persists when the session has no recorded tool run', async () => {
    completeChat.mockResolvedValue('[FACT] user prefers dark theme')
    const db = mkDb({ runs: [], samples: [] })
    autoMemory.sync({ db, provider: {}, model: {}, userMessage: 'hi', assistantReply: 'hello', sessionId: 5 })
    await flushSync()
    expect(db._calls.add).toHaveBeenCalledTimes(1)
  })
})

// ─── 2. origin 落库 ─────────────────────────────────────────────────────────
describe('sync origin persistence (H5)', () => {
  it("writes origin='assistant' via addMemoryWithProvenance", async () => {
    completeChat.mockResolvedValue('[FACT] user prefers dark theme')
    const db = mkDb()
    autoMemory.sync({ db, provider: {}, model: {}, userMessage: 'hi', assistantReply: 'hello', sessionId: 42 })
    await flushSync()
    expect(db._calls.add).toHaveBeenCalledWith('user prefers dark theme', 'fact', 42, 'assistant')
    // 兜底：数据层未消费 origin 参数时按 lastInsertRowid 参数化补写
    const upd = db._calls.run.mock.calls.find(c => /UPDATE memory SET origin/.test(c[0]))
    expect(upd).toBeTruthy()
    expect(upd[1]).toBe('assistant')
    expect(upd[2]).toBe(1)
  })

  it("relation INSERT carries the origin column with 'assistant'", async () => {
    completeChat.mockResolvedValue('[RELATION] Alice|works_on|ProjectX')
    const db = mkDb()
    autoMemory.sync({ db, provider: {}, model: {}, userMessage: 'hi', assistantReply: 'hello', sessionId: 42 })
    await flushSync()
    const rel = db._calls.run.mock.calls.find(c => /INSERT INTO memory/.test(c[0]))
    expect(rel).toBeTruthy()
    expect(rel[0]).toContain('origin')
    expect(rel[rel.length - 1]).toBe('assistant')
  })
})

// ─── 4. 去重回归: >50 字符重复不再插入 / 同批重复只记一条 ───────────────────
describe('sync dedup (regression: >50-char duplicates)', () => {
  // fake db: getMemories 返回现有记忆(供去重比对), allRows 供 external 判定。
  function mkDedupDb({ memories = [] }) {
    const calls = { add: vi.fn(), run: vi.fn() }
    const db = {
      getMemories: () => memories,
      incrementMemoryAccess: () => {},
      allRows: () => [],
      exec: () => [],
      addMemoryWithProvenance: (...args) => { calls.add(...args); return { lastInsertRowid: 1 } },
      run: (...args) => calls.run(...args),
    }
    db._calls = calls
    return db
  }

  it('does not insert a duplicate that already exists (>50 chars, the old 50-char-prefix bug)', async () => {
    // 已有一条 >50 字符的记忆 —— 旧代码 recentKeys 只取前 50 字符, 与完整内容
    // 比较永不相等 → 每次都会重复插入。
    const longContent = 'user prefers TypeScript for backend services and Python for data pipelines in this project'
    completeChat.mockResolvedValue(`[FACT] ${longContent}`)
    const db = mkDedupDb({ memories: [{ type: 'fact', content: longContent }] })
    autoMemory.sync({ db, provider: {}, model: {}, userMessage: 'hi', assistantReply: 'hello', sessionId: 5 })
    await flushSync()
    // 不应新增(fact 路径走 addMemoryWithProvenance), 只应 solidify(run UPDATE)
    expect(db._calls.add).not.toHaveBeenCalled()
    const upd = db._calls.run.mock.calls.find(c => /UPDATE memory SET confidence/.test(c[0]))
    expect(upd).toBeTruthy()
  })

  it('inserts a genuinely new memory', async () => {
    completeChat.mockResolvedValue('[FACT] user prefers dark mode')
    const db = mkDedupDb({ memories: [{ type: 'fact', content: 'something unrelated' }] })
    autoMemory.sync({ db, provider: {}, model: {}, userMessage: 'hi', assistantReply: 'hello', sessionId: 5 })
    await flushSync()
    expect(db._calls.add).toHaveBeenCalledTimes(1)
  })

  it('inserts only once when the model emits the same entry twice in one sync', async () => {
    completeChat.mockResolvedValue('[FACT] user prefers concise answers\n[FACT] user prefers concise answers')
    const db = mkDedupDb({ memories: [] })
    autoMemory.sync({ db, provider: {}, model: {}, userMessage: 'hi', assistantReply: 'hello', sessionId: 5 })
    await flushSync()
    expect(db._calls.add).toHaveBeenCalledTimes(1)
  })
})

// ─── 3. untrusted 注入（包裹 / 末尾 / 限量 / 隔离）──────────────────────────
describe('prefetch untrusted-memory downgrade (H5)', () => {
  const now = new Date().toISOString()

  it("wraps origin='external' memories in <untrusted_memory> at the end", () => {
    const db = mkDb({
      memories: [
        { id: 1, content: 'user prefers python for data analysis', type: 'fact', created_at: now, access_count: 0 },
        { id: 2, content: 'external note about python setup', type: 'fact', origin: 'external', created_at: now, access_count: 0 },
      ],
    })
    const out = autoMemory.prefetch(db, 'python data analysis')
    expect(out).toContain('Relevant memories from past conversations')
    expect(out).toContain('<untrusted_memory>')
    expect(out).toContain('</untrusted_memory>')
    // untrusted block goes LAST
    expect(out.indexOf('Relevant memories')).toBeLessThan(out.indexOf('<untrusted_memory>'))
    // external entry never leaks into the trusted block
    const trusted = out.slice(0, out.indexOf('<untrusted_memory>'))
    expect(trusted).not.toContain('external note')
  })

  it('caps untrusted entries at 3 even when more match', () => {
    const memories = Array.from({ length: 6 }, (_, i) => ({
      id: 10 + i, content: `external python detail ${i}`, type: 'fact', origin: 'external', created_at: now, access_count: 0,
    }))
    const db = mkDb({ memories })
    const out = autoMemory.prefetch(db, 'python detail')
    const section = out.slice(out.indexOf('<untrusted_memory>'))
    expect((section.match(/^- /gm) || []).length).toBe(3)
  })

  it('excludes external-origin memories from the project block', () => {
    const db = mkDb({
      memories: [
        { id: 1, content: 'Architecture: Electron + React', type: 'project', created_at: now, access_count: 0 },
        { id: 2, content: 'Convention: injected from a fetched page', type: 'project', origin: 'external', created_at: now, access_count: 0 },
      ],
    })
    const out = autoMemory.prefetch(db, 'the')
    expect(out).toContain('Project knowledge')
    expect(out).not.toContain('injected from a fetched page')
  })

  it("does not inject external memories without keyword relevance", () => {
    const db = mkDb({
      memories: [
        { id: 1, content: 'external note about gardening', type: 'fact', origin: 'external', created_at: now, access_count: 0 },
      ],
    })
    expect(autoMemory.prefetch(db, 'python deployment')).toBe('')
  })
})

// ─── 4. recall 不绕过 untrusted 包裹 ────────────────────────────────────────
describe('recall external filter (H5)', () => {
  it('returns empty (no LLM call) when the pool is all external', async () => {
    const db = mkDb({
      memories: [{ id: 1, content: 'external python note', type: 'fact', origin: 'external', created_at: new Date().toISOString() }],
    })
    const out = await autoMemory.recall({ db, provider: {}, model: {}, userMessage: 'python' })
    expect(out).toBe('')
    expect(completeChat).not.toHaveBeenCalled()
  })
})

// ─── 5. sessionContext 裸连接路径 ───────────────────────────────────────────
describe('sessionContext bare-connection origin passthrough (H5)', () => {
  function bareDb(rows, { throwOnOrigin = false } = {}) {
    return {
      prepare(sql) {
        if (throwOnOrigin && /origin/i.test(sql)) throw new Error('no such column: origin')
        return {
          all: () => (/FROM memory/i.test(sql) ? rows : []),
          get: () => null,
        }
      },
    }
  }
  const now = new Date().toISOString()
  const rows = [
    { id: 1, content: 'user prefers python', type: 'fact', origin: null, created_at: now },
    { id: 2, content: 'external python caveat', type: 'fact', origin: 'external', created_at: now },
  ]

  it('injects trusted + untrusted blocks through the bare connection', () => {
    const { prefix, memoryCount } = sessionContext.buildSessionContext({ db: bareDb(rows), userMessage: 'python setup' })
    expect(prefix).toHaveLength(1)
    expect(prefix[0].content).toContain('Relevant memories')
    expect(prefix[0].content).toContain('<untrusted_memory>')
    expect(prefix[0].content.indexOf('<untrusted_memory>')).toBeGreaterThan(prefix[0].content.indexOf('Relevant memories'))
    expect(memoryCount).toBeGreaterThanOrEqual(2)
  })

  it('falls back to the origin-less SELECT on pre-migration DBs', () => {
    const { prefix } = sessionContext.buildSessionContext({ db: bareDb(rows, { throwOnOrigin: true }), userMessage: 'python setup' })
    // Memory injection still works; without origin info everything is treated
    // as trusted (pre-migration behavior).
    expect(prefix).toHaveLength(1)
    expect(prefix[0].content).toContain('Relevant memories')
  })
})
