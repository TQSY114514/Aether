// ─── Anthropic adapter streaming content_block state machine tests ──────────
// Verifies that tool_use blocks are assembled correctly across the
// content_block_start → content_block_delta → content_block_stop sequence,
// especially that fragmented input_json_delta payloads are concatenated in
// order (no lost arguments) and the full tool_use (name + input) is only
// emitted at content_block_stop.

import { describe, it, expect } from 'vitest'
import { streamChat, toAnthropicMessages, parseToolUses, parseSSELine } from '../electron/llm/anthropicAdapter'

const PROVIDER = { id: 1, api_url: 'https://api.anthropic.com/v1', api_format: 'anthropic', api_key: 'test-key', name: 'test' }
const MODEL = { model_name: 'claude-3-5-sonnet-20241022' }

// Build a fake fetch Response whose body is a ReadableStream of the given SSE
// text. Each `data: ` line is emitted as a separate chunk so the adapter's
// line-splitting path is exercised.
function fakeFetchResponse(sseText) {
  const encoder = new TextEncoder()
  const lines = sseText.split('\n')
  const body = new ReadableStream({
    start(controller) {
      for (const line of lines) {
        if (line) controller.enqueue(encoder.encode(line + '\n'))
      }
      controller.close()
    },
  })
  return {
    ok: true,
    body,
    text: async () => sseText,
    json: async () => ({}),
  }
}

// Consume a streamChat generator, returning { text, stream }.
async function consume(sseText, options = {}) {
  const originalFetch = global.fetch
  global.fetch = async () => fakeFetchResponse(sseText)
  try {
    const stream = streamChat({ provider: PROVIDER, model: MODEL, messages: [{ role: 'user', content: 'hi' }], options })
    let text = ''
    for await (const delta of stream) text += delta
    return { text, stream }
  } finally {
    global.fetch = originalFetch
  }
}

const SSE = (obj) => `data: ${JSON.stringify(obj)}`

const MSG_START = SSE({ type: 'message_start', message: { role: 'assistant', content: [] } })
const MSG_STOP = SSE({ type: 'message_stop' })

