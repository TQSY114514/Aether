// ─── workflow unit tests ────────────────────────────────────────────────────
// Tests for electron/llm/workflow.js:
//   1. runWorkflow: 线性步骤推进 / 失败中止 / onStepComplete 回调
//   2. maxSubagentCalls 预算: 超预算安全中止 (P0 防失控)
//   3. stepModels 角色-模型映射: 各步骤用映射模型 (P1)
//   4. checkpoint: 失败后带 checkpointKey 续跑跳过已完成步骤 (P2-2)
//
// 与 subAgent.test.js 同模式: Module._load hook mock 依赖, 不加载 electron.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import Module from 'node:module'

const runSubagent = vi.fn()
const mockedSubAgent = { runSubagent, runParallel: vi.fn() }
const mockedLogger = { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() }
const mockedRoles = {
  getRole: name => ({ name }),
  buildRolePrompt: name => `You are the ${String(name).toUpperCase()} agent`,
  getRoleDefaultMode: () => 'plan',
}

const origLoad = Module._load
Module._load = function (request, ...args) {
  if (request.includes('electron/llm/subAgent') || request === './subAgent') return mockedSubAgent
  if (request.includes('electron/llm/agentRoles') || request === './agentRoles') return mockedRoles
  if (request.includes('logger')) return mockedLogger
  return origLoad.apply(this, [request, ...args])
}

let wf

async function loadWorkflow() {
  vi.resetModules()
  runSubagent.mockReset()
  mockedLogger.warn.mockClear()
  runSubagent.mockResolvedValue({ content: '(step output)', childSessionId: 42, wasTimeout: false, hasError: false, error: null })
  wf = await import('../electron/llm/workflow')
}

const ctx = () => ({ db: {}, provider: { id: 1 }, model: { model_name: 'm' }, userRequest: 'do the thing', signal: undefined })

