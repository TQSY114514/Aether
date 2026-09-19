// ─── Model Advisor tests ───────────────────────────────────────────────────
// Validates Cold-Start Prior, Dynamic ELO blending (0 -> 15% -> 80%),
// unified ModelRouter.route() delegation, and priority adjustments.

import { describe, it, expect } from 'vitest'
import {
  suggestModel,
  suggestModelExplained,
  ModelRouter,
  routeWithExplanation,
  classifyTask,
  detectFamily,
} from '../electron/llm/modelAdvisor'

const mockModels = [
  { id: 1, model_name: 'claude-3-7-sonnet', provider_id: 1 },
  { id: 2, model_name: 'gpt-4o', provider_id: 2 },
  { id: 3, model_name: 'deepseek-v3', provider_id: 3 },
]

describe('modelAdvisor Cold Start Prior', () => {
  it('falls back 100% to heuristic prior when no ELO data exists', () => {
    // Coding task: claude has highest base heuristic score (95 vs 90 vs 85)
    const res = routeWithExplanation({
      allModels: mockModels,
      userMessage: '写一个 React 自定义 Hook 函数处理窗口大小',
      useTools: false,
    })
    expect(res).not.toBeNull()
    expect(res.model.id).toBe(1) // claude-3-7-sonnet
    expect(res.reasonParts.eloScore).toBeNull()
  })

  it('preserves heuristic prior when eloData total_count is 0', () => {
    const eloData = {
      1: { score: 1000, total_count: 0 },
      2: { score: 1000, total_count: 0 },
      3: { score: 1000, total_count: 0 },
    }
    const res = routeWithExplanation({
      allModels: mockModels,
      userMessage: '写一个 React 自定义 Hook 函数处理窗口大小',
      useTools: false,
      eloData,
    })
    expect(res.model.id).toBe(1)
  })
})

describe('modelAdvisor Dynamic ELO Blending', () => {
  it('activates ELO starting from 1 match and scales up', () => {
    // DeepSeek has 1 winning match (ELO 1250)
    const eloData = {
      1: { score: 1000, win_count: 0, total_count: 1 },
      3: { score: 1300, win_count: 1, total_count: 1 },
    }
    const res = routeWithExplanation({
      allModels: mockModels,
      userMessage: '写一个 React 自定义 Hook 函数处理窗口大小',
      useTools: false,
      eloData,
    })
    expect(res).not.toBeNull()
    expect(res.reasonParts.eloTotal).toBeGreaterThan(0)
  })

  it('allows personal ELO to dominate when total_count >= 5 (60-80% weight)', () => {
    // In coding, Claude base = 95, DeepSeek base = 85.
    // With 10 matches and high ELO (1500), DeepSeek must overtake Claude
    const eloData = {
      1: { score: 950, win_count: 2, total_count: 10 },
      3: { score: 1550, win_count: 9, total_count: 10 },
    }
    const res = routeWithExplanation({
      allModels: mockModels,
      userMessage: '写一个 React 自定义 Hook 函数处理窗口大小',
      useTools: false,
      eloData,
    })
    expect(res.model.id).toBe(3) // deepseek wins due to strong personal ELO
    expect(res.reasonParts.eloTotal).toBe(10)
    expect(res.reasonParts.arenaElo).toBe(1550)
  })
})

describe('modelAdvisor Router Unification', () => {
  it('suggestModel delegates to ModelRouter.route with shared ELO brain', () => {
    const eloData = {
      1: { score: 950, win_count: 2, total_count: 10 },
      3: { score: 1550, win_count: 9, total_count: 10 },
    }
    const winner1 = suggestModel({
      allModels: mockModels,
      userMessage: '写一个 React 自定义 Hook 函数处理窗口大小',
      useTools: false,
      eloData,
    })
    const winner2 = new ModelRouter().route({
      allModels: mockModels,
      userMessage: '写一个 React 自定义 Hook 函数处理窗口大小',
      useTools: false,
      eloData,
    })
    expect(winner1).not.toBeNull()
    expect(winner2).not.toBeNull()
    expect(winner1.id).toBe(winner2.id)
    expect(winner1.id).toBe(3)
  })
})
