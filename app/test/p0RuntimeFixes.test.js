import { describe, it, expect, afterAll, afterEach, vi } from 'vitest'
import Module from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const origLoad = Module._load

afterAll(() => {
  Module._load = origLoad
})

describe('P0 Runtime Fixes', () => {
  const tmpDirs = []
  afterEach(() => {
    vi.useRealTimers()
    while (tmpDirs.length > 0) {
      const d = tmpDirs.pop()
      try { fs.rmSync(d, { recursive: true, force: true }) } catch {}
    }
  })

  it('read_file applies offset/limit before capping at MAX_READ_BYTES (>64KB files)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-read-64k-'))
    tmpDirs.push(dir)
    const filePath = path.join(dir, 'big.txt')
    // ~100KB file (1000 lines * ~105 bytes)
    const lines = Array.from({ length: 1000 }, (_, i) => `LINE_${String(i + 1).padStart(4, '0')}: ` + 'x'.repeat(90))
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
    expect(fs.statSync(filePath).size).toBeGreaterThan(80 * 1024)

    const { getTool } = require('../electron/tools/registry')
    const readTool = getTool('read_file')
    const slice = readTool.run({ path: filePath, offset: 900, limit: 5 }, { agentMode: 'yolo' })
    expect(slice).toContain('LINE_0900:')
    expect(slice).toContain('LINE_0904:')
    expect(slice).not.toContain('LINE_0899:')
    expect(slice).not.toContain('LINE_0905:')
    expect(slice).not.toContain('[truncated')
  })

  it('runCommand aborts immediately on AbortSignal and runToolWithTimeout does not retry run_command timeouts', async () => {
    const { runCommand } = require('../electron/tools/exec')
    const ac = new AbortController()
    const t0 = Date.now()
    setTimeout(() => ac.abort(), 80)
    const r = await runCommand('node', ['-e', 'setTimeout(() => {}, 30000)'], { timeout: 15000, signal: ac.signal })
    const elapsed = Date.now() - t0
    expect(r.aborted).toBe(true)
    expect(elapsed).toBeLessThan(5000)

    const { runToolWithTimeout } = require('../electron/llm/toolLoopUtils')
    let calls = 0
    const fakeRunCommand = {
      name: 'run_command',
      run: async () => {
        calls++
        throw new Error('tool timed out after 30000ms')
      },
    }
    const res = await runToolWithTimeout(fakeRunCommand, { command: 'sleep 60' }, {}, undefined)
    expect(res.error).toContain('timed out')
    expect(calls).toBe(1)
  })

  it('run_command in registry marks noRetry=true and rejects on AbortSignal during streaming', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-runcmd-abort-'))
    tmpDirs.push(dir)
    const { getTool } = require('../electron/tools/registry')
    const runCmdTool = getTool('run_command')
    expect(runCmdTool.noRetry).toBe(true)

    const ac = new AbortController()
    setTimeout(() => ac.abort(), 80)
    await expect(
      runCmdTool.run(
        { command: 'node -e "setTimeout(()=>{}, 30000)"', description: 'long sleep', cwd: dir, timeout: 15000 },
        { agentMode: 'yolo', signal: ac.signal, onStream: () => {} }
      )
    ).rejects.toThrow(/aborted/i)
  })

  it('compaction.summarizeHistory does not timeout at 3000ms and preserves order + tool pairs on fallback', async () => {
    vi.useFakeTimers()
    Module._load = function (request, parent, isMain) {
      if (request === './providerAdapter' || request.endsWith('providerAdapter')) {
        return {
          completeChat: ({ signal }) => new Promise((resolve, reject) => {
            const t = setTimeout(() => resolve('SUMMARY_OK'), 3500)
            if (signal) {
              signal.addEventListener('abort', () => {
                clearTimeout(t)
                reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
              }, { once: true })
            }
          }),
        }
      }
      return origLoad.apply(this, arguments)
    }
    delete require.cache[require.resolve('../electron/llm/compaction')]
    const { maybeCompact } = require('../electron/llm/compaction')

    const big = 'a'.repeat(4000)
    const msgs = [
      { role: 'system', content: 'sys' },
      ...Array.from({ length: 10 }, (_, i) => ({ role: 'assistant', content: `${i}:${big}` })),
    ]
    const p = maybeCompact({ provider: { api_format: 'openai' }, model: { model_name: 'test' }, messages: msgs, budget: 8000 })
    await vi.advanceTimersByTimeAsync(4000)
    const compacted = await p
    expect(compacted.some(m => m.role === 'system' && m.content.includes('SUMMARY_OK'))).toBe(true)

    // Fallback test: completeChat fails -> chronological order & tool pairs must stay intact
    vi.useRealTimers()
    Module._load = function (request, parent, isMain) {
      if (request === './providerAdapter' || request.endsWith('providerAdapter')) {
        return { completeChat: async () => { throw new Error('summarizer down') } }
      }
      return origLoad.apply(this, arguments)
    }
    delete require.cache[require.resolve('../electron/llm/compaction')]
    const { maybeCompact: maybeCompactFallback } = require('../electron/llm/compaction')

    const seqMsgs = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'U1:' + big },
      { role: 'assistant', content: 'A1:' + big },
      { role: 'assistant', content: 'A2', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'read_file', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'tc1', content: 'R1:' + 'r'.repeat(300) },
      { role: 'assistant', content: 'A3:' + big },
      { role: 'user', content: 'U2:' + big },
      { role: 'assistant', content: 'A4:' + big },
      { role: 'assistant', content: 'A5:' + big },
    ]
    const fb = await maybeCompactFallback({ provider: { api_format: 'openai' }, model: { model_name: 'test' }, messages: seqMsgs, budget: 4000 })
    // Verify chronological order of retained non-system messages
    const nonSys = fb.filter(m => m.role !== 'system')
    const origOrder = nonSys.map(m => seqMsgs.indexOf(m))
    for (let i = 1; i < origOrder.length; i++) {
      expect(origOrder[i]).toBeGreaterThan(origOrder[i - 1])
    }
    // Verify tool_call/tool_result pair integrity
    const callIds = new Set(nonSys.flatMap(m => (m.tool_calls || []).map(tc => tc.id)))
    const toolResultIds = nonSys.filter(m => m.role === 'tool').map(m => m.tool_call_id)
    for (const id of toolResultIds) expect(callIds.has(id)).toBe(true)
    for (const id of callIds) expect(toolResultIds.includes(id)).toBe(true)
  })

  it('orderSystemMessagesForCache places dynamic blocks (time/memory/replay/plan/repoMap) after stable blocks', () => {
    const { orderSystemMessagesForCache } = require('../electron/llm/microcompact')
    const input = [
      { role: 'system', content: '当前时间：2026-11-28 (UTC+8, 星期六)' },
      { role: 'system', content: 'Relevant memories from past conversations (use if helpful, ignore if not):\n- fact' },
      { role: 'system', content: '## Execution Plan\nGoal: test' },
      { role: 'system', content: '## Experience replay (from previous successful tasks)\n1. fix' },
      { role: 'system', content: '# Repo Map (10 files, 10 indexed)\n```' },
      { role: 'system', content: 'You are an autonomous coding agent.' },
      { role: 'system', content: '## Project Instructions (Cascading Hierarchy)\nRules' },
      { role: 'user', content: 'hi' },
    ]
    const out = orderSystemMessagesForCache(input)
    expect(out[0].content).toBe('You are an autonomous coding agent.')
    expect(out[1].content).toContain('## Project Instructions')
    expect(out[out.length - 1].role).toBe('user')
    for (let i = 2; i < out.length - 1; i++) {
      expect(out[i].cacheHint).toBe('dynamic')
    }
  })

  it('chat-send.handler injects date-only 当前时间 without HH:MM', () => {
    const src = fs.readFileSync(path.join(__dirname, '../electron/ipc/chat-send.handler.js'), 'utf8')
    expect(src).toContain('当前时间：${_dateStr}')
    expect(src).not.toContain('_now.getHours()')
    expect(src).not.toContain('_now.getMinutes()')
  })

  it('toolLoop deduplicates AGENTS.md from sessionContext and places planBlock after static prefix', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-nodup-agents-'))
    tmpDirs.push(dir)
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Repo Rules\nKeep edits minimal.\n', 'utf8')

    const captured = []
    Module._load = function (request, parent, isMain) {
      if (request === 'electron') return { app: { getPath: () => os.tmpdir() } }
      if (request === './providerAdapter' || request.endsWith('/providerAdapter')) {
        return {
          completeChatMessage: async ({ messages }) => {
            captured.push(messages)
            return { role: 'assistant', content: 'done', usage: { prompt_tokens: 10, completion_tokens: 5 } }
          },
          normalizeUsage: (u) => u,
        }
      }
      if (request === './planning' || request.endsWith('/planning')) {
        const realPlanning = origLoad.apply(this, arguments)
        return {
          ...realPlanning,
          isComplexRequest: () => true,
          generatePlan: async () => ({
            id: 'plan_1',
            description: 'Test plan',
            tasks: [
              { id: '1', description: 'Step 1', dependsOn: [], status: 'in_progress' },
              { id: '2', description: 'Step 2', dependsOn: ['1'], status: 'pending' },
            ],
          }),
        }
      }
      return origLoad.apply(this, arguments)
    }

    delete require.cache[require.resolve('../electron/llm/toolLoop')]
    delete require.cache[require.resolve('../electron/llm/sessionContext')]
    const { buildSessionContext } = require('../electron/llm/sessionContext')
    const { runToolLoop } = require('../electron/llm/toolLoop')

    const { prefix } = buildSessionContext({ cwd: dir, userMessage: 'hello' })
    expect(prefix.some(m => m.content.includes('[Workspace Context: AGENTS.md]'))).toBe(true)

    await runToolLoop({
      provider: { id: 'mock', api_format: 'openai' },
      model: { model_name: 'gpt-4o-mini' },
      messages: [...prefix, { role: 'user', content: 'hello' }],
      workspaceRoot: dir,
      tools: false,
      maxIterations: 2,
      sessionId: 88001,
    })

    expect(captured.length).toBe(1)
    const sysContents = captured[0].filter(m => m.role === 'system').map(m => m.content)
    const agentsBlocks = sysContents.filter(c => c.includes('Keep edits minimal.'))
    expect(agentsBlocks.length).toBe(1)
    const agentPromptIdx = sysContents.findIndex(c => c.includes('You are an autonomous coding agent'))
    const planIdx = sysContents.findIndex(c => c.includes('## Execution Plan'))
    expect(agentPromptIdx).toBe(0)
    expect(planIdx).toBeGreaterThan(agentPromptIdx)
  }, 20000)

  it('autoMemory.prefetchWithDetails surfaces 1-hop graph-expanded memories with 0 keyword hits', () => {
    const autoMemory = require('../electron/llm/autoMemory')
    const memories = [
      { id: 1, content: 'alice works on project_x', type: 'fact', origin: 'user', created_at: '2026-11-28 00:00:00', access_count: 0, confidence: 1 },
      { id: 2, content: 'project_x uses vitest runner', type: 'fact', origin: 'user', created_at: '2026-11-28 00:00:00', access_count: 0, confidence: 1 },
    ]
    const fakeDb = {
      getMemories: () => memories,
      getMemoriesScoped: () => memories,
      incrementMemoryAccess: () => {},
      allRows: (sql, params = []) => {
        const p0 = params[0]
        if (sql.includes('FROM kg_nodes')) {
          return String(p0 || '').includes('alice') ? [{ entity: 'alice', type: 'entity' }] : []
        }
        if (sql.includes('FROM kg_edges')) {
          if (sql.includes('"from" = ?') && p0 === 'alice') {
            return [{ to: 'project_x', relation: 'works_on', confidence: 0.9 }]
          }
          return []
        }
        return []
      },
    }
    const res = autoMemory.prefetchWithDetails(fakeDb, 'alice', null)
    expect(res.hits.some(h => h.id === 2)).toBe(true)
    const graphHit = res.hits.find(h => h.id === 2)
    expect(graphHit.why).toContain('graph')
  })
})
