// ─────────────────────────────────────────────────────────────────────────────
// capabilityPolicy.js — Capability-based permission（外部评审 P0-2 落地及升级）
//
// 升级版：实现更细粒度的 6 轴策略 (Read, Write, Execute, Network, Git, External)
// 并且支持动态命令拦截（例如识别 npm install, 危险命令等）返回 'ask' 或 'always_ask'。
// ─────────────────────────────────────────────────────────────────────────────

// ── 轴定义 ──────────────────────────────────────────────────────────────────
const AXES = Object.freeze({ 
  READ: 'read', 
  WRITE: 'write', 
  EXECUTE: 'execute', 
  NETWORK: 'network', 
  GIT: 'git', 
  EXTERNAL: 'external',
  UNKNOWN: 'unknown' 
})

// 多态策略 (增加了 ALWAYS_ASK)
const POLICY = Object.freeze({ 
  ALLOW: 'allow', 
  ASK: 'ask', 
  DENY: 'deny',
  ALWAYS_ASK: 'always_ask'
})

// 工具 → 轴映射
const TOOL_AXIS = {
  // read: 纯读取操作 (默认最安全)
  read_file: AXES.READ, list_dir: AXES.READ, glob_find: AXES.READ,
  grep_search: AXES.READ, get_project_context: AXES.READ,
  codebase_graph: AXES.READ, workspace_files: AXES.READ,
  lsp_definition: AXES.READ, lsp_references: AXES.READ,
  lsp_diagnostics: AXES.READ, find_symbol: AXES.READ,

  // write: 写入操作
  write_file: AXES.WRITE, edit_file: AXES.WRITE, apply_patch: AXES.WRITE,
  lsp_code_actions: AXES.WRITE, lsp_rename: AXES.WRITE,

  // execute: 命令执行 (风险高)
  run_command: AXES.EXECUTE, debug_loop: AXES.EXECUTE, test_first: AXES.EXECUTE,
  run_long_task: AXES.EXECUTE,

  // network: 本地或普通网络访问
  web_search: AXES.NETWORK, web_fetch: AXES.NETWORK, gateway: AXES.NETWORK,

  // git: 版本控制操作
  git_status: AXES.GIT, git_diff: AXES.GIT, git_log: AXES.GIT,
  git_commit: AXES.GIT, git_push: AXES.GIT, git_create_branch: AXES.GIT,

  // external: 外部服务 API (如 GitHub)
  github_pr_create: AXES.EXTERNAL, github_pr_list: AXES.EXTERNAL, github_pr_merge: AXES.EXTERNAL,
  github_pr_review: AXES.EXTERNAL, github_issue_create: AXES.EXTERNAL, github_issue_list: AXES.EXTERNAL,
  github_release_create: AXES.EXTERNAL, github_actions_status: AXES.EXTERNAL,

  // agent meta: 工具自身 → read 兜底
  use_skill: AXES.READ, ask_user: AXES.READ, todo_write: AXES.READ,
  memory_save: AXES.READ, memory_list: AXES.READ, memory_search: AXES.READ,
  delegate_task: AXES.READ, run_agent: AXES.READ,
  run_workflow: AXES.READ, run_arena: AXES.READ,
  task: AXES.READ, review_code: AXES.READ,
}

/** 工具 → 轴 */
function axisFor(toolName) {
  return TOOL_AXIS[toolName] || AXES.UNKNOWN
}

/** 动态命令安全分析，返回强制的 POLICY（如果有） */
function analyzeCommandRisk(toolName, input) {
  if (toolName === 'run_command' || toolName === 'run_long_task') {
    let command = ''
    try {
      const parsed = JSON.parse(input)
      command = parsed.command || parsed.code || ''
    } catch {
      command = input
    }
    command = String(command).trim().toLowerCase()
    
    // 高危命令强制 Always Ask
    if (command.includes('rm -rf') || command.includes('drop table') || command.includes('mkfs')) {
      return POLICY.ALWAYS_ASK
    }
    
    // 敏感环境操作强制 Always Ask (生产环境)
    if (command.includes('production') || command.includes('--prod') || command.startsWith('gcloud') || command.startsWith('aws ')) {
      return POLICY.ALWAYS_ASK
    }

    // 常见的状态更改/依赖安装命令强制 Ask
    if (command.startsWith('npm install') || command.startsWith('yarn add') || command.startsWith('pip install') || command.startsWith('apt-get')) {
      return POLICY.ASK
    }
    if (command.startsWith('docker run') || command.startsWith('docker-compose')) {
      return POLICY.ASK
    }
  }

  if (toolName === 'git_push') {
    return POLICY.ASK // 推送远端强制要求确认
  }

  if (toolName.startsWith('github_') && !toolName.endsWith('_list') && !toolName.endsWith('_status')) {
    return POLICY.ASK // 改变外部服务状态
  }

  return null
}

/**
 * 轴策略决策: 返回 { axis, policy, matched }。
 * axisPolicies = { read: 'allow', execute: 'ask', ... }
 */
function decideAxisPolicy(toolName, input, axisPolicies) {
  const axis = axisFor(toolName)
  
  // 1. 动态风险拦截 (强制升级策略)
  const riskPolicy = analyzeCommandRisk(toolName, input)
  
  if (axis === AXES.UNKNOWN) {
    return { axis, policy: riskPolicy || POLICY.ALLOW, matched: !!riskPolicy }
  }
  
  let policy = (axisPolicies && axisPolicies[axis]) || null
  
  // 2. 如果基础策略不如风险拦截策略严格，则覆盖
  if (riskPolicy === POLICY.ALWAYS_ASK) {
    policy = POLICY.ALWAYS_ASK
  } else if (riskPolicy === POLICY.ASK && policy !== POLICY.DENY && policy !== POLICY.ALWAYS_ASK) {
    policy = POLICY.ASK
  }
  
  if (!policy) return { axis, policy: null, matched: false }
  return { axis, policy, matched: true }
}

/** 轴策略三态校验（Settings 持久化前用） */
function normalizeAxisPolicies(raw) {
  const out = {}
  for (const axis of Object.values(AXES)) {
    if (axis === AXES.UNKNOWN) continue
    const v = raw && raw[axis]
    if (v === POLICY.ALLOW || v === POLICY.ASK || v === POLICY.DENY || v === POLICY.ALWAYS_ASK) out[axis] = v
  }
  return out
}

module.exports = {
  AXES, POLICY, TOOL_AXIS,
  axisFor, decideAxisPolicy, normalizeAxisPolicies, analyzeCommandRisk
}
