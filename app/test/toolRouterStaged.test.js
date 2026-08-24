import { describe, it, expect, afterAll } from 'vitest'
import { createRequire } from 'module'
import Module from 'module'
import os from 'os'
import { routeTools, inferStage, _stageCategories } from '../electron/llm/toolRouter'

// toolLoop.js pulls the provider-adapter/logger chain which touches electron;
// stub app.getPath so the module loads headless under vitest (CI included).
const require = createRequire(import.meta.url)
const origLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { app: { getPath: () => os.tmpdir() } }
  }
  return origLoad.apply(this, arguments)
}
const { IterationBudget } = require('../electron/llm/toolLoop.js')

afterAll(() => {
  Module._load = origLoad
})

// Fixture: core + every category + one unknown (MCP-style) tool.
const ALL_TOOLS = [
  'read_file', 'list_dir', 'glob_find', 'grep_search', 'web_search', 'web_fetch',
  'write_file', 'edit_file', 'apply_patch', 'run_command',
  'use_skill', 'ask_user', 'todo_write', 'get_project_context',
  'lsp_definition', 'lsp_references', 'lsp_diagnostics', 'lsp_code_actions', 'lsp_rename', 'find_symbol',
  'git_status', 'git_diff', 'git_log', 'git_commit', 'git_push', 'git_create_branch',
  'delegate_task', 'task', 'debug_loop', 'test_first', 'review_code',
  'memory_save', 'memory_list', 'memory_search',
  'github_pr_create', 'github_issue_list',
  'mcp_unknown_tool',
]

describe('inferStage（阶段推断）', () => {
  it('test_failure 错误信号 → verify', () => {
    expect(inferStage({ depth: 5, recentToolCalls: ['run_command'], recentErrorKinds: ['test_failure'] })).toBe('verify')
  })

  it('lsp_diagnostics 调用信号 → verify', () => {
    expect(inferStage({ depth: 5, recentToolCalls: ['edit_file', 'lsp_diagnostics'], recentErrorKinds: [] })).toBe('verify')
  })

  it('写入工具 → build', () => {
    expect(inferStage({ depth: 5, recentToolCalls: ['read_file', 'write_file'], recentErrorKinds: [] })).toBe('build')
  })

  it('git 工具 → deliver', () => {
    expect(inferStage({ depth: 5, recentToolCalls: ['git_status'], recentErrorKinds: [] })).toBe('deliver')
  })

  it('早期轮次无信号 → explore', () => {
    expect(inferStage({ depth: 1, recentToolCalls: [], recentErrorKinds: [] })).toBe('explore')
    expect(inferStage({ depth: 2, recentToolCalls: ['grep_search'], recentErrorKinds: [] })).toBe('explore')
  })

  it('深轮次且无任何信号 → null（保守不追加）', () => {
    expect(inferStage({ depth: 9, recentToolCalls: ['grep_search'], recentErrorKinds: [] })).toBeNull()
    expect(inferStage({})).toBeNull()
    expect(inferStage()).toBeNull()
  })

  it('优先级 verify > build > deliver', () => {
    // 写入 + 测试失败同时出现 → verify 赢
    expect(inferStage({ depth: 5, recentToolCalls: ['write_file'], recentErrorKinds: ['test_failure'] })).toBe('verify')
    // git + 写入同时出现 → build 赢
    expect(inferStage({ depth: 5, recentToolCalls: ['git_commit', 'edit_file'], recentErrorKinds: [] })).toBe('build')
  })
})

describe('_stageCategories 形状', () => {
  it('四阶段齐全，explore 不追加类别', () => {
    for (const key of ['explore', 'build', 'verify', 'deliver']) {
      expect(Array.isArray(_stageCategories[key])).toBe(true)
    }
    expect(_stageCategories.explore).toEqual([])
    expect(_stageCategories.build).toContain('lsp')
    expect(_stageCategories.verify).toContain('agent')
    expect(_stageCategories.deliver).toEqual(['git'])
  })
})

