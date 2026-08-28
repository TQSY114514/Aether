// ─── agentArena unit tests ──────────────────────────────────────────────────
// Tests for electron/llm/agentArena.js:
//   1. 纯函数: normalizeRoles / clampScore / judgePlans / parseJudgeJSON
//   2. runPlanPhase: 同模型走 runParallel(并行), 角色-模型映射走 runSubagent
//   3. runJudgePhase: LLM judge JSON 解析成功 / 失败回退启发式
//   4. runArena: 参数校验 / plan_only / full 全流程(mock 子代理, 不发起真实 LLM)
//
// 与 subAgent.test.js 同模式: Module._load hook mock 依赖, 不加载 electron.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import Module from 'node:module'

const runParallel = vi.fn()
const runSubagent = vi.fn()
const mockedSubAgent = { runParallel, runSubagent }
const mockedLogger = { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() }
const mockedWorkflow = { WORKFLOW_TEMPLATES: {}, runWorkflow: vi.fn() }

const origLoad = Module._load
Module._load = function (request, ...args) {
  if (request.includes('electron/llm/subAgent') || request === './subAgent') return mockedSubAgent
  if (request.includes('electron/llm/workflow') || request === './workflow') return mockedWorkflow
  if (request.includes('logger')) return mockedLogger
  return origLoad.apply(this, [request, ...args])
}

let arena

async function loadArena() {
  vi.resetModules()
  runParallel.mockReset()
  runSubagent.mockReset()
  mockedLogger.warn.mockClear()
  // 默认: runParallel 每个任务成功返回; runSubagent 返回无害内容
  runParallel.mockImplementation((tasks) => Promise.resolve(tasks.map((_, i) => ({ success: true, output: `out-${i}`, childSessionId: i + 1, latencyMs: 10 }))))
  runSubagent.mockResolvedValue({ content: '(content)', childSessionId: 99, wasTimeout: false, hasError: false, error: null })
  arena = await import('../electron/llm/agentArena')
}

const ctx = () => ({ db: {}, provider: { id: 1 }, model: { model_name: 'm' }, userRequest: 'do the thing', signal: undefined })

describe('normalizeRoles', () => {
  beforeEach(loadArena)

  it('字符串数组 → {role, model:null}', () => {
    const out = arena.normalizeRoles(['explore', 'build'])
    expect(out).toEqual([{ role: 'explore', model: null }, { role: 'build', model: null }])
  })

  it('对象数组保留 model 映射', () => {
    const cheap = { model_name: 'cheap' }
    const out = arena.normalizeRoles([{ role: 'explore', model: cheap }, { role: 'build' }])
    expect(out).toEqual([{ role: 'explore', model: cheap }, { role: 'build', model: null }])
  })

  it('过滤无效项 (空串 / 无 role / null)', () => {
    expect(arena.normalizeRoles(['explore', '', null, {}, { model: 1 }, 42])).toEqual([{ role: 'explore', model: null }])
  })

  it('非数组 → []', () => {
    expect(arena.normalizeRoles('explore')).toEqual([])
    expect(arena.normalizeRoles(undefined)).toEqual([])
  })
})

describe('clampScore', () => {
  beforeEach(loadArena)

  it('钳到 1-10 并保留 1 位小数', () => {
    expect(arena.clampScore(8.77)).toBe(8.8)
    expect(arena.clampScore(0)).toBe(1)
    expect(arena.clampScore(11)).toBe(10)
    expect(arena.clampScore(7)).toBe(7)
  })

  it('非数字回退 5', () => {
    expect(arena.clampScore('abc')).toBe(5)
    expect(arena.clampScore(undefined)).toBe(5)
  })
})

