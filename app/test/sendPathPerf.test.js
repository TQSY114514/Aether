// Regression tests for send-path freeze / main-thread blocking fixes.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Module from 'node:module'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const nodeRequire = createRequire(import.meta.url)

describe('database metadata queries, decrypt cache & slim reads', () => {
  let database
  let tmpDir = null
  let restoredElectronEntry
  let decryptCalls = 0

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-send-perf-'))
    const electronPath = nodeRequire.resolve('electron')
    restoredElectronEntry = nodeRequire.cache[electronPath]
    nodeRequire.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: {
        app: { getPath: () => tmpDir },
        safeStorage: {
          isEncryptionAvailable: () => true,
          encryptString: (s) => Buffer.from(`enc:${s}`, 'utf8'),
          decryptString: (buf) => {
            decryptCalls++
            const str = buf.toString('utf8')
            return str.startsWith('enc:') ? str.slice(4) : str
          },
        },
      },
    }
    const dbModPath = nodeRequire.resolve('../electron/database')
    delete nodeRequire.cache[dbModPath]
    database = nodeRequire('../electron/database')
    database.initDatabase()
  })

  afterAll(() => {
    if (database && typeof database.closeDatabase === 'function') database.closeDatabase()
    const electronPath = nodeRequire.resolve('electron')
    if (restoredElectronEntry === undefined) delete nodeRequire.cache[electronPath]
    else nodeRequire.cache[electronPath] = restoredElectronEntry
    try { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  })

  it('performs zero safeStorage.decryptString calls in getProvidersMetadata / getAllModelsMetadata / buildTopologyPromptXml', () => {
    const p = database.addProvider({
      name: 'FastProvider',
      api_url: 'https://api.example.com/v1',
      api_key: 'sk-super-secret-perf-key-1234',
      api_format: 'openai',
      enabled: 1,
    })
    database.addModel({ provider_id: p.lastInsertRowid, model_name: 'model-a', is_primary: 1 })
    database.addModel({ provider_id: p.lastInsertRowid, model_name: 'model-b' })
    database.addModel({ provider_id: p.lastInsertRowid, model_name: 'model-c' })

    decryptCalls = 0
    const providersMeta = database.getProvidersMetadata()
    const modelsMeta = database.getAllModelsMetadata()
    expect(providersMeta.length).toBeGreaterThanOrEqual(1)
    expect(modelsMeta.length).toBe(3)
    expect(providersMeta[0].api_key).toBeUndefined()
    expect(modelsMeta[0].api_key).toBeUndefined()
    expect(decryptCalls).toBe(0)

    const { buildTopologyPromptXml } = nodeRequire('../electron/llm/providerTopology')
    const xml = buildTopologyPromptXml(database)
    expect(xml).toContain('FastProvider')
    expect(xml).toContain('model-a')
    expect(decryptCalls).toBe(0)

    // Decrypted path caches per ciphertext so N models sharing one provider key decrypt only once.
    const decryptedModels = database.getAllModels()
    expect(decryptedModels).toHaveLength(3)
    expect(decryptedModels[0].api_key).toBe('sk-super-secret-perf-key-1234')
    expect(decryptCalls).toBe(1)

    // Subsequent calls hit cache -> 0 additional DPAPI decrypts.
    database.getAllModels()
    database.getProvider(p.lastInsertRowid)
    expect(decryptCalls).toBe(1)
  })

  it('omits attachment blobs in getMessagesForContext and truncates last_message in getSessions', () => {
    const s = database.createSession({ title: 'Perf Chat' })
    const sid = s.lastInsertRowid
    const hugeBody = 'A'.repeat(5000)
    database.addMessage({
      session_id: sid,
      role: 'user',
      content: hugeBody,
      attachment: JSON.stringify({ name: 'img.png', kind: 'image', all: [{ name: 'img.png', preview: 'data:image/png;base64,AAAA' }] }),
    })

    const ctxMsgs = database.getMessagesForContext(sid)
    expect(ctxMsgs).toHaveLength(1)
    expect(ctxMsgs[0].role).toBe('user')
    expect(ctxMsgs[0].content).toBe(hugeBody)
    expect(ctxMsgs[0].attachment).toBeUndefined()

    const sessions = database.getSessions()
    const row = sessions.find((x) => x.id === sid)
    expect(row).toBeTruthy()
    expect(row.last_message.length).toBeLessThanOrEqual(2000)
  })

  it('caps getMemoriesScoped with limit and batches incrementMemoryAccessBatch', () => {
    const ids = []
    for (let i = 0; i < 6; i++) {
      const res = database.addMemory({ content: `fact number ${i} unique-${i}`, type: 'fact' })
      ids.push(res.lastInsertRowid)
    }

    const limited = database.getMemoriesScoped(null, 3)
    expect(limited).toHaveLength(3)

    database.incrementMemoryAccessBatch(ids.slice(0, 3))
    const rows = database.getMemoriesScoped(null)
    const touched = rows.filter((r) => ids.slice(0, 3).includes(r.id))
    expect(touched.every((r) => Number(r.access_count) >= 1)).toBe(true)
  })
})

