// ─── Model Router tests ─────────────────────────────────────────────────────
// Covers routeTask tier classification and suggestModelForTier (including the
// autoMode ELO + price + latency blending).

import { describe, it, expect } from 'vitest'
import { routeTask, suggestModelForTier, needsExtendedThinking } from '../electron/llm/modelRouter'

const models = [
  { id: 1, model_name: 'claude-haiku-4', provider_id: 1, is_primary: 1, input_price_per_1k: 0.001 },
  { id: 2, model_name: 'claude-sonnet-4', provider_id: 1, is_primary: 0, input_price_per_1k: 0.003 },
  { id: 3, model_name: 'opus-4', provider_id: 1, is_primary: 0, input_price_per_1k: 0.015 },
]

describe('modelRouter routeTask', () => {
  it('routes fast tasks to the fast tier', () => {
    expect(routeTask('classify', 'is this a bug?', 2)).toBe('fast')
    expect(routeTask('extract', 'get the name', 1)).toBe('fast')
  })

  it('routes long messages or long histories to thinking', () => {
    expect(routeTask('complete', 'x'.repeat(5000), 2)).toBe('thinking')
    expect(routeTask('complete', 'short', 50)).toBe('thinking')
  })

  it('routes short simple messages to fast', () => {
    expect(routeTask('complete', 'hi', 1)).toBe('fast')
  })

  it('defaults to standard for everything else', () => {
    expect(routeTask('complete', 'a moderately long request that needs reasoning', 5)).toBe('standard')
  })
})

describe('modelRouter suggestModelForTier', () => {
  it('returns null when no models are provided', () => {
    expect(suggestModelForTier('fast', [])).toBeNull()
    expect(suggestModelForTier('fast', null)).toBeNull()
  })

  it('picks a fast-tier model for the fast tier', () => {
    const r = suggestModelForTier('fast', models)
    expect(r.modelName).toBe('claude-haiku-4')
    expect(r.autoMode).toBe(false)
  })

  it('picks a thinking-tier model for the thinking tier', () => {
    const r = suggestModelForTier('thinking', models)
    expect(r.modelName).toBe('opus-4')
  })

  it('picks the primary model for the standard tier', () => {
    const r = suggestModelForTier('standard', models)
    expect(r.modelName).toBe('claude-haiku-4')
  })

  it('autoMode stock quality favors higher ELO', () => {
    const r = suggestModelForTier('standard', models, {
      autoMode: true,
      priority: 'quality',
      eloData: { 1: { score: 900, total_count: 10 }, 2: { score: 1400, total_count: 10 }, 3: { score: 1000, total_count: 10 } },
    })
    expect(r.autoMode).toBe(true)
    expect(r.modelName).toBe('claude-sonnet-4')
    expect(r.eloScore).toBe(1400)
  })

  it('autoMode cost priority favors the cheapest model', () => {
    const r = suggestModelForTier('standard', models, {
      autoMode: true,
      priority: 'cost',
      eloData: { 1: { score: 1000, total_count: 10 }, 2: { score: 1000, total_count: 10 }, 3: { score: 1000, total_count: 10 } },
    })
    expect(r.modelName).toBe('claude-haiku-4')
  })
})

describe('modelRouter needsExtendedThinking', () => {
  it('flags long messages and verification keywords', () => {
    expect(needsExtendedThinking('x'.repeat(1000), 1)).toBe(true)
    expect(needsExtendedThinking('请重构这个架构', 1)).toBe(true)
    expect(needsExtendedThinking('hi', 1)).toBe(false)
  })
  it('flags long histories', () => {
    expect(needsExtendedThinking('hi', 20)).toBe(true)
  })
})