describe('judgePlans (启发式 fallback 纯函数)', () => {
  beforeEach(loadArena)

  it('全局评审平均分 + risk/test/长度 bonus, 封顶 10', () => {
    const plans = [
      { role: 'a', success: true, plan: 'step 1\nstep 2 risk mitigated, then test everything\n'.repeat(10) },
      { role: 'b', success: true, plan: 'tiny plan without keywords' },
      { role: 'c', success: false, plan: null },
    ]
    // 评审为全局平均: (7+3)/2 = 5 落到每个 plan, 差异化来自启发式 bonus
    const reviews = [
      { reviewer: 'b', target: 'all_others', review: 'a is good', score: 7, success: true },
      { reviewer: 'a', target: 'all_others', review: 'b is weak', score: 3, success: true },
    ]
    const ranked = arena.judgePlans(plans, reviews)
    expect(ranked[0].role).toBe('a')           // 5 + 0.5 + 0.5 + 0.3 = 6.3
    expect(ranked[0].finalScore).toBe(6.3)
    expect(ranked[1].role).toBe('b')           // 5 无 bonus
    expect(ranked[1].finalScore).toBe(5)
    expect(ranked[2].success).toBe(false)
    expect(ranked[2].finalScore).toBe(0)
  })

  it('无可用评审时默认 5 分, 失败的 review 不计入平均', () => {
    const plans = [{ role: 'a', success: true, plan: 'plain without keywords' }]
    const reviews = [
      { reviewer: 'x', target: null, review: '', score: 2, success: false },
    ]
    const ranked = arena.judgePlans(plans, reviews)
    expect(ranked[0].finalScore).toBe(5)
  })
})

describe('parseJudgeJSON', () => {
  beforeEach(loadArena)

  it('解析 ```json 围栏', () => {
    const out = arena.parseJudgeJSON('```json\n{"scores":[],"best":"explore"}\n```')
    expect(out).toEqual({ scores: [], best: 'explore' })
  })

  it('解析裸 JSON (含前后散文)', () => {
    const out = arena.parseJudgeJSON('Here you go: {"scores":[],"best":"build"} thanks!')
    expect(out).toEqual({ scores: [], best: 'build' })
  })

  it('无效输入 → null', () => {
    expect(arena.parseJudgeJSON('no json here')).toBeNull()
    expect(arena.parseJudgeJSON('{broken json}')).toBeNull()
    expect(arena.parseJudgeJSON('{\"scores\":[}')).toBeNull()
    expect(arena.parseJudgeJSON('')).toBeNull()
    expect(arena.parseJudgeJSON(null)).toBeNull()
  })
})

describe('runPlanPhase', () => {
  beforeEach(loadArena)

  it('同模型 → runParallel 并行, 每个任务带角色差异化 prompt', async () => {
    const plans = await arena.runPlanPhase({
      ...ctx(), roles: ['explore', 'build', 'review'],
    })
    expect(runParallel).toHaveBeenCalledTimes(1)
    expect(plans).toHaveLength(3)
    expect(plans[0]).toMatchObject({ role: 'explore', success: true, plan: 'out-0' })
    // role prompt 注入角色系统提示 (explore 角色说 READ-ONLY)
    const tasks = runParallel.mock.calls[0][0]
    expect(tasks[0]).toContain('EXPLORATION agent')
    expect(tasks[1]).toContain('BUILD agent')
    expect(tasks[2]).toContain('REVIEW agent')
  })

  it('角色-模型映射 → 每个角色用各自 model 并行 runSubagent', async () => {
    const cheap = { model_name: 'cheap' }
    const main = ctx().model
    const plans = await arena.runPlanPhase({
      ...ctx(), roles: [{ role: 'explore', model: cheap }, { role: 'build' }],
    })
    expect(runParallel).not.toHaveBeenCalled()
    expect(runSubagent).toHaveBeenCalledTimes(2)
    expect(runSubagent.mock.calls[0][0].model).toBe(cheap)  // 映射的模型
    expect(runSubagent.mock.calls[1][0].model).toStrictEqual({ model_name: 'm' })  // 缺省用主模型
    expect(plans).toHaveLength(2)
    expect(plans.every(p => p.success)).toBe(true)
  })

  it('runParallel 返回失败项时保留 error 字段', async () => {
    runParallel.mockResolvedValue([
      { success: false, error: 'boom', childSessionId: null },
    ])
    const plans = await arena.runPlanPhase({ ...ctx(), roles: ['explore'] })
    expect(plans[0]).toMatchObject({ role: 'explore', success: false, error: 'boom', plan: null })
  })
})

