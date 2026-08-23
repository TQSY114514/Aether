// ─────────────────────────────────────────────────────────────────────────────
// toolRouter.js — Tool Router（外部评审 P0-1 落地）
//
// 问题: 42 个内置工具 + MCP 工具全量注入 context, 每轮请求体积大、模型易
// 选错工具、token 浪费。评审建议: 按任务阶段只注入相关工具集。
//
// 路由策略（保守优先, 绝不误伤）:
//   - CORE: 文件读写/检索/shell/web —— 模型工作基本盘, 永远注入。
//   - 按需类别: github / lsp / agent(子代理/编排) / memory / git —— 用
//     prompt 关键词检测, 命中才注入; 未命中时模型请求仍可执行
//     （getMergedTool 不变, 只是不在 payload 里 —— 路由失败 ≠ 任务失败）。
//   - 未分类工具（MCP/新内置/gateway 等）恒注入 —— 路由只降级认识的类别,
//     不做黑盒裁剪。
//   - plan 模式: 保持只读过滤（既有 toolsPayload 逻辑, 路由在过滤之后应用）。
//
// 纯函数、无 IO、可单测。feature flag 'agent.toolRouter' 门控（默认开）。
// 注意: 本模块在 electron/ 下, 必须用 CommonJS（AGENTS.md 硬规则）。
// ─────────────────────────────────────────────────────────────────────────────

// 类别 → 工具名集合
const CATEGORY_TOOLS = {
  github: [
    'github_pr_create', 'github_pr_list', 'github_pr_merge', 'github_pr_review',
    'github_issue_create', 'github_issue_list',
    'github_release_create', 'github_actions_status',
  ],
  lsp: [
    'lsp_definition', 'lsp_references', 'lsp_diagnostics',
    'lsp_code_actions', 'lsp_rename', 'find_symbol',
  ],
  agent: [
    'delegate_task', 'task', 'debug_loop', 'test_first', 'review_code',
  ],
  memory: ['memory_save', 'memory_list', 'memory_search'],
  git: ['git_status', 'git_diff', 'git_log', 'git_commit', 'git_push', 'git_create_branch'],
}

// 核心工具（永远注入）——模型完成通用任务的基本盘
const CORE_TOOLS = new Set([
  'read_file', 'list_dir', 'glob_find', 'grep_search',
  'web_search', 'web_fetch',
  'write_file', 'edit_file', 'apply_patch', 'run_command',
  'use_skill', 'ask_user', 'todo_write',
  'get_project_context',
])

// 关键词 → 命中的类别（正则, 命中任一即注入该类全部工具）
const CATEGORY_PATTERNS = [
  { category: 'github', re: /\b(pr|pull\s*request|github|issue|release|actions)\b/i },
  { category: 'lsp', re: /\b(symbol|definition|references|diagnostic|refactor|rename|定位|定义|引用|重构|重命名)\b/i },
  { category: 'agent', re: /\b(delegate|sub.?agent|parallel|debug|test.first|review|子代理|并行|调试|审查|测试)\b/i },
  { category: 'memory', re: /\b(memory|remember|recall|记住|回忆|记忆)\b/i },
  { category: 'git', re: /\b(git|commit|push|branch|diff|提交|分支|推送)\b/i },
]

// 路由「认识」的全部工具名（CORE + 各类别）。认识之外的一律走保守兜底：
// 路由只能过滤认识的工具，绝不能把不认识的（新内置 / MCP / gateway 等）
// 从 payload 里抹掉 —— 否则模型永远看不见它们。
const KNOWN_TOOLS = new Set([
  ...CORE_TOOLS,
  ...Object.values(CATEGORY_TOOLS).flat(),
])

/**
 * 路由: 给定 mode 与 prompt, 返回应注入的工具名集合。
 * @param {object} opts
 * @param {string} [opts.mode]       'plan' | 其他(全量风险放行由调用方处理)
 * @param {string} [opts.prompt]     用户消息(路由依据)
 * @param {string[]} [opts.allToolNames] 全部可用工具名(含 MCP)
 * @param {Set<string>} [opts.safeNames] plan 模式下允许的只读工具名
 * @returns {Set<string>} 应注入的工具名
 */
function routeTools({ mode, prompt, allToolNames, safeNames }) {
  const names = allToolNames || []
  const want = new Set()

  // 1. 核心工具 + plan 模式只读过滤
  for (const n of names) {
    if (CORE_TOOLS.has(n)) {
      if (mode === 'plan' && safeNames && !safeNames.has(n)) continue
      want.add(n)
    }
  }

  // 2. 按需类别（prompt 关键词命中 → 注入该类; plan 模式仍受只读过滤）
  const text = String(prompt || '')
  for (const { category, re } of CATEGORY_PATTERNS) {
    if (!re.test(text)) continue
    for (const t of CATEGORY_TOOLS[category] || []) {
      if (!names.includes(t)) continue
      if (mode === 'plan' && safeNames && !safeNames.has(t)) continue
      want.add(t)
    }
  }

  // 3. 保守兜底: 不在 KNOWN_TOOLS 里的工具恒注入（plan 模式仍受只读过滤）。
  for (const n of names) {
    if (KNOWN_TOOLS.has(n)) continue
    if (mode === 'plan' && safeNames && !safeNames.has(n)) continue
    want.add(n)
  }
  return want
}

/**
 * 是否启用路由（feature flag 门控）: 未提供 flag 状态时默认启用。
 * @param {boolean} [flagEnabled]
 */
function routerEnabled(flagEnabled) {
  return flagEnabled !== false
}

module.exports = { routeTools, routerEnabled, _categories: CATEGORY_TOOLS }
