// ─────────────────────────────────────────────────────────────────────────────
// session.test.js — TUI 会话流式（todo 2）
// mock runAgent 推 {type:'text', delta:'hi'} + agent:end，断言 reducer 重放后
// 渲染消息含 "hi"（App 渲染的正是 reducer state）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tuiReducer, initialTuiState } from '../../tui/reducer.js'
import { runSession } from '../../tui/runSession.js'

// 注入的 resolve 实现：跳过真实 DB。
const stubResolve = () => ({
  provider: { id: 1, name: 'mock', api_url: 'http://127.0.0.1', api_key: 'k', api_format: 'openai' },
  model: { id: 1, model_name: 'mock-model' },
})

// 事件脚本驱动的 mock runAgent：按序列回调 onText/onToolCall/onStatus。
function scriptedRunAgent(script) {
  return async ({ onText, onToolCall, onStatus, requestPermission }) => {
    const seen = { requestPermission }
    for (const e of script) {
      if (e.type === 'text') onText({ text: e.delta, done: e.done })
      else if (e.type === 'status') onStatus({ text: e.text })
      else if (e.type === 'tool:start') onToolCall({ name: e.name, args: e.args || {}, startedAt: Date.now() })
      else if (e.type === 'tool:end') onToolCall({ name: e.name, result: e.result, error: e.error, startedAt: Date.now() })
    }
    return { text: script.filter((e) => e.type === 'text').map((e) => e.delta).join(''), toolCalls: [] }
  }
}

// 用 runSession 发出的 action 重放 reducer，得到与 App 渲染一致的状态。
function replay(dispatched) {
  return dispatched.reduce(tuiReducer, initialTuiState)
}