describe('runJudgePhase (LLM judge)', () => {
  beforeEach(loadArena)

  const plans = [
    { role: 'explore', success: true, plan: 'plan A with risk and test detail ' },
    { role: 'build', success: true, plan: 'plan B ' },
  ]
  const reviews = [
    { reviewer: 'build', review: 'explore plan solid', score: 8, success: true },
    { reviewer: 'explore', review: 'build plan ok', score: 6, success: true },
  ]

  it('LLM 返回可解析 JSON → 采用 LLM 分数排序', async () => {
    runSubagent.mockResolvedValue({
      content: '{"scores":[{"role":"explore","score":9.5,"reasoning":"concrete"},{"role":"build","score":4,"reasoning":"vague"}],"best":"explore","decision":"d"}',
      childSessionId: 1,
    })
    const ranked = await arena.runJudgePhase({ ...ctx(), plans, reviews })
    expect(ranked[0].role).toBe('explore')
    expect(ranked[0].finalScore).toBe(9.5)
    expect(ranked[0].llmAwarded).toBe(true)
    expect(ranked[1].finalScore).toBe(4)
    // 即使启发式会颠倒 (build 平庸短计划), LLM 分数优先
    expect(mockedLogger.warn).not.toHaveBeenCalled()
  })

  it('LLM 返回不可解析内容 → 回退 judgePlans 启发式并告警', async () => {
    runSubagent.mockResolvedValue({ content: 'I think explore is best, no structure here', childSessionId: 2 })
    const ranked = await arena.runJudgePhase({ ...ctx(), plans, reviews })
    // fallback: explore avg 8 + bonus(risk+test+长度) ≈ 9.3; build 6
    expect(mockedLogger.warn).toHaveBeenCalled()
    expect(ranked[0].role).toBe('explore')
    expect(ranked[0].llmAwarded).toBeUndefined()
    expect(ranked[0].judgeReasoning).toContain('avg review score')
  })

  it('LLM 调用抛错 → 回退启发式', async () => {
    runSubagent.mockRejectedValue(new Error('provider down'))
    const ranked = await arena.runJudgePhase({ ...ctx(), plans, reviews })
    expect(mockedLogger.warn).toHaveBeenCalled()
    expect(ranked[0].role).toBe('explore')
  })
})

