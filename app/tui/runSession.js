// ─────────────────────────────────────────────────────────────────────────────
// runSession.js — TUI 会话执行封装（todo 2）
// Electron-free：复用 agentCore 的 openDatabase + resolveProviderModel 从 DB 解析
// provider/model（--db 路径），驱动 runAgent 的 onText/onToolCall/onStatus/onPlanStep
// 事件 → reducer action（dispatch），由 App 逐帧渲染。
//
// requestPermission 透传义务（todo 4 契约）：runSession 接受可选的 requestPermission
// 回调并透传给执行层。runAgent 目前尚无该参数（todo 4 二选一接线：runAgent 追加可选
// 参数透传，或 runSession 直调已导出的 runToolLoop）；无回调时 runToolLoop 默认拒绝
// （toolLoop.js:872-880 已核实），即 headless 默认全拒。
// ─────────────────────────────────────────────────────────────────────────────
import { openDatabase, resolveProviderModel, runAgent } from '../electron/llm/agentCore.js'

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
 * 跑一轮 agent 会话，把事件流翻译成 reducer action。
 * @param {object} opts
 * @param {string} [opts.dbPath]
 * @param {string} [opts.modelName]
 * @param {string} opts.prompt
 * @param {string} [opts.agentMode]   'auto' | 'plan' | 'ask'（默认 'auto'）
 * @param {number} [opts.maxIterations]
 * @param {string} [opts.workspace]
 * @param {(action: object) => void} opts.dispatch   reducer dispatch
 * @param {(result: object) => void} [opts.onEnd]    完成回调（result.text/toolCalls）
 * @param {(perm: object) => Promise<boolean>} [opts.requestPermission]  权限回调（todo 4 契约，透传执行层）
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
  dispatch,
  onEnd,
  requestPermission,
  runAgentImpl = runAgent,
  resolveImpl = resolveSessionResources,
} = {}) {
  const { provider, model } = resolveImpl(dbPath, modelName)
  const result = await runAgentImpl({
    prompt: String(prompt || ''),
    provider,
    model,
    workspace: workspace || process.cwd(),
    agentMode,
    maxIterations,
    requestPermission,
    onText: (chunk) => {
      if (chunk && typeof chunk.text === 'string') {
        dispatch({ type: 'TEXT_DELTA', delta: chunk.text })
      }
    },
    onToolCall: (entry) => {
      const isStart = entry && entry.result == null && entry.error == null && entry.startedAt != null
      dispatch({ type: isStart ? 'TOOL_START' : 'TOOL_END', entry: entry || {} })
    },
    onStatus: (s) => {
      if (s && typeof s.text === 'string') dispatch({ type: 'STATUS', text: s.text })
    },
    onPlanStep: () => { /* todo 6 steering 队列消费 */ },
  })
  dispatch({ type: 'AGENT_END' })
  if (onEnd) onEnd(result)
  return result
}
