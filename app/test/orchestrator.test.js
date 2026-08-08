// ─── Orchestrator unit tests ────────────────────────────────────────────────
// Tests for electron/llm/orchestrator.js: plan → dependency-aware parallel
// batches → summarize. Uses a fake db (flag control) and injected planner /
// runner so no live model calls happen.

import { describe, it, expect } from 'vitest'
import orchestrator from '../electron/llm/orchestrator'

const { isEnabled, batchTasks, planToBatches, summarizeResults, orchestrate } = orchestrator

function mkDb(enabled = true) {
  return {
    getSetting: (k) => (enabled ? '1' : '0'),
  }
}

const fakePlan = {
  description: 'ship the feature',
  tasks: [
    { id: '1', description: 'design', dependsOn: [], status: 'pending', result: null },
    { id: '2', description: 'implement', dependsOn: ['1'], status: 'pending', result: null },
    { id: '3', description: 'test', dependsOn: ['2'], status: 'pending', result: null },
    { id: '4', description: 'docs', dependsOn: ['2'], status: 'pending', result: null },
  ],
}

const fakeRunner = () => (tasks) => tasks.map((t, i) => ({ success: true, output: `done ${i}` }))

// ─── flag ───────────────────────────────────────────────────────────────────

describe('isEnabled', () => {
  it('honors the agent.orchestrator flag', () => {
    expect(isEnabled(mkDb(true))).toBe(true)
    expect(isEnabled(mkDb(false))).toBe(false)
    expect(isEnabled(null)).toBe(false)
  })
})

// ─── batchTasks ─────────────────────────────────────────────────────────────

describe('batchTasks', () => {
  it('groups independent tasks into one batch, dependencies into later ones', () => {
    const batches = batchTasks(fakePlan.tasks)
    // batch1: {1} → batch2: {2} → batch3: {3,4} (both depend on 2)
    expect(batches.length).toBe(3)
    expect(batches[0]).toEqual(['1'])
    expect(batches[2]).toContain('3')
    expect(batches[2]).toContain('4')
  })

  it('handles fully independent tasks in one batch', () => {
    const tasks = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
    ]
    const batches = batchTasks(tasks)
    expect(batches.length).toBe(1)
    expect(batches[0].slice().sort()).toEqual(['a', 'b'])
  })

  it('survives cycles by breaking them', () => {
    const tasks = [
      { id: 'a', dependsOn: ['b'] },
      { id: 'b', dependsOn: ['a'] },
    ]
    const batches = batchTasks(tasks)
    expect(batches.length).toBeGreaterThan(1)
  })
})

// ─── planToBatches ──────────────────────────────────────────────────────────

describe('planToBatches', () => {
  it('renders prompts from tasks respecting batches', () => {
    const batches = planToBatches(fakePlan)
    expect(batches.length).toBe(3)
    expect(batches[0][0]).toContain('design')
    expect(batches[2].length).toBe(2)
  })

  it('returns empty for empty/null plans', () => {
    expect(planToBatches(null)).toEqual([])
    expect(planToBatches({ tasks: [] })).toEqual([])
  })
})

// ─── summarizeResults ───────────────────────────────────────────────────────

describe('summarizeResults', () => {
  it('renders success and failure lines', () => {
    const summary = summarizeResults(
      [
        { success: true, output: 'ok a' },
        { success: false, error: 'boom' },
      ],
      fakePlan,
    )
    expect(summary).toContain('ship the feature')
    expect(summary).toContain('ok a')
    expect(summary).toContain('failed: boom')
  })
})

// ─── orchestrate ────────────────────────────────────────────────────────────

describe('orchestrate', () => {
  it('falls back to a single run when no plan is requested', async () => {
    const res = await orchestrate({
      db: mkDb(true),
      request: 'simple thing',
      isPlanRequested: false,
      runParallel: fakeRunner,
    })
    expect(res.ok).toBe(true)
    expect(res.plan).toBeNull()
    expect(res.results.length).toBe(1)
  })

  it('requires a request', async () => {
    const res = await orchestrate({ db: mkDb(true), request: '   ' })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('request is required')
  })

  it('runs planned tasks in batches and summarizes', async () => {
    const seen = []
    const runner = async (tasks) => {
      seen.push(tasks.length)
      return tasks.map(() => ({ success: true, output: 'step result' }))
    }
    const res = await orchestrate({
      db: mkDb(true),
      request: 'build the whole feature and ship it with docs',
      isPlanRequested: true,
      generatePlan: async () => fakePlan,
      runParallel: runner,
    })
    expect(res.ok).toBe(true)
    expect(res.plan).toBe(fakePlan)
    // 4 tasks → batch sizes [1,1,2]
    expect(seen).toEqual([1, 1, 2])
    expect(res.results.length).toBe(4)
    expect(res.summary).toContain('ship the feature')
  })

  it('degrades to single run when plan generation fails', async () => {
    const res = await orchestrate({
      db: mkDb(true),
      request: 'something big',
      isPlanRequested: true,
      generatePlan: async () => null,
      runParallel: fakeRunner,
    })
    expect(res.ok).toBe(true)
    expect(res.plan).toBeNull()
    expect(res.results.length).toBe(1)
  })

  it('returns ok:false on runner failure', async () => {
    const res = await orchestrate({
      db: mkDb(true),
      request: 'whatever',
      isPlanRequested: false,
      runParallel: async () => { throw new Error('runner down') },
    })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('runner down')
  })
})