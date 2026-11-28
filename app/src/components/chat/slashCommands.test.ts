import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from '@/store'
import { executeTypedSlashCommand } from './slashCommands'

describe('slashCommands P0 UX safety', () => {
  beforeEach(() => {
    useStore.setState({
      currentSessionId: 42,
      messages: [{ id: 1, session_id: 42, role: 'user', content: 'hi' } as any],
      toasts: [],
    })
  })

  it('requires confirmation before /clear deletes session messages', async () => {
    const deleteAfter = vi.fn(async () => ({}))
    const list = vi.fn(async () => [])
    ;(globalThis as any).window = {
      confirm: vi.fn(() => false),
      electronAPI: {
        message: { deleteAfter, list },
      },
    }

    const handled = await executeTypedSlashCommand('/clear', () => {})
    expect(handled).toBe(true)
    expect((globalThis as any).window.confirm).toHaveBeenCalledTimes(1)
    expect(deleteAfter).not.toHaveBeenCalled()
  })

  it('deletes session messages and shows toast when /clear is confirmed', async () => {
    const deleteAfter = vi.fn(async () => ({}))
    const list = vi.fn(async () => [])
    ;(globalThis as any).window = {
      confirm: vi.fn(() => true),
      electronAPI: {
        message: { deleteAfter, list },
      },
    }

    const handled = await executeTypedSlashCommand('/clear', () => {})
    expect(handled).toBe(true)
    expect(deleteAfter).toHaveBeenCalledWith(42, 0)
    expect(useStore.getState().toasts.length).toBeGreaterThan(0)
  })

  it('uses non-blocking toast instead of window.alert when /review has no session', async () => {
    useStore.setState({ currentSessionId: null, toasts: [] })
    const alertSpy = vi.fn()
    ;(globalThis as any).window = {
      alert: alertSpy,
      electronAPI: {
        git: { getDiffForReview: async () => ({ success: true, suggestedReviewPrompt: 'review' }) },
      },
    }

    await executeTypedSlashCommand('/review', () => {})
    expect(alertSpy).not.toHaveBeenCalled()
    expect(useStore.getState().toasts.length).toBeGreaterThan(0)
  })

  it('exports session as Markdown via /export and triggers toast', async () => {
    const clickSpy = vi.fn()
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    ;(globalThis as any).URL = { createObjectURL, revokeObjectURL }
    ;(globalThis as any).document = {
      createElement: vi.fn(() => ({ href: '', download: '', click: clickSpy })),
    }
    useStore.setState({
      currentSessionId: 42,
      sessions: [{ id: 42, title: 'My Session', persona_id: null, created_at: '2026-01-01', updated_at: '2026-01-01', pinned: 0 }],
      messages: [{ id: 1, session_id: 42, role: 'user', content: 'hi there' } as any],
      toasts: [],
    })

    const handled = await executeTypedSlashCommand('/export', () => {})
    expect(handled).toBe(true)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
    expect(useStore.getState().toasts.some((t) => t.type === 'success')).toBe(true)
  })
})
