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
import { openDatabase, resolveProviderModel, runAgent, isEncryptedKey, defaultDbPath } from '../electron/llm/agentCore.js'
import { createEmptyDatabase } from '../electron/database.js'
import { taskDbAdapter } from '../electron/llm/taskDbAdapter.js'
import { captureFileSnapshot } from './rollback.js'
import { isToolStart } from './toolCards.js'
import { connectMcpServers, disconnectMcpServers, runSessionHooks } from '../electron/llm/headlessMcp.js'
import { loadAuthKeys } from './authStore.js'

// ── 流式节流常量（模块级: 参数默认值引用, 不能定义在函数体内）──────────────
// TEXT_DELTA 节流: 模型每 token 一个 chunk, 逐 chunk dispatch 会高频全量
// 重渲染 → ConPTY 下抽搐。定时器合并（TEXT_DELTA_THROTTLE_MS）+ 结束 flush。
// 参考 codex-cli frame_requester（帧合并调度）与 aichat gather_events（50ms
// 批量）的成熟做法。
const TEXT_DELTA_THROTTLE_MS = 60
// 思考增量节流: 推理模型每 token 一个 reasoning chunk, 合并后一次 dispatch。
const THINK_DELTA_THROTTLE_MS = 100

// 判定 agent 错误文本（toolLoop.js 把 API/工具错误包成 '[agent error: ...]'
// 字符串返回, 若直接当 assistant 文本渲染, 用户看到"有输出"实为错误——
// 这是"输出不可用"体验的根因。此处统一识别并转为 [sys] 错误行呈现。）
export function isAgentErrorText(s) {
  return typeof s === 'string' && /^\[agent error:/.test(s.trim())
}

/**
 * 从 DB 解析 provider + model（供 runSession 使用）。抛错带人类可读信息。
 * 返回 { provider, model, db }（db 供 todo 13 persona/记忆注入透传 runAgent）。
 * @param {string} [dbPath]  --db 路径；缺省用 agentCore 默认路径
 * @param {string} [modelName]  模型名或 provider/model；缺省用 primary
 */
export function resolveSessionResources(dbPath, modelName) {
  let db = openDatabase(dbPath)
  if (!db) {
    // 全新机器无 aetherai.db → Electron-free 自动建库（W0-B3a）：
    // 不再要求先跑桌面版。建库失败（目录不可写等）→ 明确报错，不崩溃。
    const target = dbPath || defaultDbPath()
    try {
      db = createEmptyDatabase(target)
    } catch (err) {
      throw new Error(`unable to create database at ${target}: ${err && err.message ? err.message : String(err)}`)
    }
  }
  const resolved = resolveProviderModel(db, { modelName })
  if (!resolved) {
    throw new Error('未配置模型 — 运行 /provider add 配置提供方')
  }
  return { ...resolved, db }
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
 * @param {string} [opts.sessionId]   steering/事件键控（默认 'tui'；W0-t3：保持 'tui' 不变，不承载 DB id）
 * @param {number|null} [opts.dbSessionId]  DB 会话行 id（/use /fork 后由 reducer 持有；null → runSession 建新行）
 * @param {(action: object) => void} opts.dispatch   reducer dispatch
  * @param {(result: object) => void} [opts.onEnd]    完成回调（result.text/toolCalls）
  * @param {(perm: object) => Promise<boolean>} [opts.requestPermission]  权限回调（todo 4：createTuiPermissionHandler 产物或自定义）
  * @param {Function} [opts.runAgentImpl]  可注入 runAgent（测试用）
  * @param {Function} [opts.resolveImpl]   可注入 resolveSessionResources（测试用）
  * @returns {Promise<{text: string, toolCalls: object[], dbSessionId: number|null}>}
  *
  * W0-t3 落库语义（按 turn 聚合单次写入，绝不逐 chunk 写）：
  *   - db 存在时：dbSessionId 为 null → createSession({title:'tui'}) 建行；
  *    非 null → 复用该行（不重复建）。用户消息在运行前落库；
  *    agent 成功后才落 assistant 行；抛错轮次不落 assistant（用户行保留）。
  *   - 任一次落库失败 → 抛错（App 侧呈现 [sys]），turn 中止，不半写。
  *   - 返回 dbSessionId 供 App dispatch SESSION_ID_SET 回填 reducer。
  *
  * API key 解析优先级: --api-key 显式 > 环境变量(AETHER_API_KEY / <PROVIDER>_API_KEY) > DB 明文 > 报错。
  * 桌面版 safeStorage 加密的 key headless 无法解密——环境变量回退让 TUI/CLI 无摩擦可用。
  */
// 从环境变量回退取 API key(桌面版 safeStorage 加密的 key headless 无法解密):
//   AETHER_API_KEY(全局兜底) > AETHER_API_KEY_<PROVIDER名> > <PROVIDER名>_API_KEY
// provider 名非 ASCII(如中文)时, 用 AETHER_API_KEY 全局变量最省事。
function envKeyFor(provider) {
  if (!provider) return null
  const raw = String(provider.name || '').trim()
  if (!raw) return process.env.AETHER_API_KEY || null
  const norm = raw.toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  return process.env[`AETHER_API_KEY_${norm}`] || process.env[`${norm}_API_KEY`] || process.env.AETHER_API_KEY || null
}

// 从 auth.json 持久化存储回退(/apikey 命令写入; 对齐 opencode/Claude Code/Codex 惯例)
function authKeyFor(provider) {
  try {
    const keys = loadAuthKeys()
    if (!keys) return null
    const name = provider ? String(provider.name || '').trim() : ''
    return (name && keys[name]) || keys['*'] || null
  } catch {
    return null
  }
}

export async function runSession({
  dbPath,
  modelName,
  prompt,
  agentMode = 'auto',
  maxIterations,
  workspace,
  sessionId = 'tui',
  personaId,
  apiKey,
  apiUrl,
  apiFormat,
  effort,
  dispatch,
  onEnd,
  requestPermission,
  runAgentImpl = runAgent,
  resolveImpl = resolveSessionResources,
  onAskUser,
  onTodoUpdate,
  // W3-t21: 思考过程事件链式转发（runSession 内部 dispatch THINKING_* 之后
  // 原样透传给调用方, 与 onTodoUpdate 链式模式一致）
  onThinkingStart,
  onThinkingDelta,
  onThinkingEnd,
  dbSessionId = null,
  // 节流间隔（ms）: 生产默认 60ms 合并流式 chunk 防 ConPTY 抽搐;
  // 测试注入 0 → 立即 dispatch（同步语义, 便于断言）。
  textThrottleMs = TEXT_DELTA_THROTTLE_MS,
  thinkThrottleMs = THINK_DELTA_THROTTLE_MS,
} = {}) {
  const { provider, model, db } = resolveImpl(dbPath, modelName)
  // headless 无法解密 safeStorage 加密的 API key——密文直接发 API 会 401/卡住，
  // 表现为"无回复"。与 CLI 同款检测,提前红字报错。
  // 回退顺序: --api-key 显式 > 环境变量(AETHER_API_KEY / <PROVIDER>_API_KEY) > DB 明文。
  let effectiveApiKey = apiKey
  if (!effectiveApiKey && provider && provider.api_key && isEncryptedKey(provider.api_key)) {
    // 回退: 环境变量 > auth.json(持久化, /apikey 保存) > 报错
    effectiveApiKey = envKeyFor(provider) || authKeyFor(provider)
    if (!effectiveApiKey) {
      throw new Error(
        `the stored API key for provider "${provider.name}" is encrypted with the desktop app (safeStorage). ` +
        'Headless mode cannot decrypt it. Fix: run /apikey <provider> <key> once to save it locally, ' +
        'or set env AETHER_API_KEY, or pass --api-key <plaintext>.',
      )
    }
  }
  const effectiveProvider = effectiveApiKey ? { ...provider, api_key: effectiveApiKey, ...(apiUrl ? { api_url: apiUrl } : {}), ...(apiFormat ? { api_format: apiFormat } : {}) } : provider
  dispatch({ type: 'AGENT_START', max: maxIterations, modelName: model.model_name })
  // ── W0-t3 会话落库（按 turn 聚合单次写入；失败即中止，不半写）────────────
  // dbSessionId == null → 建新会话行（W2-t17 自动标题: 首条 prompt 前 40 字）;
  // 非 null（/use /fork 置入）→ 复用既有行，不重复建。
  let sessionRowId = null
  if (db) {
    const adapter = taskDbAdapter(db)
    try {
      if (dbSessionId == null) {
        // W2-t17 自动标题: 首条 prompt 前 40 字（超长截断加 …）; 空 prompt 回退 'tui' 占位
        const p = String(prompt || '').trim()
        const title = p ? (p.length > 40 ? `${p.slice(0, 40)}…` : p) : 'tui'
        sessionRowId = Number(adapter.createSession({ title, parentSessionId: null }).lastInsertRowid)
      } else {
        sessionRowId = Number(dbSessionId)
      }
      // 用户消息在运行前落库：agent 抛错也保留该行（中断轮次 = 合法的"无回复"态）
      adapter.addMessage({ session_id: sessionRowId, role: 'user', content: String(prompt || '') })
    } catch (err) {
      throw new Error(`session persistence failed: ${err && err.message ? err.message : String(err)}`)
    }
  }
  const ws = workspace || process.cwd()
  // 流式节流态: textBuf/textTimer 合并 TEXT_DELTA（textThrottleMs 可注入,
  // 测试传 0 → 立即 dispatch）; thinkBuf/thinkTimer 合并思考增量。
  let textBuf = ''
  let textTimer = null
  let thinkBuf = ''
  let thinkTimer = null

  // 节流文本入队: 0 → 同步 dispatch（测试/小窗口）; >0 → 定时器合并一次 dispatch。
  const flushText = () => {
    const payload = textBuf
    textBuf = ''
    if (payload) {
      dispatch({ type: 'TEXT_DELTA', delta: payload })
      hasAppendedText = true
    }
  }
  const queueText = (s) => {
    textBuf += s
    if (textThrottleMs <= 0) { flushText(); return }
    if (!textTimer) {
      textTimer = setTimeout(() => {
        textTimer = null
        flushText()
      }, textThrottleMs)
    }
  }
  // 思考增量入队（同上语义）
  const queueThink = (s) => {
    thinkBuf += s
    if (thinkThrottleMs <= 0) { flushThink(); return }
    if (!thinkTimer) {
      thinkTimer = setTimeout(() => {
        thinkTimer = null
        flushThink()
      }, thinkThrottleMs)
    }
  }
  const flushThink = () => {
    const payload = thinkBuf
    thinkBuf = ''
    if (payload) dispatch({ type: 'THINKING_DELTA', delta: payload })
  }
  // todo 14：MCP 连接 + SessionStart/SessionEnd hooks（best-effort，不阻塞 agent）。
  try { require('../electron/tools/sandbox').setWorkspaceRoot(ws) } catch {}
  try { await connectMcpServers({ db }) } catch {}
  try { await runSessionHooks('SessionStart', { sessionId, timestamp: new Date().toISOString() }) } catch {}
  let result
  let hasAppendedText = false
  let hasAppendedError = false
  try {
    result = await runAgentImpl({
      prompt: String(prompt || ''),
      provider: effectiveProvider,
      model,
      db,
      personaId,
      workspace: ws,
    agentMode,
    maxIterations,
    sessionId,
    requestPermission,
    options: effort ? { reasoning_effort: effort } : {},
    onText: (chunk) => {
      // 空串也算"收到文本"会让 hasAppendedText 误置位 → 兜底提示被跳过。
      // 只有非空 content 才算真实输出（部分中转站开头发空 content chunk）。
      if (chunk && typeof chunk.text === 'string' && chunk.text.length > 0) {
        // agent 错误文本（HTTP 503 / 401 等）→ 以 [sys] 错误行呈现, 不进 assistant
        // 气泡——否则"有输出"其实是错误（"输出不可用"根因）。
        if (isAgentErrorText(chunk.text)) {
          if (!hasAppendedError) {
            dispatch({ type: 'APPEND_SYSTEM', text: chunk.text.trim() })
            hasAppendedError = true
          }
          // 错误文本不标记"有文本"：让结束时的兜底逻辑判断是否显示提示
          return
        }
        // 流式文本节流: 合并 textThrottleMs 窗口内的 chunk, 一次 dispatch
        queueText(chunk.text)
      }
    },
    onToolCall: (entry) => {
      const isStart = isToolStart(entry)
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
      // assistant 回复文本经 onPlanStep.assistantText 传递（toolLoop.js:451）——
      // 不转发就是"agent 跑完但界面无回复"的根因。
      // 节流: 与 onText 共用 textBuf/textTimer 合并 dispatch, 防 ConPTY 抽搐。
      if (step && typeof step.assistantText === 'string' && step.assistantText) {
        if (isAgentErrorText(step.assistantText)) {
          if (!hasAppendedError) {
            dispatch({ type: 'APPEND_SYSTEM', text: step.assistantText.trim() })
            hasAppendedError = true
          }
          return
        }
        // 节流: 与 onText 共用 textBuf/textTimer 合并 dispatch, 防 ConPTY 抽搐。
        queueText(step.assistantText)
      }
    },
    onThinkingStart: () => {
      // W3-t21: 思考开始 → 新块（清空旧块; 运行中实时渲染 open=true）
      dispatch({ type: 'THINKING_START' })
      if (onThinkingStart && typeof onThinkingStart === 'function') onThinkingStart()
    },
    onThinkingDelta: (reasoning) => {
      // 推理模型思考增量 → 累积进 thinking 缓冲（reducer 尾部保留 4000 上限）。
      // 节流（thinkThrottleMs 合并）: 推理模型每 token 一个 chunk,
      // 逐 chunk dispatch 会高频全量重渲染 → ConPTY 下抽搐。定时器合并 +
      // 结束时 flush（不丢尾部）。
      if (reasoning && typeof reasoning === 'string') {
        queueThink(reasoning)
      }
      if (onThinkingDelta && typeof onThinkingDelta === 'function') onThinkingDelta(reasoning)
    },
    onThinkingEnd: () => {
      // 思考结束 → flush 残留缓冲（<thinkThrottleMs 的短思考不丢）+ 保持展开
      // （默认展开, Enter 可折叠; 不随 AGENT_END 清除供回顾）
      if (thinkTimer) { clearTimeout(thinkTimer); thinkTimer = null }
      flushThink()
      dispatch({ type: 'THINKING_END' })
      if (onThinkingEnd && typeof onThinkingEnd === 'function') onThinkingEnd()
    },
    onAskUser, // ask_user 工具: TUI 面板应答(结构化提问)
    onUsage: (usage) => {
      // 实时 token 用量(状态栏 tok: in/out)
      if (usage && (usage.input || usage.output)) {
        dispatch({ type: 'USAGE', usage: { input: usage.input || 0, output: usage.output || 0 } })
      }
    },
    // W1-t9: todo_write 清单（runAgent 转发 → TODO_SET → 状态栏计数 + Ctrl+T 面板）。
    // 转发原样（{content, status, activeForm?}[]，registry.js todo_write 规范化后的形状），
    // 不转换；非数组防御由 reducer TODO_SET 兜底。
    onTodoUpdate: (todos) => {
      if (Array.isArray(todos)) dispatch({ type: 'TODO_SET', todos })
      if (onTodoUpdate && typeof onTodoUpdate === 'function') onTodoUpdate(todos)
    },
    })
  } finally {
    try { await runSessionHooks('SessionEnd', { sessionId, timestamp: new Date().toISOString() }) } catch {}
    try { await disconnectMcpServers() } catch {}
  }
  // 兜底: 若回复文本未经 onPlanStep/onText 送达(纯工具循环等路径), 把 result.text 追加到
  // assistant 消息(TEXT_DELTA 需 running, 故放在 AGENT_END 之前)。
  // 若连 result.text 都为空且全程无输出 → 明确提示(推理模型仅思考/空回复不再静默)。
  // flush 流式节流缓冲（<textThrottleMs 的短回复不丢尾部）。
  if (textTimer) { clearTimeout(textTimer); textTimer = null }
  flushText()
  if (!hasAppendedText) {
    const finalText = result && result.text ? String(result.text) : ''
    if (finalText && !isAgentErrorText(finalText)) {
      dispatch({ type: 'TEXT_DELTA', delta: finalText })
    } else if (isAgentErrorText(finalText) && !hasAppendedError) {
      // agent 错误文本（toolLoop 返回）→ [sys] 错误行, 不渲染成 assistant 回复
      dispatch({ type: 'APPEND_SYSTEM', text: finalText.trim() })
      hasAppendedError = true
    } else if (!hasAppendedError) {
      dispatch({ type: 'APPEND_SYSTEM', text: 'agent 未返回文本回复——模型可能仅输出思考过程, 请重试或换非推理模型' })
    }
  }
  dispatch({ type: 'AGENT_END' })
  // ── W0-t3：仅成功后落 assistant 回复（抛错轮次已在上面抛出，不落残缺行）──
  if (db && sessionRowId != null && result) {
    try {
      taskDbAdapter(db).addMessage({ session_id: sessionRowId, role: 'assistant', content: String(result.text || '') })
    } catch (err) {
      throw new Error(`session persistence failed: ${err && err.message ? err.message : String(err)}`)
    }
  }
  if (onEnd) onEnd(result)
  return result && typeof result === 'object' ? { ...result, dbSessionId: sessionRowId } : result
}
