// ─────────────────────────────────────────────────────────────────────────────
// capabilityPolicy.js — Capability-based permission（外部评审 P0-2 落地）
//
// 在既有 5 档模式 + 规则引擎之上加"轴级默认策略"层, 把工具按三个能力轴归类:
//   filesystem / shell / network —— 每轴 allow|ask|deny 三态。
// 决策顺序（保守递增, 与既有 authorizeWithContext 兼容）:
//   1. 既有规则引擎(deny/allow/ask 规则, hook override) —— 优先级最高, 不变
//   2. 本层轴策略: 工具映射到轴 → 轴策略决定是否放行
//   3. 轴未命中/策略 allow → 回落既有模式判断(5 档)
//
// 纯函数、无 IO、可单测。工具→轴映射覆盖 registry 全部 42 个内置工具;
// 未知工具按 'unknown' 轴处理(策略默认 allow, 不误伤 MCP/新工具)。
// ─────────────────────────────────────────────────────────────────────────────

// ── 轴定义 ──────────────────────────────────────────────────────────────────
const AXES = Object.freeze({ FILESYSTEM: 'filesystem', SHELL: 'shell', NETWORK: 'network', UNKNOWN: 'unknown' })

// 三态策略
const POLICY = Object.freeze({ ALLOW: 'allow', ASK: 'ask', DENY: 'deny' })

// 工具 → 轴映射（覆盖 registry 42 工具 + MCP 默认 unknown）
const TOOL_AXIS = {
  // filesystem: 文件/目录操作
  read_file: AXES.FILESYSTEM, list_dir: AXES.FILESYSTEM, glob_find: AXES.FILESYSTEM,
  grep_search: AXES.FILESYSTEM, write_file: AXES.FILESYSTEM, edit_file: AXES.FILESYSTEM,
  apply_patch: AXES.FILESYSTEM, get_project_context: AXES.FILESYSTEM,
  lsp_definition: AXES.FILESYSTEM, lsp_references: AXES.FILESYSTEM,
  lsp_diagnostics: AXES.FILESYSTEM, lsp_code_actions: AXES.FILESYSTEM,
  lsp_rename: AXES.FILESYSTEM, find_symbol: AXES.FILESYSTEM,
  // shell: 命令执行
  run_command: AXES.SHELL, debug_loop: AXES.SHELL, test_first: AXES.SHELL,
  // network: 网络访问
  web_search: AXES.NETWORK, web_fetch: AXES.NETWORK,
  github_pr_create: AXES.NETWORK, github_pr_list: AXES.NETWORK, github_pr_merge: AXES.NETWORK,
  github_pr_review: AXES.NETWORK, github_issue_create: AXES.NETWORK, github_issue_list: AXES.NETWORK,
  github_release_create: AXES.NETWORK, github_actions_status: AXES.NETWORK,
  // git: 归 filesystem 轴（本地仓库操作, 不触网）
  git_status: AXES.FILESYSTEM, git_diff: AXES.FILESYSTEM, git_log: AXES.FILESYSTEM,
  git_commit: AXES.FILESYSTEM, git_push: AXES.FILESYSTEM, git_create_branch: AXES.FILESYSTEM,
  // agent meta: 工具自身（ask_user/todo/use_skill/memory/delegate）→ filesystem 兜底宽松
  use_skill: AXES.FILESYSTEM, ask_user: AXES.FILESYSTEM, todo_write: AXES.FILESYSTEM,
  memory_save: AXES.FILESYSTEM, memory_list: AXES.FILESYSTEM, memory_search: AXES.FILESYSTEM,
  delegate_task: AXES.FILESYSTEM, task: AXES.FILESYSTEM, review_code: AXES.FILESYSTEM,
}

/** 工具 → 轴 */
function axisFor(toolName) {
  return TOOL_AXIS[toolName] || AXES.UNKNOWN
}

/**
 * 轴策略决策: 返回 { axis, policy, matched }。
 * axisPolicies = { filesystem: 'allow'|'ask'|'deny', shell: ..., network: ... }
 * 未配置的轴 → matched=false（调用方回落既有逻辑）。
 * 未知工具轴 → matched=false（不误伤 MCP/新工具）。
 */
function decideAxisPolicy(toolName, axisPolicies) {
  const axis = axisFor(toolName)
  if (axis === AXES.UNKNOWN) return { axis, policy: null, matched: false }
  const policy = (axisPolicies && axisPolicies[axis]) || null
  if (!policy) return { axis, policy: null, matched: false }
  return { axis, policy, matched: true }
}

/** 轴策略三态校验（Settings 持久化前用） */
function normalizeAxisPolicies(raw) {
  const out = {}
  for (const axis of Object.values(AXES)) {
    if (axis === AXES.UNKNOWN) continue
    const v = raw && raw[axis]
    if (v === POLICY.ALLOW || v === POLICY.ASK || v === POLICY.DENY) out[axis] = v
  }
  return out
}

module.exports = {
  AXES, POLICY, TOOL_AXIS,
  axisFor, decideAxisPolicy, normalizeAxisPolicies,
}
