import { describe, it, expect, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { reconcileMessages } from '../src/store/chatSlice'

const require = createRequire(import.meta.url)

describe('System Prompt injection & Prompt-Cache ordering', () => {
  const origLoad = Module._load
  let capturedRequests: any[] = []

  afterAll(() => {
    Module._load = origLoad
  })

  it('always injects AGENT_SYSTEM_PROMPT even when dynamic time/skills system messages precede it, and preserves Persona at index 0', async () => {
    capturedRequests = []
    Module._load = function (request: string, parent: any, ...rest: any[]) {
      if (request === './providerAdapter' || request.endsWith('/providerAdapter')) {
        return {
          completeChatMessage: async ({ messages }: any) => {
            capturedRequests.push(messages)
            return { role: 'assistant', content: 'done', usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }
          },
          normalizeUsage: (u: any) => u,
        }
      }
      return origLoad.apply(this, [request, parent, ...rest])
    }

    const toolLoopPath = require.resolve('../electron/llm/toolLoop')
    delete require.cache[toolLoopPath]
    const { runToolLoop } = require(toolLoopPath)

    // Case 1: Only auxiliary/dynamic system messages (time + skills) -> AGENT_SYSTEM_PROMPT must still be injected at index 0
    await runToolLoop({
      provider: { id: 'mock', api_format: 'openai' },
      model: { model_name: 'gpt-4o-mini' },
      messages: [
        { role: 'system', content: '<available_skills>...</available_skills>' },
        { role: 'system', content: '当前时间：2026-11-27 23:30 (UTC+8, 星期五)' },
        { role: 'user', content: 'hello' },
      ],
      tools: false,
      maxIterations: 2,
      sessionId: 9001,
    })

    expect(capturedRequests).toHaveLength(1)
    const sys1 = capturedRequests[0].filter((m: any) => m.role === 'system').map((m: any) => m.content)
    expect(sys1.some((c: string) => c.includes('You are an autonomous coding agent'))).toBe(true)
    expect(sys1[0]).toContain('You are an autonomous coding agent')

    // Case 2: Leading Persona -> Persona stays at index 0, AGENT_SYSTEM_PROMPT is right after it, and time stays after static blocks
    await runToolLoop({
      provider: { id: 'mock', api_format: 'openai' },
      model: { model_name: 'gpt-4o-mini' },
      messages: [
        { role: 'system', content: '[Persona: CodeReviewer] Always review carefully.' },
        { role: 'system', content: '当前时间：2026-11-27 23:30 (UTC+8, 星期五)' },
        { role: 'user', content: 'review' },
      ],
      tools: false,
      maxIterations: 2,
      sessionId: 9002,
    })

    expect(capturedRequests).toHaveLength(2)
    const sys2 = capturedRequests[1].filter((m: any) => m.role === 'system').map((m: any) => m.content)
    expect(sys2[0]).toContain('[Persona: CodeReviewer]')
    expect(sys2[1]).toContain('You are an autonomous coding agent')
    const timeIdx = sys2.findIndex((c: string) => c.startsWith('当前时间：'))
    expect(timeIdx).toBeGreaterThan(1)
  }, 15000)
})

describe('reconcileMessages referential stability', () => {
  it('returns changed=false and preserves exact array & item references when nothing changed', () => {
    const prev: any[] = [
      { id: 1, session_id: 10, role: 'user', content: 'hi', status: 'success', attachment: { kind: 'image', name: 'a.png' } },
      { id: 2, session_id: 10, role: 'assistant', content: 'hello', status: 'success', token_count: 5 },
    ]
    const incoming: any[] = [
      { id: 1, session_id: 10, role: 'user', content: 'hi', status: 'success', attachment: JSON.stringify({ kind: 'image', name: 'a.png' }) },
      { id: 2, session_id: 10, role: 'assistant', content: 'hello', status: 'success', token_count: 5 },
    ]
    const res = reconcileMessages(prev, incoming)
    expect(res.changed).toBe(false)
    expect(res.messages).toBe(prev)
  })

  it('preserves references for unchanged historical messages when a new message is appended', () => {
    const prev: any[] = [
      { id: 1, session_id: 10, role: 'user', content: 'hi', status: 'success' },
      { id: 2, session_id: 10, role: 'assistant', content: 'old', status: 'success' },
    ]
    const incoming: any[] = [
      { id: 1, session_id: 10, role: 'user', content: 'hi', status: 'success' },
      { id: 2, session_id: 10, role: 'assistant', content: 'old', status: 'success' },
      { id: 3, session_id: 10, role: 'assistant', content: 'new reply', status: 'success' },
    ]
    const res = reconcileMessages(prev, incoming)
    expect(res.changed).toBe(true)
    expect(res.messages).toHaveLength(3)
    expect(res.messages[0]).toBe(prev[0])
    expect(res.messages[1]).toBe(prev[1])
    expect(res.messages[2].content).toBe('new reply')
  })
})

describe('i18n completeness across en, zh-CN, zh-TW and src/', () => {
  it('has zero missing keys in zh-CN and zh-TW, and zero missing static t() keys in src/', () => {
    const appRoot = path.resolve(__dirname, '..')
    const base = JSON.parse(fs.readFileSync(path.join(appRoot, 'src/utils/i18n-en-base.json'), 'utf8'))
    const trArr = JSON.parse(fs.readFileSync(path.join(appRoot, 'src/utils/i18n-translations.json'), 'utf8'))
    const zhCN = trArr.find((x: any) => x.lang === 'zh-CN').strings
    const zhTW = trArr.find((x: any) => x.lang === 'zh-TW').strings

    const baseKeys = Object.keys(base)
    expect(baseKeys.filter((k) => !zhCN[k])).toEqual([])
    expect(baseKeys.filter((k) => !zhTW[k])).toEqual([])

    const usedKeys = new Set<string>()
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name)
        if (ent.isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(ent.name) && ent.name !== 'i18n.ts') {
          const text = fs.readFileSync(p, 'utf8')
          const re = /\bt\(\s*['"]([^'"]+)['"]/g
          let m: RegExpExecArray | null
          while ((m = re.exec(text))) usedKeys.add(m[1])
        }
      }
    }
    walk(path.join(appRoot, 'src'))

    const missingInBase = [...usedKeys].filter((k) => !(k in base))
    const missingInCN = [...usedKeys].filter((k) => !(k in zhCN))
    expect(missingInBase).toEqual([])
    expect(missingInCN).toEqual([])
  })
})

