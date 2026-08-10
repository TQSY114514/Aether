// ─────────────────────────────────────────────────────────────────────────────
// entry.test.js — TUI 入口纯函数回归（todo 1 修复：main→runInteractive argv 透传）
// 实测 bug：main() 曾漏传 argv 给 runInteractive → parseTuiOpts(undefined).length
// 崩溃（真实 TTY 才触发）。parseTuiOpts 已导出，此处锁定其行为。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { parseTuiOpts } from '../../tui/index.mjs'

describe('parseTuiOpts（todo 1）', () => {
  it('空参数 → 默认 undefined（不抛错）', () => {
    expect(parseTuiOpts([])).toEqual({ dbPath: undefined, modelName: undefined })
    expect(parseTuiOpts(undefined)).toEqual({ dbPath: undefined, modelName: undefined })
  })

  it('--db / --model 解析', () => {
    expect(parseTuiOpts(['--db', 'D:\\x\\aetherai.db', '--model', 'deepseek']))
      .toEqual({ dbPath: 'D:\\x\\aetherai.db', modelName: 'deepseek' })
  })

  it('--db= 等号形式解析', () => {
    expect(parseTuiOpts(['--db=C:\\d.db'])).toEqual({ dbPath: 'C:\\d.db', modelName: undefined })
    expect(parseTuiOpts(['--model=m1'])).toEqual({ dbPath: undefined, modelName: 'm1' })
  })

  it('未知 flag 忽略', () => {
    expect(parseTuiOpts(['--foo', 'bar', '--db', 'x.db'])).toEqual({ dbPath: 'x.db', modelName: undefined })
  })
})
