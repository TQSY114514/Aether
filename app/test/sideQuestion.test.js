// ─────────────────────────────────────────────────────────────────────────────
// test/sideQuestion.test.js — Tests for Side Questions (BTW mode)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { registerChatHandlers } = require('../electron/ipc/chat.handler')

describe('Side Questions (BTW)', () => {
  it('validates input parameters and rejects missing question or sessionId', async () => {
    const handlers = new Map()
    const ipcMain = {
      handle: (channel, fn) => handlers.set(channel, fn),
      on: () => {},
    }
    const db = { getSetting: () => null }
    const getWebContents = () => null

    registerChatHandlers(ipcMain, db, getWebContents)

    const askSide = handlers.get('chat:ask-side')
    expect(askSide).toBeDefined()

    const res1 = await askSide(null, {})
    expect(res1.ok).toBe(false)
    expect(res1.error).toContain('required')

    const res2 = await askSide(null, { sessionId: 1, question: '   ' })
    expect(res2.ok).toBe(false)
    expect(res2.error).toContain('required')
  })

  it('queries read-only messages without writing to message table', async () => {
    const handlers = new Map()
    const ipcMain = {
      handle: (channel, fn) => handlers.set(channel, fn),
      on: () => {},
    }

    let addMessageCalled = false
    const db = {
      getSetting: () => null,
      getSession: () => ({ id: 42, config: JSON.stringify({ modelId: 1 }) }),
      getModel: () => ({ id: 1, model_name: 'test-model', provider_id: 10 }),
      getProvider: () => ({ id: 10, api_url: 'http://localhost', api_key: 'key', api_format: 'openai' }),
      getAllModels: () => [{ id: 1 }],
      getMessages: vi.fn(() => [
        { role: 'user', content: 'What is the port?' },
        { role: 'assistant', content: 'The server runs on port 3000.' },
      ]),
      addMessage: () => {
        addMessageCalled = true
      },
    }

    const events = []
    const getWebContents = () => ({
      send: (evt, payload) => events.push({ evt, payload }),
    })

    // Mock streamChat via providerAdapter
    const providerAdapter = require('../electron/llm/providerAdapter')
    const origStream = providerAdapter.streamChat
    providerAdapter.streamChat = async function* () {
      yield 'The port is '
      yield '3000.'
    }

    try {
      registerChatHandlers(ipcMain, db, getWebContents)
      const askSide = handlers.get('chat:ask-side')

      const result = await askSide(null, { sessionId: 42, question: 'Confirm the port please' })
      expect(result.ok).toBe(true)
      expect(result.answer).toBe('The port is 3000.')

      // Verify ZERO writes to message table
      expect(addMessageCalled).toBe(false)
      expect(db.getMessages).toHaveBeenCalledWith(42)

      // Verify streamed chunks to webContents
      const chunks = events.filter((e) => e.evt === 'chat:side-chunk')
      expect(chunks.length).toBeGreaterThan(0)
      const finalChunk = chunks[chunks.length - 1]
      expect(finalChunk.payload.done).toBe(true)
      expect(finalChunk.payload.fullContent).toBe('The port is 3000.')
    } finally {
      providerAdapter.streamChat = origStream
    }
  })

  it('supports stopping / aborting in-flight side questions via chat:stop-side', async () => {
    const handlers = new Map()
    const ipcMain = {
      handle: (channel, fn) => handlers.set(channel, fn),
      on: () => {},
    }
    const db = { getSetting: () => null }
    registerChatHandlers(ipcMain, db, () => null)

    const stopSide = handlers.get('chat:stop-side')
    expect(stopSide).toBeDefined()
    const res = await stopSide(null, 42)
    expect(res.ok).toBe(true)
  })
})