describe('routeTools extraCategories（阶段追加）', () => {
  it('与关键词命中类别取并集', () => {
    const want = routeTools({
      prompt: '请帮我 git 提交这次改动',           // 关键词命中 git 类
      allToolNames: ALL_TOOLS,
      extraCategories: ['lsp'],                    // 阶段追加 lsp 类
    })
    expect(want.has('git_commit')).toBe(true)
    expect(want.has('lsp_diagnostics')).toBe(true)
    expect(want.has('read_file')).toBe(true)       // CORE 恒在
  })

  it('prompt 无关键词时仅追加指定类别，CORE 不受影响', () => {
    const want = routeTools({
      prompt: '继续刚才的任务',
      allToolNames: ALL_TOOLS,
      extraCategories: ['git'],
    })
    expect(want.has('git_push')).toBe(true)
    expect(want.has('github_pr_create')).toBe(false) // 未命中、未追加
    expect(want.has('read_file')).toBe(true)
  })

  it('未知类别被忽略（不抛错、不影响其他注入）', () => {
    const want = routeTools({
      prompt: '',
      allToolNames: ALL_TOOLS,
      extraCategories: ['bogus_category'],
    })
    expect(want.has('read_file')).toBe(true)
    expect(want.has('git_commit')).toBe(false)
  })

  it('plan 模式下 extraCategories 仍受只读过滤', () => {
    const readOnly = new Set(ALL_TOOLS.filter(n => !['write_file', 'edit_file', 'apply_patch', 'run_command', 'git_commit', 'git_push', 'git_create_branch'].includes(n)))
    const want = routeTools({
      mode: 'plan',
      prompt: '',
      allToolNames: ALL_TOOLS,
      safeNames: readOnly,
      extraCategories: ['git'],
    })
    expect(want.has('git_status')).toBe(true)      // 只读 git 工具放行
    expect(want.has('git_commit')).toBe(false)     // 写类 git 工具仍被挡
  })

  it('plan 模式缺 safeNames 时 fail-closed 返回空集（extraCategories 不能绕过）', () => {
    const want = routeTools({
      mode: 'plan',
      prompt: '',
      allToolNames: ALL_TOOLS,
      extraCategories: ['git', 'lsp'],
    })
    expect(want.size).toBe(0)
  })
})

describe('IterationBudget.extendIterations（缩围重试基础）', () => {
  it('耗尽后追加额度可继续 consume，总消耗 = 原+追加', () => {
    const budget = new IterationBudget(3)
    expect(budget.consume()).toBe(true)
    expect(budget.consume()).toBe(true)
    expect(budget.consume()).toBe(true)
    expect(budget.consume()).toBe(false)             // 耗尽
    expect(budget.exhausted().exhausted).toBe(true)
    expect(budget.extendIterations(2)).toBe(true)    // 解闩锁 +2
    expect(budget.exhausted().exhausted).toBe(false)
    expect(budget.consume()).toBe(true)
    expect(budget.consume()).toBe(true)
    expect(budget.consume()).toBe(false)             // 新额度用完
    expect(budget.used).toBe(5)
  })

  it('非正数追加被拒绝且不解锁', () => {
    const budget = new IterationBudget(1)
    expect(budget.consume()).toBe(true)
    expect(budget.consume()).toBe(false)
    expect(budget.extendIterations(0)).toBe(false)
    expect(budget.extendIterations(-3)).toBe(false)
    expect(budget.extendIterations('nonsense')).toBe(false)
    expect(budget.exhausted().exhausted).toBe(true)  // 仍是耗尽态
    expect(budget.consume()).toBe(false)
  })

  it('未耗历时 extendIterations 同样有效（只加不减已用计数）', () => {
    const budget = new IterationBudget(5)
    budget.consume()
    budget.consume()
    expect(budget.extendIterations(1)).toBe(true)
    expect(budget.remaining).toBe(4)                 // 5+1-2
    expect(budget.used).toBe(2)
  })
})
