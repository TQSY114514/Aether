// ─────────────────────────────────────────────────────────────────────────────
// status.test.js — 状态栏 + steering 回注队列（todo 6）
// 验收：mock agent:start → 状态栏 running 且预算减一；注入消息后队列渲染 +1。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach } from 'vitest'
import { tuiReducer, initialTuiState } from '../../tui/reducer.js'
import { runSession, injectSteering } from '../../tui/runSession.js'

const stubResolve = () => ({
  provider: { id: 1, name: 'mock', api_url: 'http://127.0.0.1', api_key: 'k', api_format: 'openai' },
  model: { id: 1, model_name: 'mock-model' },
})

function replay(dispatched) {
  return dispatched.reduce(tuiReducer, initialTuiState)
}

afterEach(() => {
  // 清掉 steering 模块的会话态，避免跨用例泄漏
  const steering = require('../../electron/llm/steering')
  steering.clearSession('tui')
})

describe('状态栏：agent:start → running + 预算（todo 6）', () => {
  it('runSession 起始派发 AGENT_START → running true、预算 max 就位', async () => {
    const dispatched = []
    await runSession({
      dbPath: null,
      prompt: 'x',
      maxIterations: 5,
      dispatch: (a) => dispatched.push(a),
      resolveImpl: stubResolve,
      runAgentImpl: async () => ({ text: 'ok', toolCalls: [] }),
    })
    const state = replay(dispatched)
    expect(dispatched).toContainEqual({ type: 'AGENT_START', max: 5 })
    // 会话结束后 running 归 false，但 AGENT_START 时刻是 running
    const atStart = dispatched.slice(0, dispatched.findIndex((a) => a.type === 'AGENT_START') + 1)
      .reduce(tuiReducer, initialTuiState)
    expect(atStart.running).toBe(true)
    expect(atStart.budget).toEqual({ used: 0, max: 5 })
  })

  it('onPlanStep(depth) → 预算减一（used = depth+1）', async () => {
    const dispatched = []
    const agentImpl = async ({ onPlanStep }) => {
      onPlanStep({ step: 0, depth: 0, remaining: 4 })
      onPlanStep({ step: 1, depth: 1, remaining: 3 })
      return { text: 'done', toolCalls: [] }
    }
    await runSession({
      dbPath: null,
      prompt: 'x',
      maxIterations: 5,
      dispatch: (a) => dispatched.push(a),
      resolveImpl: stubResolve,
      runAgentImpl: agentImpl,
    })
    const state = replay(dispatched)
    // 预算：0 → 1 → 2（每轮消耗一次）
    expect(dispatched.filter((a) => a.type === 'BUDGET')).toEqual([
      { type: 'BUDGET', used: 1 },
      { type: 'BUDGET', used: 2 },
    ])
    expect(state.budget.used).toBe(2)
    expect(state.budget.max).toBe(5)
  })
})

describe('steering 回注队列（todo 6）', () => {
  it('STEER_ENQUEUE → 队列渲染 +1；STEER_DEQUEUE 消费', () => {
    let s = tuiReducer(initialTuiState, { type: 'STEER_ENQUEUE', text: '先修复那个 bug' })
    expect(s.steeringQueue).toHaveLength(1)
    expect(s.steeringQueue[0]).toBe('先修复那个 bug')
    s = tuiReducer(s, { type: 'STEER_ENQUEUE', text: '   ' })
    expect(s.steeringQueue).toHaveLength(1) // 空白不入队
    s = tuiReducer(s, { type: 'STEER_DEQUEUE' })
    expect(s.steeringQueue).toHaveLength(0)
  })

  it('injectSteering 写入 steering 模块，循环可消费（同 key tui）', () => {
    injectSteering('tui', '现在切到 plan 模式')
    const steering = require('../../electron/llm/steering')
    const pending = steering.getPendingInjections('tui')
    expect(pending).toContain('现在切到 plan 模式')
  })

  it('onStatus kind=injection → STEER_DEQUEUE（注入已被循环消费）', async () => {
    const dispatched = []
    const agentImpl = async ({ onStatus }) => {
      onStatus({ text: '📥 已插入你的新消息', kind: 'injection' })
      return { text: 'done', toolCalls: [] }
    }
    await runSession({
      dbPath: null,
      prompt: 'x',
      dispatch: (a) => dispatched.push(a),
      resolveImpl: stubResolve,
      runAgentImpl: agentImpl,
    })
    expect(dispatched).toContainEqual({ type: 'STEER_DEQUEUE' })
  })

  it('Ctrl+C 打断态：STEER_MODE 切换（状态栏提示）', () => {
    let s = tuiReducer(initialTuiState, { type: 'STEER_MODE', on: true })
    expect(s.steeringMode).toBe(true)
    s = tuiReducer(s, { type: 'STEER_MODE', on: false })
    expect(s.steeringMode).toBe(false)
  })

  it('currentTool 随 TOOL_START/END 更新（状态栏工具名）', () => {
    let s = tuiReducer(initialTuiState, { type: 'TOOL_START', entry: { name: 'run_tests', args: {} } })
    expect(s.currentTool).toBe('run_tests')
    s = tuiReducer(s, { type: 'TOOL_END', entry: { name: 'run_tests', result: 'ok' } })
    expect(s.currentTool).toBeNull()
  })
})
