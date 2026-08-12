// ─────────────────────────────────────────────────────────────────────────────
// wheel.test.js — SGR 1006 滚轮按钮码 → 滚动方向纯函数单测（W0-t8）
// 编码验证（xterm ctlseqs / Windows Terminal 同款）:
//   Cb 低 5 位 = 按钮码: 4→64 滚轮上 / 5→65 滚轮下 / 6→66 滚轮左 / 7→67 滚轮右
//   Shift 修饰 +4 → 68/69; Alt +8 → 72/73; Ctrl +16 → 80/81
//   滚轮事件只发 'M'(按下), 不发 'm'(释放) —— 剥离层对 M/m 同等剥离
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { wheelDelta } from '../../tui/wheel.js'

describe('wheelDelta (W0-t8)', () => {
  it('64 = 滚轮上 → +1（向旧消息滚动）', () => {
    expect(wheelDelta(64)).toBe(1)
  })

  it('65 = 滚轮下 → -1（向新消息滚动）', () => {
    expect(wheelDelta(65)).toBe(-1)
  })

  it('Shift+滚轮（68/69）同样生效', () => {
    expect(wheelDelta(68)).toBe(1)
    expect(wheelDelta(69)).toBe(-1)
  })

  it('66/67 = 滚轮左/右（横向, 非垂直）→ 0 不滚动', () => {
    expect(wheelDelta(66)).toBe(0)
    expect(wheelDelta(67)).toBe(0)
  })

  it('普通按钮（0 左键 / 1 中键 / 2 右键 / 3 释放）→ 0', () => {
    expect(wheelDelta(0)).toBe(0)
    expect(wheelDelta(1)).toBe(0)
    expect(wheelDelta(2)).toBe(0)
    expect(wheelDelta(3)).toBe(0)
  })

  it('修饰组合（Ctrl+滚轮 80/81, Alt+滚轮 72/73）→ 0 不滚动（防误翻页）', () => {
    expect(wheelDelta(80)).toBe(0)
    expect(wheelDelta(81)).toBe(0)
    expect(wheelDelta(72)).toBe(0)
    expect(wheelDelta(73)).toBe(0)
  })

  it('畸形输入（负数/非整数/NaN/字符串垃圾）→ 0 不崩溃', () => {
    expect(wheelDelta(-5)).toBe(0)
    expect(wheelDelta(1.5)).toBe(0)
    expect(wheelDelta(NaN)).toBe(0)
    expect(wheelDelta(undefined)).toBe(0)
    expect(wheelDelta(null)).toBe(0)
    expect(wheelDelta('abc')).toBe(0)
    expect(wheelDelta({})).toBe(0)
  })

  it("数字字符串 '64'/'65' 可解析（剥离层 Number 后传入, 双保险）", () => {
    expect(wheelDelta('64')).toBe(1)
    expect(wheelDelta('65')).toBe(-1)
  })
})
