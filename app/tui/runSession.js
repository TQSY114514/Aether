// ─────────────────────────────────────────────────────────────────────────────
// runSession.js — TUI 会话执行封装（todo 2）+ 权限审批接线（todo 4）
// Electron-free：复用 agentCore 的 openDatabase + resolveProviderModel 从 DB 解析
// provider/model（--db 路径），驱动 runAgent 的 onText/onToolCall/onStatus/onPlanStep
// 事件 → reducer action（dispatch），由 App 逐帧渲染。
//
// requestPermission（todo 4，B2 接线 a 方案）：
//   agentCore.runAgent 已追加可选 requestPermission 参数并透传 runToolLoop
//   （向后兼容）。TUI 侧用 createTuiPermissionHandler 构造键盘应答面板回调：
//   allowRules 命中 → 直接放行；否则 dispatch PERMISSION_REQUEST 进入 awaiting
//   态，App 捕获 y/n/a 键后调 decidePermission 完成 Promise。
//   （无回调时 runToolLoop 默认拒绝 toolLoop.js:872-880）
// ─────────────────────────────────────────────────────────────────────────────
import { openDatabase, resolveProviderModel, runAgent } from '../electron/llm/agentCore.js'
import { captureFileSnapshot } from './rollback.js'

/**
 * 从 DB 解析 provider + model（供 runSession 使用）。抛错带人类可读信息。
 * @param {string} [dbPath]  --db 路径；缺省用 agentCore 默认路径
 * @param {string} [modelName]  模型名或 provider/model；缺省用 primary
 */
export function resolveSessionResources(dbPath, modelName) {
  const db = openDatabase(dbPath)
  if (!db) throw new Error('no database found (run the desktop app once, or pass --db <path>)')
  const resolved = resolveProviderModel(db, { modelName })
  if (!resolved) {
    throw new Error('no enabled model found. Configure one in the app or run --list-models / --list-providers.')
  }
  return resolved
}

/**
 * 工具→快照路径提取（todo 4）：write/edit 取 args.path，其余无快照（走 git 兜底）。
 * @param {string} name
 * @param {object} [args]
 * @returns {string|null}
 */
export function toolToSnapshotPath(name, args) {
  if (name === 'write_file' || name === 'edit_file') return args?.path || null
  return null
}

/**
 * 构造 TUI 键盘应答的 requestPermission 回调（todo 4）：
 * allowRules 命中 → 直接放行；否则写前快照 + dispatch PERMISSION_REQUEST 进入
 * awaiting 态，Promise resolver 存入 resolveRef，由 App 的 y/n/a 键经
 * decidePermission 完成。附 takeSnapshot(name)：TOOL_START 时把快照挂到工具卡。
 *
 * @param {object} opts
 * @param {(action: object) => void} opts.dispatch
 * @param {ReturnType<import('./allowRules.js').createAllowRulesStore>} opts.allowRules
 * @param {string} [opts.sessionId]
 * @param {{ current: {resolve: Function, name: string, args: object} | null }} opts.resolveRef
 * @param {Function} [opts.captureImpl]
 * @param {Function} [opts.pathImpl]
 * @returns {(perm: {name: string, args: object, risk?: string}) => Promise<boolean> & { takeSnapshot: (name: string) => object | null }}
 */
export function createTuiPermissionHandler({ dispatch, allowRules, sessionId = 'tui', resolveRef, captureImpl = captureFileSnapshot, pathImpl = toolToSnapshotPath }) {
  const snapshots = new Map() // toolName -> snapshot（TOOL_START 时消费）
  const handler = async ({ name, args, risk }) => {
    if (allowRules.match(sessionId, name, args)) return true
    const filePath = pathImpl(name, args)
    const snapshot = filePath ? captureImpl(filePath) : null
    if (snapshot) snapshots.set(name, snapshot)
    return new Promise((resolve) => {
      resolveRef.current = { resolve, name, args }
      dispatch({ type: 'PERMISSION_REQUEST', payload: { name, args, risk: risk || 'unknown', snapshot } })
    })
  }
  handler.takeSnapshot = (name) => {
    const s = snapshots.get(name)
    if (s) snapshots.delete(name)
    return s || null
  }
  return handler
}

/**
 * 完成待决权限（App y/n/a 键调用）。
 * @param {object} opts
 * @param {'allow'|'deny'} opts.decision
 * @param {boolean} [opts.remember]   'a' 键 → 记入会话 allowRules
 * @param {ReturnType<import('./allowRules.js').createAllowRulesStore>} opts.allowRules
 * @param {string} [opts.sessionId]
 * @param {{ current: {resolve: Function, name: string, args: object} | null }} opts.resolveRef
 * @param {(action: object) => void} opts.dispatch
 */