describe('chat:send hot-path avoids blocking recall, redundant decrypts, and attachment duplication', () => {
  const origLoad = Module._load
  let handlers = {}
  let addedMessages = []
  let recallCalls = 0
  let syncFileCalls = 0
  let getAllModelsCalls = 0
  let getAllModelsMetadataCalls = 0
  let getMessagesCalls = 0
  let getMessagesForContextCalls = 0
  let tmpWs = null

  beforeAll(() => {
    tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-chat-send-perf-'))
    const fakeWc = { send: () => {}, isDestroyed: () => false }
    const fakeIpcMain = { handle: (ch, fn) => { handlers[ch] = fn }, on: () => {} }
    const fakeDb = {
      getSetting: () => '1',
      addMessage: (m) => { addedMessages.push(m); return { lastInsertRowid: addedMessages.length } },
      touchSession: () => {},
      getModel: () => ({ id: 1, provider_id: 10, model_name: 'gpt-test', context_window: 32000 }),
      getProvider: () => ({ id: 10, name: 'pTest', api_url: 'https://api.example.com', api_key: 'k', api_format: 'openai', enabled: 1 }),
      getAllModels: () => { getAllModelsCalls++; return [] },
      getAllModelsMetadata: () => { getAllModelsMetadataCalls++; return [{ id: 1, provider_id: 10, provider_name: 'pTest', model_name: 'gpt-test' }] },
      getModelScores: () => [],
      getFallbackChain: () => [],
      getMessages: () => { getMessagesCalls++; return [{ id: 1, role: 'user', content: 'hi' }] },
      getMessagesForContext: () => { getMessagesForContextCalls++; return [{ id: 1, role: 'user', content: 'hi' }] },
      getSession: () => ({ id: 1, title: 'Chat', persona_id: null, cwd: tmpWs, config: null }),
      getPersona: () => null,
      updateMessage: () => {},
      logUsage: () => {},
      classifyIntent: () => 'general',
      setSessionConfig: () => {},
    }

    Module._load = function (request, parent, ...rest) {
      if (parent?.filename && (parent.filename.includes('chat-send.handler.js') || parent.filename.includes('chat.handler.js'))) {
        const stubs = {
          '../llm/providerAdapter': {
            completeChat: async () => ({ content: 'title' }),
            normalizeUsage: (u) => u,
            streamChat: async function* () { yield 'ok' },
          },
          '../llm/compaction': {
            maybeCompact: async (x) => x.messages,
            estimateMessagesTokens: () => 10,
            estimateTextTokens: () => 2,
            foldStaleToolOutputs: (m) => m,
          },
          '../llm/autoMemory': {
            prefetchWithDetails: () => ({ text: '', hits: [] }),
            prefetch: () => '',
            recall: async () => { recallCalls++; return 'should not run' },
            sync: () => {},
            reinforceEchoes: () => {},
          },
          '../llm/memoryProjector': {
            getLastProjectedContent: () => null,
            syncMemoryFileToDb: () => { syncFileCalls++; return { success: true } },
            debounceProjectWorkspaceMemory: () => {},
          },
          '../tools/sandbox': {
            isAuthorizedWorkspace: () => true,
            isWorkspaceTrusted: () => true,
          },
          '../llm/habitLearner': {
            proactiveSuggest: () => {},
            detectAndLearn: () => {},
            confirmHabit: () => {},
            dismissHabit: () => {},
          },
          '../llm/skills': { formatSkillsForPrompt: () => '' },
          '../llm/providerHealth': { isHealthy: () => true, recordResult: () => {}, recordError: () => {}, setCooldown: () => {} },
          '../utils/cost': { computeCost: () => 0 },
          '../logger': { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} },
        }
        if (request in stubs) return stubs[request]
      }
      return origLoad.apply(this, [request, parent, ...rest])
    }

    const handlerPath = nodeRequire.resolve('../electron/ipc/chat.handler')
    const sendHandlerPath = nodeRequire.resolve('../electron/ipc/chat-send.handler')
    delete nodeRequire.cache[handlerPath]
    delete nodeRequire.cache[sendHandlerPath]
    const { registerChatHandlers } = nodeRequire('../electron/ipc/chat.handler')
    registerChatHandlers(fakeIpcMain, fakeDb, () => fakeWc)
  })

  afterAll(() => {
    Module._load = origLoad
    try { if (tmpWs) fs.rmSync(tmpWs, { recursive: true, force: true }) } catch {}
  })

  it('uses metadata/context queries, skips blocking autoMemory.recall, deduplicates attachment preview, and caches MEMORY.md mtime', async () => {
    addedMessages = []
    recallCalls = 0
    syncFileCalls = 0
    getAllModelsCalls = 0
    getAllModelsMetadataCalls = 0
    getMessagesCalls = 0
    getMessagesForContextCalls = 0

    await handlers['chat:send']({}, {
      sessionId: 1,
      content: 'hello',
      modelId: 1,
      useTools: false,
      attachments: [{ name: 'shot.png', mime: 'image/png', kind: 'image', dataUrl: 'data:image/png;base64,XYZ' }],
    })

    expect(getAllModelsMetadataCalls).toBe(1)
    expect(getAllModelsCalls).toBe(0)
    expect(getMessagesForContextCalls).toBe(1)
    expect(getMessagesCalls).toBe(0)
    expect(recallCalls).toBe(0)
    expect(syncFileCalls).toBe(0) // no MEMORY.md file

    const userInsert = addedMessages.find((m) => m.role === 'user')
    const att = JSON.parse(userInsert.attachment)
    expect(att.all).toEqual([{ name: 'shot.png', preview: 'data:image/png;base64,XYZ' }])
    expect(att.preview).toBeUndefined()

    // Create MEMORY.md -> sync runs once, then skips on identical mtime.
    const memPath = path.join(tmpWs, 'MEMORY.md')
    fs.writeFileSync(memPath, '- fact: hello\n')
    await handlers['chat:send']({}, { sessionId: 1, content: 'turn 2', modelId: 1, useTools: false })
    expect(syncFileCalls).toBe(1)

    await handlers['chat:send']({}, { sessionId: 1, content: 'turn 3', modelId: 1, useTools: false })
    expect(syncFileCalls).toBe(1)
  })
})

