// ─────────────────────────────────────────────────────────────────────────────
// contextInfo.test.js — /context 估算与展示行（W1-t11）
// 覆盖：CJK 中文计数（fallback 1.5 token/字）、空输入 → 0、ASCII 计数、
// 模型上限缺失 → '—'、占比计算、usage 透传。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { estimateTokens, estimateMessagesTokens, buildContextLine } from '../../tui/contextInfo.js'

describe('estimateTokens（复用 compaction ./tokenizer, W1-t11）', () => {
  it('空输入 → 0（fallback 对空串返回 1, 展示场景需要 0）', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens(null)).toBe(0)
    expect(estimateTokens(undefined)).toBe(0)
  })

  it('中文计数合理：CJK ≈1.5 token/字', () => {
    // '你好世界' = 4 个 CJK 字 → 4 × 1.5 = 6
    expect(estimateTokens('你好世界', 'unknown', 'x')).toBe(6)
  })

  it('ASCII ≈0.25 token/字（≈4 字/token）', () => {
    // 'hello world' = 11 字符 → 11 × 0.25 = 2.75 → ceil 3
    expect(estimateTokens('hello world', 'unknown', 'x')).toBe(3)
  })

  it('混合中英不崩溃且非负', () => {
    const n = estimateTokens('修复 bug 并 add tests!', 'unknown', 'x')
    expect(Number.isFinite(n)).toBe(true)
    expect(n).toBeGreaterThan(0)
  })

  it('未知 provider 也走 fallback（不计精确 token）', () => {
    expect(estimateTokens('hi', 'some-provider', 'some-model')).toBe(1) // 2 × 0.25 = 0.5 → ceil 1
  })

  it('estimateMessagesTokens 只统计 user/assistant, system 不占位', () => {
    const msgs = [
      { role: 'user', text: '你好世界' },        // 6
      { role: 'assistant', text: 'hi there!' },  // 9 × 0.25 = 2.25 → 3
      { role: 'system', text: 'x'.repeat(5000) },// 不统计
    ]
    expect(estimateMessagesTokens(msgs, 'unknown', 'x')).toBe(9)
  })
})

describe('buildContextLine（/context 展示行, W1-t11）', () => {
  it('有上限：消息数/估算/上限/占比/usage 齐全', () => {
    const line = buildContextLine({ messageCount: 12, estTokens: 3480, contextLimit: 128000, usage: { input: 1000, output: 2200 }, modelName: 'deepseek' })
    expect(line).toContain('messages: 12')
    expect(line).toContain('est: 3,480 tokens')
    expect(line).toContain('limit: 128,000 (3%)')
    expect(line).toContain('used in/out: 1000/2200')
    expect(line).toContain('model: deepseek')
  })

  it('上限缺失 → "—"（模型无 context_window 字段）', () => {
    const line = buildContextLine({ messageCount: 2, estTokens: 100, contextLimit: null, usage: {} })
    expect(line).toContain('limit: —')
    expect(line).not.toContain('(')
  })

  it('上限为 0/负 → 视为缺失', () => {
    expect(buildContextLine({ messageCount: 1, estTokens: 1, contextLimit: 0 })).toContain('limit: —')
    expect(buildContextLine({ messageCount: 1, estTokens: 1, contextLimit: -5 })).toContain('limit: —')
  })

  it('占比封顶 999%（防超宽渲染）', () => {
    const line = buildContextLine({ messageCount: 1, estTokens: 99999999, contextLimit: 1000, usage: {} })
    expect(line).toContain('(999%)')
  })

  it('非法输入不崩溃（数值 NaN 兜底 0）', () => {
    const line = buildContextLine({ messageCount: NaN, estTokens: undefined, contextLimit: null, usage: null })
    expect(line).toContain('messages: 0')
    expect(line).toContain('est: 0 tokens')
  })
})
