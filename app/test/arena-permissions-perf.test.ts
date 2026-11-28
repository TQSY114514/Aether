import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import Module from 'node:module'
import path from 'node:path'
import { createRequire } from 'node:module'

import { normalizeArenaCompareResponse } from '../src/utils/arenaExport'
import { splitMarkdownBlocks, renderMarkdown, renderMarkdownTail } from '../src/utils/markdown'

const require = createRequire(import.meta.url)
const { createAllowRulesStore, buildToolLoopCallbacks, createLeadingBatcher } = require('../electron/ipc/toolLoopCallbacks')
const codeUnderstanding = require('../electron/context/codeUnderstanding')

// ─── 1. Arena dual-model execution & response normalization ─────────────────
describe('Arena dual-model output & format dispatch', () => {
  const providerCalls: any[] = []
  const dbAddMessageCalls: any[] = []
  const dbTouchCalls: any[] = []
  const dbUsageCalls: any[] = []
  const events: { channel: string; payload: any }[] = []
  let handlers: Record<string, Function> = {}

  const fakeWc = { send: (channel: string, payload: any) => events.push({ channel, payload }) }
  const fakeIpcMain = { handle: (ch: string, fn: Function) => { handlers[ch] = fn }, on: () => {} }

  const fakeDb = {
    getAllModels: () => [
      { id: 101, provider_id: 1, provider_name: 'Anthropic', model_name: 'claude-sonnet', api_url: 'https://api.anthropic.com', api_key: 'sk-a', api_format: 'anthropic' },
      { id: 102, provider_id: 2, provider_name: 'OpenAI-Resp', model_name: 'gpt-5', api_url: 'https://api.openai.com', api_key: 'sk-b', api_format: 'responses' },
    ],
    addMessage: (m: any) => { dbAddMessageCalls.push(m); return { lastInsertRowid: dbAddMessageCalls.length } },
    getSession: () => null,
    getMessages: () => [],
    getSetting: () => '1',
    renameSession: () => {},
    getPersona: () => null,
    logUsage: (u: any) => dbUsageCalls.push(u),
    touchSession: (sid: any) => dbTouchCalls.push(sid),
    classifyIntent: () => 'coding',
    recordArenaVote: () => {},
    getModelScores: () => [],
    listArenaBenchmarks: () => [{
      id: 7,
      name: 'fmt-check',
      tasks: ['ping'],
      model_ids: [101, 102],
    }],
    getArenaBenchmark: (id: number) => ({
      id,
      name: 'fmt-check',
      tasks: ['ping'],
      model_ids: [101, 102],
    }),
    updateArenaBenchmarkResults: () => {},
  }

  const origLoad = Module._load
  let arenaModuleLoaded = false

  function ensureArenaHandlers() {
    if (arenaModuleLoaded) return
    arenaModuleLoaded = true
    Module._load = function (request: string, parent: any, ...rest: any[]) {
      if (parent?.filename && String(parent.filename).includes('arena.handler.js')) {
        if (request === '../llm/providerAdapter') {
          return {
            completeChatMessage: async ({ provider, model }: any) => {
              providerCalls.push({ api_format: provider.api_format, modelId: model.id, modelName: model.model_name })
              if (model.id === 102) {
                return { content: '', reasoning: 'Reasoning-only output', usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 } }
              }
              return { content: `Answer from ${model.model_name}`, usage: { prompt_tokens: 3, completion_tokens: 6, total_tokens: 9 } }
            },
            normalizeUsage: (u: any) => u,
          }
        }
        if (request === '../utils/cost') return { computeCost: () => 0.001 }
        if (request === '../logger') return { warn: () => {}, debug: () => {}, info: () => {} }
      }
      return origLoad.apply(this, [request, parent, ...rest])
    }
    const { registerArenaHandlers } = require(path.join(process.cwd(), 'electron/ipc/arena.handler'))
    registerArenaHandlers(fakeIpcMain, fakeDb, () => fakeWc)
  }

  beforeEach(() => {
    providerCalls.length = 0
    dbAddMessageCalls.length = 0
    dbTouchCalls.length = 0
    dbUsageCalls.length = 0
    events.length = 0
  })

  afterAll(() => {
    Module._load = origLoad
  })

  it('forwards model api_format (anthropic/responses), skips orphan sessionId<=0 DB writes, and handles reasoning fallback', async () => {
    ensureArenaHandlers()
    const res = await handlers['arena:send']({}, {
      sessionId: -999,
      content: 'Write quicksort',
      modelIds: [102, 101],
    })

    expect(Array.isArray(res.results)).toBe(true)
    expect(res.results).toHaveLength(2)
    // Caller order preserved + slot_index populated + api_format preserved
    expect(res.results[0].model_id).toBe(102)
    expect(res.results[0].slot_index).toBe(0)
    expect(res.results[0].content).toBe('Reasoning-only output')
    expect(res.results[1].model_id).toBe(101)
    expect(res.results[1].slot_index).toBe(1)
    expect(res.results[1].content).toBe('Answer from claude-sonnet')

    expect(providerCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ modelId: 102, api_format: 'responses' }),
      expect.objectContaining({ modelId: 101, api_format: 'anthropic' }),
    ]))

    // No orphan session_id=0 / negative session message or touch writes
    expect(dbAddMessageCalls).toHaveLength(0)
    expect(dbTouchCalls).toHaveLength(0)
    expect(dbUsageCalls.every((u) => u.session_id === null)).toBe(true)
  })

  it('supports comparing identical model IDs side-by-side and persists sessionId > 0 runs', async () => {
    ensureArenaHandlers()
    const res = await handlers['arena:send']({}, {
      sessionId: 42,
      content: 'Hello',
      modelIds: [101, 101],
    })

    expect(res.results).toHaveLength(2)
    expect(res.results[0].slot_index).toBe(0)
    expect(res.results[1].slot_index).toBe(1)
    expect(dbAddMessageCalls.length).toBe(3) // 1 user + 2 assistant
    expect(dbTouchCalls).toEqual([42])
  })

  it('forwards non-OpenAI api_format inside arena:benchmark-run as well', async () => {
    ensureArenaHandlers()
    await handlers['arena:benchmark-run']({}, { id: 7, modelIds: [101, 102] })
    expect(providerCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ modelId: 101, api_format: 'anthropic' }),
      expect.objectContaining({ modelId: 102, api_format: 'responses' }),
    ]))
  })

  it('normalizes { results } wrapper, duplicate model IDs, and errors cleanly in ArenaPage helper', () => {
    const start = 1000
    const normalized = normalizeArenaCompareResponse(
      {
        results: [
          { model_id: 5, slot_index: 0, content: 'First answer', latency_ms: 120, usage: { total_tokens: 15, cost: 0.01 } },
          { model_id: 5, slot_index: 1, content: '[Error: 401 unauthorized]', error: '401 unauthorized', latency_ms: 80 },
        ],
      },
      5,
      5,
      start,
      start,
      1500
    )

    expect(normalized.a.content).toBe('First answer')
    expect(normalized.a.error).toBeUndefined()
    expect(normalized.a.tokens).toBe(15)
    expect(normalized.b.error).toBe('401 unauthorized')
    expect(normalized.b.done).toBe(true)

    const empty = normalizeArenaCompareResponse({ results: [] }, 1, 2, start, start, 1200)
    expect(empty.a.done).toBe(true)
    expect(empty.a.error).toBeTruthy()
    expect(empty.b.error).toBeTruthy()
  })
})

