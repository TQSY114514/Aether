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
//   - plan 模式: 保持只读过滤（既有 toolsPayload 逻辑, 路由在过滤之后应用）;
//     safeNames 缺席时拒绝路由（fail-closed, 返回空集）。
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

// ─── 阶段感知路由（roadmap P0-1 第二步）─────────────────────────────────────
// 关键词路由只看用户消息，任务推进到新阶段（动手改代码 / 验证修复 / 收尾提交）
// 时不会自动补齐该阶段需要的工具。这里基于循环内的客观信号推断阶段，向既有
// 路由结果「只做加法」地追加类别 —— 绝不裁掉关键词路由已注入的工具。
// feature flag 'agent.toolRouter.staged' 门控（默认关，保守上线）。

// 写入信号：窗口内出现即视为进入 build 阶段。run_command 不算 —— 它既可能
// 是构建也可能是跑测试，交给错误分类（test_failure）去判定 verify。
const BUILD_SIGNAL_TOOLS = new Set(['write_file', 'edit_file', 'apply_patch', 'delete_file'])

// 交付信号：git 类工具被使用过。
const GIT_SIGNAL_TOOLS = new Set([
  'git_status', 'git_diff', 'git_log', 'git_commit', 'git_push', 'git_create_branch',
])

// 阶段 → 追加的类别。explore 不追加（CORE 已覆盖检索需求）。
const STAGE_CATEGORIES = {
  explore: [],
  build: ['lsp'],            // 动手改代码：定义/引用/重命名辅助
  verify: ['lsp', 'agent'],  // 验证修复：diagnostics + test_first/debug_loop/review_code
  deliver: ['git'],          // 收尾：提交/分支/推送
}

/**
 * 从循环内信号推断当前任务阶段。
 * @param {object} [opts]
 * @param {number} [opts.depth]          当前迭代深度（budget.used）
 * @param {string[]} [opts.recentToolCalls] 最近若干轮执行过的工具名（含失败）
 * @param {string[]} [opts.recentErrorKinds] 最近工具错误的 failure_kind 列表
 * @returns {'explore'|'build'|'verify'|'deliver'|null}
 *   null = 信号不足，调用方不应追加任何类别
 *
 * 优先级 verify > build > deliver > explore：
 *   - 窗口内有 test_failure 错误或 lsp_diagnostics 调用 → verify（修到绿为止）
 *   - 否则有写入类工具 → build
 *   - 否则有 git 工具 → deliver
 *   - 否则早期轮次 → explore；深度未知且无信号 → null（保守不追加）
 */
function inferStage({ depth, recentToolCalls, recentErrorKinds } = {}) {
  const calls = Array.isArray(recentToolCalls) ? recentToolCalls : []
  const errs = Array.isArray(recentErrorKinds) ? recentErrorKinds : []

  if (errs.includes('test_failure') || calls.includes('lsp_diagnostics')) return 'verify'
  if (calls.some(n => BUILD_SIGNAL_TOOLS.has(n))) return 'build'
  if (calls.some(n => GIT_SIGNAL_TOOLS.has(n))) return 'deliver'
  if (typeof depth === 'number' && depth > 0 && depth <= 2) return 'explore'
  return null
}

/**
 * 路由: 给定 mode 与 prompt, 返回应注入的工具名集合。
 * @param {object} opts
 * @param {string} [opts.mode]       'plan' | 其他(全量风险放行由调用方处理)
 * @param {string} [opts.prompt]     用户消息(路由依据)
 * @param {string[]} [opts.allToolNames] 全部可用工具名(含 MCP)
 * @param {Set<string>} [opts.safeNames] plan 模式下允许的只读工具名(必填 ——
 *   plan 模式缺失时拒绝路由返回空集, 绝不在只读边界未知时放行任何工具)
 * @param {string[]} [opts.extraCategories] 额外注入的类别（阶段路由追加用,
 *   与关键词命中的类别取并集; plan 模式同样受只读过滤）
 * @returns {Set<string>} 应注入的工具名
 */
function routeTools({ mode, prompt, allToolNames, safeNames, extraCategories }) {
  const names = allToolNames || []
  const want = new Set()
  const plan = mode === 'plan'

  // 0. plan 模式必须提供只读边界（fail-closed）: safeNames 缺席 = 调用方
  //    未经过只读过滤 → 拒绝路由, 返回空集。宁可 payload 为空, 不放行
  //    未经验证的写类工具。（调用方对空集的约定是"保持原 payload", 而
  //    原 payload 在 plan 下本就该由 toolsPayload 过滤过。）
  if (plan && !safeNames) return want

  // 1. 核心工具 + plan 模式只读过滤
  for (const n of names) {
    if (CORE_TOOLS.has(n)) {
      if (plan && !safeNames.has(n)) continue
      want.add(n)
    }
  }

  // 2. 按需类别（prompt 关键词命中 → 注入该类; plan 模式仍受只读过滤）
  const text = String(prompt || '')
  for (const { category, re } of CATEGORY_PATTERNS) {
    if (!re.test(text)) continue
    for (const t of CATEGORY_TOOLS[category] || []) {
      if (!names.includes(t)) continue
      if (plan && !safeNames.has(t)) continue
      want.add(t)
    }
  }

  // 2.5 阶段追加类别（与关键词命中取并集; 同样受只读过滤）。未知类别忽略。
  for (const category of Array.isArray(extraCategories) ? extraCategories : []) {
    for (const t of CATEGORY_TOOLS[category] || []) {
      if (!names.includes(t)) continue
      if (plan && !safeNames.has(t)) continue
      want.add(t)
    }
  }

  // 3. 保守兜底: 不在 KNOWN_TOOLS 里的工具恒注入（plan 模式仍受只读过滤,
  //    未知名单同样无法绕过 —— 见第 0 条守卫）。
  for (const n of names) {
    if (KNOWN_TOOLS.has(n)) continue
    if (plan && !safeNames.has(n)) continue
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

module.exports = {
  routeTools,
  routerEnabled,
  inferStage,
  _categories: CATEGORY_TOOLS,
  _stageCategories: STAGE_CATEGORIES,
}