describe('codeUnderstanding async walk & repoMap cached turn start', () => {
  it('listSourceFilesAsync yields the same files as listSourceFiles', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-cu-async-'))
    try {
      fs.mkdirSync(path.join(tmp, 'src'))
      fs.writeFileSync(path.join(tmp, 'src', 'a.js'), 'export const a = 1\n')
      fs.writeFileSync(path.join(tmp, 'src', 'b.ts'), 'export const b = 2\n')
      const { listSourceFiles, listSourceFilesAsync } = nodeRequire('../electron/context/codeUnderstanding')
      const syncFiles = listSourceFiles(tmp).sort()
      const asyncFiles = (await listSourceFilesAsync(tmp)).sort()
      expect(asyncFiles).toEqual(syncFiles)
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
    }
  })

  it('buildRepoMapMessage reuses cached map within TTL without re-walking', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-repomap-ttl-'))
    try {
      fs.mkdirSync(path.join(tmp, 'src'))
      fs.writeFileSync(path.join(tmp, 'src', 'a.js'), 'export function foo() {}\n')
      const repoMap = nodeRequire('../electron/context/repoMap')
      repoMap.invalidateCache(tmp)
      const msg1 = await repoMap.buildRepoMapMessage({ rootDir: tmp, userMessage: 'check foo' })
      expect(msg1?.content).toContain('foo')
      const cachedBefore = repoMap.getCachedMap(tmp)
      // Remove directory to prove second call within TTL hits memory cache instead of walking disk.
      fs.rmSync(tmp, { recursive: true, force: true })
      const msg2 = await repoMap.buildRepoMapMessage({ rootDir: tmp, userMessage: 'check foo' })
      expect(repoMap.getCachedMap(tmp)).toBe(cachedBefore)
      expect(msg2?.content).toContain('foo')
      repoMap.invalidateCache(tmp)
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
    }
  })

  it('buildRepoMapMessage honors options.force even when a cached map exists', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-repomap-force-'))
    try {
      fs.mkdirSync(path.join(tmp, 'src'))
      fs.writeFileSync(path.join(tmp, 'src', 'a.js'), 'export function alpha() {}\n')
      const repoMap = nodeRequire('../electron/context/repoMap')
      repoMap.invalidateCache(tmp)
      const msg1 = await repoMap.buildRepoMapMessage({ rootDir: tmp, userMessage: 'check alpha' })
      expect(msg1?.content).toContain('alpha')
      const cached1 = repoMap.getCachedMap(tmp)

      fs.writeFileSync(path.join(tmp, 'src', 'b.js'), 'export function beta() {}\n')
      const msg2 = await repoMap.buildRepoMapMessage({ rootDir: tmp, userMessage: 'check beta', force: true })
      expect(repoMap.getCachedMap(tmp)).not.toBe(cached1)
      expect(msg2?.content).toContain('beta')
      repoMap.invalidateCache(tmp)
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
    }
  })
})
