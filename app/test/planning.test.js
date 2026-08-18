// ─── Hierarchical planner heuristics tests ──────────────────────────────────
// Covers isComplexRequest, especially the Chinese multi-step patterns added
// for orchestrator triggering (correctly classify complex CJK tasks, no false
// positives on trivial/English cases).

import { describe, it, expect } from 'vitest'
import { isComplexRequest } from '../electron/llm/planning'

describe('isComplexRequest — 中文多步任务', () => {
  it('重构 + 拆分子任务 → 复杂', () => {
    expect(isComplexRequest('帮我重构这个模块，涉及多个文件，请拆成几个子任务并行处理，包括修改 A 和修改 B', 0)).toBe(true)
  })
  it('修复 + 添加测试 + 同时重构 → 复杂', () => {
    expect(isComplexRequest('请修复登录页面的bug并添加单元测试，同时重构错误处理逻辑', 0)).toBe(true)
  })
  it('涉及多个文件/并行 → 复杂', () => {
    expect(isComplexRequest('迁移到新框架并并行调整多个模块', 0)).toBe(true)
  })
  it('简单问候 → 不复杂（不误报）', () => {
    expect(isComplexRequest('你好，帮我看看这个', 0)).toBe(false)
  })
})

describe('isComplexRequest — 英文多步任务', () => {
  it('refactor then add tests → 复杂', () => {
    expect(isComplexRequest('refactor this module then add unit tests', 0)).toBe(true)
  })
  it('简单英文 → 不复杂', () => {
    expect(isComplexRequest('hello', 0)).toBe(false)
  })
})