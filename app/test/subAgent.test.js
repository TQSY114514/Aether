// ─── subAgent unit tests ────────────────────────────────────────────────────
// Tests for electron/llm/subAgent.js: 权限继承 + 回调透传.
//
// runToolLoop / IterationBudget / reasoning / providerAdapter 全部用 Module._load
// hook mock（与 autoMemoryOrigin.test.js 同模式），不发起真实 LLM 调用、不加载 electron.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import Module from 'node:module'

const runToolLoop = vi.fn()
class IterationBudget { constructor(n) { this.n = n } }
const mockedProviderAdapter = { completeChatMessage: vi.fn() }
const mockedReasoning = { buildReasoningParams: () => ({}) }
const mockedToolLoop = { runToolLoop, IterationBudget }
const setWorkspaceRootForSession = vi.fn()
const mockedSandbox = {
  getWorkspaceRoot: vi.fn(() => 'C:\\AetherProject'),
  setWorkspaceRootForSession,
}

const origLoad = Module._load
Module._load = function (request, ...args) {
  if (request === './toolLoop' || request === '../electron/llm/toolLoop') return mockedToolLoop
  if (request === './providerAdapter' || request === '../electron/llm/providerAdapter') return mockedProviderAdapter
  if (request === './reasoning' || request === '../electron/llm/reasoning') return mockedReasoning
  if (request === '../tools/sandbox' || request === './sandbox') return mockedSandbox
  return origLoad.apply(this, [request, ...args])
}

let subAgent

function mkDb() {
  return {
    createSession: () => ({ lastInsertRowid: 42 }),
    addMessage: () => {},
    deleteSession: () => {},
  }
}

beforeEach(async () => {
  vi.resetModules()
  runToolLoop.mockReset()
  runToolLoop.mockResolvedValue('final answer')
  setWorkspaceRootForSession.mockReset()
  mockedSandbox.getWorkspaceRoot.mockReset()
  mockedSandbox.getWorkspaceRoot.mockReturnValue('C:\\AetherProject')
  subAgent = await import('../electron/llm/subAgent')
})

describe('runSubagent — workspace + hidden child session', () => {
  it('inherits the parent workspace and marks the child as a subagent session', async () => {
    let created = null
    const db = {
      createSession: (args) => { created = args; return { lastInsertRowid: 42 } },
      addMessage: () => {},
      deleteSession: () => {},
    }
    await subAgent.runSubagent({
      db, parentSessionId: 7, provider: { id: 1 }, model: { model_name: 'test' }, prompt: 'inspect'
    })
    expect(created).toMatchObject({
      parentSessionId: 7,
      session_kind: 'subagent',
      config: { workspace: 'C:\\AetherProject' },
    })
    expect(setWorkspaceRootForSession).toHaveBeenCalledWith(42, 'C:\\AetherProject')
  })
})

describe('runSubagent — 权限继承', () => {
  const base = { db: mkDb(), provider: { id: 1 }, model: { model_name: 'test' }, prompt: 'hi' }

  it('ask 继承为 ask（子代理能执行但需确认）', async () => {
    const out = await subAgent.runSubagent({ ...base, agentMode: 'ask' })
    expect(out.content).toBe('final answer')
    expect(runToolLoop).toHaveBeenCalledTimes(1)
    expect(runToolLoop.mock.calls[0][0].agentMode).toBe('ask')
  })

  it('auto 继承为 auto', async () => {
    await subAgent.runSubagent({ ...base, agentMode: 'auto' })
    expect(runToolLoop.mock.calls[0][0].agentMode).toBe('auto')
  })

  it('plan 继承为 plan（只读）', async () => {
    await subAgent.runSubagent({ ...base, agentMode: 'plan' })
    expect(runToolLoop.mock.calls[0][0].agentMode).toBe('plan')
  })

  it('yolo 降级为 auto', async () => {
    await subAgent.runSubagent({ ...base, agentMode: 'yolo' })
    expect(runToolLoop.mock.calls[0][0].agentMode).toBe('auto')
  })
})

describe('runSubagent — 回调透传', () => {
  it('把 requestPermission / onToolCall / onAskUser 透传给子循环', async () => {
    const requestPermission = vi.fn()
    const onToolCall = vi.fn()
    const onAskUser = vi.fn()
    await subAgent.runSubagent({
      db: mkDb(), provider: { id: 1 }, model: { model_name: 'test' }, prompt: 'hi', agentMode: 'ask',
      callbacks: { requestPermission, onToolCall, onAskUser },
    })
    const args = runToolLoop.mock.calls[0][0]
    expect(args.requestPermission).toBe(requestPermission)
    expect(args.onToolCall).toBe(onToolCall)
    expect(args.onAskUser).toBe(onAskUser)
  })

  it('无回调时子循环仍可运行（默认空对象）', async () => {
    await subAgent.runSubagent({ db: mkDb(), provider: { id: 1 }, model: { model_name: 'test' }, prompt: 'hi' })
    expect(runToolLoop).toHaveBeenCalledTimes(1)
  })

  it('onJournalEntry 仅记录 start（result=null）时不误判为工作区写入，保留 ledger 预算', async () => {
    const fs = require('node:fs')
    const os = require('node:os')
    const path = require('node:path')
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-budget-'))
    fs.writeFileSync(path.join(tmpDir, 'main.js'), 'line1\nline2\n', 'utf8')
    mockedSandbox.getWorkspaceRoot.mockReturnValueOnce(tmpDir)
    try {
      const longProse = 'X'.repeat(1200)
      runToolLoop.mockImplementationOnce(async (opts) => {
        opts.onJournalEntry?.({ tool: 'write_file', result: null })
        opts.findingsLedger?.add({ claim: 'Verified claim in main.js', cites: ['main.js:1'] })
        return longProse
      })
      const out = await subAgent.runSubagent({
        db: mkDb(),
        provider: { id: 1 },
        model: { model_name: 'test' },
        prompt: 'inspect',
        config: { maxOutputChars: 500 },
      })
      expect(out.hasWorkspaceMutations).toBe(false)
      expect(out.content.length).toBeLessThanOrEqual(500)
      expect(out.content).toContain('## Verified Findings')
      expect(out.content).toContain('Verified claim in main.js')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('onFileSummary 记录文件变更时正确设置 hasWorkspaceMutations=true', async () => {
    runToolLoop.mockImplementationOnce(async (opts) => {
      opts.onFileSummary?.({ fileCount: 1, files: [{ path: 'a.js', status: 'modified' }] })
      return 'done'
    })
    const out = await subAgent.runSubagent({
      db: mkDb(),
      provider: { id: 1 },
      model: { model_name: 'test' },
      prompt: 'edit',
    })
    expect(out.hasWorkspaceMutations).toBe(true)
  })
})