describe('anthropic streamChat — tool_use content_block state machine', () => {
  it('assembles a fragmented input_json_delta into a complete tool_use', async () => {
    const sse = [
      MSG_START,
      SSE({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_01', name: 'read_file', input: {} } }),
      SSE({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":' } }),
      SSE({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"src/index.ts",' } }),
      SSE({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"offset":10}' } }),
      SSE({ type: 'content_block_stop', index: 0 }),
      MSG_STOP,
    ].join('\n')

    const { text, stream } = await consume(sse)
    // No text deltas — the tool call produced no text.
    expect(text).toBe('')
    // Full tool_use assembled only at content_block_stop, with all fragments joined.
    expect(stream.toolCalls).toEqual([
      { id: 'toolu_01', type: 'function', function: { name: 'read_file', arguments: '{"path":"src/index.ts","offset":10}' } },
    ])
  })

  it('keeps interleaved multi-tool calls isolated by index (no args bleed)', async () => {
    const sse = [
      MSG_START,
      SSE({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_a', name: 'read_file', input: {} } }),
      SSE({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":"a.ts"}' } }),
      SSE({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_b', name: 'grep_search', input: {} } }),
      SSE({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"pattern":"foo"}' } }),
      SSE({ type: 'content_block_stop', index: 0 }),
      SSE({ type: 'content_block_stop', index: 1 }),
      MSG_STOP,
    ].join('\n')

    const { stream } = await consume(sse)
    expect(stream.toolCalls).toEqual([
      { id: 'toolu_a', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.ts"}' } },
      { id: 'toolu_b', type: 'function', function: { name: 'grep_search', arguments: '{"pattern":"foo"}' } },
    ])
  })

  it('interleaves text deltas and tool_use without mixing', async () => {
    const sse = [
      MSG_START,
      SSE({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      SSE({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Let me ' } }),
      SSE({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'read it' } }),
      SSE({ type: 'content_block_stop', index: 0 }),
      SSE({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_c', name: 'read_file', input: {} } }),
      SSE({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"path":"b.ts"}' } }),
      SSE({ type: 'content_block_stop', index: 1 }),
      MSG_STOP,
    ].join('\n')

    const { text, stream } = await consume(sse)
    expect(text).toBe('Let me read it')
    expect(stream.toolCalls).toEqual([
      { id: 'toolu_c', type: 'function', function: { name: 'read_file', arguments: '{"path":"b.ts"}' } },
    ])
  })

  it('falls back to an empty object when input_json is malformed', async () => {
    const sse = [
      MSG_START,
      SSE({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_d', name: 'run_command', input: {} } }),
      SSE({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'not-json{' } }),
      SSE({ type: 'content_block_stop', index: 0 }),
      MSG_STOP,
    ].join('\n')

    const { stream } = await consume(sse)
    expect(stream.toolCalls).toEqual([
      { id: 'toolu_d', type: 'function', function: { name: 'run_command', arguments: '{}' } },
    ])
  })

  it('still emits text deltas and no toolCalls for a plain text reply', async () => {
    const sse = [
      MSG_START,
      SSE({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      SSE({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } }),
      SSE({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } }),
      SSE({ type: 'content_block_stop', index: 0 }),
      MSG_STOP,
    ].join('\n')

    const { text, stream } = await consume(sse)
    expect(text).toBe('Hello world')
    expect(stream.toolCalls).toBeNull()
  })
})

describe('anthropic toAnthropicMessages', () => {
  it('hoists multiple system messages into a concatenated top-level system string', () => {
    const { system, messages } = toAnthropicMessages([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Hi' },
    ])
    expect(system).toBe('You are a helpful assistant.\n\nBe concise.')
    expect(messages).toEqual([{ role: 'user', content: 'Hi' }])
  })

  it('converts a tool_result message to user with tool_result block', () => {
    const { messages } = toAnthropicMessages([
      { role: 'tool', tool_call_id: 't1', content: '{"result":true}' },
    ])
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toEqual([
      { type: 'tool_result', tool_use_id: 't1', content: '{"result":true}' },
    ])
  })

  it('converts assistant tool_calls to multiple tool_use blocks', () => {
    const { messages } = toAnthropicMessages([
      {
        role: 'assistant',
        content: 'Let me check two files',
        tool_calls: [
          { id: 't1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a"}' } },
          { id: 't2', type: 'function', function: { name: 'read_file', arguments: '{"path":"b"}' } },
        ],
      },
    ])
    expect(messages[0].role).toBe('assistant')
    expect(messages[0].content).toHaveLength(3) // text + two tool_use
    expect(messages[0].content.filter(b => b.type === 'tool_use')).toHaveLength(2)
  })

  it('handles base64 image in user content', () => {
    const { messages } = toAnthropicMessages([
      { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc123' } }] },
    ])
    expect(messages[0].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'jpeg', data: 'abc123' } },
    ])
  })
})

describe('anthropic parseToolUses', () => {
  it('returns text + tool_calls for mixed content blocks', () => {
    const { text, tool_calls } = parseToolUses([
      { type: 'text', text: 'Here is the result:' },
      { type: 'tool_use', id: 't1', name: 'search', input: { query: 'test' } },
    ])
    expect(text).toBe('Here is the result:')
    expect(tool_calls).toEqual([
      { id: 't1', type: 'function', function: { name: 'search', arguments: '{"query":"test"}' } },
    ])
  })

  it('returns just text when no tool_use blocks', () => {
    const { text, tool_calls } = parseToolUses([
      { type: 'text', text: 'Hello world' },
      { type: 'text', text: '\nMore text' },
    ])
    expect(text).toBe('Hello world\nMore text')
    expect(tool_calls).toBeUndefined()
  })
})

describe('anthropic parseSSELine', () => {
  it('returns null for non-data lines', () => {
    expect(parseSSELine('event: message_start')).toBeNull()
    expect(parseSSELine('')).toBeNull()
  })

  it('parses a content_block_start event correctly', () => {
    const evt = parseSSELine(SSE({
      type: 'content_block_start',
      index: 2,
      content_block: { type: 'thinking', thinking: '' },
    }))
    expect(evt.type).toBe('content_block_start')
    expect(evt.index).toBe(2)
    expect(evt.block.type).toBe('thinking')
  })

  it('returns null for malformed JSON', () => {
    expect(parseSSELine('data: {broken')).toBeNull()
  })
})