export function decidePermission({ decision, remember = false, allowRules, sessionId = 'tui', resolveRef, dispatch }) {
  const pending = resolveRef.current
  if (!pending) return
  const { resolve, name, args } = pending
  resolveRef.current = null
  if (decision === 'allow') {
    if (remember) allowRules.add(sessionId, name, args)
    resolve(true)
  } else {
    resolve(false)
  }
  dispatch({ type: 'PERMISSION_DECIDE' })
}

/**
 * 向运行中的循环注入 follow-up 消息（todo 6）。
 * 直接写 steering 模块（toolLoop.js:425 每轮消费同 key 的注入），Electron-free。
 * @param {string} sessionId  与 runSession 的 sessionId 一致（默认 'tui'）
 * @param {string} text
 */
export function injectSteering(sessionId, text) {
  const steering = require('../electron/llm/steering')
  return steering.steer(sessionId || 'tui', String(text || '').trim())
}

/**
 * 跑一轮 agent 会话，把事件流翻译成 reducer action。
 * @param {object} opts
 * @param {string} [opts.dbPath]
 * @param {string} [opts.modelName]
 * @param {string} opts.prompt
 * @param {string} [opts.agentMode]   'auto' | 'plan' | 'ask'（默认 'auto'）
 * @param {number} [opts.maxIterations]
 * @param {string} [opts.workspace]
 * @param {string} [opts.sessionId]   steering/事件键控（默认 'tui'）
 * @param {(action: object) => void} opts.dispatch   reducer dispatch
 * @param {(result: object) => void} [opts.onEnd]    完成回调（result.text/toolCalls）
 * @param {(perm: object) => Promise<boolean>} [opts.requestPermission]  权限回调（todo 4：createTuiPermissionHandler 产物或自定义）
 * @param {Function} [opts.runAgentImpl]  可注入 runAgent（测试用）
 * @param {Function} [opts.resolveImpl]   可注入 resolveSessionResources（测试用）
 * @returns {Promise<{text: string, toolCalls: object[]}>}
 */
export async function runSession({
  dbPath,
  modelName,
  prompt,
  agentMode = 'auto',
  maxIterations,
  workspace,
  sessionId = 'tui',
  dispatch,
  onEnd,
  requestPermission,
  runAgentImpl = runAgent,
  resolveImpl = resolveSessionResources,
} = {}) {
  const { provider, model } = resolveImpl(dbPath, modelName)
  dispatch({ type: 'AGENT_START', max: maxIterations })
  const result = await runAgentImpl({
    prompt: String(prompt || ''),
    provider,
    model,
    workspace: workspace || process.cwd(),
    agentMode,
    maxIterations,
    sessionId,
    requestPermission,
    onText: (chunk) => {
      if (chunk && typeof chunk.text === 'string') {
        dispatch({ type: 'TEXT_DELTA', delta: chunk.text })
      }
    },
    onToolCall: (entry) => {
      const isStart = entry && entry.result == null && entry.error == null && entry.startedAt != null
      let enriched = entry || {}
      // todo 4：TOOL_START 时把权限阶段捕获的写前快照挂到工具卡（回滚/diff 用）。
      if (isStart && requestPermission && typeof requestPermission.takeSnapshot === 'function') {
        const snap = requestPermission.takeSnapshot(entry.name)
        if (snap) enriched = { ...enriched, snapshot: snap }
      }
      dispatch({ type: isStart ? 'TOOL_START' : 'TOOL_END', entry: enriched })
    },
    onStatus: (s) => {
      if (s && typeof s.text === 'string') {
        dispatch({ type: 'STATUS', text: s.text })
        // todo 6：注入被循环消费（toolLoop.js:430 '📥 已插入你的新消息'）→ 队列出队
        if (s.kind === 'injection') dispatch({ type: 'STEER_DEQUEUE' })
      }
    },
    onPlanStep: (step) => {
      // todo 6：每轮消耗一次迭代 → 预算 used = depth + 1
      if (step && Number.isFinite(step.depth)) {
        dispatch({ type: 'BUDGET', used: step.depth + 1 })
      }
    },
  })
  dispatch({ type: 'AGENT_END' })
  if (onEnd) onEnd(result)
  return result
}
