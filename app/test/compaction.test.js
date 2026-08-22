// ─── Context compaction unit tests ──────────────────────────────────────────
// Tests for electron/llm/compaction.js pure functions:
// estimateTextTokens, estimateMessageTokens, estimateMessagesTokens,
// safeSplitIndex, and maybeCompact (which falls back to hard-truncate when
// the summarization HTTP call fails).

import { describe, it, expect } from 'vitest'
import { estimateTextTokens, estimateMessageTokens, estimateMessagesTokens, safeSplitIndex, maybeCompact, findKeepPoint, buildSummarizePrompt } from '../electron/llm/compaction'

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
    // Smart retention keeps user messages verbatim, so we use a single user
    // message + many assistant messages to exercise a real reduction, while
    // still asserting the system message is preserved.
    const big = 'x'.repeat(5000)
    const msgs = [
      { role: 'system', content: 'You are helpful' },
      m('user', big),
      ...Array.from({ length: 50 }, () => m('assistant', big)),
    ]
    const result = await maybeCompact({
      provider: { api_url: 'http://test', api_format: 'openai' },
      model: { model_name: 'test' },
      messages: msgs,
      budget: 100,
    })
    expect(result.length).toBeLessThan(msgs.length)
    expect(result[0].role).toBe('system')
    expect(result.some(msg => msg.role === 'system' && msg.content === 'You are helpful')).toBe(true)
  }, 20000)

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

  it('force=true skips the ratio gate: low-water messages get compacted', async () => {
    // 远低于 COMPACT_AT_RATIO×budget 的水位；非 force 时会原样返回。
    // 规模必须让 fallback 也必须丢东西（older 块 token 总量 > 保尾目标
    // KEEP_RECENT_TOKENS_DEFAULT=20000），否则正确语义是返回 null 而非收缩。
    const big = 'x'.repeat(5000)
    const lowWater = [
      { role: 'system', content: 'sys' },
      m('user', big),
      ...Array.from({ length: 58 }, (_, i) => m(i % 2 ? 'assistant' : 'user', big)),
    ]
    const untouched = await maybeCompact({
      provider: { api_url: 'http://test', api_format: 'openai' },
      model: { model_name: 'test' },
      messages: lowWater,
      budget: 1_000_000,
    })
    expect(untouched.length).toBe(lowWater.length) // 正常门槛下不压缩

    const forced = await maybeCompact({
      provider: { api_url: 'http://test', api_format: 'openai' },
      model: { model_name: 'test' },
      messages: lowWater,
      budget: 1_000_000,
      force: true,
    })
    expect(forced).not.toBeNull()
    expect(forced.length).toBeLessThan(lowWater.length)
  }, 20000)

  it('force=true returns null when nothing can be compacted (anti-loop)', async () => {
    const result = await maybeCompact({
      provider: { api_url: 'http://test', api_format: 'openai' },
      model: { model_name: 'test' },
      messages: [{ role: 'user', content: 'hi' }],
      budget: 100_000,
      force: true,
    })
    expect(result).toBeNull()
  })
})

// ─── findKeepPoint（token 保尾） ─────────────────────────────────────────────
describe('findKeepPoint（token 保尾）', () => {
  it('导出存在', () => {
    expect(typeof findKeepPoint).toBe('function')
  })

  it('预算越大保留越多（splitIndex 单调不增）', () => {
    const messages = Array.from({ length: 40 }, (_, i) => m(i % 2 ? 'assistant' : 'user', 'x'.repeat(600)))
    const small = findKeepPoint(messages, 8000)
    const large = findKeepPoint(messages, 160000)
    expect(large).toBeLessThanOrEqual(small)
    expect(small).toBeGreaterThan(0) // 小预算下确实有前缀被摘走
  })

  it('小预算时保尾让位于预算上限（budget−overhead）', () => {
    const messages = Array.from({ length: 20 }, (_, i) => m(i % 2 ? 'assistant' : 'user', 'x'.repeat(2000))) // 每条约500tok
    const idx = findKeepPoint(messages, 6000)
    // headroom=floor((6000-2048)/1.2)=3293 → 保尾≤7条；旧4000下限会保8条
    expect(messages.length - idx).toBeLessThanOrEqual(7)
    expect(idx).toBeGreaterThan(0)
  })

  it('极小预算只保最后一条（headroom=0，25%份额仍生效）', () => {
    const messages = Array.from({ length: 10 }, (_, i) => m(i % 2 ? 'assistant' : 'user', 'x'.repeat(2000)))
    const idx = findKeepPoint(messages, 500) // b−2048<0 → target 仅剩 125
    // 第一条(约500tok)即达 target → 只保尾部1条
    expect(idx).toBe(messages.length - 1)
  })

  it('切点永不孤立 tool 配对', () => {
    const messages = [
      m('system', 'x'.repeat(10)),
      m('user', 'x'.repeat(500)),
      { role: 'assistant', content: '', tool_calls: [{ id: 't1', type: 'function', function: { name: 'x', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 't1', content: 'y'.repeat(1200) },
      m('assistant', 'x'.repeat(80)),
    ]
    const idx = findKeepPoint(messages, 9000)
    expect(messages[idx].role).not.toBe('tool') // 保尾的第一条不是无主的 tool 结果
  })
})

// --- buildSummarizePrompt ---
describe('buildSummarizePrompt', () => {
  it('full mode: six headings, chunk text, verbatim rule, no previous_summary', () => {
    const p = buildSummarizePrompt(null, 'CHUNK_TEXT')
    for (const s of ['## Goal', '## Constraints', '## Progress', '## Key Decisions', '## Next Steps', '## Critical Context']) {
      expect(p).toContain(s)
    }
    expect(p).toContain('CHUNK_TEXT')
    expect(p).toContain('逐字保留') 
    expect(p).not.toContain('<previous_summary>')
  })
  it('UPDATE mode: both inputs present and rolling-merge instruction explicit', () => {
    const p = buildSummarizePrompt('PREV_SUMMARY', 'NEW_DELTA')
    expect(p).toContain('<previous_summary>')
    expect(p).toContain('PREV_SUMMARY')
    expect(p).toContain('<new_conversation_segment>')
    expect(p).toContain('NEW_DELTA')
    expect(p).toMatch(/滚动|更新/)
  })
})
