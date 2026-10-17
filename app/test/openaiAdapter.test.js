// ─── OpenAI-compatible adapter pure-function tests ──────────────────────────
// Covers parseSSELine (SSE chunk parsing), normalizeMessages (wire shape for
// tool loop), and normalizeUsage (cross-provider usage normalization).

import { describe, it, expect } from 'vitest'
import {
  parseSSELine,
  normalizeMessages,
  normalizeUsage,
  ThinkTagExtractor,
  extractThinkTags,
} from '../electron/llm/openaiAdapter'

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

describe('extractThinkTags', () => {
  it('extracts <think> tags correctly', () => {
    const res = extractThinkTags('Prefix <think>internal reasoning</think> Answer')
    expect(res.reasoning).toBe('internal reasoning')
    expect(res.content).toBe('Prefix  Answer')
  })

  it('extracts <thought> tags correctly (Hermes 3 format)', () => {
    const res = extractThinkTags('<thought>deliberation here</thought>Final solution')
    expect(res.reasoning).toBe('deliberation here')
    expect(res.content).toBe('Final solution')
  })

  it('extracts <scratchpad> tags correctly (Hermes scratchpad format)', () => {
    const res = extractThinkTags('<scratchpad>planning step 1</scratchpad>Result')
    expect(res.reasoning).toBe('planning step 1')
    expect(res.content).toBe('Result')
  })

  it('returns original content when no thinking tags exist', () => {
    const res = extractThinkTags('Just plain text')
    expect(res.reasoning).toBe('')
    expect(res.content).toBe('Just plain text')
  })
})

describe('ThinkTagExtractor streaming', () => {
  it('streams <think> tags split across chunks', () => {
    const ext = new ThinkTagExtractor()
    const r1 = ext.process('Hello <thi')
    expect(r1.content).toBe('Hello ')
    expect(r1.reasoning).toBe('')

    const r2 = ext.process('nk>deep thought</thi')
    expect(r2.content).toBe('')
    expect(r2.reasoning).toBe('deep thought')

    const r3 = ext.process('nk> World')
    expect(r3.content).toBe(' World')
    expect(r3.reasoning).toBe('')
  })

  it('streams <thought> tags split across chunks (Hermes 3)', () => {
    const ext = new ThinkTagExtractor()
    const r1 = ext.process('<thou')
    expect(r1.content).toBe('')

    const r2 = ext.process('ght>Hermes deliberation</thou')
    expect(r2.reasoning).toBe('Hermes deliberation')

    const r3 = ext.process('ght>Done')
    expect(r3.content).toBe('Done')
  })

  it('streams <scratchpad> tags split across chunks', () => {
    const ext = new ThinkTagExtractor()
    const r1 = ext.process('<scratch')
    expect(r1.content).toBe('')

    const r2 = ext.process('pad>Scratchpad notes</scratchpad>Ready')
    expect(r2.reasoning).toBe('Scratchpad notes')
    expect(r2.content).toBe('Ready')
  })
})

// `<|channel>thought … <channel|>` is the native channel-marker form (DeepSeek
// and compatibles). It must never be persisted as visible answer text.
describe('native channel markers', () => {
  it('extracts an empty thought channel and keeps the answer', () => {
    const res = extractThinkTags('<|channel>thought\n<channel|>Hello there')
    expect(res.reasoning).toBe('')
    expect(res.content).toBe('Hello there')
  })

  it('extracts a non-empty thought channel body', () => {
    const res = extractThinkTags('<|channel>thought\nlook at the code\n<channel|>The bug is on line 3')
    expect(res.reasoning).toBe('look at the code')
    expect(res.content).toBe('The bug is on line 3')
  })

  it('drops a leading marker pair in streaming, split across chunks', () => {
    const ext = new ThinkTagExtractor()
    const seen = { content: '', reasoning: '' }
    for (const chunk of ['<|chan', 'nel>thought', '\n', '<channel|>', 'Hello', ' world']) {
      const r = ext.process(chunk)
      seen.content += r.content
      seen.reasoning += r.reasoning
    }
    const tail = ext.flush()
    seen.content += tail.content
    seen.reasoning += tail.reasoning
    expect(seen.content).toBe('Hello world')
    expect(seen.reasoning).toBe('\n')
  })

  it('does not leak a half-written marker into content', () => {
    const ext = new ThinkTagExtractor()
    const r1 = ext.process('Answer <|channel>thou')
    expect(r1.content).toBe('Answer ')
    const r2 = ext.process('ght\n<channel|>!')
    expect(r2.content).toBe('!')
  })
})