// ─────────────────────────────────────────────────────────────────────────────
// chat-send-title.test.js — auto-title decision logic (pure functions)
//
// Regression for "会话不自动生成标题": previously the AI-summary title only
// ran on the FIRST exchange (msgs.length === 1) AND only after a successful
// stream. If the first turn was aborted or the summary request was rejected
// upstream (429), the session title stayed "新会话" forever — later turns had
// msgs >= 2 so the condition never re-fired. Fix: (a) write an immediate
// quick-cut title at send time (title is ALWAYS visible), (b) let the AI
// summary upgrade re-fire on later successful turns while the title is still
// the quick-cut shape.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { shouldWriteQuickTitle, shouldTryAiSummary, quickTitleOf } from '../electron/ipc/chat-send.handler'

describe('chat-send auto-title decision', () => {
  describe('shouldWriteQuickTitle (immediate fallback title)', () => {
    it('writes on the first message of a placeholder-titled session', () => {
      expect(shouldWriteQuickTitle({ autoTitleOn: true, sessionTitle: '新会话', msgsLen: 1 })).toBe(true)
      expect(shouldWriteQuickTitle({ autoTitleOn: true, sessionTitle: 'New Chat', msgsLen: 1 })).toBe(true)
    })

    it('does not write when autoTitle is off', () => {
      expect(shouldWriteQuickTitle({ autoTitleOn: false, sessionTitle: '新会话', msgsLen: 1 })).toBe(false)
    })

    it('does not write when the session already has a real title', () => {
      expect(shouldWriteQuickTitle({ autoTitleOn: true, sessionTitle: '区块链讲解', msgsLen: 1 })).toBe(false)
    })

    it('does not write when this is not the first exchange (msgs >= 2)', () => {
      expect(shouldWriteQuickTitle({ autoTitleOn: true, sessionTitle: '新会话', msgsLen: 2 })).toBe(false)
      expect(shouldWriteQuickTitle({ autoTitleOn: true, sessionTitle: '新会话', msgsLen: 4 })).toBe(false)
    })
  })

  describe('shouldTryAiSummary (AI title upgrade)', () => {
    it('fires on a placeholder title even after the first turn failed (msgs > 1)', () => {
      // 关键回归: 首轮中止/失败后标题仍是占位符 → 后续成功回合仍要尝试 AI 摘要
      expect(shouldTryAiSummary({ autoTitleOn: true, sessionTitle: '新会话', content: '你好' })).toBe(true)
    })

    it('fires while the title is still the quick-cut shape (immediate fallback, not yet upgraded)', () => {
      const content = '用费曼学习法教我一个你假设我完全不懂的概念：区块链'
      const quick = quickTitleOf(content)
      expect(quick).toBe('用费曼学习法教我一个你假设我完全不懂的概念：区块链')
      expect(shouldTryAiSummary({ autoTitleOn: true, sessionTitle: quick, content })).toBe(true)
    })

    it('does not fire once the title has been upgraded to a real summary', () => {
      expect(shouldTryAiSummary({ autoTitleOn: true, sessionTitle: '费曼学习法讲解', content: '用费曼学习法教我一个你假设我完全不懂的概念' })).toBe(false)
    })

    it('does not fire when autoTitle is off', () => {
      expect(shouldTryAiSummary({ autoTitleOn: false, sessionTitle: '新会话', content: 'x' })).toBe(false)
    })

    it('does not fire on an empty content (no quick-cut shape to match)', () => {
      expect(shouldTryAiSummary({ autoTitleOn: true, sessionTitle: '', content: '' })).toBe(false)
    })
  })

  describe('quickTitleOf', () => {
    it('collapses whitespace and keeps the FULL first message (capped at 200)', () => {
      expect(quickTitleOf('  hello   world  ')).toBe('hello world')
      // 30 字内不再截断——完整保留(寒暄开头也不丢主题)
      expect(quickTitleOf('你好，谢谢你上次的帮助！另外我想问一下，那个生产环境部署失败的问题')).toBe('你好，谢谢你上次的帮助！另外我想问一下，那个生产环境部署失败的问题')
      // 仅极端粘贴(代码/日志)防膨胀: 200 字上限
      expect(quickTitleOf('a'.repeat(250))).toBe('a'.repeat(200))
    })

    it('returns empty string for empty input', () => {
      expect(quickTitleOf('')).toBe('')
      expect(quickTitleOf(null)).toBe('')
    })
  })
})
