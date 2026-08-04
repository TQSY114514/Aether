// Regression test: chat:stop must abort both the plain streaming path and the
// tool-loop path, preserve accumulated content as 'aborted', and leave the
// session usable for another send. Guards the fullContent-scope crash where
// the abort catch referenced a try-local variable (ReferenceError).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Module from 'module'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const events = []
const updateCalls = []
let handlers = {}
const fakeWc = { send: (channel, payload) => events.push({ channel, payload }) }
const fakeIpcMain = { handle: (ch, fn) => { handlers[ch] = fn }, on: () => {} }

const db = {
  getSetting: () => null,
  addMessage: () => ({ lastInsertRowid: 1 }),
  touchSession: () => {},
  getModel: () => ({ id: 1, provider_id: 10, provider_name: 'pA', model_name: 'gpt-5-test', api_url: 'x', api_key: 'k', api_format: 'openai', context_window: 32000, input_price_per_1k: 0, output_price_per_1k: 0 }),
  getProvider: () => ({ id: 10, name: 'pA', api_url: 'x', api_key: 'k', api_format: 'openai' }),
  getAllModels: () => [],
  getModelScores: () => [],
  getFallbackChain: () => [],
  getMessages: () => [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'ok' }],
  getSession: () => ({ title: 'Existing', persona_id: null, config: null }),
  getPersona: () => null,
  updateMessage: (id, data) => updateCalls.push(data),
  logUsage: () => {},
  classifyIntent: () => 'general',
  setSessionConfig: () => {},
}

const origLoad = Module._load
function installStubs() {
  Module._load = function (request, parent, isMain) {
    if (parent && parent.filename && (parent.filename.includes('chat-send.handler.js') || parent.filename.includes('chat.handler.js'))) {
      const stub = {
        '../llm/providerAdapter': {
          completeChat: async () => ({ content: 'x' }),
          normalizeUsage: (u) => u,
          streamChat: async function* ({ signal }) {
            await new Promise((resolve, reject) => {
              const onAbort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
              signal.addEventListener('abort', onAbort, { once: true })
              setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, 3000)
            })
            yield 'hello '
            yield 'world'
          },
        },
        '../llm/toolLoop': {
          MAX_CONCURRENT_TOOLS: 4,
          runToolLoop: async ({ signal, onThinkingDelta }) => {
            if (onThinkingDelta) onThinkingDelta('hidden reasoning text')
            await new Promise((resolve, reject) => {
              const onAbort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
              signal.addEventListener('abort', onAbort, { once: true })
              setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve('final tool answer') }, 3000)
            })
            return 'final tool answer'
          },
        },
        '../llm/reasoning': { buildReasoningParams: () => ({}) },
        '../llm/compaction': { maybeCompact: async (x) => x.messages, estimateMessagesTokens: () => 0, estimateTextTokens: () => 0 },
        '../llm/errorClassify': { classifyError: () => ({}) },
        '../llm/autoMemory': { prefetch: () => '', sync: () => {}, search: () => [] },
        '../llm/habitLearner': { proactiveSuggest: () => {}, detectAndLearn: () => {}, confirmHabit: () => {}, dismissHabit: () => {} },
        '../llm/skills': { formatSkillsForPrompt: () => '' },
        '../utils/cost': { computeCost: () => 0 },
        '../llm/auditLog': { setDb: () => {} },
        '../llm/modelAdvisor': { suggestModelExplained: () => null },
        '../llm/modelRouter': {},
        '../llm/moa': { maybeRunMoA: async () => null },
        '../logger': { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} },
        '../llm/steering': {},
        '../llm/trajectory': { getStats: () => ({}) },
        '../llm/providerHealth': { isHealthy: () => true, recordResult: () => {}, recordError: () => {}, setCooldown: () => {} },
        '../llm/checkpoints': { setDb: () => {} },
        '../tools/sandbox': { setWorkspaceRootForSession: () => {}, setWorkspaceRoot: () => {} },
      }
      if (request in stub) return stub[request]
    }
    return origLoad.apply(this, arguments)
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const doneEvents = () => events.filter(e => e.channel === 'chat:stream-chunk' && e.payload.done)
const base = { sessionId: 1, content: 'hi', modelId: 1, mode: 'normal', useTools: false, agentMode: 'off', effortLevel: 'off', genParams: {}, systemPrefix: '' }

beforeAll(() => {
  installStubs()
  const { registerChatHandlers } = require(path.join(__dirname, '../electron/ipc/chat.handler'))
  registerChatHandlers(fakeIpcMain, db, () => fakeWc)
})

afterAll(() => {
  Module._load = origLoad
})

describe('chat:stop', () => {
  it('aborts the plain streaming path and persists aborted content', async () => {
    events.length = 0
    updateCalls.length = 0
    const p = handlers['chat:send']({}, base)
    await sleep(150)
    expect(doneEvents().length).toBe(0)
    handlers['chat:stop']({}, 1)
    const r = await p
    await sleep(30)
    expect(r.messageId).toBe(1)
    expect(doneEvents().length).toBe(1)
    expect(updateCalls.some(u => u.status === 'aborted')).toBe(true)
  }, 10000)

  it('aborts the tool-loop path and allows a new send afterwards', async () => {
    events.length = 0
    updateCalls.length = 0
    const toolBase = { ...base, useTools: true, agentMode: 'ask' }
    const p2 = handlers['chat:send']({}, toolBase)
    await sleep(150)
    handlers['chat:stop']({}, 1)
    const r2 = await p2
    await sleep(30)
    expect(r2.messageId).toBe(1)
    expect(events.filter(e => e.channel === 'chat:tool-loop-end').length).toBe(1)
    expect(doneEvents().length).toBe(1)
    expect(updateCalls.some(u => u.status === 'aborted')).toBe(true)
    // Thinking deltas from the tool loop must be forwarded to the renderer.
    expect(events.some(e => e.channel === 'chat:thinking-chunk' && e.payload.delta === 'hidden reasoning text')).toBe(true)

    // Same session can send again: the new turn must start (not be queued).
    events.length = 0
    const p3 = handlers['chat:send']({}, toolBase)
    await sleep(100)
    expect(events.filter(e => e.channel === 'chat:tool-loop-start').length).toBe(1)
    const r3 = await Promise.race([p3.then(r => r), sleep(1200).then(() => null)])
    handlers['chat:stop']({}, 1)
    expect(r3 === null || r3.queued !== true).toBe(true)
  }, 10000)
})
