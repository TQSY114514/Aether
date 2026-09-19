// ───────────────────────────────────────────────────────────────────────────
// toolLoopUtils.js — Decoupled utilities, detectors, budgets, and helpers
// for the agent tool-call loop (toolLoop.js).
//
// Keeps toolLoop.js focused on core loop orchestration while extracting:
//   - Concurrency & tool classification (READ_TOOLS, WRITE_TOOLS, getMaxConcurrent)
//   - Error classification & auto-commit integration
//   - Multi-dimensional IterationBudget & SemanticLoopDetector
//   - Tool execution wrappers with timeout & retry (runToolWithTimeout)
//   - Usage accounting (accountToolLoopUsage)
// ───────────────────────────────────────────────────────────────────────────

const { normalizeUsage } = require('./providerAdapter')
const { computeCost } = require('../utils/cost')
const { classifyError } = require('./errorClassify')
const IterationBudgetBase = require('./iterationBudget')
const log = require('../logger')

// Concurrency & timeout constants
const DEFAULT_MAX_ITERATIONS = 25
const MAX_TOTAL_CHARS = 200000
const LOOP_REPEAT_LIMIT = 3
const TOOL_TIMEOUT_MS = 30000
const TOOL_RETRY_MAX = 2
const TOOL_RETRY_BASE_MS = 1000
const PERMISSION_TIMEOUT_MS = 120000
const MAX_CONCURRENT_TOOLS = 5

const MAX_READ_CONCURRENT = 8
const MAX_WRITE_CONCURRENT = 1
const MAX_DEFAULT_CONCURRENT = 5

const READ_TOOLS = new Set([
  'read_file', 'list_dir', 'glob_find', 'grep_search', 'web_search',
  'web_fetch', 'get_file_contents', 'list_branches', 'list_commits',
  'list_issues', 'list_pull_requests', 'list_releases', 'list_tags',
  'search_code', 'search_commits', 'search_issues', 'search_pull_requests',
  'search_repositories', 'search_users', 'get_commit', 'get_label',
  'get_latest_release', 'get_release_by_tag', 'get_tag', 'get_me',
  'get_team_members', 'get_teams', 'list_repository_collaborators',
  'issue_read', 'pull_request_read', 'list_issue_fields', 'list_issue_types',
  'generate_repo_map',
])

const WRITE_TOOLS = new Set([
  'write_file', 'edit_file', 'apply_patch', 'delete_file',
  'run_command', 'exec', 'create_or_update_file', 'push_files',
  'create_branch', 'create_pull_request', 'create_repository',
  'fork_repository', 'merge_pull_request', 'update_pull_request',
  'update_pull_request_branch', 'issue_write', 'sub_issue_write',
  'add_issue_comment', 'add_comment_to_pending_review',
  'add_reply_to_pull_request_comment', 'pull_request_review_write',
  'request_copilot_review', 'run_secret_scanning',
])

let defaultGetTool = null
/** Resolve a tool name against the merged registry. */
function resolveTool(name) {
  if (!defaultGetTool) {
    try {
      const m = require('../mcp/manager')
      defaultGetTool = m.getMergedTool
    } catch {
      const r = require('../tools/registry')
      defaultGetTool = r.getTool
    }
  }
  return defaultGetTool ? defaultGetTool(name) : null
}

/** Compute safe tool-call concurrency from the requested tool metadata. */
function getMaxConcurrent(toolCalls, getToolFn = resolveTool) {
  const names = toolCalls.map(tc => (tc.function || {}).name).filter(Boolean)
  const hasWrite = names.some(n => WRITE_TOOLS.has(n))
  const hasAnySequential = toolCalls.some(tc => {
    const t = getToolFn ? getToolFn((tc.function || {}).name) : null
    return t && t.executionMode === 'sequential'
  })
  if (hasAnySequential || hasWrite) return 1
  const allRead = names.every(n => READ_TOOLS.has(n))
  if (allRead) return MAX_READ_CONCURRENT
  return MAX_DEFAULT_CONCURRENT
}