// ─── 2. High-risk permission rules management & session scoping ─────────────
describe('allowRulesStore session scoping, CRUD & enforcement', () => {
  let settingsTable: Map<string, string>
  let mockDb: any

  beforeEach(() => {
    settingsTable = new Map()
    mockDb = {
      prepare(sql: string) {
        return {
          all() {
            if (sql.includes('SELECT key, value FROM settings')) {
              const rows: { key: string; value: string }[] = []
              for (const [k, v] of settingsTable.entries()) {
                if (k.startsWith('permission_rule.')) rows.push({ key: k, value: v })
              }
              return rows
            }
            return []
          },
          run(...args: any[]) {
            if (sql.includes('INSERT OR REPLACE INTO settings')) {
              settingsTable.set(args[0], args[1])
            } else if (sql.includes('DELETE FROM settings')) {
              settingsTable.delete(args[0])
            }
            return { changes: 1 }
          },
        }
      },
    }
  })

  it('persists session-scoped rules, reloads them across store instances, and isolates unrelated sessions', () => {
    const store = createAllowRulesStore(mockDb)
    store.persist(mockDb, 'run_command', 'npm test', 'allow', [10, 20])
    store.persist(mockDb, 'run_command', 'git push', 'allow', [10])
    store.persist(mockDb, 'write_file', 'src', 'deny', [10])

    // Matching scoped sessions works (prefix match for benign runner; exact-only for destructive git push); other sessions stay isolated
    expect(store.match(10, 'run_command', { command: 'npm test -- --watch' })).toBe(true)
    expect(store.match(20, 'run_command', { command: 'npm test' })).toBe(true)
    expect(store.match(30, 'run_command', { command: 'npm test' })).toBe(false)
    expect(store.match(10, 'run_command', { command: 'git push' })).toBe(true)
    expect(store.match(10, 'run_command', { command: 'git push origin main' })).toBe(false)
    expect(store.decision(10, 'write_file', { path: 'src/index.ts' })).toBe('deny')
    expect(store.decision(20, 'write_file', { path: 'src/index.ts' })).toBeNull()

    // Reload into fresh store from DB
    const reloaded = createAllowRulesStore(mockDb)
    expect(reloaded.match(10, 'run_command', { command: 'npm test' })).toBe(true)
    expect(reloaded.match(30, 'run_command', { command: 'npm test' })).toBe(false)
    const listed = reloaded.listAll()
    const testRule = listed.persisted.find((r: any) => r.ruleKey === 'npm test')
    expect(testRule.sessionIds).toEqual([10, 20])
    expect(testRule.decision).toBe('allow')

    // Broaden back to global -> legacy plain string stored in settings
    reloaded.persist(mockDb, 'run_command', 'npm test', 'allow', null)
    expect(settingsTable.get('permission_rule.run_command.npm test')).toBe('allow')
    expect(reloaded.match(30, 'run_command', { command: 'npm test' })).toBe(true)
  })

  it('requestPermission honors allow/deny/ask decisions and Settings deletion takes effect immediately without stale sessionRules shadowing', async () => {
    const store = createAllowRulesStore(mockDb)
    const sent: { ch: string; p: any }[] = []
    const listeners = new Map<string, Function[]>()
    const fakeWc = {
      on: (ch: string, fn: Function) => {
        const list = listeners.get(ch) || []
        list.push(fn)
        listeners.set(ch, list)
      },
      removeListener: (ch: string, fn: Function) => {
        const list = listeners.get(ch) || []
        listeners.set(ch, list.filter((x) => x !== fn))
      },
    }
    const emitReply = (reqId: string, allowed: boolean, remember: any) => {
      for (const fn of [...(listeners.get('chat:permission-reply') || [])]) {
        fn({}, { reqId, allowed, remember })
      }
    }

    const cb11 = buildToolLoopCallbacks({
      db: mockDb,
      send: (ch: string, p: any) => {
        sent.push({ ch, p })
        if (ch === 'chat:permission-request') {
          queueMicrotask(() => emitReply(p.reqId, true, 'permanent'))
        }
      },
      getWc: () => fakeWc,
      sessionId: 11,
      msgId: 1,
      controller: new AbortController(),
      source: 'chat',
      allowRules: store,
    })

    // First call prompts -> user chooses 'permanent'
    const firstAllowed = await cb11.requestPermission({ name: 'write_file', args: { path: 'etc/app.conf' }, risk: 'dangerous' })
    expect(firstAllowed).toBe(true)
    expect(sent.filter((e) => e.ch === 'chat:permission-request')).toHaveLength(1)

    // Second call auto-approves without prompting
    sent.length = 0
    const secondAllowed = await cb11.requestPermission({ name: 'write_file', args: { path: 'etc/app.conf' }, risk: 'dangerous' })
    expect(secondAllowed).toBe(true)
    expect(sent.filter((e) => e.ch === 'chat:permission-request')).toHaveLength(0)

    // User deletes the rule in Settings -> session 11 MUST prompt again immediately!
    store.removePersisted(mockDb, 'write_file', 'etc')
    sent.length = 0
    const thirdAllowed = await cb11.requestPermission({ name: 'write_file', args: { path: 'etc/app.conf' }, risk: 'dangerous' })
    expect(thirdAllowed).toBe(true)
    expect(sent.filter((e) => e.ch === 'chat:permission-request')).toHaveLength(1)

    // User sets rule to 'deny' for session 11 -> auto-blocks immediately (even without prompt, even if tainted!)
    store.persist(mockDb, 'write_file', 'etc', 'deny', [11])
    sent.length = 0
    const fourthAllowed = await cb11.requestPermission({ name: 'write_file', args: { path: 'etc/app.conf' }, risk: 'dangerous', isTainted: true })
    expect(fourthAllowed).toBe(false)
    expect(sent.filter((e) => e.ch === 'chat:permission-request')).toHaveLength(0)
  })

  it('revokes individual in-memory session approvals without affecting other sessions', () => {
    const store = createAllowRulesStore(mockDb)
    store.add(1, 'run_command', { command: 'rm -rf dist' }, 'allow')
    store.add(2, 'run_command', { command: 'rm -rf dist' }, 'allow')

    const rk = store.ruleKey('run_command', { command: 'rm -rf dist' })
    expect(store.removeSessionRule(1, 'run_command', rk)).toBe(true)
    expect(store.match(1, 'run_command', { command: 'rm -rf dist' })).toBe(false)
    expect(store.match(2, 'run_command', { command: 'rm -rf dist' })).toBe(true)
  })
})

