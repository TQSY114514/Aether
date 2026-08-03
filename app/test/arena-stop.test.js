// Regression test: arena results stream per model, arena:stop aborts only the
// targeted session, and a no-arg stop aborts all runs.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Module from 'module'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const events = []
let handlers = {}
const fakeWc = { send: (channel, payload) => events.push({ channel, payload }) }
const fakeIpcMain = { handle: (ch, fn) => { handlers[ch] = fn }, on: () => {} }

const db = {
  getAllModels: () => [
    { id: 1, provider_id: 10, provider_name: 'pA', model_name: 'mA', api_url: 'x', api_key: 'k', api_format: 'openai' },
    { id: 2, provider_id: 10, provider_name: 'pA', model_name: 'mB', api_url: 'x', api_key: 'k', api_format: 'openai' },
  ],
  addMessage: () => ({ lastInsertRowid: 1 }),
  getPersona: () => null,
  logUsage: () => {},
  touchSession: () => {},
  classifyIntent: () => 'general',
  recordArenaVote: () => {},
  getModelScores: () => [],
}

const origLoad = Module._load
let callCount = 0
function installStubs() {
  Module._load = function (request, parent, isMain) {
    if (parent && parent.filename && parent.filename.includes('arena.handler.js')) {
      const stub = {
        '../llm/providerAdapter': {
          completeChatMessage: async ({ signal, model }) => {
            callCount++
            const delay = model && model.id === 1 ? 400 : 700
            await new Promise((resolve, reject) => {
              const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, delay)
              const onAbort = () => { clearTimeout(timer); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })) }
              signal.addEventListener('abort', onAbort, { once: true })
            })
            return { content: 'answer-' + callCount, usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3, cache_read_tokens: 0, cache_creation_tokens: 0 } }
          },
          normalizeUsage: (u) => u,
        },
        '../utils/cost': { computeCost: () => 0 },
        '../logger': { warn: () => {}, debug: () => {}, info: () => {} },
      }
      if (request in stub) return stub[request]
    }
    return origLoad.apply(this, arguments)
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const done = () => events.filter(e => e.channel === 'arena:model-done')

beforeAll(() => {
  installStubs()
  const { registerArenaHandlers } = require(path.join(__dirname, '../electron/ipc/arena.handler'))
  registerArenaHandlers(fakeIpcMain, db, () => fakeWc)
})

afterAll(() => {
  Module._load = origLoad
})

describe('arena', () => {
  it('emits one model-done per finished model (progressive results)', async () => {
    events.length = 0
    const p = handlers['arena:send']({}, { sessionId: 1, content: 'q', modelIds: [1, 2], personaId: null })
    await sleep(450)
    expect(done().length).toBe(1)
    const r = await p
    expect(r.results.length).toBe(2)
    expect(done().length).toBe(2)
  }, 10000)

  it('aborts only the targeted session; no-arg stop aborts all', async () => {
    events.length = 0
    const p2 = handlers['arena:send']({}, { sessionId: 2, content: 'q', modelIds: [1, 2], personaId: null })
    await sleep(100)
    handlers['arena:stop']({}, 3)
    await sleep(380)
    expect(done().length).toBe(1)
    expect(done()[0].payload.result.content.startsWith('answer-')).toBe(true)
    handlers['arena:stop']({}, 2)
    const r2 = await p2
    expect(r2.results[0].content.startsWith('answer-')).toBe(true)
    expect(r2.results[1].content).toContain('aborted')

    events.length = 0
    const p3 = handlers['arena:send']({}, { sessionId: 4, content: 'q', modelIds: [1, 2], personaId: null })
    await sleep(100)
    handlers['arena:stop']({})
    const r3 = await p3
    expect(r3.results.every(x => x.content.includes('aborted'))).toBe(true)
  }, 10000)
})
