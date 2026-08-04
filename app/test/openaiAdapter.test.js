// ─── OpenAI-compatible adapter pure-function tests ──────────────────────────
// Covers parseSSELine (SSE chunk parsing), normalizeMessages (wire shape for
// tool loop), and normalizeUsage (cross-provider usage normalization).

import { describe, it, expect } from 'vitest'
import { parseSSELine, normalizeMessages, normalizeUsage } from '../electron/llm/openaiAdapter'

const SSE = (obj) => `data: ${JSON.stringify(obj)}`

describe('openai parseSSELine', () => {
  it('returns {} for a non-data line', () => {
    expect(parseSSELine('event: ping')).toEqual({})
    expect(parseSSELine('')).toEqual({})
    expect(parseSSELine('   ')).toEqual({})
  })

  it('returns {} for [DONE] and empty data payloads', () => {
    expect(parseSSELine('data: [DONE]')).toEqual({})
    expect(parseSSELine('data: ')).toEqual({})
  })

  it('returns {} for malformed JSON', () => {
    expect(parseSSELine('data: {not-json')).toEqual({})
    expect(parseSSELine('data: {"choices":')).toEqual({})
  })

  it('extracts content delta from a choices chunk', () => {
    const { delta } = parseSSELine(SSE({ choices: [{ delta: { content: 'Hello' } }] }))
    expect(delta).toBe('Hello')
  })

  it('extracts reasoning_content as reasoning and empty content as delta ""', () => {
    const { delta, reasoning } = parseSSELine(SSE({ choices: [{ delta: { reasoning_content: 'thinking...' } }] }))
    expect(delta).toBe('')
    expect(reasoning).toBe('thinking...')
  })

  it('extracts usage from a usage chunk', () => {
    const { usage } = parseSSELine(SSE({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }))
    expect(usage).toEqual({
      prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cache_read_tokens: 0, cache_creation_tokens: 0,
    })
  })

  it('returns no usage when the chunk carries none', () => {
    const { usage } = parseSSELine(SSE({ choices: [{ delta: { content: 'x' } }] }))
    expect(usage).toBe(null)
  })
})

describe('openai normalizeMessages', () => {
  it('preserves tool_calls/tool_call_id/name on tool-loop messages', () => {
    const out = normalizeMessages([
      { role: 'assistant', content: 'using tool', tool_calls: [{ id: 't1', type: 'function', function: { name: 'read_file', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 't1', name: 'read_file', content: '{"ok":true}' },
    ])
    expect(out[0].tool_calls).toHaveLength(1)
    expect(out[1].tool_call_id).toBe('t1')
    expect(out[1].name).toBe('read_file')
  })

  it('passes through plain role/content untouched and drops extra fields', () => {
    const out = normalizeMessages([{ role: 'user', content: 'hi', extra: 'dropped' }])
    expect(out).toEqual([{ role: 'user', content: 'hi' }])
  })
})

describe('openai normalizeUsage', () => {
  it('maps OpenAI-style field names', () => {
    const u = normalizeUsage({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, prompt_tokens_details: { cached_tokens: 3 } })
    expect(u.cache_read_tokens).toBe(3)
    expect(u.prompt_tokens).toBe(10)
  })

  it('maps Anthropic-style field names', () => {
    const u = normalizeUsage({ input_tokens: 12, output_tokens: 7, cache_read_input_tokens: 4, cache_creation_input_tokens: 2 })
    expect(u.prompt_tokens).toBe(12)
    expect(u.completion_tokens).toBe(7)
    expect(u.total_tokens).toBe(19)
    expect(u.cache_read_tokens).toBe(4)
    expect(u.cache_creation_tokens).toBe(2)
  })

  it('returns null for empty/undefined input', () => {
    expect(normalizeUsage(null)).toBeNull()
    expect(normalizeUsage(undefined)).toBeNull()
  })
})