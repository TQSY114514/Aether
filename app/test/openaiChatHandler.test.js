// ─── OpenAI-compatible /v1/chat/completions handler tests ───────────────────
// Pure module tests (no electron, no real HTTP server): request parsing and
// 400 validation, model resolution, the OpenAI response shape, usage
// passthrough, and SSE streaming basics for stream=true.

import { describe, it, expect } from 'vitest'

import {
  parseChatCompletionsBody,
  resolveChatModel,
  buildOpenAIResponse,
  handleChatCompletions,
} from '../electron/llm/openaiChatHandler'

function fakeDb(models, providers = {}) {
  return {
    getAllModels: () => models,
    getModel: (id) => models.find(m => m.id === id) || null,
    getProvider: (id) => providers[id] || null,
  }
}

const MODELS = [
  { id: 1, model_name: 'fast-model', provider_id: 10, is_primary: 1 },
  { id: 2, model_name: 'slow-model', provider_id: 20, is_primary: 0 },
]
const PROVIDERS = {
  10: { id: 10, api_format: 'openai' },
  20: { id: 20, api_format: 'anthropic' },
}

describe('parseChatCompletionsBody', () => {
  it('parses a valid non-stream body', () => {
    const out = parseChatCompletionsBody({
      model: 'claude-model',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(out.model).toBe('claude-model')
    expect(out.messages).toHaveLength(1)
    expect(out.stream).toBe(false)
  })

  it('defaults stream to false and passes generation params through', () => {
    const out = parseChatCompletionsBody({
      model: 'm',
      messages: [],
      temperature: 0.5,
      max_tokens: 128,
    })
    expect(out.stream).toBe(false)
    expect(out.temperature).toBe(0.5)
    expect(out.max_tokens).toBe(128)
  })

  it('throws a 400 when messages are missing', () => {
    expect(() => parseChatCompletionsBody({ model: 'm' }))
      .toThrowError(/messages/)
  })

  it('throws a 400 when messages is not an array', () => {
    expect(() => parseChatCompletionsBody({ model: 'm', messages: 'nope' }))
      .toThrowError(/messages/)
  })

  it('throws a 400 when model is missing', () => {
    expect(() => parseChatCompletionsBody({ messages: [] }))
      .toThrowError(/model/)
  })
})

describe('resolveChatModel', () => {
  it('finds a model by its model_name (OpenAI semantics)', () => {
    const { provider, model } = resolveChatModel(fakeDb(MODELS, PROVIDERS), 'slow-model')
    expect(model.model_name).toBe('slow-model')
    expect(provider.id).toBe(20)
  })

  it('falls back to resolving by model id', () => {
    const { model } = resolveChatModel(fakeDb(MODELS, PROVIDERS), '2')
    expect(model.id).toBe(2)
  })

  it('returns null for unknown models and missing providers', () => {
    expect(resolveChatModel(fakeDb(MODELS, PROVIDERS), 'nope-model')).toBe(null)
    expect(resolveChatModel(fakeDb(MODELS, {}), '1')).toBe(null) // model exists, provider missing
  })
})

describe('buildOpenAIResponse', () => {
  it('produces the OpenAI chat.completion shape with usage', () => {
    const out = buildOpenAIResponse({
      model: 'claude-model',
      content: 'hello world',
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
    })
    expect(out.object).toBe('chat.completion')
    expect(out.id).toMatch(/^chatcmpl-/)
    expect(out.model).toBe('claude-model')
    expect(typeof out.created).toBe('number')
    expect(out.choices).toHaveLength(1)
    expect(out.choices[0].index).toBe(0)
    expect(out.choices[0].message.role).toBe('assistant')
    expect(out.choices[0].message.content).toBe('hello world')
    expect(out.choices[0].finish_reason).toBe('stop')
    expect(out.usage.total_tokens).toBe(6)
  })
})

describe('handleChatCompletions (non-stream)', () => {
  const db = fakeDb(MODELS, PROVIDERS)
  const fakeComplete = async () => ({
    content: 'the answer',
    usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
  })

  it('returns the OpenAI shape with content and usage', async () => {
    const out = await handleChatCompletions({
      db,
      body: { model: 'slow-model', messages: [{ role: 'user', content: 'q' }] },
      completeChatMessage: fakeComplete,
    })
    expect(out.status).toBe(200)
    expect(out.json.choices[0].message.content).toBe('the answer')
    expect(out.json.usage.total_tokens).toBe(13)
  })

  it('returns 400 for an unknown model (never calls the adapter)', async () => {
    let called = false
    const out = await handleChatCompletions({
      db,
      body: { model: 'ghost', messages: [{ role: 'user', content: 'q' }] },
      completeChatMessage: async () => { called = true },
    })
    expect(out.status).toBe(400)
    expect(out.json.error.message).toMatch(/model/)
    expect(called).toBe(false)
  })

  it('returns 400 when required fields are missing', async () => {
    const db2 = fakeDb(MODELS, PROVIDERS)
    const missingModel = await handleChatCompletions({ db: db2, body: { messages: [] }, completeChatMessage: fakeComplete })
    expect(missingModel.status).toBe(400)

    const missingMessages = await handleChatCompletions({ db: db2, body: { model: 'slow-model' }, completeChatMessage: fakeComplete })
    expect(missingMessages.status).toBe(400)
  })

  it('relays provider failures as a 502', async () => {
    const out = await handleChatCompletions({
      db,
      body: { model: 'slow-model', messages: [] },
      completeChatMessage: async () => { throw new Error('upstream exploded') },
    })
    expect(out.status).toBe(502)
    expect(out.json.error.message).toMatch(/upstream exploded/)
  })
})

describe('handleChatCompletions (stream=true, SSE)', () => {
  const db = fakeDb(MODELS, PROVIDERS)

  it('yields role-first, content deltas, finish_reason, and [DONE]', async () => {
    async function* fakeStream() {
      yield 'hel'
      yield 'lo'
    }
    const out = await handleChatCompletions({
      db,
      body: { model: 'slow-model', messages: [], stream: true },
      streamChat: fakeStream,
    })
    expect(out.status).toBe(200)
    expect(typeof out.stream[Symbol.asyncIterator]).toBe('function')

    const lines = []
    for await (const line of out.stream) lines.push(line)

    // First chunk carries the role delta.
    const first = JSON.parse(lines[0].replace(/^data: /, ''))
    expect(first.object).toBe('chat.completion.chunk')
    expect(first.choices[0].delta.role).toBe('assistant')

    // Middle chunks carry content deltas.
    const middle = lines.slice(1, 3).map(l => JSON.parse(l.replace(/^data: /, '')))
    expect(middle[0].choices[0].delta.content).toBe('hel')
    expect(middle[1].choices[0].delta.content).toBe('lo')

    // Final chunk carries finish_reason, then [DONE].
    const last = JSON.parse(lines[lines.length - 2].replace(/^data: /, ''))
    expect(last.choices[0].finish_reason).toBe('stop')
    expect(lines[lines.length - 1]).toBe('data: [DONE]')
  })
})