describe('session:set-cwd workspace switching', () => {
  it('accepts string path returned by sandbox.resolveRoamingPath and updates session cwd', async () => {
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'aether-cwd-'))
    const handlers: Record<string, Function> = {}
    const fakeIpcMain = { handle: (ch: string, fn: Function) => { handlers[ch] = fn } }
    let savedConfig: any = null
    let savedCwd: string | null = null
    const fakeDb = {
      getSessionConfig: () => ({}),
      setSessionConfig: (_id: number, cfg: any) => { savedConfig = cfg },
      setSessionCwd: (_id: number, cwd: string) => { savedCwd = cwd; return cwd },
    }
    const { registerSessionHandlers } = require('../electron/ipc/session.handler')
    registerSessionHandlers(fakeIpcMain, fakeDb)

    try {
      const result = await handlers['session:set-cwd']({}, 42, tmpDir)
      expect(result).toBe(fs.realpathSync(tmpDir))
      expect(savedCwd).toBe(fs.realpathSync(tmpDir))
      expect(savedConfig?.workspace).toBe(fs.realpathSync(tmpDir))
      expect(() => handlers['session:set-cwd']({}, 42, path.join(tmpDir, 'nonexistent-dir'))).toThrow(/Directory does not exist/)
      expect(() => handlers['session:set-cwd']({}, 42, 'C:\\')).toThrow(/Forbidden working directory/)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
