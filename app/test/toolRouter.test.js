// ─────────────────────────────────────────────────────────────────────────────
// toolRouter.test.js — Tool Router 纯函数单元测试
//
// 锁定契约: 核心工具恒在; github/lsp/agent/memory/git 按 prompt 关键词命中;
// plan 模式只读过滤; 路由失败 ≠ 任务失败(过滤只是 payload 层)。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { routeTools, routerEnabled, _categories } from '../electron/llm/toolRouter'

// 全量工具名(模拟 registry + MCP 合并)
const ALL = [
  'read_file', 'list_dir', 'glob_find', 'grep_search',
  'web_search', 'web_fetch', 'write_file', 'edit_file', 'apply_patch', 'run_command',
  'use_skill', 'ask_user', 'todo_write', 'get_project_context',
  'github_pr_create', 'github_pr_list', 'github_issue_create',
  'lsp_definition', 'lsp_diagnostics', 'find_symbol',
  'delegate_task', 'task', 'review_code',
  'memory_save', 'memory_list',
  'git_status', 'git_commit', 'git_push',
]

// plan 模式只读集(模拟 toolsPayload('plan') 的结果)
const SAFE = new Set(ALL.filter(n => !['write_file', 'edit_file', 'apply_patch', 'run_command', 'github_pr_create', 'github_issue_create', 'delegate_task', 'task', 'git_commit', 'git_push', 'lsp_rename'].includes(n)))

describe('routeTools', () => {
  it('always includes core tools regardless of prompt', () => {
    const want = routeTools({ prompt: 'hello', allToolNames: ALL })
    for (const core of ['read_file', 'write_file', 'run_command', 'grep_search', 'web_search', 'todo_write', 'ask_user']) {
      expect(want.has(core)).toBe(true)
    }
  })

  it('injects github tools when prompt mentions PR', () => {
    const want = routeTools({ prompt: 'create a PR for this change', allToolNames: ALL })
    expect(want.has('github_pr_create')).toBe(true)
    expect(want.has('github_pr_list')).toBe(true)
  })

  it('injects lsp tools on symbol/refactor keywords', () => {
    const want = routeTools({ prompt: 'find the definition of this symbol and rename it', allToolNames: ALL })
    expect(want.has('lsp_definition')).toBe(true)
    expect(want.has('find_symbol')).toBe(true)
  })

  it('injects agent tools on debug/test-first keywords', () => {
    const want = routeTools({ prompt: 'debug the failing test and fix it', allToolNames: ALL })
    expect(want.has('delegate_task')).toBe(true)
    expect(want.has('review_code')).toBe(true)
  })

  it('injects git tools on commit/push keywords', () => {
    const want = routeTools({ prompt: 'commit and push my changes', allToolNames: ALL })
    expect(want.has('git_commit')).toBe(true)
    expect(want.has('git_push')).toBe(true)
  })

  it('does not inject category tools when prompt is unrelated', () => {
    const want = routeTools({ prompt: 'what is the weather today', allToolNames: ALL })
    expect(want.has('github_pr_create')).toBe(false)
    expect(want.has('lsp_definition')).toBe(false)
    expect(want.has('delegate_task')).toBe(false)
    expect(want.has('git_commit')).toBe(false)
  })

  it('plan mode: category tools still respect read-only filtering', () => {
    const want = routeTools({ prompt: 'create a PR for this change and commit', allToolNames: ALL, mode: 'plan', safeNames: SAFE })
    // 只读 github 工具可注入, 写类被过滤
    expect(want.has('github_pr_list')).toBe(true)
    expect(want.has('github_pr_create')).toBe(false)
    expect(want.has('git_status')).toBe(true)
    expect(want.has('git_commit')).toBe(false)
    // 核心写工具也被过滤
    expect(want.has('write_file')).toBe(false)
    expect(want.has('read_file')).toBe(true)
  })

  it('unknown tool names in categories are skipped safely', () => {
    const want = routeTools({ prompt: 'create a PR', allToolNames: ['read_file', 'run_command'] })
    expect(want.has('read_file')).toBe(true)
    expect(want.has('github_pr_create')).toBe(false) // 不在 allToolNames → 跳过
  })
})

describe('routerEnabled', () => {
  it('defaults to enabled; explicit false disables', () => {
    expect(routerEnabled(undefined)).toBe(true)
    expect(routerEnabled(true)).toBe(true)
    expect(routerEnabled(false)).toBe(false)
  })
})

describe('_categories', () => {
  it('has all five categories with tool lists', () => {
    expect(Object.keys(_categories).sort()).toEqual(['agent', 'git', 'github', 'lsp', 'memory'])
    expect(_categories.github.length).toBeGreaterThan(0)
    expect(_categories.lsp).toContain('lsp_diagnostics')
  })
})
