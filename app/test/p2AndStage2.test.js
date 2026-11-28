import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import Module from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)

describe('Phase 5 P2 & Stage 2 Backend Fixes', () => {
  it('composer.nextPromptPrediction feature flag defaults to false and toggles cleanly', () => {
    const featureFlags = require('../electron/featureFlags')
    expect(featureFlags.has('composer.nextPromptPrediction')).toBe(true)
    const def = featureFlags.defs().find(d => d.key === 'composer.nextPromptPrediction')
    expect(def).toMatchObject({ key: 'composer.nextPromptPrediction', default: false, category: 'ux' })
    expect(featureFlags.isEnabled(null, 'composer.nextPromptPrediction')).toBe(false)
  })

  it('chat:predict-next returns empty suggestion when disabled and concise single-line suggestion when enabled', async () => {
    const origLoad = Module._load
    let flagEnabled = false
    let capturedCall = null
    let mockCompletion = '  "Run the unit tests next"  \nExtra explanation ignored'

    Module._load = function (request, parent, ...rest) {
      if (request === 'electron') return { app: { getPath: () => os.tmpdir() } }
      if (parent?.filename?.includes('chat.handler.js') && request === '../llm/providerAdapter') {
        return {
          completeChat: async (args) => {
            capturedCall = args
            if (typeof mockCompletion === 'function') return mockCompletion(args)
            return mockCompletion
          },
          streamChat: async function* () {},
          normalizeUsage: (u) => u,
        }
      }
      return origLoad.apply(this, [request, parent, ...rest])
    }

    try {
      const chatHandlerPath = require.resolve('../electron/ipc/chat.handler')
      delete require.cache[chatHandlerPath]
      const { registerChatHandlers } = require('../electron/ipc/chat.handler')
      const handlers = {}
      const fakeIpcMain = { handle: (ch, fn) => { handlers[ch] = fn }, on: () => {} }
      const fakeDb = {
        getSetting: (k) => (k === 'feature_flag.composer.nextPromptPrediction' ? (flagEnabled ? '1' : '0') : null),
        getMessagesForContext: () => [
          { id: 1, role: 'user', content: 'Fix the timeout in compaction.js' },
          { id: 2, role: 'assistant', content: 'I updated summarizeHistory to use AbortController.' },
        ],
        getSession: () => ({ id: 42, config: null }),
        getModel: (id) => ({ id: Number(id) || 1, provider_id: 10, model_name: 'gpt-4o-mini' }),
        getProvider: () => ({ id: 10, name: 'OpenAI', api_url: 'https://api.openai.com/v1', api_key: 'sk-test', api_format: 'openai' }),
        getAllModelsMetadata: () => [{ id: 1, provider_id: 10, model_name: 'gpt-4o-mini' }],
      }
      registerChatHandlers(fakeIpcMain, fakeDb, () => ({ send: () => {}, isDestroyed: () => false }))

      // 1. Disabled by default -> returns { suggestion: '' } without calling LLM
      const offRes = await handlers['chat:predict-next']({}, { sessionId: 42, modelId: 1 })
      expect(offRes).toEqual({ suggestion: '' })
      expect(capturedCall).toBeNull()

      // 2. Enabled -> calls non-streaming completeChat with max_tokens: 48 and trims to 1 line
      flagEnabled = true
      const onRes = await handlers['chat:predict-next']({}, { sessionId: 42, modelId: 1 })
      expect(onRes).toEqual({ suggestion: 'Run the unit tests next' })
      expect(capturedCall?.options?.max_tokens).toBe(48)
      expect(capturedCall?.signal).toBeInstanceOf(AbortSignal)

      // 3. Sentinel NONE or thrown error -> gracefully returns { suggestion: '' }
      mockCompletion = 'NONE'
      expect(await handlers['chat:predict-next']({}, { sessionId: 42, modelId: 1 })).toEqual({ suggestion: '' })
      mockCompletion = () => { throw new Error('network down') }
      expect(await handlers['chat:predict-next']({}, { sessionId: 42, modelId: 1 })).toEqual({ suggestion: '' })
    } finally {
      Module._load = origLoad
    }
  })

  it('initDatabase stamps db.startup_backfill_v1 so warm restarts skip repeat mergeDuplicateMemories and backfill scans while addModel still inits scores', () => {
    const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-p2-db-'))
    const origLoad = Module._load
    Module._load = function (request, ...args) {
      if (request === 'electron') {
        return {
          app: { getPath: () => tmpUserData },
          safeStorage: { isEncryptionAvailable: () => false },
        }
      }
      return origLoad.apply(this, [request, ...args])
    }

    try {
      const dbModPath = require.resolve('../electron/database')
      delete require.cache[dbModPath]
      const database = require('../electron/database')

      // First boot runs startup backfills and records db.startup_backfill_v1 = '1'
      const db1 = database.initDatabase()
      expect(database.getSetting('db.startup_backfill_v1')).toBe('1')
      const p = database.addProvider({ name: 'TestP', api_url: 'https://api.example.com/v1', api_key: 'k', api_format: 'openai' })

      // Insert duplicate memories bypassing dedup directly via SQL to observe whether warm restart skips mergeDuplicateMemories
      db1.prepare("INSERT INTO memory (content, type, content_norm) VALUES ('dup item', 'fact', 'dup item')").run()
      db1.prepare("INSERT INTO memory (content, type, content_norm) VALUES ('dup item', 'fact', 'dup item')").run()
      database.closeDatabase()

      // Warm restart: stamped DB skips repeat mergeDuplicateMemories() full-table scan
      delete require.cache[dbModPath]
      const database2 = require('../electron/database')
      const db2 = database2.initDatabase()
      const dupCount = db2.prepare("SELECT COUNT(*) AS c FROM memory WHERE content = 'dup item'").get().c
      expect(dupCount).toBe(2)

      // Newly added model after startup stamp still initializes model_score rows
      const m = database2.addModel({ provider_id: p.lastInsertRowid, model_name: 'late-added-model' })
      const scoreRows = db2.prepare('SELECT COUNT(*) AS c FROM model_score WHERE model_id = ?').get(m.lastInsertRowid).c
      expect(scoreRows).toBe(5)
      database2.closeDatabase()
    } finally {
      Module._load = origLoad
      try { fs.rmSync(tmpUserData, { recursive: true, force: true }) } catch {}
    }
  })

  it('knowledgeGraph.searchGraph bounds keyword lookups and edge query LIMIT on long prompts', () => {
    const knowledgeGraph = require('../electron/llm/knowledgeGraph')
    const nodeQueries = []
    const edgeQueries = []

    const fakeDb = {
      getMemories: () => [
        { id: 1, content: 'alpha relates to beta_neighbor', created_at: '2026-01-01' },
      ],
      allRows: (sql, params = []) => {
        if (sql.includes('FROM kg_nodes')) {
          nodeQueries.push({ sql, params })
          return [{ entity: 'alpha', type: 'entity' }]
        }
        if (sql.includes('FROM kg_edges')) {
          edgeQueries.push({ sql, params })
          return sql.includes('"from" = ?') ? [{ to: 'beta_neighbor', relation: 'uses', confidence: 0.9 }] : []
        }
        return []
      },
    }

    // Long prompt with 25 distinct keywords
    const longPrompt = Array.from({ length: 25 }, (_, i) => `keyword${i}`).join(' ')
    const results = knowledgeGraph.searchGraph(fakeDb, longPrompt, 5)

    expect(nodeQueries.length).toBeLessThanOrEqual(6)
    expect(edgeQueries.length).toBeGreaterThan(0)
    for (const eq of edgeQueries) {
      expect(eq.sql).toContain('LIMIT')
    }
    expect(results.some(r => r.id === 1)).toBe(true)
  })
})
