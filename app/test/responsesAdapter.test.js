// ─── OpenAI Responses API adapter — pure-function tests ─────────────────────
// Covers the wire-format conversion and extraction helpers that don't need a
// network or a real provider: toResponsesInput (message → input items),
// extractText / extractReasoning / extractToolCalls (output → shapes), and
// parseSSEEvent (SSE line → event).

import { describe, it, expect } from 'vitest'
import {
  toResponsesInput, extractText, extractReasoning, extractToolCalls, parseSSEEvent,
} from '../electron/llm/responsesAdapter'

describe('toResponsesInput — plain messages', () => {
  it('maps system/user/assistant with role + content', () => {
    const input = toResponsesInput([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
    expect(input).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
  })
})

describe('toResponsesInput — tool calls', () => {
  it('converts assistant tool_calls to function_call output items', () => {
    const input = toResponsesInput([
      {
        role: 'assistant',
        content: 'let me check',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"/a"}' } },
        ],
      },
    ])
    expect(input[0].output).toEqual([
      { type: 'function_call', call_id: 'call_1', name: 'read_file', arguments: '{"path":"/a"}' },
    ])
  })

  it('stringifies object arguments when not already a string', () => {
    const input = toResponsesInput([
      { role: 'assistant', content: '', tool_calls: [{ id: 'c', type: 'function', function: { name: 'f', arguments: { a: 1 } } }] },
    ])
    expect(input[0].output[0].arguments).toBe(JSON.stringify({ a: 1 }))
  })
})

describe('toResponsesInput — tool results', () => {
  it('converts tool-role messages to function_call_output items', () => {
    const input = toResponsesInput([
      { role: 'tool', tool_call_id: 'call_1', content: 'file contents' },
    ])
    expect(input).toEqual([
      { type: 'function_call_output', call_id: 'call_1', output: 'file contents' },
    ])
  })

  it('stringifies non-string tool content', () => {
    const input = toResponsesInput([{ role: 'tool', tool_call_id: 'c', content: { ok: true } }])
    expect(input[0].output).toBe(JSON.stringify({ ok: true }))
  })
})

describe('extractText / extractReasoning / extractToolCalls', () => {
  const output = [
    { type: 'message', content: [{ type: 'output_text', text: 'Hello ' }, { type: 'output_text', text: 'world' }] },
    { type: 'message', content: [{ type: 'reasoning', summary: [{ type: 'summary_text', text: 'think…' }] }] },
    { type: 'function_call', call_id: 'call_9', name: 'grep_search', arguments: '{"pattern":"x"}' },
  ]

  it('extractText concatenates output_text parts', () => {
    expect(extractText(output)).toBe('Hello world')
  })

  it('extractReasoning reads summary text', () => {
    expect(extractReasoning(output)).toBe('think…')
  })

  it('extractToolCalls returns OpenAI-style tool_calls', () => {
    const calls = extractToolCalls(output)
    expect(calls).toEqual([{ id: 'call_9', type: 'function', function: { name: 'grep_search', arguments: '{"pattern":"x"}' } }])
  })

  it('extractToolCalls returns undefined when no function calls', () => {
    expect(extractToolCalls([{ type: 'message', content: [{ type: 'output_text', text: 'hi' }] }])).toBeUndefined()
  })
})

describe('parseSSEEvent', () => {
  it('parses a data line into an event', () => {
    const evt = parseSSEEvent('data: {"type":"response.output_text.delta","delta":"hi"}')
    expect(evt).toEqual({ type: 'response.output_text.delta', delta: 'hi' })
  })

  it('ignores non-data lines and [DONE]', () => {
    expect(parseSSEEvent('event: foo')).toBeNull()
    expect(parseSSEEvent('data: [DONE]')).toBeNull()
    expect(parseSSEEvent('')).toBeNull()
  })

  it('ignores malformed JSON', () => {
    expect(parseSSEEvent('data: not-json')).toBeNull()
  })
})