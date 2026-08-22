// ─── Incremental compaction boundary tests ─────────────────────────────────
// Tests the incremental-compaction + smart-retention behavior of
// electron/llm/compaction.js (maybeCompact). These complement the pure
// estimate/split tests in compaction.test.js by exercising the state machine
// and the retention branches.
//
// We stub providerAdapter.completeChat via Module._load (the same technique
// used in toolLoop.test.js) so summarization returns a controllable summary
// instead of hitting the network.

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import Module from 'module'

// ─── Stub completeChat before importing compaction ─────────────────────────
const completeChatMock = vi.fn()
const origLoad = Module._load
Module._load = function (request, ...args) {
  if (request === './providerAdapter' || request === '../electron/llm/providerAdapter') {
    return { completeChat: completeChatMock }
  }
  return origLoad.apply(this, [request, ...args])
}

let maybeCompact, safeSplitIndex, clearCompactionState
beforeEach(async () => {
  completeChatMock.mockReset()
  completeChatMock.mockResolvedValue('SUMMARY')
  delete require.cache[require.resolve('../electron/llm/compaction')]
  const compaction = await import('../electron/llm/compaction')
  maybeCompact = compaction.maybeCompact
  safeSplitIndex = compaction.safeSplitIndex
  clearCompactionState = compaction.clearCompactionState
})

afterAll(() => {
  Module._load = origLoad
})

const provider = { api_url: 'http://test', api_format: 'openai' }
const model = { model_name: 'test' }
const big = 'x'.repeat(5000)
const mkAssistants = n => Array.from({ length: n }, () => ({ role: 'assistant', content: big }))

// ─── Incremental compaction ─────────────────────────────────────────────────
describe('incremental compaction', () => {
  it('only summarizes new messages: rolling mode feeds previous summary via buildSummarizePrompt', async () => {
    completeChatMock.mockResolvedValueOnce('SUMMARY-A').mockResolvedValueOnce('SUMMARY-B')
    await maybeCompact({ provider, model, messages: mkAssistants(10), budget: 100, sessionId: 's-inc' })
    const second = await maybeCompact({ provider, model, messages: mkAssistants(14), budget: 100, sessionId: 's-inc' })
    expect(completeChatMock).toHaveBeenCalledTimes(2)
    // Task5 滚动合并：第二次调用的提示词必须携带上一次摘要（替代旧的 [Later] 拼接）
    const secondPrompt = JSON.stringify(completeChatMock.mock.calls[1])
    expect(secondPrompt).toContain('SUMMARY-A')
    const summaryMsg = second.find(m => m.role === 'system' && m.content.startsWith('Summary of earlier'))
    expect(summaryMsg.content).toContain('SUMMARY-B')
    expect(summaryMsg.content).not.toContain('[Later]')
  })

  it('falls back to full re-summarization when no messages were added since boundary', async () => {
    completeChatMock.mockResolvedValueOnce('SUMMARY-A').mockResolvedValueOnce('SUMMARY-C')
    await maybeCompact({ provider, model, messages: mkAssistants(10), budget: 100, sessionId: 's-full' })
    const second = await maybeCompact({ provider, model, messages: mkAssistants(10), budget: 100, sessionId: 's-full' })
    expect(completeChatMock).toHaveBeenCalledTimes(2)
    const summaryMsg = second.find(m => m.role === 'system' && m.content.startsWith('Summary of earlier'))
    expect(summaryMsg.content).not.toContain('[Later]')
    expect(summaryMsg.content).toContain('SUMMARY-C')
  })

  it('clearCompactionState resets the incremental boundary', async () => {
    completeChatMock.mockResolvedValueOnce('SUMMARY-A').mockResolvedValueOnce('SUMMARY-D')
    await maybeCompact({ provider, model, messages: mkAssistants(10), budget: 100, sessionId: 's-clear' })
    clearCompactionState('s-clear')
    const second = await maybeCompact({ provider, model, messages: mkAssistants(14), budget: 100, sessionId: 's-clear' })
    const summaryMsg = second.find(m => m.role === 'system' && m.content.startsWith('Summary of earlier'))
    expect(summaryMsg.content).not.toContain('[Later]')
    expect(summaryMsg.content).toContain('SUMMARY-D')
  })
})