describe('runWorkflow 基础', () => {
  beforeEach(loadWorkflow)

  it('未知模板报错', async () => {
    const r = await wf.runWorkflow({ ...ctx(), templateName: 'nope' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('unknown template')
  })

  it('feature 模板: 5 步线性推进, context 喂给下一步', async () => {
    const r = await wf.runWorkflow({ ...ctx(), templateName: 'feature' })
    expect(r.ok).toBe(true)
    expect(r.trace).toHaveLength(5)  // understand → plan → implement → test → review
    expect(r.trace.map(t => t.type)).toEqual(['understand', 'plan', 'implement', 'test', 'review'])
    expect(runSubagent).toHaveBeenCalledTimes(5)
    // 第 2 步起 prompt 带上一步输出
    const prompts = runSubagent.mock.calls.map(c => c[0].prompt)
    expect(prompts[1]).toContain('Output from step 1')
    expect(prompts[1]).toContain('(step output)')
    // 角色 prompt 注入
    expect(prompts[0]).toContain('EXPLORE agent')
    expect(prompts[2]).toContain('BUILD agent')
    expect(prompts[4]).toContain('REVIEW agent')
  })

  it('某步失败 → 中止并返回 completedSteps + trace', async () => {
    runSubagent
      .mockResolvedValueOnce({ content: 'ok', childSessionId: 1 })
      .mockRejectedValueOnce(new Error('provider boom'))
    const r = await wf.runWorkflow({ ...ctx(), templateName: 'bugfix' })  // 4 步
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Step 2')
    expect(r.completedSteps).toBe(1)
    expect(r.trace).toHaveLength(2)
    expect(r.trace[0].success).toBe(true)
    expect(r.trace[1].success).toBe(false)
  })

  it('onStepComplete 每步回调', async () => {
    const seen = []
    await wf.runWorkflow({ ...ctx(), templateName: 'explore', onStepComplete: s => seen.push(s.type) })
    expect(seen).toEqual(['survey', 'deepdive', 'summarize'])
  })
})

describe('runWorkflow + maxSubagentCalls (预算)', () => {
  beforeEach(loadWorkflow)

  it('超预算 → 安全中止, 不发起更多调用', async () => {
    const r = await wf.runWorkflow({ ...ctx(), templateName: 'feature', maxSubagentCalls: 2 })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('budget exhausted')
    expect(r.budgetExhausted).toBe(true)
    expect(r.completedSteps).toBe(2)
    expect(runSubagent).toHaveBeenCalledTimes(2)
  })

  it('预算足够 → 正常完成', async () => {
    const r = await wf.runWorkflow({ ...ctx(), templateName: 'feature', maxSubagentCalls: 10 })
    expect(r.ok).toBe(true)
    expect(runSubagent).toHaveBeenCalledTimes(5)
  })
})

describe('runWorkflow + stepModels (角色-模型映射)', () => {
  beforeEach(loadWorkflow)

  it('role→model 映射: 该角色步骤用映射模型, 其余用主模型', async () => {
    const cheap = { model_name: 'cheap-small' }
    await wf.runWorkflow({ ...ctx(), templateName: 'feature', stepModels: { explore: cheap } })
    const models = runSubagent.mock.calls.map(c => c[0].model)
    // understand(explore)→cheap, plan(explore)→cheap, implement(build)→m, test(build)→m, review(review)→m
    expect(models[0]).toStrictEqual(cheap)
    expect(models[1]).toStrictEqual(cheap)
    expect(models[2]).toStrictEqual({ model_name: 'm' })
    expect(models[4]).toStrictEqual({ model_name: 'm' })
  })

  it('step-index 数组映射: 只覆盖对应索引', async () => {
    const strong = { model_name: 'strong-big' }
    await wf.runWorkflow({ ...ctx(), templateName: 'bugfix', stepModels: [null, strong] })
    const models = runSubagent.mock.calls.map(c => c[0].model)
    expect(models[0]).toStrictEqual({ model_name: 'm' })  // 索引 0 null → 主模型
    expect(models[1]).toStrictEqual(strong)               // 索引 1 → strong
  })
})

describe('runWorkflow + checkpoint (P2-2 断点续跑)', () => {
  beforeEach(loadWorkflow)

  it('失败后以 checkpointKey 续跑: 跳过已完成步骤只跑剩余', async () => {
    // 第一次: 第 3 步 (implement) 失败 → 前 2 步存档
    runSubagent
      .mockResolvedValueOnce({ content: 'out1', childSessionId: 1 })
      .mockResolvedValueOnce({ content: 'out2', childSessionId: 2 })
      .mockRejectedValueOnce(new Error('boom'))
    const r1 = await wf.runWorkflow({ ...ctx(), templateName: 'feature', checkpointKey: 'wf-ck' })
    expect(r1.ok).toBe(false)
    expect(r1.completedSteps).toBe(2)
    expect(r1.checkpoint).toBe('wf-ck')

    // 第二次: 同 key 续跑 → 从步骤 3 开始 (只 3 次调用), 不重跑 1/2
    runSubagent.mockClear()
    runSubagent.mockResolvedValue({ content: 'ok', childSessionId: 9 })
    const r2 = await wf.runWorkflow({ ...ctx(), templateName: 'feature', checkpointKey: 'wf-ck' })
    expect(r2.ok).toBe(true)
    expect(r2.trace).toHaveLength(5)
    expect(runSubagent).toHaveBeenCalledTimes(3)  // implement + test + review
    // 第 3 步 prompt 已带上 checkpoint 恢复的 context (前 2 步输出)
    const prompts = runSubagent.mock.calls.map(c => c[0].prompt)
    expect(prompts[0]).toContain('Output from step 2')
  })

  it('未知 checkpointKey → 从头跑', async () => {
    runSubagent.mockResolvedValue({ content: 'ok', childSessionId: 1 })
    const r = await wf.runWorkflow({ ...ctx(), templateName: 'explore', checkpointKey: 'missing-ck' })
    expect(r.ok).toBe(true)
    expect(runSubagent).toHaveBeenCalledTimes(3)
  })

  it('load/saveWorkflowCheckpoint 读写一致 (内存 db)', async () => {
    const db = {}
    const saved = { completedSteps: 2, trace: [{ x: 1 }], context: 'ctx' }
    wf.saveWorkflowCheckpoint(db, 'k1', saved)
    const loaded = wf.loadWorkflowCheckpoint(db, 'k1')
    expect(loaded).toEqual(saved)
    expect(wf.loadWorkflowCheckpoint(db, 'absent')).toBeNull()
  })
})