// ─── 3. Streaming performance & batching ────────────────────────────────────
describe('Streaming markdown splitting, IPC coalescing & DB batching', () => {
  it('splits finalized top-level markdown blocks without breaking fenced code blocks or math blocks', () => {
    const md = [
      '# Title',
      '',
      'Intro paragraph.',
      '',
      '```ts',
      'function add(a: number, b: number) {',
      '',
      '  return a + b;',
      '}',
      '```',
      '',
      '$$',
      'a^2 + b^2 = c^2',
      '$$',
      '',
      'Active trailing line',
    ].join('\n')

    const { committed, tail } = splitMarkdownBlocks(md)
    expect(committed).toEqual([
      '# Title',
      'Intro paragraph.',
      '```ts\nfunction add(a: number, b: number) {\n\n  return a + b;\n}\n```',
      '$$\na^2 + b^2 = c^2\n$$',
    ])
    expect(tail).toBe('Active trailing line')

    // Ensure finalized blocks and tail render valid HTML cleanly
    expect(renderMarkdown(committed[2])).toContain('<pre class="code-block')
    expect(renderMarkdownTail(tail)).toContain('Active trailing line')
  })

  it('keeps an unclosed streaming fenced code block together in tail across blank lines', () => {
    const md = 'Intro\n\n```python\ndef f():\n\n    return 1'
    const { committed, tail } = splitMarkdownBlocks(md)
    expect(committed).toEqual(['Intro'])
    expect(tail).toBe('```python\ndef f():\n\n    return 1')
  })

  it('coalesces high-rate streaming chunks with synchronous leading edge and clean trailing flush', async () => {
    const sent: string[] = []
    const batcher = createLeadingBatcher((chunk: string) => sent.push(chunk), 15)

    batcher.push('A') // leading edge fires synchronously
    expect(sent).toEqual(['A'])

    batcher.push('B')
    batcher.push('C')
    batcher.push('D')
    expect(sent).toEqual(['A']) // coalesced during 15ms window

    await new Promise((r) => setTimeout(r, 30))
    expect(sent).toEqual(['A', 'BCD'])

    batcher.push('E')
    batcher.push('F')
    batcher.flush()
    expect(sent).toEqual(['A', 'BCD', 'E', 'F'])
  })

  it('wraps writeCodeUnderstanding writes inside db.transaction when available', () => {
    let txCalls = 0
    const nodes: any[] = []
    const fakeDb = {
      transaction(fn: Function) {
        return () => { txCalls++; return fn() }
      },
      prepare(sql: string) {
        return {
          get: () => null,
          run: (...params: any[]) => {
            if (sql.includes('INSERT INTO kg_nodes')) nodes.push(params[0])
            return { changes: 1 }
          },
        }
      },
    }

    const res = codeUnderstanding.writeCodeUnderstanding(fakeDb, {
      nodes: [{ entity: 'a.ts', type: 'file' }, { entity: 'b.ts', type: 'file' }],
      edges: [{ from: 'a.ts', to: 'b.ts', relation: 'imports', confidence: 0.9 }],
    })
    expect(txCalls).toBe(1)
    expect(res).toEqual({ nodes: 2, edges: 1 })
    expect(nodes).toEqual(['a.ts', 'b.ts'])
  })
})
