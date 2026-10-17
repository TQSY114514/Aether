// ─────────────────────────────────────────────────────────────────────────────
// test/queueDock.test.js — Tests for QueueDock actions in chatSlice
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest'
import { createStore } from 'zustand'
import { createChatSlice } from '../src/store/chatSlice'

describe('QueueDock chatSlice actions', () => {
  let store

  beforeEach(() => {
    store = createStore((set, get) => ({
      ...createChatSlice(set, get),
      currentSessionId: 1,
      triggerHint: () => {},
    }))
  })

  it('enqueues messages and preserves order', () => {
    store.getState().enqueueMessage('first')
    store.getState().enqueueMessage('second')
    store.getState().enqueueMessage('third')

    const queued = store.getState().queuedMessages
    expect(queued.length).toBe(3)
    expect(queued[0].content).toBe('first')
    expect(queued[1].content).toBe('second')
    expect(queued[2].content).toBe('third')
  })

  it('reorders queued items correctly', () => {
    store.getState().enqueueMessage('item 0')
    store.getState().enqueueMessage('item 1')
    store.getState().enqueueMessage('item 2')

    // Move item 2 to index 0
    store.getState().reorderQueued(2, 0)
    let queued = store.getState().queuedMessages
    expect(queued.map((q) => q.content)).toEqual(['item 2', 'item 0', 'item 1'])

    // Move item 0 to index 2
    store.getState().reorderQueued(0, 2)
    queued = store.getState().queuedMessages
    expect(queued.map((q) => q.content)).toEqual(['item 0', 'item 1', 'item 2'])

    // Out of bounds is safely ignored
    store.getState().reorderQueued(-1, 2)
    store.getState().reorderQueued(0, 99)
    expect(store.getState().queuedMessages.map((q) => q.content)).toEqual(['item 0', 'item 1', 'item 2'])
  })

  it('updates a queued message content', () => {
    store.getState().enqueueMessage('original')
    const id = store.getState().queuedMessages[0].id

    store.getState().updateQueued(id, 'updated content')
    expect(store.getState().queuedMessages[0].content).toBe('updated content')
  })

  it('removes a specific item and clears the entire queue', () => {
    store.getState().enqueueMessage('one')
    store.getState().enqueueMessage('two')
    const idOne = store.getState().queuedMessages[0].id

    store.getState().removeQueued(idOne)
    expect(store.getState().queuedMessages.length).toBe(1)
    expect(store.getState().queuedMessages[0].content).toBe('two')

    store.getState().clearQueued()
    expect(store.getState().queuedMessages.length).toBe(0)
  })
})