// ─── Smart retention ────────────────────────────────────────────────────────
describe('smart retention', () => {
  it('keeps user messages verbatim in the recent block', async () => {
    const messages = [
      { role: 'user', content: big },
      ...mkAssistants(9),
    ]
    const result = await maybeCompact({ provider, model, messages, budget: 100, sessionId: 's-ret-user' })
    expect(result.some(m => m.role === 'user' && m.content === big)).toBe(true)
  })

  it('keeps high-impact tool calls verbatim', async () => {
    const messages = [
      { role: 'assistant', content: big, tool_calls: [{ id: 't1', function: { name: 'write_file' } }] },
      ...mkAssistants(9),
    ]
    const result = await maybeCompact({ provider, model, messages, budget: 100, sessionId: 's-ret-write' })
    expect(result.some(m => m.tool_calls && m.tool_calls[0].function.name === 'write_file')).toBe(true)
  })

  it('does not keep non-high-impact tool calls verbatim', async () => {
    const messages = [
      { role: 'assistant', content: big, tool_calls: [{ id: 't1', function: { name: 'read_file' } }] },
      ...mkAssistants(9),
    ]
    const result = await maybeCompact({ provider, model, messages, budget: 100, sessionId: 's-ret-read' })
    expect(result.some(m => m.tool_calls && m.tool_calls[0].function.name === 'read_file')).toBe(false)
  })

  it('keeps long tool results (content > 200 chars) verbatim', async () => {
    const longResult = 'y'.repeat(300)
    const messages = [
      { role: 'assistant', content: big, tool_calls: [{ id: 't1', function: { name: 'read_file' } }] },
      { role: 'tool', tool_call_id: 't1', content: longResult },
      ...mkAssistants(8),
    ]
    const result = await maybeCompact({ provider, model, messages, budget: 100, sessionId: 's-ret-long' })
    expect(result.some(m => m.role === 'tool' && m.content === longResult)).toBe(true)
  })
})

// ─── Boundary cases ─────────────────────────────────────────────────────────
describe('compaction boundary cases', () => {
  it('returns messages unchanged while estimated tokens stay under COMPACT_AT_RATIO', async () => {
    // CR 一轮发现2语义迁移注记：保尾目标上限是 25%×budget，而触发门槛是 80%×budget
    // —— 一旦触发压缩，保尾在数学上不可能覆盖全部消息（0.25b < 0.667b）。
    // 旧「everything fits」分支已随 headroom cap 消失；本边界现守护的是
    // 另一条 unchanged 路径：估算总量低于门槛时完全不碰历史。
    const chunk = 'x'.repeat(1800) // ≈450 tok/条
    const messages = Array.from({ length: 30 }, () => ({ role: 'assistant', content: chunk }))
    // 30×450=13500 raw，est=⌈13500×1.2⌉=16200 < floor(21000×0.8)=16800 → 原样返回
    const result = await maybeCompact({ provider, model, messages, budget: 21000, sessionId: 's-window' })
    expect(result).toBe(messages)
  })

  it('safeSplitIndex walks back before an assistant tool_call at the boundary', () => {
    const msgs = [
      { role: 'user', content: '0' },
      { role: 'assistant', content: '1' },
      { role: 'user', content: '2' },
      { role: 'assistant', content: '3' },
      { role: 'assistant', content: '4', tool_calls: [{ id: 'c1' }] },
      { role: 'user', content: '5' },
      { role: 'assistant', content: '6' },
      { role: 'user', content: '7' },
    ]
    expect(safeSplitIndex(msgs, 3)).toBe(4)
  })

  it('safeSplitIndex extends back across consecutive tool results', () => {
    const msgs = [
      { role: 'user', content: '0' },
      { role: 'assistant', content: '1', tool_calls: [{ id: 'c1' }] },
      { role: 'tool', tool_call_id: 'c1', content: 'r1' },
      { role: 'assistant', content: '2', tool_calls: [{ id: 'c2' }] },
      { role: 'tool', tool_call_id: 'c2', content: 'r2' },
      { role: 'tool', tool_call_id: 'c3', content: 'r3' },
      { role: 'user', content: '6' },
      { role: 'assistant', content: '7' },
    ]
    expect(safeSplitIndex(msgs, 3)).toBe(3)
  })
})