describe('runSession', () => {
  it('streams text deltas; reducer messages contain "hi" (render source)', async () => {
    // App 真实流程：先 INPUT+SUBMIT（reducer 置 running），再 startSession 推事件。
    const dispatched = [
      { type: 'INPUT', value: 'hello' },
      { type: 'SUBMIT' },
    ]
    const result = await runSession({
      dbPath: null,
      modelName: 'mock-model',
      prompt: 'hello',
      dispatch: (a) => dispatched.push(a),
      resolveImpl: stubResolve,
      // 节流注入 0: 同步 dispatch（生产默认 60ms 合并 chunk 防抽搐, 见 runSession）
      textThrottleMs: 0,
      thinkThrottleMs: 0,
      runAgentImpl: scriptedRunAgent([
        { type: 'text', delta: 'hi', done: false },
        { type: 'text', delta: '!', done: true },
      ]),
    })
    const state = replay(dispatched)

    // 事件 → TEXT_DELTA action
    expect(dispatched.filter((a) => a.type === 'TEXT_DELTA')).toEqual([
      { type: 'TEXT_DELTA', delta: 'hi' },
      { type: 'TEXT_DELTA', delta: '!' },
    ])
    // 最终渲染文本 = "hi!"（App 直接渲染 last assistant message）
    const last = state.messages[state.messages.length - 1]
    expect(last.role).toBe('assistant')
    expect(last.text).toContain('hi')
    expect(last.text).toBe('hi!')
    // 会话结束回 idle
    expect(state.running).toBe(false)
    expect(dispatched.some((a) => a.type === 'AGENT_END')).toBe(true)
    expect(result.text).toBe('hi!')
  })

  it('relays status events to the status line', async () => {
    const dispatched = [
      { type: 'INPUT', value: 'x' },
      { type: 'SUBMIT' },
    ]
    await runSession({
      dbPath: null,
      prompt: 'x',
      dispatch: (a) => dispatched.push(a),
      resolveImpl: stubResolve,
      runAgentImpl: scriptedRunAgent([
        { type: 'status', text: 'planning…' },
        { type: 'text', delta: 'ok', done: true },
      ]),
    })
    // STATUS action 已发出
    expect(dispatched).toContainEqual({ type: 'STATUS', text: 'planning…' })
    // 在 STATUS 时刻的状态栏是 planning…（会话结束后 AGENT_END 会正确重置为 idle）
    const atStatus = dispatched.slice(0, dispatched.findIndex((a) => a.type === 'STATUS') + 1)
      .reduce(tuiReducer, initialTuiState)
    expect(atStatus.statusLine).toBe('planning…')
    expect(replay(dispatched).statusLine).toBe('idle') // 结束后回 idle
  })

  it('maps tool:start / tool:end entries to tool cards', async () => {
    const dispatched = []
    await runSession({
      dbPath: null,
      prompt: 'x',
      dispatch: (a) => dispatched.push(a),
      resolveImpl: stubResolve,
      runAgentImpl: scriptedRunAgent([
        { type: 'tool:start', name: 'read', args: { path: 'a.txt' } },
        { type: 'tool:end', name: 'read', result: 'content' },
        { type: 'tool:start', name: 'write' },
        { type: 'tool:end', name: 'write', error: 'denied' },
        { type: 'text', delta: 'done', done: true },
      ]),
    })
    const state = replay(dispatched)
    expect(state.toolCalls).toHaveLength(2)
    expect(state.toolCalls[0]).toMatchObject({ name: 'read', status: 'done' })
    expect(state.toolCalls[1]).toMatchObject({ name: 'write', status: 'error' })
  })

  it('propagates resolution failures as errors (no provider → throw, caller renders red status)', async () => {
    const dispatched = []
    await expect(runSession({
      dbPath: null,
      prompt: 'x',
      dispatch: (a) => dispatched.push(a),
      resolveImpl: () => { throw new Error('no enabled model found. Configure one in the app or run --list-models / --list-providers.') },
      runAgentImpl: scriptedRunAgent([]),
    })).rejects.toThrow('no enabled model found')
    // App 侧 catch 会补 STATUS error + AGENT_END（此处仅验证 runSession 抛错语义）
    expect(dispatched).toHaveLength(0)
  })

  it('passes requestPermission through to the execution layer (todo 4 contract)', async () => {
    let receivedPermissionCb = null
    const dispatched = []
    await runSession({
      dbPath: null,
      prompt: 'x',
      dispatch: (a) => dispatched.push(a),
      resolveImpl: stubResolve,
      requestPermission: () => Promise.resolve(true),
      runAgentImpl: async (opts) => { receivedPermissionCb = opts.requestPermission; return { text: 't', toolCalls: [] } },
    })
    expect(typeof receivedPermissionCb).toBe('function')
  })

  it('relays onPlanStep.assistantText into the message stream (real reply path)', async () => {
    // toolLoop.js:451 的回复文本经 onPlanStep.assistantText 传递——不转发
    // 就是"agent 跑完但界面无回复"的根因。锁定此路径。
    const dispatched = [
      { type: 'INPUT', value: 'q' },
      { type: 'SUBMIT' },
    ]
    const agentImpl = async ({ onPlanStep }) => {
      onPlanStep({ step: 0, depth: 0, remaining: 9, assistantText: 'Hello there', kind: 'plan' })
      return { text: 'Hello there', toolCalls: [] }
    }
    await runSession({
      dbPath: null,
      prompt: 'q',
      dispatch: (a) => dispatched.push(a),
      resolveImpl: stubResolve,
      runAgentImpl: agentImpl,
    })
    expect(dispatched).toContainEqual({ type: 'TEXT_DELTA', delta: 'Hello there' })
    const state = replay(dispatched)
    expect(state.messages[state.messages.length - 1].text).toBe('Hello there')
  })

  it('appends result.text only when no text was relayed (no duplicate)', async () => {
    const dispatched = [
      { type: 'INPUT', value: 'q' },
      { type: 'SUBMIT' },
    ]
    await runSession({
      dbPath: null,
      prompt: 'q',
      dispatch: (a) => dispatched.push(a),
      resolveImpl: stubResolve,
      runAgentImpl: async ({ onText }) => {
        onText({ text: 'streamed', done: true })
        return { text: 'streamed', toolCalls: [] }
      },
    })
    const deltas = dispatched.filter((a) => a.type === 'TEXT_DELTA').map((a) => a.delta)
    expect(deltas).toEqual(['streamed']) // 兜底不重复追加
  })

  it('rejects encrypted safeStorage API keys with a clear error (headless)', async () => {
    const encResolve = () => ({
      provider: { id: 1, name: 'my-provider', api_url: 'http://x', api_key: 'QUJDREVGR0hJSktMTU5PUFE=', api_format: 'openai' },
      model: { id: 1, model_name: 'm' },
      db: null,
    })
    await expect(runSession({
      dbPath: null,
      prompt: 'x',
      dispatch: () => {},
      resolveImpl: encResolve,
      runAgentImpl: async () => ({ text: '', toolCalls: [] }),
    })).rejects.toThrow(/encrypted with the desktop app/)
    // 传 --api-key 明文覆盖时不再拦截
    let called = false
    await runSession({
      dbPath: null,
      prompt: 'x',
      apiKey: 'sk-plain',
      dispatch: () => {},
      resolveImpl: encResolve,
      runAgentImpl: async (opts) => { called = opts.provider.api_key === 'sk-plain'; return { text: '', toolCalls: [] } },
    })
    expect(called).toBe(true)
  })

  it('falls back to auth.json when stored key is encrypted (persisted via /apikey)', async () => {
    const oldFile = process.env.AETHER_AUTH_FILE
    const tmp = join(tmpdir(), `auth-${Date.now()}.json`)
    process.env.AETHER_AUTH_FILE = tmp
    writeFileSync(tmp, JSON.stringify({ '新疆': 'sk-from-auth' }), 'utf8')
    try {
      let got
      const encResolve = () => ({
        provider: { id: 1, name: '新疆', api_url: 'http://x', api_key: 'QUJDREVGR0hJSktMTU5PUFE=', api_format: 'openai' },
        model: { id: 1, model_name: 'm' },
        db: null,
      })
      await runSession({
        dbPath: null,
        prompt: 'x',
        dispatch: () => {},
        resolveImpl: encResolve,
        runAgentImpl: async (opts) => { got = opts.provider.api_key; return { text: '', toolCalls: [] } },
      })
      expect(got).toBe('sk-from-auth')
    } finally {
      if (oldFile === undefined) delete process.env.AETHER_AUTH_FILE
      else process.env.AETHER_AUTH_FILE = oldFile
      try { rmSync(tmp, { force: true }) } catch {}
    }
  })

  it('falls back to AETHER_API_KEY env when stored key is encrypted (headless)', async () => {
    const old = process.env.AETHER_API_KEY
    process.env.AETHER_API_KEY = 'sk-from-env'
    try {
      let got
      const encResolve = () => ({
        provider: { id: 1, name: '新疆', api_url: 'http://x', api_key: 'QUJDREVGR0hJSktMTU5PUFE=', api_format: 'openai' },
        model: { id: 1, model_name: 'm' },
        db: null,
      })
      await runSession({
        dbPath: null,
        prompt: 'x',
        dispatch: () => {},
        resolveImpl: encResolve,
        runAgentImpl: async (opts) => { got = opts.provider.api_key; return { text: '', toolCalls: [] } },
      })
      expect(got).toBe('sk-from-env')
    } finally {
      if (old === undefined) delete process.env.AETHER_API_KEY
      else process.env.AETHER_API_KEY = old
    }
  })

  it('throttles TEXT_DELTA by default (60ms window merges chunks) and flushes at end', async () => {
    // 生产默认 textThrottleMs=60: onText 的 chunk 不逐条 dispatch,
    // 而是在结束时合并为一次（防 ConPTY 抽搐）。最终文本必须完整。
    const dispatched = [
      { type: 'INPUT', value: 'hi' },
      { type: 'SUBMIT' },
    ]
    await runSession({
      dbPath: null,
      prompt: 'hi',
      dispatch: (a) => dispatched.push(a),
      resolveImpl: stubResolve,
      runAgentImpl: scriptedRunAgent([
        { type: 'text', delta: 'He', done: false },
        { type: 'text', delta: 'llo', done: false },
        { type: 'text', delta: ' world', done: true },
      ]),
    })
    const deltas = dispatched.filter((a) => a.type === 'TEXT_DELTA')
    // 节流窗口内所有 chunk 合并 → 只 flush 一次（或极少数窗口）, 且最终文本完整
    const joined = deltas.map((a) => a.delta).join('')
    expect(joined).toBe('Hello world')
    const state = replay(dispatched)
    expect(state.messages[state.messages.length - 1].text).toBe('Hello world')
    expect(state.running).toBe(false)
  })

  it('renders [agent error: ...] as a red system line, not an assistant reply', async () => {
    // toolLoop 把 API 错误包成 '[agent error: HTTP 503 ...]' 返回——必须转成
    // [sys] 错误行（渲染为红色）, 而非 assistant 气泡（用户以为有输出实为错误）。
    const dispatched = []
    await runSession({
      dbPath: null,
      prompt: 'x',
      dispatch: (a) => dispatched.push(a),
      resolveImpl: stubResolve,
      runAgentImpl: async () => ({ text: '[agent error: HTTP 503: model_not_found ...]', toolCalls: [] }),
    })
    const sys = dispatched.filter((a) => a.type === 'APPEND_SYSTEM')
    expect(sys.some((a) => String(a.text).startsWith('[agent error'))).toBe(true)
    // 不产生 assistant TEXT_DELTA（错误不是回复）
    expect(dispatched.some((a) => a.type === 'TEXT_DELTA')).toBe(false)
    const state = replay(dispatched)
    expect(state.messages.some((m) => m.role === 'assistant' && m.text)).toBe(false)
  })

  it('renders agent error text relayed via onText as a system error line', async () => {
    // 流中途错误（streamChatWithRetry 提前终止）也走错误呈现路径
    const dispatched = []
    await runSession({
      dbPath: null,
      prompt: 'x',
      dispatch: (a) => dispatched.push(a),
      resolveImpl: stubResolve,
      textThrottleMs: 0,
      runAgentImpl: async ({ onText }) => {
        onText({ text: '[agent error: HTTP 401: invalid api key]', done: true })
        return { text: '', toolCalls: [] }
      },
    })
    expect(dispatched.some((a) => a.type === 'APPEND_SYSTEM' && String(a.text).startsWith('[agent error'))).toBe(true)
    expect(dispatched.filter((a) => a.type === 'TEXT_DELTA').length).toBe(0)
  })

  it('keeps empty text chunks from falsely marking output (placeholder-suffix providers)', async () => {
    // 部分中转站开头发空 content chunk: 不能把空串当成"有输出"
    const dispatched = []
    await runSession({
      dbPath: null,
      prompt: 'x',
      dispatch: (a) => dispatched.push(a),
      resolveImpl: stubResolve,
      textThrottleMs: 0,
      runAgentImpl: async ({ onText }) => {
        onText({ text: '', done: false })
        onText({ text: '', done: true })
        return { text: 'real answer', toolCalls: [] }
      },
    })
    const deltas = dispatched.filter((a) => a.type === 'TEXT_DELTA')
    // 空 chunk 不标记 hasAppendedText → 最终 result.text 走兜底追加
    expect(deltas.map((a) => a.delta)).toEqual(['real answer'])
  })
})