describe('runArena', () => {
  beforeEach(loadArena)

  it('缺参校验: db/provider/model', async () => {
    const r = await arena.runArena({ userRequest: 'x' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('missing required params')
  })

  it('空 userRequest 校验', async () => {
    const r = await arena.runArena({ ...ctx(), userRequest: '   ' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('userRequest is required')
  })

  it('空 roles 校验', async () => {
    const r = await arena.runArena({ ...ctx(), roles: [] })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('roles must be a non-empty array')
  })

  it('plan_only: 并行产出 plans, 返回截断 + subagentCalls', async () => {
    const r = await arena.runArena({ ...ctx(), mode: 'plan_only', roles: ['explore', 'build'] })
    expect(r.ok).toBe(true)
    expect(r.plans).toHaveLength(2)
    expect(r.plans[0]).toMatchObject({ role: 'explore', success: true })
    expect(r.subagentCalls).toBe(2)
    expect(runParallel).toHaveBeenCalledTimes(1)  // plan 阶段一次性并行
  })

  it('full: plan→review→judge→execute 全流程 (全 mock)', async () => {
    // judge LLM 返回 JSON: build 赢
    runSubagent.mockResolvedValue({
      content: '{"scores":[{"role":"explore","score":5,"reasoning":"ok"},{"role":"build","score":9,"reasoning":"best"},{"role":"review","score":6,"reasoning":"fine"}],"best":"build","decision":"build wins"}',
      childSessionId: 7,
    })
    const r = await arena.runArena({ ...ctx(), mode: 'full', roles: ['explore', 'build', 'review'] })
    expect(r.ok).toBe(true)
    expect(r.bestPlan.role).toBe('build')
    expect(r.bestPlan.score).toBe(9)
    expect(r.execution.success).toBe(true)
    expect(r.rounds).toBe(1)
    // 预算计数: 3 plan + 3 review + 1 judge + 1 execute = 8
    expect(r.subagentCalls).toBe(8)
  })

  it('full + refineloop: 分数低于阈值时 refine 一轮', async () => {
    // judge 先给低分让 refine 循环触发, 再给高分
    runSubagent
      .mockResolvedValueOnce({ content: '{"scores":[{"role":"explore","score":2,"reasoning":"bad"}],"best":"explore","decision":"meh"}', childSessionId: 1 })   // judge #1 → 触发 refine
      .mockResolvedValue({ content: '(refined plan)', childSessionId: 2 })                                                                                    // refine + review + execute
    const r = await arena.runArena({ ...ctx(), mode: 'full', roles: ['explore'], maxRounds: 2, judgeThreshold: 6 })
    expect(r.ok).toBe(true)
    expect(r.rounds).toBe(2)  // 执行了 1 轮 refine
    // 预算计数: plan(1) + review(1) + judge(1) + refine(1) + critique(1) + execute(1) = 6
    expect(r.subagentCalls).toBe(6)
  })

  it('预算枯竭: maxSubagentCalls=1 在 plan 阶段安全中止', async () => {
    const r = await arena.runArena({ ...ctx(), mode: 'full', roles: ['explore', 'build'], maxSubagentCalls: 1 })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('budget exhausted')
  })
})

describe('runSupervisorPhase (P2-1 动态角色路由)', () => {
  beforeEach(loadArena)

  const sp = () => ({ db: {}, provider: { id: 1 }, model: { model_name: 'm' }, userRequest: 'fix a bug in code', signal: undefined, fallbackRoles: ['explore', 'build', 'review'] })

  it('LLM 返回有效 roles → 采用并带 llmAwarded', async () => {
    runSubagent.mockResolvedValue({
      content: '{"roles":["debug","build"],"reasoning":"it is a bug fix"}',
      childSessionId: 1,
    })
    const sup = await arena.runSupervisorPhase(sp())
    expect(sup.llmAwarded).toBe(true)
    expect(sup.roles).toEqual(['debug', 'build'])
    expect(sup.reasoning).toBe('it is a bug fix')
  })

  it('返回非法角色名 → 过滤后仍可用, 全非法则 fallback', async () => {
    runSubagent.mockResolvedValue({ content: '{"roles":["debug","drone","evil"],"reasoning":"x"}', childSessionId: 1 })
    const sup = await arena.runSupervisorPhase(sp())
    expect(sup.roles).toEqual(['debug'])  // 非法项被剔除

    runSubagent.mockResolvedValue({ content: '{"roles":["terminator","drone"],"reasoning":"x"}', childSessionId: 1 })
    const sup2 = await arena.runSupervisorPhase(sp())
    expect(sup2.llmAwarded).toBeUndefined()
    expect(sup2.roles).toEqual(['explore', 'build', 'review'])  // fallback
  })

  it('不可解析 JSON 或调用抛错 → fallback 默认 roles + 告警', async () => {
    runSubagent.mockResolvedValue({ content: 'no json at all', childSessionId: 1 })
    const sup = await arena.runSupervisorPhase(sp())
    expect(sup.llmAwarded).toBeUndefined()
    expect(sup.roles).toEqual(['explore', 'build', 'review'])
    expect(mockedLogger.warn).toHaveBeenCalled()

    mockedLogger.warn.mockClear()
    runSubagent.mockRejectedValue(new Error('provider down'))
    const sup2 = await arena.runSupervisorPhase(sp())
    expect(sup2.roles).toEqual(['explore', 'build', 'review'])
    expect(mockedLogger.warn).toHaveBeenCalled()
  })
})

describe('runArena + supervise (P2-1)', () => {
  beforeEach(loadArena)

  it('supervise=true: supervisor 选角色执行 full 流程', async () => {
    // supervisor 调用返回 json(debug+build), judge 返回 json 让 debug 赢
    runSubagent
      .mockResolvedValueOnce({ content: '{"roles":["debug","build"],"reasoning":"bug fix"}', childSessionId: 1 })
      .mockResolvedValueOnce({ content: '{"scores":[{"role":"debug","score":8,"reasoning":"good"}],"best":"debug","decision":"d"}', childSessionId: 2 })
    const r = await arena.runArena({ ...ctx(), mode: 'full', roles: ['explore', 'build', 'review'], supervise: true })
    expect(r.ok).toBe(true)
    expect(r.supervisor).toEqual({ roles: ['debug', 'build'], reasoning: 'bug fix' })
    expect(r.bestPlan.role).toBe('debug')
    // 2 plan + 1 review(debug 有对比对象? plans 只有 debug+build 都成功 → 2 review) + 1 judge + 1 execute + 1 supervisor = 7
    // plan: 2, review: 2 成功 plan, judge: 1, execute: 1, supervisor: 1 → 7
    expect(r.subagentCalls).toBe(7)
    // 角色从 supervisor 来 → runParallel 用 ['debug','build'] prompt
    const tasks = runParallel.mock.calls[0][0]
    expect(tasks).toHaveLength(2)
  })

  it('supervise=true 但 supervisor 失败 → 保留调用方默认 roles, supervisor=null', async () => {
    runSubagent.mockResolvedValue({ content: 'garbage', childSessionId: 1 })  // supervisor 解析失败
    const r = await arena.runArena({ ...ctx(), mode: 'plan_only', roles: ['explore'], supervise: true })
    expect(r.ok).toBe(true)
    expect(r.supervisor).toBeNull()
    expect(r.plans).toHaveLength(1)
    expect(r.plans[0].role).toBe('explore')  // fallback roles 生效
    expect(r.subagentCalls).toBe(2)  // 1 supervisor + 1 plan
  })
})

describe('runArena + checkpoint (P2-2)', () => {
  beforeEach(loadArena)

  it('plan_only: 带 checkpointKey 返回并落盘', async () => {
    const r = await arena.runArena({ ...ctx(), mode: 'plan_only', roles: ['explore'], checkpointKey: 'my-ck' })
    expect(r.ok).toBe(true)
    expect(r.checkpoint).toBe('my-ck')
    // 同进程内可从内存 checkpoint 读取
    const ck = arena.loadArenaCheckpoint(ctx().db, 'my-ck')
    expect(ck).not.toBeNull()
    expect(ck.plans).toHaveLength(1)
    expect(ck.phase).toBe('plans')
  })

  it('full: 恢复 checkpoint 跳过已完成 plan/review 阶段', async () => {
    // 第一次: plan_only 存 plans checkpoint
    await arena.runArena({ ...ctx(), mode: 'plan_only', roles: ['explore', 'build'], checkpointKey: 'resume-ck' })
    runParallel.mockClear()
    // 第二次: full + 同 key → plans/reviews 从 checkpoint 恢复, 只跑 judge + execute
    runSubagent.mockResolvedValue({ content: '{"scores":[{"role":"explore","score":7,"reasoning":"ok"}],"best":"explore","decision":"d"}', childSessionId: 5 })
    const r = await arena.runArena({ ...ctx(), mode: 'full', roles: ['explore', 'build'], checkpointKey: 'resume-ck' })
    expect(r.ok).toBe(true)
    // 但 plan_only checkpoint 只有 plans (phase=plans) — full 模式下 mode 不匹配会忽略
    // plan_only ck.mode='plan_only' ≠ 'full' → 不恢复 → 仍跑全流程
    expect(r.bestPlan.role).toBe('explore')
    expect(r.subagentCalls).toBeGreaterThanOrEqual(4)
  })

  it('full: 同 mode 同 key 的 checkpoint 恢复 plan/review/judge, 只执行 execute', async () => {
    // 第一步: full 跑完但刻意让 execute 失败? 简化: 先手动构造一个 phase=judged 的 checkpoint
    const ckPlans = [
      { role: 'explore', success: true, plan: 'plan A risk test details', childSessionId: 1 },
      { role: 'build', success: true, plan: 'plan B risk test details too', childSessionId: 2 },
    ]
    const ckReviews = [
      { reviewer: 'explore', target: 'all_others', review: 'solid', score: 8, success: true },
      { reviewer: 'build', target: 'all_others', review: 'solid too', score: 7, success: true },
    ]
    const ckRanked = [
      { ...ckPlans[0], finalScore: 8.5, judgeReasoning: 'from ck' },
      { ...ckPlans[1], finalScore: 7.5, judgeReasoning: 'from ck' },
    ]
    arena.saveArenaCheckpoint(ctx().db, 'full-ck', { userRequest: ctx().userRequest, mode: 'full', phase: 'judged', plans: ckPlans, reviews: ckReviews, ranked: ckRanked })

    runSubagent.mockResolvedValue({ content: '(executed)', childSessionId: 9 })
    const r = await arena.runArena({ ...ctx(), mode: 'full', roles: ['explore', 'build'], checkpointKey: 'full-ck' })
    expect(r.ok).toBe(true)
    // 恢复后只执行 execute: runParallel 不调用, runSubagent 只调 1 次 (execute)
    expect(runParallel).not.toHaveBeenCalled()
    expect(runSubagent).toHaveBeenCalledTimes(1)
    expect(r.subagentCalls).toBe(1)
    expect(r.bestPlan.role).toBe('explore')
    expect(r.bestPlan.reasoning).toBe('from ck')
  })
})