import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'module'
import Module from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'node:child_process'

const require = createRequire(import.meta.url)

describe('Phase 3 P1 Backend & Runtime Fixes', () => {
  it('readFileSliced preserves multi-byte UTF-8 characters across 64KB chunk and maxBytes boundaries', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-p1-utf8-'))
    try {
      const target = path.join(tmpDir, 'utf8-boundary.txt')
      // 500 lines x 130 bytes = 65000 bytes, then line 501 places 3-byte '中' at bytes 65534..65536
      // so the 64KB (65536) CHUNK_SIZE boundary splits '中' directly mid-character.
      const padLines = Array.from({ length: 500 }, () => 'x'.repeat(129)).join('\n')
      const boundaryLine = 'a'.repeat(533) + '中end-of-line-501'
      const emojiLine = 'line-502-🚀-emoji'
      fs.writeFileSync(target, `${padLines}\n${boundaryLine}\n${emojiLine}\n`, 'utf8')

      const { getTool } = require('../electron/tools/registry')
      const readTool = getTool('read_file')

      const sliceRes = readTool.run({ path: target, offset: 501, limit: 2 }, { agentMode: 'yolo' })
      expect(sliceRes).not.toContain('\uFFFD')
      expect(sliceRes).toContain('中end-of-line-501')
      expect(sliceRes).toContain('line-502-🚀-emoji')

      // Fast-path byte-capped full read with a 3-byte char straddling byte 65536 must omit partial char without U+FFFD
      const fastTarget = path.join(tmpDir, 'utf8-fast-cap.txt')
      fs.writeFileSync(fastTarget, 'a'.repeat(65534) + '中tail', 'utf8')
      const fullRes = readTool.run({ path: fastTarget }, { agentMode: 'yolo' })
      expect(fullRes).not.toContain('\uFFFD')
      expect(fullRes).toContain('[truncated,')
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    }
  })

  it('checkpointManager shouldAutoCheckpoint uses step & token deltas instead of firing every round >= 8000 tokens', () => {
    const Database = require('better-sqlite3')
    const checkpointMgr = require('../electron/llm/checkpointManager')
    checkpointMgr.resetAutoCheckpointState()

    const hugeMsgs = [{ role: 'user', content: 'A'.repeat(40000) }] // ~10k tokens
    // Step 0 and step 1 should not trigger unconditionally just because total >= 8000
    expect(checkpointMgr.shouldAutoCheckpoint(0, hugeMsgs)).toBe(false)
    expect(checkpointMgr.shouldAutoCheckpoint(1, hugeMsgs)).toBe(false)

    // With recorded baseline at step 0 (~12k tokens), small growth on steps 1..4 must NOT fire
    expect(checkpointMgr.shouldAutoCheckpoint(2, hugeMsgs, { lastStep: 0, lastTokens: 12000 })).toBe(false)
    expect(checkpointMgr.shouldAutoCheckpoint(3, hugeMsgs, { lastStep: 0, lastTokens: 12000 })).toBe(false)
    expect(checkpointMgr.shouldAutoCheckpoint(4, hugeMsgs, { lastStep: 0, lastTokens: 12000 })).toBe(false)

    // Step 5 still triggers periodic every-5-steps checkpoint
    expect(checkpointMgr.shouldAutoCheckpoint(5, hugeMsgs, { lastStep: 0, lastTokens: 12000 })).toBe(true)

    // Meaningful token growth (>= 4000) + step delta (>= 2) triggers mid-window checkpoint
    const largerMsgs = [...hugeMsgs, { role: 'assistant', content: 'B'.repeat(24000) }]
    expect(checkpointMgr.shouldAutoCheckpoint(3, largerMsgs, { lastStep: 1, lastTokens: 12000 })).toBe(true)

    // Session state updated by save() prevents back-to-back saves on step 6, 7
    const db = new Database(':memory:')
    checkpointMgr.createTable(db)
    checkpointMgr.save(db, 777, 0, 5, hugeMsgs, [])
    expect(checkpointMgr.shouldAutoCheckpoint(6, hugeMsgs, { sessionId: 777 })).toBe(false)
    expect(checkpointMgr.shouldAutoCheckpoint(7, hugeMsgs, { sessionId: 777 })).toBe(false)
    db.close()
  })

  it('checkpoints async helpers capture git/dir snapshots without blocking and cache gitRoot', { timeout: 20000 }, async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-p1-ck-'))
    const checkpoints = require('../electron/llm/checkpoints')
    checkpoints.clearGitRootCache()
    try {
      execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore', windowsHide: true })
      execFileSync('git', ['config', 'user.email', 'test@aether.local'], { cwd: tmpDir, stdio: 'ignore', windowsHide: true })
      execFileSync('git', ['config', 'user.name', 'Aether Test'], { cwd: tmpDir, stdio: 'ignore', windowsHide: true })
      const file = path.join(tmpDir, 'a.txt')
      fs.writeFileSync(file, 'hello\n', 'utf8')
      execFileSync('git', ['add', 'a.txt'], { cwd: tmpDir, stdio: 'ignore', windowsHide: true })
      execFileSync('git', ['commit', '-m', 'init'], { cwd: tmpDir, stdio: 'ignore', windowsHide: true })
      fs.writeFileSync(file, 'dirty\n', 'utf8')

      const r1 = await checkpoints.nearestGitRootAsync(file)
      const r2 = await checkpoints.nearestGitRootAsync(file)
      expect(r1).toBeTruthy()
      expect(r2).toBe(r1)

      const snap = await checkpoints.createPreWriteSnapshotAsync({
        workspaceRoot: tmpDir,
        turnId: 'p1_async_turn',
        affectedPaths: [file],
        toolName: 'edit_file',
      })
      expect(snap.method).toBe('git_stash_create')
      expect(snap.hadDirtyStash).toBe(true)
      expect(snap.stashHash).toMatch(/^[0-9a-f]{40}$/)
    } finally {
      checkpoints.clearGitRootCache()
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    }
  })

  it('openaiAdapter & anthropicAdapter use idle/stall timeout reset per chunk and selective stream_options', async () => {
    const openaiAdapter = require('../electron/llm/openaiAdapter')
    const anthropicAdapter = require('../electron/llm/anthropicAdapter')

    expect(openaiAdapter.shouldIncludeStreamUsage({ api_url: 'https://api.openai.com/v1', name: 'OpenAI' })).toBe(true)
    expect(openaiAdapter.shouldIncludeStreamUsage({ api_url: 'https://api.deepseek.com/v1', name: 'DeepSeek' })).toBe(true)
    expect(openaiAdapter.shouldIncludeStreamUsage({ api_url: 'https://openrouter.ai/api/v1', name: 'OpenRouter' })).toBe(true)
    expect(openaiAdapter.shouldIncludeStreamUsage({ api_url: 'https://my-community-relay.example/v1', name: 'Relay' })).toBe(false)
    expect(openaiAdapter.shouldIncludeStreamUsage({ api_url: 'http://localhost:11434/v1', name: 'Ollama' })).toBe(false)
    expect(openaiAdapter.shouldIncludeStreamUsage({ api_url: 'https://my-community-relay.example/v1' }, { stream_options: { include_usage: true } })).toBe(true)

    const origFetch = globalThis.fetch
    const enc = new TextEncoder()
    const capturedBodies = []
    try {
      // 1. OpenAI steady stream lasting 150ms (> 70ms idleTimeoutMs) succeeds because chunks reset idle timer
      globalThis.fetch = async (url, init) => {
        capturedBodies.push(JSON.parse(init.body))
        const stream = new ReadableStream({
          async start(controller) {
            for (const chunk of ['data: {"choices":[{"delta":{"content":"hi"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"!"}}]}\n\n', 'data: [DONE]\n\n']) {
              await new Promise(r => setTimeout(r, 45))
              controller.enqueue(enc.encode(chunk))
            }
            controller.close()
          },
        })
        return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
      }
      let out = ''
      for await (const d of openaiAdapter.streamChat({
        provider: { id: 1, api_url: 'https://api.openai.com/v1', api_key: 'k', name: 'OpenAI' },
        model: { model_name: 'gpt-4o' },
        messages: [{ role: 'user', content: 'hi' }],
        options: { idleTimeoutMs: 90, maxTimeoutMs: 2000 },
      })) {
        out += d
      }
      expect(out).toBe('hi!')
      expect(capturedBodies[0].stream_options).toEqual({ include_usage: true })
      expect(capturedBodies[0].idleTimeoutMs).toBeUndefined()

      // 2. Stalled OpenAI stream aborts after idleTimeoutMs
      globalThis.fetch = async (url, init) => {
        const stream = new ReadableStream({
          start(controller) {
            init.signal.addEventListener('abort', () => controller.error(init.signal.reason || new Error('aborted')))
          },
        })
        return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
      }
      await expect((async () => {
        for await (const _d of openaiAdapter.streamChat({
          provider: { id: 1, api_url: 'https://api.openai.com/v1', api_key: 'k' },
          model: { model_name: 'gpt-4o' },
          messages: [{ role: 'user', content: 'stall' }],
          options: { idleTimeoutMs: 50, maxTimeoutMs: 500 },
        })) {}
      })()).rejects.toThrow(/idle timeout|Timeout/i)

      // 3. Anthropic steady stream resets idle timer across chunks
      globalThis.fetch = async () => {
        const stream = new ReadableStream({
          async start(controller) {
            const events = [
              'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"cl"}}\n\n',
              'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"aude"}}\n\n',
            ]
            for (const ev of events) {
              await new Promise(r => setTimeout(r, 45))
              controller.enqueue(enc.encode(ev))
            }
            controller.close()
          },
        })
        return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
      }
      let aOut = ''
      for await (const d of anthropicAdapter.streamChat({
        provider: { id: 2, api_url: 'https://api.anthropic.com/v1', api_key: 'k' },
        model: { model_name: 'claude-sonnet-4-20250514' },
        messages: [{ role: 'user', content: 'hi' }],
        options: { idleTimeoutMs: 90, maxTimeoutMs: 2000 },
      })) {
        aOut += d
      }
      expect(aOut).toBe('claude')
    } finally {
      globalThis.fetch = origFetch
    }
  })

  it('compaction estimateMessageTokens prices image blocks and trajectory keeps chronological order', () => {
    const { estimateMessageTokens } = require('../electron/llm/compaction')
    const { compressTrajectory } = require('../electron/llm/trajectory')

    expect(estimateMessageTokens({
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA', detail: 'low' } }],
    })).toBe(85)
    expect(estimateMessageTokens({
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } }],
    })).toBe(765)
    expect(estimateMessageTokens({
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA', detail: 'high' } }],
    })).toBe(1105)
    expect(estimateMessageTokens({
      role: 'user',
      content: [{ type: 'image', source: { type: 'base64', data: 'AAA' } }],
    })).toBe(765)

    // trajectory.compressTrajectory preserves leading system prompt and keeps summary before kept older messages
    const msgs = [
      { role: 'system', content: 'CORE SYSTEM PROMPT' },
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: '', tool_calls: [{ id: '1', function: { name: 'read_file', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: '1', content: 'small' },
      { role: 'user', content: 'u2' },
    ]
    const comp = compressTrajectory(msgs, { compressAtMessages: 3, keepRecent: 1 })
    expect(comp.messages[0]).toEqual({ role: 'system', content: 'CORE SYSTEM PROMPT' })
    expect(comp.messages[1].content).toContain('[Trajectory compressed:')
    expect(comp.messages[2]).toEqual({ role: 'user', content: 'u1' })
  })

  it('fileScanner caches scan results within TTL and stops early at maxFiles', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-p1-scan-'))
    const fileScanner = require('../electron/context/fileScanner')
    fileScanner.clearScanCache()
    const readdirSpy = vi.spyOn(fs.promises, 'readdir')
    try {
      for (let i = 0; i < 12; i++) {
        fs.writeFileSync(path.join(tmpDir, `f${i}.js`), `// ${i}\n`, 'utf8')
      }
      const capped = await fileScanner.scanWorkspace(tmpDir, { maxFiles: 5, cacheTtlMs: 0 })
      expect(capped.length).toBe(5)

      readdirSpy.mockClear()
      const first = await fileScanner.scanWorkspace(tmpDir, { cacheTtlMs: 5000 })
      expect(first.length).toBe(12)
      expect(readdirSpy).toHaveBeenCalledTimes(1)

      // Repeated call when dir mtimes are unchanged reuses cached scan without re-reading disk
      const cached = await fileScanner.scanWorkspace(tmpDir, { cacheTtlMs: 5000 })
      expect(cached.length).toBe(12)
      expect(readdirSpy).toHaveBeenCalledTimes(1)

      // Adding a file invalidates mtime check and returns fresh count
      fs.writeFileSync(path.join(tmpDir, 'late.js'), '// late\n', 'utf8')
      const fresh = await fileScanner.scanWorkspace(tmpDir, { cacheTtlMs: 5000 })
      expect(fresh.length).toBe(13)
      expect(readdirSpy).toHaveBeenCalledTimes(2)
    } finally {
      readdirSpy.mockRestore()
      fileScanner.clearScanCache()
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    }
  })

  it('database creates P1 composite indexes and getRecentUserImageAttachments rehydrates prior-turn images', async () => {
    const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-p1-db-'))
    const origLoad = Module._load
    let sentMsgs = null

    Module._load = function (request, parent, ...rest) {
      if (request === 'electron') {
        return {
          app: { getPath: () => tmpUserData },
          safeStorage: { isEncryptionAvailable: () => false },
        }
      }
      if (parent?.filename?.includes('chat-send.handler.js')) {
        const stubs = {
          '../llm/providerAdapter': {
            completeChat: async () => ({ content: 'title' }),
            normalizeUsage: (u) => u,
            streamChat: async function* ({ messages }) { sentMsgs = messages; yield 'ok' },
          },
          '../llm/compaction': {
            maybeCompact: async (x) => x.messages,
            estimateMessagesTokens: () => 10,
            estimateTextTokens: () => 2,
            foldStaleToolOutputs: (m) => m,
          },
          '../llm/autoMemory': { prefetchWithDetails: () => ({ text: '', hits: [] }), prefetch: () => '', sync: () => {}, reinforceEchoes: () => {} },
          '../llm/memoryProjector': { getLastProjectedContent: () => null, syncMemoryFileToDb: () => ({ success: true }), debounceProjectWorkspaceMemory: () => {} },
          '../tools/sandbox': { isAuthorizedWorkspace: () => false, isWorkspaceTrusted: () => false },
          '../llm/habitLearner': { proactiveSuggest: () => {}, detectAndLearn: () => {}, confirmHabit: () => {}, dismissHabit: () => {} },
          '../llm/skills': { formatSkillsForPrompt: () => '' },
          '../llm/providerHealth': { isHealthy: () => true, recordResult: () => {}, recordError: () => {}, setCooldown: () => {} },
          '../utils/cost': { computeCost: () => 0 },
          '../logger': { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} },
        }
        if (request in stubs) return stubs[request]
      }
      return origLoad.apply(this, [request, parent, ...rest])
    }

    try {
      const dbModPath = require.resolve('../electron/database')
      delete require.cache[dbModPath]
      const database = require('../electron/database')
      const db = database.initDatabase()

      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name)
      expect(indexes).toContain('idx_message_session_role_id')
      expect(indexes).toContain('idx_agent_exec_log_session_id_desc')
      expect(indexes).toContain('idx_memory_workspace_time')

      const s = database.createSession({ title: 'Image History' })
      const sid = s.lastInsertRowid
      const p = database.addProvider({ name: 'MockP', api_url: 'https://api.example.com/v1', api_key: 'sk-test', api_format: 'openai' })
      const m = database.addModel({ provider_id: p.lastInsertRowid, model_name: 'gpt-4o', context_window: 32000 })

      const handlerPath = require.resolve('../electron/ipc/chat.handler')
      const sendPath = require.resolve('../electron/ipc/chat-send.handler')
      delete require.cache[handlerPath]
      delete require.cache[sendPath]
      const handlers = {}
      const fakeIpcMain = { handle: (ch, fn) => { handlers[ch] = fn }, on: () => {} }
      const fakeWc = { send: () => {}, isDestroyed: () => false }
      require('../electron/ipc/chat.handler').registerChatHandlers(fakeIpcMain, database, () => fakeWc)

      // Turn 1 sends an image attachment
      await handlers['chat:send']({}, {
        sessionId: sid,
        content: 'What is in this screenshot?',
        modelId: m.lastInsertRowid,
        useTools: false,
        attachments: [{ name: 'pic.png', mime: 'image/png', kind: 'image', dataUrl: 'data:image/png;base64,PRIORIMG' }],
      })

      // Verify getMessagesForContext still omits attachment while getRecentUserImageAttachments returns it
      const ctxRows = database.getMessagesForContext(sid)
      expect(ctxRows[0].attachment).toBeUndefined()
      const recentMap = database.getRecentUserImageAttachments(sid)
      expect(recentMap.get(ctxRows[0].id)).toEqual(['data:image/png;base64,PRIORIMG'])

      // Turn 2 asks follow-up with no new attachment: Turn 1's image remains in apiMsgs sent to provider
      sentMsgs = null
      await handlers['chat:send']({}, {
        sessionId: sid,
        content: 'What color is the button?',
        modelId: m.lastInsertRowid,
        useTools: false,
        attachments: [],
      })
      const turn1UserMsg = sentMsgs.find(msg => msg.role === 'user' && Array.isArray(msg.content))
      expect(turn1UserMsg).toBeTruthy()
      expect(turn1UserMsg.content.some(part => part.type === 'image_url' && part.image_url?.url === 'data:image/png;base64,PRIORIMG')).toBe(true)

      database.closeDatabase()
    } finally {
      Module._load = origLoad
      try { fs.rmSync(tmpUserData, { recursive: true, force: true }) } catch {}
    }
  })
})