// Classify tool-execution errors (distinct from LLM API errors).
function classifyToolError(errMsg) {
  const m = String(errMsg || '')
  if (/timed?\s*out|timeout/i.test(m)) return { kind: 'timeout', recover: { action: 'retry', hint: '工具执行超时，可重试或增大超时时间' } }
  if (/permission|denied|forbidden|EACCES/i.test(m)) return { kind: 'permission_denied', recover: { action: 'ask', hint: '权限不足，请在设置中检查 workspace 权限' } }
  if (/not\s*found|ENOENT|no\s*such/i.test(m)) return { kind: 'env_missing_dependency', recover: { action: 'none', hint: '文件或命令不存在，请检查路径或安装依赖' } }
  if (/MODULE_NOT_FOUND|Cannot find module/i.test(m)) return { kind: 'env_missing_dependency', recover: { action: 'none', hint: '缺少依赖模块，请运行 npm install' } }
  if (/test\s*(fail|error)|assert/i.test(m)) return { kind: 'test_failure', recover: { action: 'none', hint: '测试失败，请查看错误详情' } }
  if (/invalid\s*arg|TypeError|required\s*param|missing\s*field/i.test(m)) return { kind: 'model_invalid_args', recover: { action: 'retry', hint: '参数无效，模型可能误解了指令' } }
  if (/LSP error|LSP disabled/i.test(m)) return { kind: 'lsp_failure', recover: { action: 'retry_with_grep', hint: 'LSP服务不可用，降级使用全文搜索(grep_search)' } }
  if (/MCP|connection failed|mcp server/i.test(m)) return { kind: 'mcp_failure', recover: { action: 'none', hint: 'MCP工具调用失败，请检查MCP Server连接状态' } }
  return { kind: 'unknown', recover: { action: 'retry', hint: m.slice(0, 120) } }
}

// Independent auto-commit (Task 2.2): decoupled from the verification flow.
function maybeAutoCommitAfterTool({ toolName, args, sessionId, db, onStatus }) {
  if (!['write_file', 'edit_file', 'apply_patch'].includes(toolName)) return
  try {
    const gitAutoCommit = require('./gitAutoCommit')
    if (!gitAutoCommit.getAutoCommitEnabled(db)) return
    const filePath = String(args?.path || '')
    if (!filePath) return
    const operation = toolName === 'write_file' ? 'write' : toolName === 'edit_file' ? 'edit' : 'apply'
    const result = gitAutoCommit.gitCommit(filePath, operation)
    if (result.success && result.commitMessage) {
      onStatus?.({ text: `✓ 自动提交: ${result.commitMessage.slice(0, 60)}`, kind: 'auto_commit' })
    }
  } catch {}
}

class SemanticLoopDetector {
  constructor(windowSize = 6, threshold = 0.85, warnThreshold = 2, breakThreshold = 4) {
    this.windowSize = windowSize
    this.threshold = threshold
    this.warnThreshold = warnThreshold
    this.breakThreshold = breakThreshold
    this._history = []
  }

  static similarity(a, b) {
    const sa = new Set(String(a || '').split(/\s+/).filter(t => t.length > 1))
    const sb = new Set(String(b || '').split(/\s+/).filter(t => t.length > 1))
    if (sa.size === 0 && sb.size === 0) return 1.0
    let overlap = 0
    for (const t of sa) if (sb.has(t)) overlap++
    return (2 * overlap) / (sa.size + sb.size)
  }

  processRound(responseText, toolCallNames) {
    const sig = responseText.slice(0, 300) + ' ' + toolCallNames.join(',')
    this._history.push({ sig, toolCalls: toolCallNames })
    if (this._history.length > this.windowSize) this._history.shift()

    if (this._history.length < 2) return { action: 'normal', score: 0, consecutive: 0 }

    const prev = this._history[this._history.length - 2].sig
    const score = SemanticLoopDetector.similarity(prev, sig)

    let consecutive = 0
    for (let i = this._history.length - 1; i >= 1; i--) {
      const s = SemanticLoopDetector.similarity(this._history[i - 1].sig, this._history[i].sig)
      if (s >= this.threshold) consecutive++
      else break
    }

    if (consecutive >= this.breakThreshold) return { action: 'break', score, consecutive }
    if (consecutive >= this.warnThreshold) return { action: 'warn', score, consecutive }
    return { action: 'normal', score, consecutive: 0 }
  }

  reset() { this._history = [] }
}

class IterationBudget extends IterationBudgetBase {
  constructor(maxTotal) {
    const opts = {}
    if (maxTotal > 0) opts.maxIterations = maxTotal
    super(opts)
    this.maxTotal = maxTotal > 0 ? Math.floor(maxTotal) : DEFAULT_MAX_ITERATIONS
    this._used = 0
  }
  consume() {
    if (this._used >= this.maxTotal) return false
    this._used++
    this.track('iteration')
    return true
  }
  refund() { if (this._used > 0) { this._used-- } }
  get used() { return this._used }
  get remaining() { return Math.max(0, this.maxTotal - this._used) }
  extendIterations(extra) {
    const n = Math.max(0, Math.floor(Number(extra) || 0))
    if (n <= 0) return false
    this.maxTotal += n
    if (this.maxIterations > 0) this.maxIterations += n
    this._exhausted = false
    this._exhaustedReason = null
    this._warnings.iterations = false
    return true
  }
}

/** Translate the agent UI mode into the permission policy mode. */
function agentModeToPermissionMode(agentMode) {
  const map = {
    'plan': 'ReadOnly',
    'ask': 'Prompt',
    'auto_confirm': 'WorkspaceWrite',
    'auto': 'WorkspaceWrite',
    'yolo': 'Allow',
    'custom': 'Prompt',
  }
  return map[agentMode] || 'Prompt'
}

