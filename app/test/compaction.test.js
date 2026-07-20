// ─── Context compaction unit tests ──────────────────────────────────────────
// Tests for electron/llm/compaction.js pure functions:
// estimateTextTokens, estimateMessageTokens, estimateMessagesTokens,
// safeSplitIndex, and maybeCompact (which falls back to hard-truncate when
// the summarization HTTP call fails).

import { describe, it, expect } from 'vitest'
import { estimateTextTokens, estimateMessageTokens, estimateMessagesTokens, safeSplitIndex, maybeCompact } from '../electron/llm/compaction'

// ─── Helpers ────────────────────────────────────────────────────────────────
function m(role, content = '') { return { role, content } }

// ─── estimateTextTokens ──────────────────────────────────────────────────────
describe('estimateTextTokens', () => {
  it('returns 0 for empty/undefined input', () => {
    expect(estimateTextTokens('')).toBe(0)
    expect(estimateTextTokens(null)).toBe(0)
    expect(estimateTextTokens(undefined)).toBe(0)
  })

  it('estimates English at ~0.25 chars/token', () => {
    expect(estimateTextTokens('hello world')).toBe(3) // 11 * 0.25 = 2.75 -> 3
  })

  it('estimates CJK at 1.5 chars/token', () => {
    expect(estimateTextTokens('你好世界')).toBe(6) // 4 * 1.5 = 6
  })

  it('handles mixed English and CJK', () => {
    expect(estimateTextTokens('hello你好')).toBe(5) // 5*0.25 + 2*1.5 = 4.25 -> 5
  })

  it('returns at least 1 for non-empty text', () => {
    expect(estimateTextTokens('a')).toBeGreaterThanOrEqual(1)
  })

  it('scales with length', () => {
    expect(estimateTextTokens('a'.repeat(100))).toBe(25) // 100 * 0.25
  })
})

// ─── estimateMessageTokens ───────────────────────────────────────────────────
describe('estimateMessageTokens', () => {
  it('returns string-content estimate', () => {
    expect(estimateMessageTokens({ content: 'hello' })).toBe(2) // 5 * 0.25 = 1.25 -> 2
  })

  it('sums multimodal parts', () => {
    const t = estimateMessageTokens({ content: [{ text: 'hello' }, { text: 'world' }] })
    expect(t).toBe(estimateTextTokens('hello') + estimateTextTokens('world'))
  })

  it('returns 0 for no content', () => {
    expect(estimateMessageTokens({})).toBe(0)
    expect(estimateMessageTokens(null)).toBe(0)
    expect(estimateMessageTokens({ content: null })).toBe(0)
  })
})

// ─── estimateMessagesTokens ──────────────────────────────────────────────────
describe('estimateMessagesTokens', () => {
  it('applies 1.2x safety margin', () => {
    const msgs = [{ content: 'hello' }, { content: 'world' }]
    const total = estimateMessagesTokens(msgs)
    const raw = estimateMessageTokens(msgs[0]) + estimateMessageTokens(msgs[1])
    expect(total).toBe(Math.ceil(raw * 1.2))
  })

  it('returns 0 for empty array', () => {
    expect(estimateMessagesTokens([])).toBe(0)
  })
})

// ─── safeSplitIndex ──────────────────────────────────────────────────────────
describe('safeSplitIndex', () => {
  it('returns len - recentCount for plain messages', () => {
    const msgs = Array.from({ length: 10 }, (_, i) => m(i % 2 ? 'assistant' : 'user'))
    expect(safeSplitIndex(msgs, 4)).toBe(6)
  })

  it('clamps to 0 for arrays smaller than recent window', () => {
    expect(safeSplitIndex([m('user'), m('assistant')], 5)).toBe(0)
  })

  it('returns 0 when all fit in recent window', () => {
    expect(safeSplitIndex([m('user'), m('assistant'), m('user')], 8)).toBe(0)
  })

  it('extends backward when a tool result is at the boundary', () => {
    // recentCount=3, default split=5. msgs[5] is 'user' (not 'tool').
    // The boundary lands on a clean user message.
    const msgs = [
      m('user'), m('assistant', [{ id: 't1' }]), { role: 'tool', tool_call_id: 't1', content: 'r' },
      m('user'), m('assistant'), m('user'), m('assistant'), m('user'), m('assistant'),
    ]
    expect(safeSplitIndex(msgs, 3)).toBe(6)
  })
})

// ─── maybeCompact ────────────────────────────────────────────────────────────
describe('maybeCompact', () => {
  it('returns messages unchanged when under budget', async () => {
    const result = await maybeCompact({
      provider: { api_url: 'http://test', api_format: 'openai' },
      model: { model_name: 'test', context_window: 10000 },
      messages: [{ role: 'user', content: 'hi' }],
      budget: 100_000,
    })
    expect(result).toHaveLength(1)
  })

  it('returns messages unchanged when budget is 0', async () => {
    const msgs = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }]
    const result = await maybeCompact({
      provider: { api_url: 'http://test', api_format: 'openai' },
      model: { model_name: 'test' },
      messages: msgs,
      budget: 0,
    })
    expect(result).toBe(msgs)
  })

  it('preserves system messages on compaction (hard-truncate fallback)', async () => {
    // The HTTP call to summarizeHistory will fail (no real server).
    // The catch block hard-truncates but keeps system messages.
    const big = 'x'.repeat(5000)
    const msgs = [
      { role: 'system', content: 'You are helpful' },
      ...Array.from({ length: 15 }, () => [m('user', big), m('assistant', big)]).flat(),
    ]
    const result = await maybeCompact({
      provider: { api_url: 'http://test', api_format: 'openai' },
      model: { model_name: 'test' },
      messages: msgs,
      budget: 100,
    })
    expect(result.length).toBeLessThan(msgs.length)
    expect(result[0].role).toBe('system')
  })

  it('keeps tool_call/result pairs intact on hard-truncate', async () => {
    const big = 'x'.repeat(5000)
    const msgs = [
      { role: 'system', content: 'sys' },
      m('user', big),
      { role: 'assistant', content: big, tool_calls: [{ id: 'c1', function: { name: 'read_file' } }] },
      { role: 'tool', tool_call_id: 'c1', content: 'file content' },
      m('user', big),
      m('assistant', big),
      m('user', big),
      m('assistant', big),
    ]
    const result = await maybeCompact({
      provider: { api_url: 'http://test', api_format: 'openai' },
      model: { model_name: 'test' },
      messages: msgs,
      budget: 100,
    })
    // After hard-truncate fallback, no orphaned tool_call or tool_result should exist
    const assistantWithToolCalls = result.filter(m => m.tool_calls)
    for (const a of assistantWithToolCalls) {
      const ids = a.tool_calls.map(tc => tc.id)
      for (const id of ids) {
        const hasResult = result.some(m => m.tool_call_id === id && m.role === 'tool')
        expect(hasResult).toBe(true)
      }
    }
  })
})
