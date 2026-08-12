// ─────────────────────────────────────────────────────────────────────────────
// recap.test.js — /recap 纯逻辑（W1-t14）
// buildRecapFallback：最近 ≤maxLines 条各取首行拼接、空会话 → ''、多行截断。
// truncateRecap：120 字符截断。buildRecapMessages：最近 N 条 user/assistant
// + 总结指令作为最后一条 user 消息（runAgent messages 整体替换语义）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { buildRecapFallback, truncateRecap, buildRecapMessages, RECAP_INSTRUCTION } from '../../tui/recap.js'

describe('buildRecapFallback（W1-t14）', () => {
  it('最近 ≤maxLines 条各取首行拼接', () => {
    const msgs = [
      { id: 1, role: 'user', text: '第一行\n第二行' },
      { id: 2, role: 'assistant', text: 'assistant reply\nmore' },
      { id: 3, role: 'user', text: 'later turn' },
    ]
    expect(buildRecapFallback(msgs, 2)).toBe('assistant reply | later turn')
  })

  it('空消息/空行被过滤', () => {
    const msgs = [
      { id: 1, role: 'user', text: '' },
      { id: 2, role: 'assistant', text: '   \n x' },
      { id: 3, role: 'user', text: 'real' },
    ]
    expect(buildRecapFallback(msgs, 5)).toBe('real')
  })

  it('空会话 → 空字符串（不崩溃）', () => {
    expect(buildRecapFallback([])).toBe('')
    expect(buildRecapFallback(null)).toBe('')
  })
})

describe('truncateRecap（W1-t14）', () => {
  it('≤120 字符原样返回', () => {
    expect(truncateRecap('short')).toBe('short')
  })
  it('超长截断加 …', () => {
    const long = 'x'.repeat(200)
    const t = truncateRecap(long)
    expect(t.length).toBe(121)
    expect(t.endsWith('…')).toBe(true)
  })
})

describe('buildRecapMessages（W1-t14）', () => {
  it('只取最近 user/assistant（system 排除）, 指令为最后一条 user 消息', () => {
    const msgs = [
      { id: 1, role: 'user', text: 'u1' },
      { id: 2, role: 'assistant', text: 'a1' },
      { id: 3, role: 'system', text: 'note' },
      { id: 4, role: 'user', text: 'u2' },
    ]
    const out = buildRecapMessages(msgs, 10)
    expect(out).toEqual([
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
      { role: 'user', content: RECAP_INSTRUCTION },
    ])
  })

  it('maxCount 生效：只取最近 N 条 + 指令', () => {
    const msgs = [1, 2, 3, 4, 5, 6].map((i) => ({ id: i, role: i % 2 ? 'user' : 'assistant', text: `m${i}` }))
    const out = buildRecapMessages(msgs, 2)
    expect(out.length).toBe(3)
    expect(out[0].content).toBe('m5')
    expect(out[2]).toEqual({ role: 'user', content: RECAP_INSTRUCTION })
  })

  it('空会话 → 只有指令（不崩溃）', () => {
    expect(buildRecapMessages([])).toEqual([{ role: 'user', content: RECAP_INSTRUCTION }])
  })
})