/** Convert a generated plan into the todo shape emitted to the renderer. */
function planToTodos(plan) {
  if (!plan || !Array.isArray(plan.tasks)) return []
  return plan.tasks.map(t => ({
    content: t.description,
    status: t.status === 'completed' ? 'completed' : t.status === 'in_progress' ? 'in_progress' : 'pending',
    activeForm: t.status === 'in_progress' ? `正在执行: ${t.description}` : undefined,
  }))
}

/** Persist normalized usage metrics for one tool-loop model call. */
function accountToolLoopUsage({ db, sessionId, provider, model, usage, latencyMs, status = 200 }) {
  try {
    if (!db || !usage) return
    const u = normalizeUsage(usage)
    if (!u) return
    const cost = typeof computeCost === 'function' ? computeCost(model, u) : 0
    db.logUsage({
      session_id: sessionId || null,
      provider_id: (provider && (provider.provider_id || provider.id)) || (model && model.provider_id) || null,
      provider_name: (provider && (provider.provider_name || provider.name)) || (model && model.provider_name) || null,
      model_name: (model && model.model_name) || (model && model.name) || null,
      prompt_tokens: u.prompt_tokens || 0,
      completion_tokens: u.completion_tokens || 0,
      total_tokens: u.total_tokens || 0,
      cache_read_tokens: u.cache_read_tokens || 0,
      cache_creation_tokens: u.cache_creation_tokens || 0,
      cost,
      latency_ms: latencyMs || null,
      status,
      source: 'agent',
    })
  } catch (e) {
    try { log.warn('accountToolLoopUsage failed:', e && e.message) } catch {}
  }
}

/** Return an awaitable delay. */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Execute a tool with abort propagation and its configured timeout. */
async function runToolWithTimeout(tool, args, ctx, signal) {
  let lastResult
  for (let attempt = 0; attempt <= TOOL_RETRY_MAX; attempt++) {
    if (signal?.aborted) return { error: 'aborted' }
    const attemptCtrl = new AbortController()
    const onParentAbort = () => attemptCtrl.abort()
    if (signal) signal.addEventListener('abort', onParentAbort, { once: true })
    const attemptCtx = { ...ctx, signal: attemptCtrl.signal }

    const result = await new Promise((resolve) => {
      let done = false
      const finish = (val) => {
        if (done) return
        done = true
        clearTimeout(timer)
        if (signal) {
          signal.removeEventListener('abort', onParentAbort)
          signal.removeEventListener('abort', onAbort)
        }
        resolve(val)
      }
      const timer = setTimeout(() => {
        attemptCtrl.abort()
        finish({ error: `tool timed out after ${TOOL_TIMEOUT_MS}ms` })
      }, TOOL_TIMEOUT_MS)
      const onAbort = () => {
        attemptCtrl.abort()
        finish({ error: 'aborted' })
      }
      if (signal) signal.addEventListener('abort', onAbort, { once: true })
      Promise.resolve()
        .then(() => tool.run(args, attemptCtx))
        .then((result) => finish({ result }))
        .catch((e) => finish({ error: e && e.message ? e.message : String(e) }))
    })
    lastResult = result
    if (!result.error) return result
    const verdict = classifyError(new Error(result.error))
    if (!verdict.retryable || verdict.kind === 'abort' || verdict.kind === 'auth') return result
    if (attempt < TOOL_RETRY_MAX) {
      const backoff = TOOL_RETRY_BASE_MS * Math.pow(2, attempt)
      await sleep(backoff)
    }
  }
  return lastResult
}

/** Request user permission and fail closed when the request times out. */
function requestPermissionWithTimeout(requestPermission, payload, timeoutMs = PERMISSION_TIMEOUT_MS) {
  if (!requestPermission) return Promise.resolve(false)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    Promise.resolve(requestPermission(payload))
      .then((ok) => { clearTimeout(timer); resolve(!!ok) })
      .catch(() => { clearTimeout(timer); resolve(false) })
  })
}

module.exports = {
  DEFAULT_MAX_ITERATIONS,
  MAX_TOTAL_CHARS,
  LOOP_REPEAT_LIMIT,
  TOOL_TIMEOUT_MS,
  TOOL_RETRY_MAX,
  TOOL_RETRY_BASE_MS,
  PERMISSION_TIMEOUT_MS,
  MAX_CONCURRENT_TOOLS,
  MAX_READ_CONCURRENT,
  MAX_WRITE_CONCURRENT,
  MAX_DEFAULT_CONCURRENT,
  READ_TOOLS,
  WRITE_TOOLS,
  getMaxConcurrent,
  classifyToolError,
  maybeAutoCommitAfterTool,
  SemanticLoopDetector,
  IterationBudget,
  agentModeToPermissionMode,
  planToTodos,
  accountToolLoopUsage,
  sleep,
  runToolWithTimeout,
  requestPermissionWithTimeout,
}
