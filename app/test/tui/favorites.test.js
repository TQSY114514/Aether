// ─────────────────────────────────────────────────────────────────────────────
// favorites.test.js — W3-t22: 模型收藏 + 最近循环纯助手单测
// favoriteKey / toggleFavorite / recordRecent / cycleRecent。
// 持久化（setSetting 落 settings 表）在 App.mjs 层, 由持久化路径 F3 验证。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { favoriteKey, toggleFavorite, recordRecent, cycleRecent, RECENT_MODEL_MAX } from '../../tui/favorites.js'

describe('favoriteKey — settings 键', () => {
  it('键格式 model.favorite.<name>', () => {
    expect(favoriteKey('deepseek')).toBe('model.favorite.deepseek')
    expect(favoriteKey('gpt-4o')).toBe('model.favorite.gpt-4o')
    expect(favoriteKey('')).toBe('model.favorite.')
  })
})

describe('toggleFavorite — 切换', () => {
  it("'1' → '0'（取消）", () => {
    expect(toggleFavorite('1')).toBe('0')
  })

  it("null/undefined/'0'/其他 → '1'（收藏）", () => {
    expect(toggleFavorite(null)).toBe('1')
    expect(toggleFavorite(undefined)).toBe('1')
    expect(toggleFavorite('0')).toBe('1')
    expect(toggleFavorite('weird')).toBe('1')
  })
})

describe('recordRecent — 最近列表维护', () => {
  it('前置新模型（最前 = 最近）', () => {
    expect(recordRecent(['a', 'b'], 'c')).toEqual(['c', 'a', 'b'])
  })

  it('去重: 已存在 → 移到最前', () => {
    expect(recordRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c'])
  })

  it('上限 5', () => {
    const r = recordRecent(['e', 'd', 'c', 'b', 'a'], 'f')
    expect(r).toEqual(['f', 'e', 'd', 'c', 'b'])
    expect(r.length).toBe(RECENT_MODEL_MAX)
  })

  it('空/无 current 不崩溃', () => {
    expect(recordRecent([], 'x')).toEqual(['x'])
    expect(recordRecent(['a'], null)).toEqual(['a'])
    expect(recordRecent(null, 'x')).toEqual(['x'])
  })
})

describe('cycleRecent — F2 循环', () => {
  it('当前在列表 → 下一个（末尾环绕到首）', () => {
    expect(cycleRecent(['a', 'b', 'c'], 'a')).toBe('b')
    expect(cycleRecent(['a', 'b', 'c'], 'b')).toBe('c')
    expect(cycleRecent(['a', 'b', 'c'], 'c')).toBe('a')
  })

  it('当前不在列表 / 为 null → 第一个', () => {
    expect(cycleRecent(['a', 'b'], 'zzz')).toBe('a')
    expect(cycleRecent(['a', 'b'], null)).toBe('a')
  })

  it('空列表 → null（F2 无操作）', () => {
    expect(cycleRecent([], 'a')).toBeNull()
    expect(cycleRecent(null, 'a')).toBeNull()
  })

  it('与 recordRecent 联动: 记录后循环完整（去重不破坏顺序）', () => {
    let list = recordRecent([], 'a')
    list = recordRecent(list, 'b')
    list = recordRecent(list, 'a')
    expect(list).toEqual(['a', 'b'])
    expect(cycleRecent(list, 'a')).toBe('b')
    expect(cycleRecent(list, 'b')).toBe('a')
  })
})
