// ─────────────────────────────────────────────────────────────────────────────
// App.mjs — TUI 根组件（todo 1）+ 权限审批面板 + diff/回滚（todo 4）
// createElement 风格、无 JSX：Node v24 无法加载 .jsx（ISSUE-01 实证），且引入
// 加载器会违反「新依赖仅限纯 JS」护栏——故组件一律用 react.createElement 手写。
// ─────────────────────────────────────────────────────────────────────────────
import { createElement as h, useEffect, useReducer, useRef, useCallback, useState, useMemo } from 'react'
import { readFileSync, existsSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { execFile } from 'node:child_process' // W3-t19: !shell 执行 / W3-t23: git diff
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Box, Text, useInput, useApp } from 'ink'
import { tuiReducer, initialTuiState, messageDisplay, THINKING_BUFFER_LIMIT } from './reducer.js'
import { runSession, createTuiPermissionHandler, decidePermission, toolToSnapshotPath, injectSteering, resolveSessionResources } from './runSession.js'
import { createAllowRulesStore, decideTuiPermission } from './allowRules.js'
import { mergeRules, filterRules } from './permDialog.js' // W4-t25: /permissions 对话框纯逻辑
import { buildDiff, rollbackChange } from './rollback.js'
import { parseSessionCommand, SLASH_COMMANDS } from './sessionCommands.js'
import { openSessionDb, listSessions, forkSession, getTimeline } from './sessionTree.js'
import { loadSessionMessages, loadSessionTitle, findMostRecentSession } from './sessionLoad.js'
import { taskDbAdapter } from '../electron/llm/taskDbAdapter.js'
import { resolveProviderModel, runAgent } from '../electron/llm/agentCore.js'
import { buildCompactPlan, rebuildMessages, syncCompactToDb, userAssistantIndexOf, userAssistantCount, COMPRESS_KEEP_LAST } from './compact.js'
import { estimateMessagesTokens, buildContextLine } from './contextInfo.js'
import { findUndoBoundary, syncUndoToDb } from './undo.js'
import { buildRecapFallback, truncateRecap, resolveRecapKey, buildRecapMessages, RECAP_INSTRUCTION } from './recap.js'
import { searchMemory } from './memorySearch.js'
import { TOOL_STATUS, summarizeArgs } from './toolCards.js'
import { listModels } from './models.js'
import { dispatchKey, resolveMode } from './keyHandlers.js'
import { wheelDelta } from './wheel.js'
import { resolveFileRefs, globCandidates } from './fileRef.js' // W3-t18: @文件引用
import { parseShellLine, formatShellContext, truncateOutput, formatRecentShellContext, isBlockedShellCommand } from './shellExec.js' // W3-t19: !shell
import { resolveEditorCommand, editorTempPath, readEditorResult, spawnEditor } from './editor.js' // W3-t20: 外部编辑器
import { favoriteKey, toggleFavorite, recordRecent, cycleRecent } from './favorites.js' // W3-t22: 模型收藏
import { parseDiffStat, splitDiffFiles, diffToViewLines } from './diffParse.js' // W3-t23: /diff 查看器
import { loadKeybindings } from './keybindings.js'
import { loadAuthKeys, saveAuthKey } from './authStore.js'
import { isLegacyConsole } from './terminal.js'

// Tokyo Night 风格配色（克制、低饱和，参考 opencode 现代终端观感）
// 语义 tokens（对齐 opencode theme 结构）：组件只引用 token，不写裸色值。
const C = {
  primary: '#7aa2f7',   // 主色：logo / 提示符 / 选中项 / 运行中边框
  user: '#9ece6a',      // 用户消息
  assistant: '#c0caf5', // AI 回复
  tool: '#e0af68',      // 工具
  sys: '#565f89',       // 系统（灰）
  error: '#f7768e',     // 错误（红）
  dim: '#565f89',       // 次要文字
  bgHighlight: '#24283b', // 选中/悬停背景（opencode theme.primary 背景）
  warning: '#e0af68',   // 权限/警告（△）
  success: '#9ece6a',   // 成功/primary 标记
}

const ROLE_PREFIX = { user: '> ', assistant: '◆ ', system: '! ', tool: '⛭ ' }
const ROLE_LABEL = { user: 'you', assistant: 'aether', tool: 'tool', system: 'sys' }
const ROLE_COLOR = { user: C.user, assistant: C.assistant, tool: C.tool, system: C.sys }

  // 轻量 ticker：驱动动画帧（spinner / 运行指示）。active=false 时停表并返回静态字符
// ——idle 状态不重渲染（否则 120ms 全帧刷新就是"抽搐"）。
function useTicker(intervalMs = 500, chars = ['●', '○'], active = true) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setI((x) => (x + 1) % chars.length), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs, chars.length, active])
  return chars[i]
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

// 紧凑品牌头（单行, 替代原 6 行 ASCII Logo）：
// 渲染成本 O(1) 且不再每次 tick 重建整帧——运行中仅 spinner 字符变化,
// 避免了"动画驱动全帧重绘"的抽搐源。徽标语对齐产品调性（工程终端工作台）。
function Logo({ tick }) {
  return h(Box, { justifyContent: 'space-between' },
    h(Box, { flexDirection: 'row' },
      h(Text, { bold: true, color: C.primary }, 'AETHER'),
      h(Text, { color: C.dim }, '  terminal ai workstation'),
    ),
    tick ? h(Text, { color: C.primary }, tick) : null,
  )
}

// 通用列表行（opencode DialogSelect 行样式）：选中高亮 primary + bgHighlight
function SelectRow({ label, idx, i, marker = '❯' }) {
  return h(Text, {
    color: i === idx ? C.primary : C.dim,
    backgroundColor: i === idx ? C.bgHighlight : undefined,
  }, `  ${i === idx ? `${marker} ` : '  '}${label}`)
}

// 会话标题显示截断（纯展示层, 不改 DB）: DB 存完整首条消息(上限 200 字),
// 列表/时间线只显示前 60 字——终端面板宽度有限, 防长标题撑爆布局。
function displayTitle(title) {
  const s = String(title || '(untitled)')
  return s.length > 60 ? `${s.slice(0, 60)}…` : s
}

// 消息区窗口化常量: 最多渲染最近 MSG_WINDOW 条(其余靠 PgUp/PgDn 翻页)
const MSG_WINDOW = 40

// 消息行：role 前缀 + 颜色层次（用户绿 / assistant 浅蓝 / 工具黄 / 系统灰）。
// 流式进行中的 assistant 空消息显示 spinner（tick 由父组件传入, 不新开定时器）。
// 错误文本（[sys] error: …）整行标红——agent 错误不再伪装成普通回复。
function MessageLine({ msg, selected, expanded, tick }) {
  const prefix = ROLE_PREFIX[msg.role] || '• '
  const label = ROLE_LABEL[msg.role] || msg.role
  let color = ROLE_COLOR[msg.role] || C.assistant
  const isError = msg.role === 'system' && /^error/i.test(String(msg.text))
  if (isError) color = C.error
  const bg = selected ? C.bgHighlight : undefined
  if (!msg.text && msg.role === 'assistant') {
    return h(Text, { color: C.dim, backgroundColor: bg }, `${prefix}${label} ${tick || '…'}`)
  }
  // W0-t7: 展开态渲染完整文本（无 4000 上限）; 截断态附可见展开提示（Enter 展开）。
  // 截断/展开逻辑为纯函数 messageDisplay（reducer.js）, 单测覆盖。
  const display = messageDisplay(msg.text, expanded)
  return h(Text, { color, backgroundColor: bg }, `${prefix}${label} ${display}`)
}

// 工具调用卡（todo 3）：running 圆框 / done|error 单框，状态色边框 + 标签。
// 完成态且带快照时标注可审阅（v: diff / r: rollback）。
function ToolCard({ card, expanded }) {
  const meta = TOOL_STATUS[card.status] || TOOL_STATUS.done
  const borderStyle = card.status === 'running' ? 'round' : 'single'
  const reviewable = card.status === 'done' && (card.snapshot || card.rollbackResult)
  const hint = expanded ? ' [Enter: 接受 / r: 回滚 / Esc: 关闭]'
    : reviewable ? ' [v: diff]' : ''
  return h(Box, { borderStyle, borderColor: meta.color, paddingX: 1, marginTop: 1, flexDirection: 'column' },
    h(Text, { color: meta.color },
      `[${meta.label}] ${card.name}${card.latencyMs != null ? ` (${card.latencyMs}ms)` : ''}${hint}`),
    h(Text, { color: 'gray' }, String(card.summary || '')),
    card.rollbackResult
      ? h(Text, { color: card.rollbackResult.ok ? 'green' : 'red' },
        `rollback: ${card.rollbackResult.ok ? 'restored via ' + card.rollbackResult.via : 'failed: ' + (card.rollbackResult.error || 'unknown')}`)
      : null,
    card.diff && expanded ? h(DiffView, { diff: card.diff }) : null,
  )
}

// 行级 diff 视图（todo 4）：+ 新增 / - 删除 / 空格上下文。
function DiffView({ diff }) {
  return h(Box, { flexDirection: 'column', marginTop: 1 },
    h(Text, { bold: true, color: 'gray' }, 'diff:'),
    diff.map((d, i) => h(Text, { key: i, color: d.type === 'add' ? 'green' : d.type === 'del' ? 'red' : 'gray' },
      `${d.type === 'add' ? '+' : d.type === 'del' ? '-' : ' '} ${d.line}`)),
  )
}

// 权限审批面板（opencode 风格）：←→ 选择 Allow once / Always / Reject，Enter 确认。
// tool-specific 详情(opencode permission body): bash 显命令 / edit·write 显文件 / 读类显路径
function PermissionDetail({ perm }) {
  const a = perm.args || {}
  if (perm.name === 'bash' && a.command) return h(Text, { color: C.tool }, `$ ${a.command}`)
  if ((perm.name === 'edit' || perm.name === 'write') && (a.filePath || a.path)) return h(Text, { color: C.tool }, `file: ${a.filePath || a.path}`)
  if ((perm.name === 'read' || perm.name === 'list' || perm.name === 'glob') && (a.path || a.pattern)) return h(Text, { color: C.tool }, `path: ${a.path || a.pattern}`)
  if (perm.name === 'grep' && (a.pattern || a.path)) return h(Text, { color: C.tool }, `pattern: ${a.pattern}${a.path ? ` in ${a.path}` : ''}`)
  return null
}

function PermissionPanel({ perm, permIdx }) {
  const options = ['Allow once', 'Allow always', 'Reject']
  return h(Box, { borderStyle: 'round', borderColor: C.warning, paddingX: 1, marginTop: 1, flexDirection: 'column' },
    h(Text, { bold: true, color: C.warning }, `△ [权限请求] ${perm.name}`),
    h(PermissionDetail, { perm }),
    h(Text, { color: 'gray' }, `args: ${summarizeArgs(perm.args)} | risk: ${perm.risk}`),
    h(Box, { flexDirection: 'row', marginTop: 1 },
      options.map((opt, i) => h(Box, {
        key: opt,
        marginRight: 1,
        paddingX: 1,
        backgroundColor: i === permIdx ? C.bgHighlight : undefined,
      }, h(Text, { color: i === permIdx ? C.warning : 'gray', bold: i === permIdx }, ` ${opt} `)))),
    h(Text, { color: 'gray' }, '←→ 选择 · Enter 确认 · Esc/Ctrl+C 拒绝'),
  )
}

// 运行时长格式化（codex-cli fmt_elapsed_compact 同款）: 0-59s → '42s'; 分钟 → '1m 05s'
function fmtElapsed(sec) {
  const s = Number.isFinite(sec) ? sec : 0
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m < 60) return `${m}m ${String(r).padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `${h}h ${String(m % 60).padStart(2, '0')}m`
}

// 底部状态栏（紧凑单行）: 只留用户真正关心的 bits——
// 模式 │ 模型 │ 运行(时长) │ 上下文估算 │ 自定义脚本输出。
// 其余（approval/effort/budget/tool/steer/todos/think/tools）从行内移到
// 输入框 meta 行（下方 App 渲染处保留 effort 等高频项）。
function StatusBar({ state, tick, ctxK, extra, elapsedSec }) {
  const bits = [
    state.running ? `${tick} running ${fmtElapsed(elapsedSec)}` : '● idle',
    state.modelName ? `model:${state.modelName}` : null,
    ctxK > 0 ? `ctx:~${ctxK}k` : null,
    state.statusLine && state.statusLine !== 'idle' && state.statusLine !== 'running' ? state.statusLine : null,
    state.approvalMode !== 'manual' ? `approval:${state.approvalMode}` : null,
    state.currentTool ? `tool:${state.currentTool}` : null,
    state.todos.length ? `todos:${state.todos.length}` : null,
    state.thinking && state.thinking.text ? (state.thinking.open ? 'think:on' : `think:${state.thinking.text.length}`) : null,
    extra || null,
  ].filter(Boolean)
  return h(Box, { marginTop: 1, borderStyle: 'single', borderColor: state.running ? C.primary : C.dim, paddingX: 1 },
    h(Text, { color: C.dim }, bits.join(' │ ')),
  )
}

// ── W3-t21: 思考过程块（推理模型; 输入框上方固定渲染）────────────────────
// 折叠态: 首 80 字符 + 展开提示; 展开态: 全文（reducer 已限 4000 尾部保留,
// 超限附加截断标注）。空文本不渲染。
function ThinkingBlock({ thinking }) {
  if (!thinking || !thinking.text) return null
  const collapsed = !thinking.open
  const body = collapsed
    ? `${thinking.text.slice(0, 80)}${thinking.text.length > 80 ? '…' : ''}`
    : (thinking.text.length >= THINKING_BUFFER_LIMIT ? `…${thinking.text}（已截断）` : thinking.text)
  const hint = collapsed ? ' · Enter 展开思考' : ' · Enter 折叠'
  return h(Box, { marginTop: 1, borderStyle: 'single', borderColor: C.dim, paddingX: 1, flexDirection: 'column' },
    h(Text, { bold: true, color: C.dim }, `思考过程${collapsed ? ` · ${thinking.text.length}字` : '（运行中/展开）'}`),
    h(Text, { color: C.dim }, `${body}${hint}`),
  )
}

export function App({ dbPath, modelName, apiKey, apiUrl, apiFormat, statusLineCmd, stdin: stdinProp, tuiLog, resumeContinue, resumeSessionId, resumeFork }) {
  const { stdin, stdout, exit } = useApp()
  const [state, realDispatch] = useReducer(tuiReducer, initialTuiState)
  // 诊断日志(--tui-log <path>): 记录所有 dispatch 动作与时间戳, 排查无输出问题
  const dispatch = useCallback((a) => {
    if (tuiLog) {
      try {
        const p = tuiLog === true ? join(homedir(), '.aether-tui.log') : tuiLog
        appendFileSync(p, JSON.stringify({ t: Date.now(), type: a.type, text: a.text, delta: a.delta, name: a.name }) + '\n')
      } catch {}
    }
    realDispatch(a)
  }, [tuiLog])
  const tick = useTicker(500, SPINNER, state.running)
  // 运行时长（codex-cli StatusIndicator 同款）: running 起计时, 结束清零。
  // 独立 1s ticker 只更新这个数字, 避免拖累整帧重绘。
  const [elapsedSec, setElapsedSec] = useState(0)
  useEffect(() => {
    if (!state.running) { setElapsedSec(0); return }
    const t0 = Date.now()
    const t = setInterval(() => setElapsedSec(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(t)
  }, [state.running])
  const sessionBusyRef = useRef(false)
  // W2-t16: /delete 两步确认——pendingDeleteRef 持有待确认删除的 dbSessionId;
  // 任何其他命令/普通输入都会清除（见 handleCommand 入口与 startSession）。
  const pendingDeleteRef = useRef(null)
  const allowRulesRef = useRef(null)
  // W4-t24: 三态规则存储（allow/deny/ask）。创建时从 settings 表载入持久化规则
  // （loadPersistedRules 已复制进内存 Map, db 连接用完即关——不跨渲染持有连接）。
  // 无库/不可读 → 降级为仅内存规则（不抛错）。
  if (!allowRulesRef.current) {
    let db = null
    try { db = openSessionDb(dbPath) } catch {}
    allowRulesRef.current = createAllowRulesStore({ db })
    try { db?.close() } catch {}
  }
  const resolveRef = useRef(null)
  const workspaceRef = useRef(process.cwd())
  // W3-t19: !shell 上下文缓冲（最近 ≤5 条; 下次提交时前置注入模型; 内存态）
  const shellContextRef = useRef([])
  // W3-t22: 最近使用模型（内存列表, 最前 = 最近, 上限 5; F2 循环）
  const recentModelsRef = useRef([])
  // 命令历史(↑↓ 回填, 上限 100 条, 去重)
  const historyRef = useRef([])
  const historyIdxRef = useRef(-1)
  // W1（t10-t14）: 命令 handler 内部读取的最新状态（避免 useCallback 闭包过期;
  // 每渲染刷新, handleCommand 依赖数组保持 [dbPath, state.currentSessionId] 不变）
  const latestState = useRef(state)
  latestState.current = state
  // 斜杠补全 / Ctrl+P 面板 / 模型选择器 / leader key（UI 本地状态，不进核心状态机）
  const [slashIdx, setSlashIdx] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteIdx, setPaletteIdx] = useState(0)
  const [paletteFilter, setPaletteFilter] = useState('')
  // W1-t9: todo 清单面板（Claude Code Ctrl+T 同款; App 本地状态, 不进核心状态机）
  const [todoOpen, setTodoOpen] = useState(false)
  // 模型选择器: null=关闭, { models, idx, filter }=打开（opencode DialogSelect 风格）
  const [modelPicker, setModelPicker] = useState(null)
  // W3-t18: @文件候选面板: null=关闭, { items, idx, tokenStart, partial }=打开
  // （App 本地状态, 不进核心状态机; resolveMode 中 filePick 优先于 base）
  const [filePick, setFilePick] = useState(null)
  // W3-t23: /diff 聚合查看器: null=关闭, { files: [{path, added, removed, lines}], idx, mode: 'file'|'all' }
  const [diffView, setDiffView] = useState(null)
  // 会话时间线(leader g): null=关闭, { sessions, idx }=祖先链
  const [timeline, setTimeline] = useState(null)
  // 帮助屏(lazygit '?' 式): 快捷键表
  const [helpOpen, setHelpOpen] = useState(false)
  // rewind 检查点面板(Esc Esc): { points, idx } — 带快照的工具卡(最新在前)
  const [rewindOpen, setRewindOpen] = useState(false)
  const [rewindIdx, setRewindIdx] = useState(0)
  const [rewindPoints, setRewindPoints] = useState([])
  // plan 模式完成后的三选项高亮(自动接受/手动接受/继续规划)
  const [planChoice, setPlanChoice] = useState(0)
  // 分层 Esc: 空输入第一次 Esc 待命(1.5s 超时), 再按打开 rewind
  const escArmedRef = useRef(false)
  // 自定义状态栏输出(statusLineCmd 脚本 stdout)
  const [statusBarExtra, setStatusBarExtra] = useState('')
  // 用户键位重绑(热加载一次; keybindings.json 修改需重启)
  const keybindings = useMemo(() => loadKeybindings(), [])
  // 权限选项高亮(opencode: Allow once / Always / Reject)
  const [permIdx, setPermIdx] = useState(0)
  // W4-t25: /permissions 交互对话框（App 本地状态, 不进核心状态机）:
  // { rules: [{key,name,ruleKey,decision,source}], idx, filter } — 打开时快照合并列表,
  // 增删后重建（session/persisted 合并, 来源标注）
  const [permDialog, setPermDialog] = useState(null)
  // leader key（opencode ctrl+x 风格）: 按下后 1.2s 内等待第二个键
  const [leaderArmed, setLeaderArmed] = useState(false)
  // 消息区滚动偏移（0 = 跟随最新）
  const [scrollOffset, setScrollOffset] = useState(0)
  const PALETTE_ITEMS = ['New chat', 'Model', 'History (sessions)', 'Timeline', 'Export JSONL', 'Help', 'Quit']

  // todo 4：TUI 键盘应答权限回调（B2 接线 a 方案 → agentCore.runAgent 透传）。
  // 审批模式包装(opencode 离散预设): manual=询问 / auto-edits=edit·write 自动放行 /
  // plan=写工具直接拒绝(只读规划) / dontask=仅 allow 规则放行（W4-t26）。
  // W4-t24 决策顺序（写死语义）: deny 规则 > 只读自动放行 > 审批模式 > allow 规则 > 询问。
  // 保留 takeSnapshot 挂载。
  const basePermission = useMemo(
    () => createTuiPermissionHandler({ dispatch, allowRules: allowRulesRef.current, sessionId: 'tui', resolveRef }),
    [dispatch],
  )
  const tuiPermission = useCallback((perm) => {
    // W4-t24/26: 决策核心收敛到纯函数 decideTuiPermission（allowRules.js, 可单测）:
    // deny 规则 > 只读自动放行 > 审批模式 > dontask(仅 allow) > allow 规则 > 询问;
    // 返回 null 表示 ask/无规则 → 走 basePermission 询问面板（弹窗）。
    const d = allowRulesRef.current.decision('tui', perm.name, perm.args)
    const r = decideTuiPermission({ decision: d, name: perm.name, approvalMode: state.approvalMode })
    if (r == null) return basePermission(perm)
    return Promise.resolve(r)
  }, [basePermission, state.approvalMode])
  tuiPermission.takeSnapshot = basePermission.takeSnapshot

  // ask_user 工具应答: 结构化提问面板(↑↓ 选择 / Enter 确认 / Esc 取消)
  const askUserResolveRef = useRef(null)
  const tuiAskUser = useCallback((questions) => {
    return new Promise((resolve) => {
      askUserResolveRef.current = resolve
      dispatch({ type: 'ASK_USER_SET', questions })
    })
  }, [dispatch])

  const startSession = useCallback(async (promptText) => {
    if (sessionBusyRef.current) return
    pendingDeleteRef.current = null // W2-t16: 普通输入取消待确认的删除
    sessionBusyRef.current = true
    try {
      // W3-t18: @文件引用注入（≤50KB 内容块 / 超限截断标注 / 缺失原样保留）
      // W3-t19: 最近 !shell 上下文块前置注入（模型可见上次命令输出）
      const filePrompt = resolveFileRefs(promptText, workspaceRef.current).prompt
      const shellCtx = formatRecentShellContext(shellContextRef.current)
      const finalPrompt = shellCtx ? `${shellCtx}\n\n${filePrompt}` : filePrompt
      const result = await runSession({
        dbPath,
        modelName: state.modelName || modelName,   // /model 优先于 CLI 参数
        apiKey,
        apiUrl,
        apiFormat,
        prompt: finalPrompt,
        agentMode: state.mode,
        personaId: state.currentPersonaId,
        dbSessionId: state.dbSessionId,  // W0-t3: 复用 /use /fork 的 DB 会话行；null → runSession 新建
      dispatch,
      requestPermission: tuiPermission,
      onAskUser: tuiAskUser,
    })
      // W0-t3: 回填实际使用的 DB 会话 id（首轮创建 / 既有会话复用）
      if (result && result.dbSessionId != null) {
        dispatch({ type: 'SESSION_ID_SET', sessionId: result.dbSessionId })
      }
    } catch (err) {
      // 错误以 [sys] 消息可见呈现（仅改状态栏会被 AGENT_END 重置吞掉）。
      // 超时/中止转友好文案(adapter 60s 请求超时)
      const raw = err && err.message ? err.message : String(err)
      const friendly = /abort|timeout/i.test(raw) && !/HTTP/.test(raw)
        ? 'API 请求超时(60s) — 请检查网络或 provider 配置'
        : raw
      dispatch({ type: 'APPEND_SYSTEM', text: `error: ${friendly}` })
      dispatch({ type: 'AGENT_END' })
    } finally {
      sessionBusyRef.current = false
    }
  }, [dbPath, modelName, state.mode, state.modelName, state.dbSessionId, tuiPermission])

  // ── W3-t19: !shell 模式（'!' 开头且非 '!!' 转义 → 执行命令, 不跑 agent）────
  // Windows 执行: cmd.exe /d /s /c <line>（/d 忽略注册表 autorun, /s 保留引号语义）。
  // 安全: 必须过 isBlockedShellCommand（sandbox.js 破坏性 blocklist 镜像, 不裸奔）;
  // 输出 ≤8KB 截断 + 退出码; 结果以 [sys] 行显示 + 注入 user 消息（对话上下文）;
  // shellContextRef 缓冲供下次提交前置注入（模型可见）。
  const runShell = useCallback((text) => {
    const parsed = parseShellLine(text)
    if (!parsed) return
    pendingDeleteRef.current = null
    // 与 enter 提交同款清理: 清输入 + 入历史（重复 push 由去重兜底）
    historyRef.current = [...historyRef.current.filter((x) => x !== text), text].slice(-100)
    historyIdxRef.current = -1
    dispatch({ type: 'INPUT', value: '' })
    dispatch({ type: 'STATUS', text: '!shell: 执行中…' })
    dispatch({ type: 'APPEND_SYSTEM', text: `$ !${parsed.line}` })
    const run = async () => {
      // ── W4 钩子: deny 规则接入点（!shell 与 run_command 同规则; 持久化 deny
      // 层命中即拒绝, 不执行不注入上下文——会话级规则目前只有 'a' 产生的 allow,
      // 故此处实际生效的是持久化 deny）──
      const deny = allowRulesRef.current.decision('tui', 'run_command', { command: parsed.line })
      if (deny === 'deny') {
        const key = `${allowRulesRef.current.keyOf('run_command', { command: parsed.line })}`
        dispatch({ type: 'APPEND_SYSTEM', text: `!shell denied: run_command:${key} (permission rule)` })
        dispatch({ type: 'STATUS', text: `!shell denied by permission rule` })
        return
      }
      // 破坏性命令拦截（sandbox.js 同规则）; 拒绝则不执行、不注入上下文
      const gate = isBlockedShellCommand(parsed.line)
      if (!gate.ok) {
        dispatch({ type: 'APPEND_SYSTEM', text: `!shell blocked: ${gate.reason}` })
        dispatch({ type: 'STATUS', text: `!shell blocked: ${gate.reason}` })
        return
      }
      let output = ''
      let exitCode = 1
      try {
        const { stdout, stderr } = await new Promise((resolve, reject) => {
          execFile('cmd.exe', ['/d', '/s', '/c', parsed.line], {
            cwd: workspaceRef.current,
            timeout: 30000,             // 30s 超时
            maxBuffer: 8 * 1024 * 1024, // 防大输出爆内存
            windowsHide: true,
          }, (err, so, se) => {
            if (err) reject(Object.assign(err, { stdout: so, stderr: se }))
            else resolve({ stdout: so, stderr: se })
          })
        })
        output = String(stdout || '') + (stderr ? (stdout ? '\n' : '') + String(stderr) : '')
        exitCode = 0
      } catch (err) {
        output = String(err.stdout || '') + (err.stderr ? (err.stdout ? '\n' : '') + String(err.stderr) : '')
        exitCode = err.code != null ? err.code : 1
      }
      const truncated = truncateOutput(output, 8000)
      // 显示: 命令 + 输出以 [sys] 行呈现（用户立即看到执行了什么）
      dispatch({ type: 'APPEND_SYSTEM', text: `[exit ${exitCode}] ${truncated}`.trim() })
      // 注入: user 消息带 [shell: !cmd] 上下文块（对话内载体）+ 缓冲（下次提交前置）
      const block = formatShellContext(parsed.line, truncated, exitCode)
      shellContextRef.current = [...shellContextRef.current, { command: parsed.line, output: truncated, exitCode }].slice(-5)
      dispatch({ type: 'APPEND_USER', text: `!${parsed.line}${block}` })
      dispatch({ type: 'STATUS', text: `!shell: exit ${exitCode}` })
    }
    run()
  }, [dispatch])

  // ── W3-t20: 外部编辑器（Ctrl+X e; $EDITOR/$VISUAL, 回退 notepad.exe）──────
  // 流程: 当前输入写入临时文件 → 生成编辑器（detached, TUI 保持响应）→
  // 等待进程关闭（实测直接 spawn 的 notepad 在 Windows 上 close 即用户关闭）→
  // 读回内容 replace 输入框; 空文件 → 取消保留原输入; 临时文件删除。
  // 快速退出且内容未变 → 短轮询防御兜底（其他机器 notepad 立即返回的场景）。
  const openEditor = useCallback(async () => {
    const file = editorTempPath()
    const original = latestState.current.input
    try {
      writeFileSync(file, original, 'utf8')
    } catch (err) {
      dispatch({ type: 'STATUS', text: `editor: 无法创建临时文件 (${err && err.message ? err.message : String(err)})` })
      return
    }
    const editorCmd = resolveEditorCommand()
    dispatch({ type: 'STATUS', text: 'editor: 打开中… (保存并关闭编辑器返回)' })
    const { child, wait } = spawnEditor(editorCmd, file)
    // 5 分钟看门狗: 超时终止, 不悬挂
    const watchdog = setTimeout(() => {
      try { child.kill() } catch {}
      dispatch({ type: 'STATUS', text: 'editor: 超时(5分钟), 已终止编辑器' })
    }, 5 * 60 * 1000)
    const t0 = Date.now()
    await wait
    clearTimeout(watchdog)
    // 快速退出(<800ms) → 可能 GUI 编辑器立即返回: 短轮询等文件写入（防御）
    if (Date.now() - t0 < 800) {
      const until = Date.now() + 10000
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, 400))
        const probe = readEditorResult(file)
        if (probe != null && probe !== original) break
      }
    }
    const content = readEditorResult(file)
    try { rmSync(file, { force: true }) } catch {}
    if (content == null || content.trim() === '') {
      dispatch({ type: 'STATUS', text: 'editor: 取消（空文件）' })
      return
    }
    if (content === original) {
      dispatch({ type: 'STATUS', text: 'editor: 未修改（无变化）' })
      return
    }
    dispatch({ type: 'INPUT', value: content, replace: true })
    dispatch({ type: 'STATUS', text: `editor: 已回填 ${content.length} 字符` })
  }, [dispatch])

  // 打开模型选择器(读 DB 启用模型; /model、Ctrl+P Model、leader m 共用)
  const openModelPicker = useCallback(() => {
    const db = openSessionDb(dbPath)
    let models = []
    let favorites = new Set()
    try { models = listModels(db) } catch {}
    // W3-t22: 读取收藏（settings 表 model.favorite.<name>）→ Set, 选择器标星
    try {
      const adapter = taskDbAdapter(db)
      for (const m of models) {
        if (adapter.getSetting(favoriteKey(m.model_name)) === '1') favorites.add(m.model_name)
      }
    } catch {}
    try { db?.close() } catch {}
    if (models.length) setModelPicker({ models, idx: 0, filter: '', favorites })
    else dispatch({ type: 'STATUS', text: '未配置模型 — 运行 /provider add 配置提供方' })
  }, [dbPath])

  // ── W3-t22: Ctrl+F 收藏/取消当前模型（settings 表持久化, 重启仍在）──────
  const toggleModelFavorite = useCallback(() => {
    const name = latestState.current.modelName
    if (!name) { dispatch({ type: 'STATUS', text: '暂无当前模型 — 先 /model 或 Ctrl+X m 选择' }); return }
    const db = openSessionDb(dbPath)
    try {
      const adapter = taskDbAdapter(db)
      const next = toggleFavorite(adapter.getSetting(favoriteKey(name)))
      adapter.setSetting(favoriteKey(name), next)
      dispatch({ type: 'STATUS', text: next === '1' ? `★ 已收藏: ${name}` : `已取消收藏: ${name}` })
    } catch (err) {
      dispatch({ type: 'STATUS', text: `收藏失败: ${err && err.message ? err.message : String(err)}` })
    } finally {
      try { db?.close() } catch {}
    }
  }, [dbPath, dispatch])

  // ── W3-t22: F2 循环最近使用模型（内存列表, 状态栏显示）──────────────────
  const cycleRecentModel = useCallback(() => {
    const next = cycleRecent(recentModelsRef.current, latestState.current.modelName)
    if (!next) {
      dispatch({ type: 'STATUS', text: '暂无最近模型 — 使用过的模型会记录在此 (F2 循环)' })
      return
    }
    dispatch({ type: 'MODEL_SET', name: next })
    dispatch({ type: 'STATUS', text: `model: ${next} (最近循环)` })
  }, [dispatch])

  // 模型切换后记录到最近列表（覆盖 /model、选择器、F2 全部路径）
  useEffect(() => {
    if (state.modelName) {
      recentModelsRef.current = recordRecent(recentModelsRef.current, state.modelName)
    }
  }, [state.modelName])

  // ── W3-t18: @文件候选面板（词首 @ → glob 候选; 打字/退格同步; 无 @ → 关闭）──
  const syncFilePick = useCallback(() => {
    const s = latestState.current
    const input = s.input
    // 运行中 / 斜杠命令 / 无输入 → 关闭（Tab 等键不被候选面板抢占）
    if (s.running || !input || input.startsWith('/')) { setFilePick(null); return }
    // 词首 @ token: 行首或紧跟空白的 @（词中 @ 不触发）
    const m = input.match(/(?:^|\s)@([^\s@"']*)$/)
    if (!m) { setFilePick(null); return }
    const partial = m[1]
    const tokenStart = m.index + (m[0][0] === ' ' ? 1 : 0)
    const items = globCandidates(partial, workspaceRef.current, 30)
    // 保持 idx 在范围内（候选变化后不越界）
    setFilePick((prev) => ({ items, idx: Math.min(prev ? prev.idx : 0, Math.max(0, items.length - 1)), tokenStart, partial }))
  }, [])

  // 候选态 Enter: 用完整 @path 替换部分 token（继续编辑, 不提交）
  const acceptFilePick = useCallback(() => {
    const fp = filePick
    setFilePick(null)
    if (!fp) return
    const item = fp.items[fp.idx]
    if (!item) return
    const token = `@${item.path}`
    const s = latestState.current
    const tokenEnd = fp.tokenStart + 1 + fp.partial.length
    dispatch({ type: 'INPUT', value: s.input.slice(0, fp.tokenStart) + token + s.input.slice(tokenEnd), replace: true })
  }, [filePick, dispatch])

  // 会话列表(Ctrl+P History / leader l 共用)
  const openSessions = useCallback(() => {
    const db = openSessionDb(dbPath)
    try { dispatch({ type: 'SESSIONS_SET', sessions: listSessions(db) }) } catch {}
    try { db?.close() } catch {}
  }, [dbPath])

  // 会话时间线(leader g / 未来命令): 当前会话的父链
  const openTimeline = useCallback(() => {
    const db = openSessionDb(dbPath)
    let chain = []
    try { chain = getTimeline(db, state.currentSessionId) } catch {}
    try { db?.close() } catch {}
    if (chain.length > 1) setTimeline({ sessions: chain, idx: 0 })
    else dispatch({ type: 'STATUS', text: 'timeline: 当前会话无父链(仅自身)' })
  }, [dbPath, state.currentSessionId])

  // rewind 检查点: 列出带快照的工具卡(最新在前), Esc Esc 打开
  const openRewind = useCallback(() => {
    const points = state.toolCalls
      .map((c, i) => ({ i, card: c }))
      .filter((x) => x.card.snapshot)
      .reverse()
    if (!points.length) { dispatch({ type: 'STATUS', text: 'rewind: 暂无检查点(尚无带快照的工具调用)' }); return }
    setRewindPoints(points)
    setRewindIdx(0)
    setRewindOpen(true)
  }, [state.toolCalls])

  // 执行 rewind: 恢复选中检查点的快照 + 截断对话/工具卡到该点之前
  const doRewind = useCallback(async () => {
    const pt = rewindPoints[rewindIdx]
    if (!pt) return
    const card = pt.card
    try {
      const filePath = toolToSnapshotPath(card.name, card.args) || (card.snapshot ? card.snapshot.path : null)
      await rollbackChange({ snapshot: card.snapshot, filePath, cwd: workspaceRef.current })
      dispatch({ type: 'TRUNCATE', messages: state.messages.slice(0, pt.i + 1), toolCalls: state.toolCalls.slice(0, pt.i) })
      dispatch({ type: 'STATUS', text: `rewound to ${card.name} checkpoint` })
    } catch (err) {
      dispatch({ type: 'STATUS', text: `rewind failed: ${err && err.message ? err.message : String(err)}` })
    }
  }, [rewindPoints, rewindIdx, state.messages, state.toolCalls])

  // plan 模式完成后用户选择"实施" → 提交实施指令
  const startPlan = useCallback(() => {
    dispatch({ type: 'SUBMIT' })
    startSession('请实施上述计划。')
  }, [dispatch, startSession])

  // plan 边沿检测: running true→false 且 approvalMode==='plan' → 弹三选项
  const prevRunningRef = useRef(false)
  useEffect(() => {
    if (prevRunningRef.current && !state.running && state.approvalMode === 'plan' && !state.planDone) {
      dispatch({ type: 'PLAN_DONE', on: true })
    }
    prevRunningRef.current = state.running
  }, [state.running, state.approvalMode, state.planDone])

  // 终端检测: cmd/ConHost 下 ink 渲染会残留/抽搐/错位(用户实测),
  // 启动时提示一次建议 Windows Terminal(不刷屏)。
  useEffect(() => {
    if (isLegacyConsole()) {
      dispatch({ type: 'STATUS', text: '终端: cmd/ConHost — 建议使用 Windows Terminal(渲染更稳定)' })
    }
  }, [])

  // ── W2-t15: 启动 resume（--continue / --session <id> / --fork）──────────
  // 挂载时一次性加载历史: --session <id> → 该会话; --continue → 最近会话;
  // --fork 叠加 → 先派生新行（parent_session_id 指向目标）再进入空会话。
  // 无 flag → 保持 fresh-start（不触碰 DB）。
  // 后续 turn 复用 dbSessionId（SESSION_USE/SESSION_FORK 已置）→ runSession 追加
  // 到该行（W0-t3 行为，已验证）。
  const resumeDoneRef = useRef(false)
  useEffect(() => {
    if (resumeDoneRef.current) return
    resumeDoneRef.current = true
    const want = resumeContinue || resumeSessionId != null || resumeFork
    if (!want) return
    const db = openSessionDb(dbPath)
    try {
      if (!db) {
        dispatch({ type: 'STATUS', text: 'resume: 未找到数据库（--db 路径不存在或不可读）' })
        return
      }
      // 目标会话: --session <id> 优先, 否则 --continue 取最近
      let targetId = null
      let targetTitle = null
      if (resumeSessionId != null) {
        targetId = Number(resumeSessionId)
        targetTitle = loadSessionTitle(db, targetId)
        if (targetTitle == null && !db.prepare('SELECT id FROM session WHERE id = ?').get(targetId)) {
          dispatch({ type: 'STATUS', text: `会话不存在: #${targetId}` })
          return
        }
      } else {
        const recent = findMostRecentSession(db)
        if (!recent) {
          dispatch({ type: 'STATUS', text: 'resume: 无历史会话 — 开始全新会话' })
          return
        }
        targetId = recent.id
        targetTitle = recent.title
      }
      if (resumeFork) {
        // 派生: 新行 parent_session_id → 目标会话; 载入空会话（fork 后从空白继续）
        const r = forkSession(db, { title: null, parentSessionId: targetId })
        const forkedId = Number(r.lastInsertRowid)
        dispatch({ type: 'SESSION_FORK', sessionId: forkedId, parentId: targetId, title: 'fork' })
        dispatch({ type: 'SESSIONS_SET', sessions: listSessions(db) })
        dispatch({ type: 'STATUS', text: `forked from #${targetId} → 新会话 #${forkedId}` })
      } else {
        const messages = loadSessionMessages(db, targetId)
        dispatch({ type: 'MESSAGES_LOAD', messages })
        dispatch({ type: 'SESSIONS_SET', sessions: listSessions(db) })
        dispatch({ type: 'SESSION_USE', sessionId: targetId })
        dispatch({ type: 'STATUS', text: `resumed session #${targetId}${targetTitle ? ` ${targetTitle}` : ''}` })
      }
    } catch (err) {
      dispatch({ type: 'STATUS', text: `resume failed: ${err && err.message ? err.message : String(err)}` })
    } finally {
      try { db?.close() } catch {}
    }
  }, [])

  // 分层 Esc 超时解除
  useEffect(() => {
    if (!escArmedRef.current) return
    const t = setTimeout(() => { escArmedRef.current = false }, 1500)
    return () => clearTimeout(t)
  }, [escArmedRef.current])

  // 自定义状态栏(Claude statusLine 模式): 执行脚本, stdout 显示在状态栏
  useEffect(() => {
    if (!statusLineCmd) return
    let cancelled = false
    let timer = null
    const run = async () => {
      try {
        const { execFile } = await import('node:child_process')
        const { promisify } = await import('node:util')
        const out = await promisify(execFile)(statusLineCmd, [], { timeout: 3000, windowsHide: true })
        if (!cancelled) setStatusBarExtra(String(out.stdout || '').trim().slice(0, 60))
      } catch { /* 脚本失败不打扰 */ }
    }
    run()
    timer = setInterval(run, 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [statusLineCmd])

  // 鼠标滚轮支持(SGR 1006): 滚轮滚动消息区(与 PgUp/PgDn 同语义, 逐行 ±1)。
  // 事件由 index 的剥离层 consume 后 emit 'mouse'(不经过 ink parser)。
  // 开启 1000(按下事件)+1006(SGR 编码); 退出时恢复, 不影响终端选择复制(Shift 拖选)。
  // W0-t8 门控: 非 base 态(模态打开/权限/diff/steering/askUser/planDone)与
  // 输入非空、运行中一律忽略——与 keyHandlers resolveMode 同条件, 滚轮不与
  // 输入框/模态打架。ctxRef 每次渲染刷新, 监听器无需重订阅。
  useEffect(() => {
    if (!stdin || !stdout) return
    if (!stdin.isTTY) return
    stdout.write('\x1b[?1000h\x1b[?1006h')
    const onMouse = (btn) => {
      const ctx = ctxRef.current
      if (!ctx || resolveMode(ctx) !== 'base') return // 模态/面板打开 → 不滚动
      if (ctx.state.running || ctx.state.input) return
      const d = wheelDelta(btn)
      if (d === 0) return
      setScrollOffset((o) => {
        // 钳制: [0, 可滚动上限]（复用渲染层 Math.min 逻辑, App.mjs 消息区窗口）
        const max = Math.max(0, ctx.state.messages.length - MSG_WINDOW)
        return Math.min(max, Math.max(0, o + d))
      })
    }
    stdin.on('mouse', onMouse)
    return () => {
      stdout.write('\x1b[?1000l\x1b[?1006l')
      stdin.removeListener('mouse', onMouse)
    }
  }, [stdin, stdout])

  // leader key 待命超时: 3s（原 1.2s 太短——Ctrl+X 后稍犹豫 m 就变普通打字,
  // 表现为"模型选择器打不开/选择不了"）
  const LEADER_TIMEOUT_MS = 3000
  useEffect(() => {
    if (!leaderArmed) return
    const t = setTimeout(() => setLeaderArmed(false), LEADER_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [leaderArmed])

  // ── W4-t25: /permissions 对话框 ──────────────────────────────────────────
  // 打开: 合并 会话级 + 持久化 规则（来源标注 session/persisted）
  const openPermDialog = useCallback(() => {
    setPermDialog({
      rules: mergeRules(allowRulesRef.current.list('tui'), allowRulesRef.current.listPersisted()),
      idx: 0, filter: '',
    })
  }, [])

  // 重建对话框规则列表（增删后调用; 保持 filter, idx 钳制在界内）
  const refreshPermDialog = useCallback(() => {
    setPermDialog((prev) => {
      if (!prev) return prev
      const rules = mergeRules(allowRulesRef.current.list('tui'), allowRulesRef.current.listPersisted())
      return { ...prev, rules, idx: Math.min(prev.idx, Math.max(0, rules.length - 1)) }
    })
  }, [])

  // 'd' 删除选中规则: session → remove; persisted → removePersisted（DB + 内存同步）
  const permDialogDelete = useCallback(() => {
    if (!permDialog) return
    const filtered = filterRules(permDialog.rules, permDialog.filter)
    const rule = filtered[permDialog.idx]
    if (!rule) {
      dispatch({ type: 'STATUS', text: 'permissions: 无选中规则' })
      return
    }
    try {
      if (rule.source === 'session') {
        allowRulesRef.current.remove('tui', rule.key)
      } else {
        // persisted 行: key 形如 'run_command:git_status' → 按 name/ruleKey 落库删除
        const db = openSessionDb(dbPath)
        try { allowRulesRef.current.removePersisted(db, rule.name, rule.ruleKey) }
        finally { try { db?.close() } catch {} }
      }
    } catch (err) {
      dispatch({ type: 'STATUS', text: `rule delete failed: ${err && err.message ? err.message : String(err)}` })
      return
    }
    dispatch({ type: 'STATUS', text: `rule deleted: ${rule.key} (${rule.source})` })
    refreshPermDialog()
  }, [permDialog, dbPath, dispatch, refreshPermDialog])

  // ── W4-t24 #4: 权限面板 'a'（always allow）→ 会话规则 + 持久化规则双写 ──
  // 在 decidePermission 消费 pending 之前调用（keyHandlers permDecide 顺序保证）;
  // 持久化副本保证重启存活; 会话副本维持既有"本会话免问"语义。
  const persistPendingAllow = useCallback(() => {
    const pending = resolveRef.current
    if (!pending) return
    const key = allowRulesRef.current.keyOf(pending.name, pending.args)
    try {
      const db = openSessionDb(dbPath)
      try { allowRulesRef.current.persist(db, pending.name, key, 'allow') }
      finally { try { db?.close() } catch {} }
    } catch (err) {
      dispatch({ type: 'STATUS', text: `rule persist failed: ${err && err.message ? err.message : String(err)}` })
    }
  }, [dbPath, dispatch])

  // 会话树/记忆/技能命令（todo 5/8/13/20）：解析 → 单次打开 DB → 处理后关闭，
  // 避免每次命令累积 better-sqlite3 连接（长会话内存泄漏）。
  const handleCommand = useCallback(async (text) => {
    const cmd = parseSessionCommand(text)
    if (!cmd) return
    // W2-t16: 除 /delete 自身外，任何命令都取消待确认的删除（两步确认取消路径）
    if (cmd.type !== 'delete') pendingDeleteRef.current = null
    const db = openSessionDb(dbPath)
    try {
      if (cmd.type === 'sessions') {
        dispatch({ type: 'SESSIONS_SET', sessions: listSessions(db) })
      } else if (cmd.type === 'use') {
        dispatch({ type: 'SESSION_USE', sessionId: cmd.sessionId })
      } else if (cmd.type === 'fork') {
        const r = forkSession(db, { title: cmd.title, parentSessionId: state.currentSessionId })
        dispatch({ type: 'SESSION_FORK', sessionId: r.lastInsertRowid, parentId: state.currentSessionId, title: cmd.title || 'fork' })
      } else if (cmd.type === 'memory') {
        // todo 8：/memory <关键词> → autoMemory.search（keyword 兜底）→ 卡片
        const { results } = searchMemory(dbPath, cmd.query || '')
        dispatch({ type: 'MEMORY_SET', results })
        dispatch({ type: 'STATUS', text: `memory: ${results.length} hit(s)` })
      } else if (cmd.type === 'persona') {
        // todo 13：/persona <id> → 切换人设（runSession 注入）
        dispatch({ type: 'PERSONA_SET', personaId: cmd.personaId })
        dispatch({ type: 'STATUS', text: cmd.personaId == null ? 'persona: none' : `persona: #${cmd.personaId}` })
    } else if (cmd.type === 'skills' || cmd.type === 'skill-accept' || cmd.type === 'skill-dismiss') {
        // todo 20：habitLearner → 技能提案闭环展示 / 接受 / 忽略
        const habitLearner = require('../electron/llm/habitLearner')
        if (cmd.type === 'skills') {
          const habits = habitLearner.listHabits(db)
          dispatch({ type: 'SKILLS_SET', skills: habits.map((h) => ({
            key: h.key, imperative: h.imperative, reason: h.reason || '', occurrences: Number(h.occurrences) || 0,
          })) })
          dispatch({ type: 'STATUS', text: `skills: ${habits.length} proposal(s)` })
        } else if (cmd.type === 'skill-accept') {
          habitLearner.confirmHabit(db, cmd.key)
          dispatch({ type: 'STATUS', text: `skill accepted: ${cmd.key}` })
        } else {
          habitLearner.dismissHabit(db, cmd.key)
          dispatch({ type: 'STATUS', text: `skill dismissed: ${cmd.key}` })
        }
      } else if (cmd.type === 'mode') {
        // /mode <ask|plan|auto>：切换运行模式
        if (!['ask', 'plan', 'auto'].includes(cmd.mode)) {
          dispatch({ type: 'STATUS', text: 'usage: /mode <ask|plan|auto>' })
        } else {
          dispatch({ type: 'MODE_SET', mode: cmd.mode })
          dispatch({ type: 'STATUS', text: `mode: ${cmd.mode}` })
        }
      } else if (cmd.type === 'model') {
        if (!cmd.name) {
          // /model 无参数 → 打开模型选择器(↑↓ 选择, 不手输防打错)
          openModelPicker()
        } else {
          dispatch({ type: 'MODEL_SET', name: cmd.name })
          dispatch({ type: 'STATUS', text: `model: ${cmd.name}` })
        }
      } else if (cmd.type === 'effort') {        // /effort <low|medium|high>：thinking 力度（reasoning_effort）
        if (!['low', 'medium', 'high'].includes(cmd.level)) {
          dispatch({ type: 'STATUS', text: 'usage: /effort <low|medium|high>' })
        } else {
          dispatch({ type: 'EFFORT_SET', level: cmd.level })
          dispatch({ type: 'STATUS', text: `effort: ${cmd.level}` })
        }
      } else if (cmd.type === 'quit') {
        dispatch({ type: 'QUIT_INTENT' })
      } else if (cmd.type === 'status') {
        // /status: 终端/环境/会话信息(诊断)
        const env = {
          platform: process.platform, node: process.version,
          term: process.env.TERM || '(none)', colorterm: process.env.COLORTERM || '(none)',
          db: dbPath || '(default)', model: state.modelName || '(auto)', approval: state.approvalMode,
          mode: state.mode, session: state.currentSessionId ?? '(new)',
        }
        dispatch({ type: 'APPEND_SYSTEM', text: `status: ${JSON.stringify(env)}` })
      } else if (cmd.type === 'export') {
        // /export [path]: 会话导出 JSONL(Claude transcript 风格)
        const target = cmd.path || 'aether-session.jsonl'
        const lines = [
          ...state.messages.map((m) => JSON.stringify({ type: 'message', role: m.role, text: m.text, ts: new Date().toISOString() })),
          ...state.toolCalls.map((c) => JSON.stringify({ type: 'tool_call', name: c.name, status: c.status, summary: c.summary, ts: new Date().toISOString() })),
        ]
        try {
          writeFileSync(target, lines.join('\n') + '\n', 'utf8')
          dispatch({ type: 'STATUS', text: `exported ${lines.length} events → ${target}` })
        } catch (err) {
          dispatch({ type: 'STATUS', text: `export failed: ${err && err.message ? err.message : String(err)}` })
        }
      } else if (cmd.type === 'permissions') {
        // W4-t25: /permissions 打开交互对话框（会话级 + 持久化规则合并; ↑↓ 导航,
        // d 删除, 字符过滤, Esc 关闭）; 空规则表由面板渲染空态提示
        openPermDialog()
        dispatch({ type: 'STATUS', text: 'permissions: ↑↓ 选择 · d 删除 · 字符过滤 · Esc 关闭' })
      } else if (cmd.type === 'permissions-add') {
        // W4-t25: /permissions add <name> <ruleKey> <allow|deny|ask> — 行内添加,
        // 落持久化层（settings 表, 重启存活）; 非法参数由 parse 给 usage
        if (cmd.usage) {
          dispatch({ type: 'STATUS', text: cmd.usage })
        } else {
          try {
            allowRulesRef.current.persist(db, cmd.name, cmd.ruleKey, cmd.decision)
            dispatch({ type: 'STATUS', text: `rule ${cmd.decision}: ${cmd.name}:${cmd.ruleKey} (persisted)` })
            refreshPermDialog() // 对话框打开中 → 同步新规则
          } catch (err) {
            dispatch({ type: 'STATUS', text: `rule add failed: ${err && err.message ? err.message : String(err)}` })
          }
        }
      } else if (cmd.type === 'approval-mode') {
        // W4-t26: /approval-mode [mode] — 无参查当前; 参数 ∈ manual|auto-edits|plan|dontask
        // （latestState 防闭包过期: handleCommand 依赖数组不含 approvalMode）
        const st = latestState.current
        if (cmd.usage) {
          dispatch({ type: 'STATUS', text: cmd.usage })
        } else if (!cmd.mode) {
          dispatch({ type: 'STATUS', text: `approval: ${st.approvalMode} — /approval-mode <manual|auto-edits|plan|dontask>` })
        } else {
          dispatch({ type: 'APPROVAL_MODE_SET', mode: cmd.mode })
          dispatch({ type: 'STATUS', text: `approval: ${cmd.mode}${cmd.mode === 'dontask' ? ' — 仅 allow 规则放行' : ''}` })
        }
      } else if (cmd.type === 'provider-usage') {
        // 裸 /provider / 未知子命令 → usage（parse 已拒绝，不落库）
        dispatch({ type: 'STATUS', text: cmd.usage })
      } else if (cmd.type === 'provider-add') {
        // /provider add <name> <base-url> [api-format]（W0-t6）
        if (cmd.usage) {
          dispatch({ type: 'STATUS', text: cmd.usage })
        } else {
          taskDbAdapter(db).upsertProvider({
            name: cmd.name,
            api_url: cmd.url,
            api_format: cmd.apiFormat || 'openai',
            enabled: 1,
          })
          dispatch({ type: 'STATUS', text: `provider added: ${cmd.name} — 现在可用 /apikey ${cmd.name} <key> 存密钥` })
        }
      } else if (cmd.type === 'provider-list') {
        // /provider list（W0-t6）：只展示 id/name/api_url/api_format/enabled，绝不输出密钥
        const rows = taskDbAdapter(db).listProviders()
        if (!rows.length) {
          dispatch({ type: 'STATUS', text: 'providers: (none) — 用法: /provider add <name> <base-url> [api-format]' })
        } else {
          dispatch({ type: 'APPEND_SYSTEM', text: rows.map((p) =>
            `provider: ${p.name} · ${p.api_url} · format: ${p.api_format} · ${p.enabled ? 'enabled' : 'disabled'}`).join('\n') })
        }
      } else if (cmd.type === 'apikey') {
        // /apikey <key> 存全局 | /apikey <provider> <key> | /apikey 查看
        if (!cmd.key) {
          const keys = loadAuthKeys() || {}
          const names = Object.keys(keys)
          dispatch({ type: 'APPEND_SYSTEM', text: names.length
            ? `saved keys: ${names.map((n) => (n === '*' ? '(global)' : n)).join(' · ')} (已保存, 打码不显示)`
            : 'no saved keys — 用法: /apikey <key> 全局 或 /apikey <provider> <key>' })
        } else {
          saveAuthKey(cmd.provider || '*', cmd.key)
          dispatch({ type: 'STATUS', text: `API key saved for "${cmd.provider || '(global)'}" → auth.json (0600)` })
        }
      } else if (cmd.type === 'help') {
        dispatch({ type: 'APPEND_SYSTEM', text: `commands: ${SLASH_COMMANDS.join(' ')} | 快捷键: Alt+m 模式 / Alt+v diff / ↑↓ 历史 / Tab 补全 / Ctrl+P 面板 / Ctrl+C 退出` })
      } else if (cmd.type === 'compact' || cmd.type === 'compress-fast') {
        // ── W1-t10: /compact（AI 摘要, 复用桌面 compaction 引擎）+/compress-fast（纯裁剪）──
        // 审计结论见 compact.js 文件头：compaction.js 传递闭包 Electron-free →
        // 直接 require/import 复用 maybeCompact（不抽 RPC 封装）。
        // 摘要替换历史 + DB 同步（被压缩行删除不留孤儿, 摘要行追加）; 引擎抛错
        // 或未达阈值 → 状态栏呈现, 原消息不丢。
        const st = latestState.current
        if (st.running) {
          dispatch({ type: 'STATUS', text: 'compact: 请等待当前回合结束' })
        } else {
          const uaCount = st.messages.filter((m) => m.role === 'user' || m.role === 'assistant').length
          if (uaCount < 2) {
            dispatch({ type: 'STATUS', text: 'compact: 无可压缩（消息不足 2 条）' })
          } else if (cmd.type === 'compress-fast') {
            // 无 AI 纯裁剪：保留窗口内原样, 更早消息以 [compacted] 标记替换
            const plan = buildCompactPlan(st.messages, COMPRESS_KEEP_LAST)
            if (!plan.canCompact) {
              dispatch({ type: 'STATUS', text: 'compact: 消息未超过保留窗口, 无需裁剪' })
            } else {
              syncCompactToDb(db, st.dbSessionId, { droppedUa: userAssistantCount(plan.older), summaryText: plan.marker.text })
              dispatch({ type: 'TRUNCATE', messages: plan.messages, toolCalls: [] })
              dispatch({ type: 'STATUS', text: `compact: 已裁剪 ${plan.older.length} 条旧消息, 保留最近 ${plan.kept.length} 条` })
            }
          } else {
            // /compact — maybeCompact 路径（摘要成功 → 摘要+保留窗口; 摘要失败 →
            // 引擎内部降级为纯裁剪; 估算未达阈值 → 原样返回）
            try {
              const resolved = resolveProviderModel(db, { modelName: st.modelName || modelName })
              if (!resolved) {
                dispatch({ type: 'STATUS', text: 'compact: 未配置模型 — 可用 /compress-fast 做纯裁剪' })
              } else {
                let budget = null
                try {
                  const row = db.prepare('SELECT context_window FROM model WHERE id = ?').get(resolved.model.id)
                  budget = row && row.context_window ? Number(row.context_window) : null
                } catch {}
                // 模型行无 context_window → 用保守默认预算（文档写明; 0 = 禁用压缩）
                const budgetToken = budget && budget > 0 ? budget : 32000
                const cjs = await import('../electron/llm/compaction.js')
                const compaction = cjs.maybeCompact ? cjs : (cjs.default || {})
                const mapped = st.messages.map((m) => ({ role: m.role, content: String(m.text || '') }))
                const result = await compaction.maybeCompact({
                  provider: resolved.provider,
                  model: resolved.model,
                  messages: mapped,
                  budget: budgetToken,
                  sessionId: `tui:${st.dbSessionId ?? 'anon'}`,
                })
                const rebuilt = rebuildMessages(result, st.messages)
                // 判定是否真的发生了压缩：有旧消息被摘除或有摘要生成
                // （result 等长不代表未压缩——smart retention 会把旧 user 消息
                // 全部保留, 摘要行替代的是 assistant 文本, 长度可能不变）
                const compacted = rebuilt.droppedUa > 0 || (rebuilt.summaryText && rebuilt.summaryText.length > 0)
                if (!result || result === mapped || !compacted) {
                  dispatch({ type: 'STATUS', text: `compact: 无需压缩（估算 ${budgetToken} 预算内）` })
                } else {
                  syncCompactToDb(db, st.dbSessionId, { droppedUa: rebuilt.droppedUa, summaryText: `[compacted] ${rebuilt.summaryText}`.trim() })
                  dispatch({ type: 'TRUNCATE', messages: rebuilt.messages, toolCalls: [] })
                  dispatch({ type: 'STATUS', text: `compact: 已压缩 ${rebuilt.droppedUa} 条旧消息（保留 ${rebuilt.keptUa} 条）` })
                }
              }
            } catch (err) {
              dispatch({ type: 'STATUS', text: `compact failed: ${err && err.message ? err.message : String(err)}（原消息未改动）` })
            }
          }
        }
      } else if (cmd.type === 'context') {
        // ── W1-t11: /context 上下文占用 ──────────────────────────────────
        // 估算复用 compaction 的 ./tokenizer（contextInfo.js, 防两套估算器漂移）;
        // 模型上限取 model.context_window（resolveProviderModel 不返回该字段,
        // 直接查 model 表; 缺失 → '—'）。
        const st = latestState.current
        const ua = st.messages.filter((m) => m.role === 'user' || m.role === 'assistant')
        let contextLimit = null
        try {
          const resolved = resolveProviderModel(db, { modelName: st.modelName || modelName })
          if (resolved) {
            const row = db.prepare('SELECT context_window FROM model WHERE id = ?').get(resolved.model.id)
            if (row && row.context_window) contextLimit = Number(row.context_window)
          }
        } catch {}
        const est = estimateMessagesTokens(ua)
        dispatch({ type: 'APPEND_SYSTEM', text: buildContextLine({
          messageCount: ua.length,
          estTokens: est,
          contextLimit,
          usage: st.usage,
          modelName: st.modelName || null,
        }) })
      } else if (cmd.type === 'clear') {
        // ── W1-t12: /clear 新会话语义 ────────────────────────────────────
        // RESET（reducer 已有）→ 全新上下文 + dbSessionId=null → 下一条消息
        // 在 runSession 建新会话行; 旧会话留在 DB（/sessions 可见）。
        const st = latestState.current
        if (st.running) {
          dispatch({ type: 'STATUS', text: 'clear: 请等待当前回合结束' })
        } else {
          dispatch({ type: 'RESET' })
          dispatch({ type: 'STATUS', text: '新会话已开始 — 旧会话保留在 /sessions' })
        }
      } else if (cmd.type === 'rename') {
        // ── W2-t16: /rename <title> ─────────────────────────────────────
        // 改 sessions.title + 刷新列表（/sessions 面板可见）; 无 DB 会话 → 提示。
        if (cmd.usage) {
          dispatch({ type: 'STATUS', text: cmd.usage })
        } else {
          const st = latestState.current
          if (st.dbSessionId == null) {
            dispatch({ type: 'STATUS', text: '当前无会话 — 无法重命名' })
          } else {
            taskDbAdapter(db).renameSession(st.dbSessionId, cmd.title)
            dispatch({ type: 'SESSIONS_SET', sessions: listSessions(db) })
            dispatch({ type: 'STATUS', text: `renamed: ${cmd.title}` })
          }
        }
      } else if (cmd.type === 'delete') {
        // ── W2-t16: /delete（两步确认）──────────────────────────────────
        // 确认方案选择：两步重输 '/delete' 而非 'y' 确认——无模态、不占键位、
        // 与斜杠命令流一致；任何其他命令/普通输入清除 pendingDeleteRef。
        // 运行中拒绝; 无 DB 会话 → 提示; 删除当前会话 → RESET 回全新态
        // （dbSessionId=null → 下一条消息在 runSession 建新行）。
        const st = latestState.current
        if (st.running) {
          dispatch({ type: 'STATUS', text: 'delete: 请等待当前回合结束' })
        } else if (st.dbSessionId == null) {
          dispatch({ type: 'STATUS', text: '当前无会话 — 没有可删除的会话' })
        } else if (pendingDeleteRef.current !== st.dbSessionId) {
          pendingDeleteRef.current = st.dbSessionId
          dispatch({ type: 'STATUS', text: '再次输入 /delete 确认删除当前会话（其他输入取消）' })
        } else {
          pendingDeleteRef.current = null
          taskDbAdapter(db).deleteSession(st.dbSessionId)
          dispatch({ type: 'RESET' })
          dispatch({ type: 'SESSIONS_SET', sessions: listSessions(db) })
          dispatch({ type: 'STATUS', text: '会话已删除 — 新消息将创建新会话' })
        }
      } else if (cmd.type === 'undo') {
        // ── W1-t13: /undo 消息级撤销 ────────────────────────────────────
        // 三步: (a) 写文件快照回滚 (b) DB 删最后一轮 user+assistant 行
        // (c) 界面 TRUNCATE 到最后一轮 user 之前。
        // 快照↔消息的跨数组映射无时间戳可依（toolCalls 无 turn 归属）——
        // 采用保守规则: 回滚全部带快照的卡（文档写明; 单轮场景即等价于
        // 回滚最后一轮, 多轮场景多还原早前轮次写文件是取舍代价）。
        const st = latestState.current
        if (st.running) {
          dispatch({ type: 'STATUS', text: 'undo: 请等待当前回合结束' })
        } else {
          const boundary = findUndoBoundary(st.messages)
          if (!boundary) {
            dispatch({ type: 'STATUS', text: '无可撤销 — 会话中还没有 user 消息' })
          } else {
            let restored = 0
            let failed = 0
            for (const card of st.toolCalls) {
              if (!card || !card.snapshot) continue
              try {
                const filePath = toolToSnapshotPath(card.name, card.args) || (card.snapshot.path || null)
                const r = await rollbackChange({ snapshot: card.snapshot, filePath, cwd: workspaceRef.current })
                if (r && r.ok) restored++
                else failed++
              } catch { failed++ }
            }
            let dbNote = ''
            if (st.dbSessionId != null) {
              try {
                const r = syncUndoToDb(db, st.dbSessionId, st.messages, boundary)
                if (!r.ok) dbNote = ` (${r.note || 'DB 删除跳过'})`
              } catch (err) {
                dbNote = ` (DB 删除失败: ${err && err.message ? err.message : String(err)})`
              }
            } else {
              dbNote = ' (无持久化会话, 仅界面回退)'
            }
            // 快照已全部回滚 → 工具卡一并清空, 避免残留 "done" 卡与实际文件状态不符
            dispatch({ type: 'TRUNCATE', messages: st.messages.slice(0, boundary.lastUserIndex), toolCalls: [] })
            dispatch({ type: 'STATUS', text: `已撤销最后一轮 (文件还原 ${restored}${failed ? `, ${failed} 失败` : ''})${dbNote}` })
          }
        }
      } else if (cmd.type === 'recap') {
        // ── W1-t14: /recap 一行摘要（单发 runAgent, 低 token; 不写 DB/历史）──
        // 非阻塞 UX: 先 STATUS 提示, 完成后替换; 失败/无模型 → 本地拼接回退。
        const st = latestState.current
        if (st.running) {
          dispatch({ type: 'STATUS', text: 'recap: 请等待当前回合结束' })
        } else if (!st.messages.some((m) => m.role === 'user' || m.role === 'assistant')) {
          dispatch({ type: 'STATUS', text: 'recap: 会话为空' })
        } else {
          const fallback = () => {
            const fb = buildRecapFallback(st.messages, 5)
            dispatch({ type: 'STATUS', text: fb ? `recap: ${truncateRecap(fb)}` : 'recap: 会话为空' })
          }
          dispatch({ type: 'STATUS', text: '正在生成摘要…' })
          try {
            const { provider, model, db: rdb } = resolveSessionResources(dbPath, st.modelName || modelName)
            try {
              const key = resolveRecapKey(provider)
              if (!key) throw new Error('未找到可用 API key')
              const summary = await runAgent({
                prompt: RECAP_INSTRUCTION,
                provider: { ...provider, api_key: key },
                model,
                db: rdb,
                messages: buildRecapMessages(st.messages, 10),
                maxIterations: 1,
                agentMode: 'auto',
              })
              // 注意: 不传 sessionId → toolLoop 的 DB 绑定路径（checkpoint/
              // trajectory/auto-commit）全部跳过, 本命令零 DB 写入
              const text = summary && summary.text ? String(summary.text).trim() : ''
              if (text) {
                dispatch({ type: 'STATUS', text: `recap: ${truncateRecap(text)}` })
              } else {
                fallback()
                dispatch({ type: 'APPEND_SYSTEM', text: 'recap: 模型返回空摘要, 已回退本地拼接' })
              }
            } finally {
              try { rdb?.close() } catch {}
            }
          } catch (err) {
            fallback()
            dispatch({ type: 'APPEND_SYSTEM', text: `recap: 模型不可用, 已回退本地拼接 (${err && err.message ? err.message : String(err)})` })
          }
        }
      } else if (cmd.type === 'diff') {
        // ── W3-t23: /diff 未提交变更查看器 ──────────────────────────────
        // 范围写死（计划）: git diff（--stat 文件列表 + 行级 diff）;
        // 非 git 目录 → 既有 per-tool 写前快照对比; 无变更 → 提示。
        const st = latestState.current
        if (st.running) {
          dispatch({ type: 'STATUS', text: 'diff: 请等待当前回合结束' })
        } else {
          const ws = workspaceRef.current
          const git = (args) => new Promise((resolve, reject) => {
            execFile('git', ['-C', ws, ...args], { timeout: 15000, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
              (err, so) => (err ? reject(err) : resolve(String(so || ''))))
          })
          let statOut = null
          let diffOut = null
          try {
            statOut = await git(['diff', '--stat'])
            diffOut = await git(['diff'])
          } catch {
            // 非 git 目录 / git 缺失 → 快照回退
          }
          if (statOut != null && diffOut != null) {
            const stats = parseDiffStat(statOut)
            if (!stats.length) {
              dispatch({ type: 'STATUS', text: '无未提交变更' })
              return
            }
            const byPath = new Map(splitDiffFiles(diffOut).map((s) => [s.path, s.content]))
            const files = stats.map((s) => ({
              path: s.path, added: s.added, removed: s.removed,
              lines: diffToViewLines(byPath.get(s.path) || ''),
            }))
            setDiffView({ files, idx: 0, mode: 'file' })
            dispatch({ type: 'STATUS', text: `diff: ${files.length} 个文件未提交变更 (↑↓ 切文件 · ←→ 视图 · Esc 关闭)` })
            return
          }
          // 快照回退（非 git）: 复用 per-tool 写前快照对比（rollback.js buildDiff）
          const snapFiles = st.toolCalls
            .filter((c) => c && c.snapshot && c.status === 'done')
            .map((c) => {
              const filePath = toolToSnapshotPath(c.name, c.args) || (c.snapshot.path || null)
              const current = filePath && existsSync(filePath) ? (readFileSync(filePath, 'utf8') || '') : ''
              return { path: filePath || `${c.name} snapshot`, added: null, removed: null, lines: buildDiff(c.snapshot.content ?? '', current) }
            })
          if (!snapFiles.length) {
            dispatch({ type: 'STATUS', text: '无未提交变更（非 git 目录且无工具快照）' })
            return
          }
          setDiffView({ files: snapFiles, idx: 0, mode: 'file' })
          dispatch({ type: 'STATUS', text: `diff: ${snapFiles.length} 个快照文件 (↑↓ 切文件 · ←→ 视图 · Esc 关闭)` })
        }
      }
    } catch (err) {
      dispatch({ type: 'STATUS', text: `error: ${err && err.message ? err.message : String(err)}` })
    } finally {
      try { db?.close() } catch {}
    }
  }, [dbPath, state.currentSessionId])

  // 展开 diff 视图：读当前文件内容 + 快照 → buildDiff → 挂到卡。
  const expandDiff = useCallback((index) => {
    dispatch({ type: 'TOOL_EXPAND', index })
    const card = state.toolCalls[index]
    if (!card || !card.snapshot) return
    const current = existsSync(card.snapshot.path) ? (readFileSync(card.snapshot.path, 'utf8') || '') : ''
    const diff = buildDiff(card.snapshot.content ?? '', current)
    dispatch({ type: 'TOOL_DIFF_SET', index, diff })
  }, [state.toolCalls])

  // 回滚（M2 双路径）：快照还原优先，缺失时 git restore 兜底（仅 git 仓库）。
  const doRollback = useCallback(async () => {
    const index = state.expandedTool
    if (index == null) return
    const card = state.toolCalls[index]
    if (!card) return
    const filePath = toolToSnapshotPath(card.name, card.args) || (card.snapshot ? card.snapshot.path : null)
    const result = await rollbackChange({ snapshot: card.snapshot, filePath, cwd: workspaceRef.current })
    dispatch({ type: 'TOOL_ROLLBACK', index, result })
  }, [state.expandedTool, state.toolCalls])

  // opencode 风格键盘调度: 全部逻辑在 keyHandlers.js(模式表 + 按键归一, 纯函数可测)。
  // ctx 每次渲染刷新, useInput 只做一行转发——新增模态只需加 handler 表, 不再堆 if/else。
  const ctxRef = useRef(null)
  ctxRef.current = {
    state, dispatch,
    modelPicker, setModelPicker,
    filePick, setFilePick, syncFilePick, acceptFilePick, // W3-t18: @候选面板
    diffView, setDiffView, // W3-t23: /diff 查看器
    timeline, setTimeline,
    paletteOpen, setPaletteOpen, paletteIdx, setPaletteIdx, paletteFilter, setPaletteFilter,
    todoOpen, setTodoOpen,
    permIdx, setPermIdx,
    permDialog, setPermDialog, // W4-t25: /permissions 对话框（keyHandlers permDialog 模态）
    permDialogDelete, persistPendingAllow, // W4-t25 删除 / W4-t24 #4 'a' 持久化
    leaderArmed, setLeaderArmed,
    scrollOffset, setScrollOffset,
    slashIdx, setSlashIdx,
    helpOpen, setHelpOpen,
    rewindOpen, setRewindOpen, rewindIdx, setRewindIdx, rewindPoints,
    planChoice, setPlanChoice,
    escArmedRef,
    keybindings,
    PALETTE_ITEMS,
    historyRef, historyIdxRef,
    openModelPicker, openSessions, openTimeline, openRewind, doRewind, startPlan,
    askUserResolveRef,
    startSession, handleCommand, expandDiff, doRollback,
    runShell, // W3-t19: !shell 模式（base enter '!' 分支）
    openEditor, // W3-t20: 外部编辑器（leader 'e'）
    toggleModelFavorite, cycleRecentModel, // W3-t22: Ctrl+F 收藏 / F2 循环
    decidePermission, allowRulesRef, resolveRef, injectSteering,
  }
  useInput((input, key) => {
    // 鼠标/未知转义序列(如 CSI <...M)不作为字符输入, 直接忽略(鼠标事件走专用 data 监听)
    if (input && input.includes('\x1b')) return
    dispatchKey(ctxRef.current, input, key)
  })

  useEffect(() => {
    if (state.quitRequested) exit()
  }, [state.quitRequested, exit])

  // 行内补全后缀已移除(opencode 用垂直列表, 不做行内 ghost text)
  // 消息区窗口化: 只渲染最近 W 条 + scrollOffset 偏移(PgUp/PgDn 翻页)
  const MSG_WINDOW = 40
  const msgTotal = state.messages.length
  const msgOffset = Math.min(scrollOffset, Math.max(0, msgTotal - MSG_WINDOW))
  const visibleMessages = msgTotal <= MSG_WINDOW ? state.messages
    : state.messages.slice(msgTotal - MSG_WINDOW - msgOffset, msgTotal - msgOffset)

  // 上下文估算(粗): 消息文本字符/4 ~ tokens, 千分位
  const ctxK = Math.round(state.messages.reduce((n, m) => n + String(m.text || '').length, 0) / 4 / 1000)

  // 输入光标( todo 4): 钳制到 [0, input.length]; 行尾时渲染为空格块
  const inputCursor = Math.max(0, Math.min(state.inputCursor || 0, state.input.length))

  // 帮助屏内容(快捷键表)。完整参考见 docs/tui-keys.md——此处只收常用条目, 保持简洁。
  const HELP_ROWS = [
    ['Shift+Tab', '审批模式循环: manual → auto-edits → plan'],
    ['Alt+m / Alt+v', '切模式 ask/plan/auto / 展开最新工具 diff'],
    ['Ctrl+X 然后 m/n/l/g/r/q/e', 'leader: 模型/新会话/会话列表/时间线/rewind/退出/外部编辑器'],
    ['Ctrl+P 或 x', '命令面板(New chat/Model/History/Timeline/Export/Help/Quit)'],
    ['Ctrl+T', 'todo 任务清单(空输入)'],
    ['Ctrl+F / F2', '收藏当前模型 / 循环最近模型(均空输入)'],
    ['@文件 / !cmd', '文件引用(候选 Tab 接受) / shell 执行(sandbox 拦截)'],
    ['←→ / Home / End', '光标移动(输入框); Ctrl+A/E 行首尾'],
    ['Ctrl+W / U / K', '删词 / 清行首至光标 / 删光标至行尾'],
    ['Shift+Enter', '输入框内换行(多行输入) · Enter 发送'],
    ['↑↓ · Tab', '历史回填/斜杠候选 · 斜杠补全或运行中排队'],
    ['PgUp/PgDn / 滚轮', '消息区逐行滚动(空输入)'],
    ['Alt+↑↓', '选中消息(空输入); Enter 展开/折叠长消息'],
    ['y / a / n', '权限审批: 允许一次 / 总是允许 / 拒绝'],
    ['?', '本帮助屏'],
    ['Esc', '清空输入(草稿入历史); 空输入再按退出(双击 Esc)'],
    ['/命令', '斜杠命令(输入 / 弹出补全, Tab 填入)'],
    ['/compact /context /clear /undo', '上下文压缩 / 用量 / 新会话 / 撤销'],
    ['/recap /rename /delete /diff /export', '摘要 / 重命名 / 删除 / 变更查看 / 导出'],
    ['/provider /apikey /permissions add', 'provider / 密钥 / 权限规则'],
    ['/approval-mode', '审批模式: manual|auto-edits|plan|dontask'],
    ['/memory /skills /status', '记忆检索 / 技能提案 / 状态'],
    ['exit / quit / :q', '退出'],
  ]

  return h(Box, { flexDirection: 'column' },
    h(Logo, { tick: state.running ? tick : null }),
    h(Text, { color: C.dim }, `  ${state.mode} · Shift+Tab 审批模式 · Alt+m 模式 · ? 帮助 · x/Ctrl+P 面板 · Ctrl+C 退出`),
    ...visibleMessages.map((m, i) => h(MessageLine, {
      key: m.id, msg: m,
      tick,
      selected: state.selectedMessage === (msgTotal - visibleMessages.length + i),
      expanded: state.expandedMessage === m.id, // W0-t7: 展开态渲染全文
    })),
    ...state.toolCalls.map((card, i) => h(ToolCard, {
      key: `${card.name}-${i}`, card,
      expanded: state.expandedTool === i,
    })),
    state.pendingPermission ? h(PermissionPanel, { perm: state.pendingPermission, permIdx }) : null,
    state.askUser
      ? (() => {
        const au = state.askUser
        const q = au.questions[au.qIdx]
        return h(Box, { marginTop: 1, borderStyle: 'double', borderColor: C.primary, paddingX: 1, flexDirection: 'column' },
          h(Text, { bold: true, color: C.primary }, `? ${q.header ? `${q.header} — ` : ''}${q.question} (${au.qIdx + 1}/${au.questions.length})`),
          q.options.map((o, i) => h(SelectRow, {
            key: i,
            label: `${o.label}${o.description ? ` — ${o.description}` : ''}`,
            idx: au.idx, i,
          })),
          h(Text, { color: C.dim }, '  ↑↓ 选择 · Enter 确认 · Esc 取消'))
      })()
      : null,
    state.memoryResults.length
      ? h(Box, { marginTop: 1, flexDirection: 'column' },
        h(Text, { bold: true, color: C.tool }, `memory (${state.memoryResults.length}):`),
        state.memoryResults.map((m) => h(Text, { key: m.id ?? m.content, color: C.dim },
          `  [${m.type || 'fact'}${m.createdAt ? ` · ${String(m.createdAt).slice(0, 16)}` : ''}] ${String(m.content).slice(0, 120)}`)))
      : null,
    state.skills.length
      ? h(Box, { marginTop: 1, flexDirection: 'column' },
        h(Text, { bold: true, color: C.primary }, `skills (${state.skills.length}):`),
        state.skills.map((s) => h(Text, { key: s.key, color: C.dim },
          `  [${s.key}] ${s.imperative}${s.occurrences > 1 ? ` (×${s.occurrences})` : ''}`)))
      : null,
    state.sessions.length
      ? h(Box, { marginTop: 1, flexDirection: 'column' },
        h(Text, { bold: true, color: C.primary }, `sessions (${state.sessions.length}):`),
        state.sessions.slice(0, 10).map((s) => h(Text, { key: s.id, color: C.dim },
          `  [${s.id}] ${displayTitle(s.title)}${s.parentId ? ` ← #${s.parentId}` : ''}`)),
        h(Text, { color: C.tool }, '  /use <id> 切换 · /fork 派生新会话'))
      : null,
      state.steeringQueue.length
        ? h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, { bold: true, color: C.primary }, 'steering queue:'),
          state.steeringQueue.map((q, i) => h(Text, { key: i, color: C.primary }, `  ⤷ ${q}`)))
        : null,
      (state.input.startsWith('/')
        ? (() => {
          const m = SLASH_COMMANDS.filter((c) => c.startsWith(state.input))
          // opencode: 垂直候选列表(≤10 条), 无行内 ghost text
          if (m.length === 0) return null
          return h(Box, { marginTop: 1, flexDirection: 'column' },
            m.slice(0, 10).map((c, i) => h(Text, {
              key: c,
              color: i === slashIdx ? C.primary : C.dim,
              backgroundColor: i === slashIdx ? C.bgHighlight : undefined,
            }, `  ${c}`)),
            h(Text, { color: C.dim }, `  ↑↓ 选择 · Tab/Enter 填入 · Esc 取消 · 共 ${m.length} 个匹配`))
        })()
        : null),
      // W3-t18: @文件候选面板（模型选择器同款样式; Enter 插入完整 @path 不提交）
      filePick
        ? (() => {
          const fp = filePick
          const visible = fp.items.slice(0, 12)
          return h(Box, { marginTop: 1, borderStyle: 'single', borderColor: C.primary, paddingX: 1, flexDirection: 'column' },
            h(Text, { bold: true, color: C.primary }, `@ 文件引用 — @${fp.partial}${fp.partial ? '' : '(全部)'}`),
            visible.length === 0
              ? h(Text, { color: C.dim }, '  无匹配文件')
              : visible.map((it, i) => h(SelectRow, {
                key: it.path,
                label: `${it.path}${it.isDir ? '/' : ''}`,
                idx: fp.idx, i,
              })),
            h(Text, { color: C.dim }, `  ↑↓/Tab 选择 · Enter 插入 @path · Esc 取消${fp.items.length > 12 ? ` · 共 ${fp.items.length} 个` : ''}`))
        })()
        : null,
      paletteOpen
        ? h(Box, { marginTop: 1, borderStyle: 'single', borderColor: C.primary, paddingX: 1, flexDirection: 'column' },
          h(Text, { bold: true, color: C.primary }, 'Ctrl+P — commands'),
          h(Text, { color: C.dim }, `  filter: ${paletteFilter || '(all)'}`),
          PALETTE_ITEMS.filter((i) => i.toLowerCase().includes(paletteFilter)).map((item, i) => h(SelectRow, {
            key: item, label: item, idx: paletteIdx, i,
          })))
        : null,
      modelPicker
        ? (() => {
          const filter = (modelPicker.filter || '').toLowerCase()
          const flat = modelPicker.models.filter((m) =>
            !filter || `${m.provider_name} ${m.model_name}`.toLowerCase().includes(filter))
          // 窗口化(opencode DialogSelect 风格): 最多显示 W 行, 选中项保持在视口内
          const W = 10
          const safeIdx = Math.min(modelPicker.idx, Math.max(0, flat.length - 1))
          const start = Math.max(0, Math.min(safeIdx - Math.floor(W / 2), Math.max(0, flat.length - W)))
          const visible = flat.slice(start, start + W)
          const current = flat[safeIdx]
          // 固定 10 行纯模型行(组标题由顶部面包屑承担): ↑↓ 移动只变高亮行,
          // 行数恒定 → 无重排 → Windows ConPTY 不再抽搐
          const rows = visible.map((m, vi) => {
            const isCurrent = state.modelName === m.model_name
            // W3-t22: 收藏标星（settings 表持久化）; primary 改文字标注避免双星混淆
            const starred = modelPicker.favorites && modelPicker.favorites.has(m.model_name)
            return h(SelectRow, {
              key: `${m.provider_id}-${m.id}`,
              label: `${m.model_name}${m.is_primary ? ' (primary)' : ''}${starred ? ' ★' : ''}${isCurrent ? ' ●' : ''}`,
              idx: modelPicker.idx, i: start + vi,
            })
          })
          return h(Box, { marginTop: 1, borderStyle: 'single', borderColor: C.primary, paddingX: 1, flexDirection: 'column' },
            // 供应商/模型面包屑固定在面板顶部(文件夹式导航)
            h(Text, { bold: true, color: C.primary }, `Select model — ${current ? `${current.provider_name} / ${current.model_name}` : '(no match)'}`),
            h(Text, { color: C.dim }, `  filter: ${modelPicker.filter || '(all)'} · ${flat.length} 个模型 · ↑↓ 滚动 · Enter 确认 · Esc 取消`),
            rows,
            flat.length > W ? h(Text, { color: C.dim }, `  … 共 ${flat.length} 个, 显示 ${start + 1}-${start + W}`) : null)
        })()
        : null,
      timeline
        ? h(Box, { marginTop: 1, borderStyle: 'single', borderColor: C.primary, paddingX: 1, flexDirection: 'column' },
          h(Text, { bold: true, color: C.primary }, 'Session timeline — ↑↓ · Enter 切换 · Esc 关闭'),
          timeline.sessions.map((s, i) => h(SelectRow, {
            key: s.id,
            label: `#${s.id} ${displayTitle(s.title)}${s.parentId ? ` ← #${s.parentId}` : ''}${s.createdAt ? ` · ${String(s.createdAt).slice(0, 16)}` : ''}`,
            idx: timeline.idx, i,
          })))
        : null,
      // W3-t23: /diff 未提交变更查看器（toolCards DiffView 同款着色; ↑↓ 切文件,
      // ←→ 切"全部/当前文件"视图, 行数窗口 200 行防卡顿）
      diffView
        ? (() => {
          const v = diffView
          const cur = v.files[v.idx]
          const all = v.mode === 'all'
          const lines = all
            ? v.files.flatMap((f) => [{ type: 'meta', line: `── ${f.path}${f.added != null ? ` (+${f.added}/-${f.removed})` : ''} ──` }, ...f.lines])
            : (cur ? cur.lines : [])
          const capped = lines.slice(0, 200)
          return h(Box, { marginTop: 1, borderStyle: 'single', borderColor: C.tool, paddingX: 1, flexDirection: 'column' },
            h(Text, { bold: true, color: C.tool },
              `▼ /diff — ${all ? `全部 (${v.files.length} 文件)` : `${cur ? cur.path : '(none)'}${cur && cur.added != null ? ` (+${cur.added}/-${cur.removed})` : ''}`}`),
            capped.length === 0
              ? h(Text, { color: C.dim }, '  （无行级 diff 内容）')
              : capped.map((d, i) => h(Text, {
                key: i,
                color: d.type === 'add' ? 'green' : d.type === 'del' ? 'red' : d.type === 'meta' ? C.tool : 'gray',
              }, `${d.type === 'add' ? '+' : d.type === 'del' ? '-' : ' '} ${d.line}`)),
            lines.length > 200 ? h(Text, { color: C.dim }, `  … 共 ${lines.length} 行, 显示前 200 行`) : null,
            h(Text, { color: C.dim }, '  ↑↓ 切文件 · ←→ 全部/当前 · Esc 关闭'))
        })()
        : null,
      state.planDone
        ? (() => {
          const opts = ['自动接受(切 auto-edits) 并实施', '手动接受 并实施', '继续规划']
          return h(Box, { marginTop: 1, borderStyle: 'double', borderColor: C.primary, paddingX: 1, flexDirection: 'column' },
            h(Text, { bold: true, color: C.primary }, '▼ 计划完成 — 如何继续?'),
            opts.map((o, i) => h(SelectRow, { key: o, label: o, idx: planChoice, i })),
            h(Text, { color: C.dim }, '  ↑↓ 选择 · Enter 确认 · Esc 继续规划'))
        })()
        : null,
      helpOpen
        ? h(Box, { marginTop: 1, borderStyle: 'single', borderColor: C.dim, paddingX: 1, flexDirection: 'column' },
          h(Text, { bold: true, color: C.primary }, '? 快捷键 — 任意键关闭'),
          HELP_ROWS.map(([k, d], i) => h(Text, { key: i, color: C.dim }, `  ${k.padEnd(28)}${d}`)))
        : null,
      rewindOpen
        ? h(Box, { marginTop: 1, borderStyle: 'single', borderColor: C.warning, paddingX: 1, flexDirection: 'column' },
          h(Text, { bold: true, color: C.warning }, '▼ rewind — 恢复检查点并截断对话'),
          rewindPoints.map((pt, i) => h(SelectRow, {
            key: `${pt.card.name}-${pt.i}`,
            label: `[${pt.i}] ${pt.card.name} ${pt.card.summary || ''}`,
            idx: rewindIdx, i,
          })),
          h(Text, { color: C.dim }, '  ↑↓ 选择 · Enter 恢复 · Esc 取消'))
        : null,
      // W1-t9: todo 清单面板（todo_write 流式更新; 只读, 任意键关闭）
      // 守卫: content/status 缺失不崩溃（默认占位 + 未知状态回退 pending）
      todoOpen
        ? h(Box, { marginTop: 1, borderStyle: 'single', borderColor: C.dim, paddingX: 1, flexDirection: 'column' },
          h(Text, { bold: true, color: C.primary }, `todo (${state.todos.length}) — Ctrl+T 切换`),
          state.todos.length === 0
            ? h(Text, { color: C.dim }, '  暂无任务 — agent 调用 todo_write 时清单在此显示')
            : state.todos.map((t, i) => {
              const status = ['pending', 'in_progress', 'completed'].includes(t.status) ? t.status : 'pending'
              const mark = { pending: '○', in_progress: '◐', completed: '●' }[status]
              const color = status === 'completed' ? C.success : status === 'in_progress' ? C.primary : C.dim
              return h(Text, { key: i, color }, `  ${mark} ${String(t.content || '(untitled)')}`)
            }),
          h(Text, { color: C.dim }, '  Esc/Enter 关闭 · 任意键关闭'))
        : null,
      // W4-t25: /permissions 交互对话框（输入框上方; 空态提示 + 过滤 + 来源标注）
      permDialog
        ? (() => {
          const filtered = filterRules(permDialog.rules, permDialog.filter)
          return h(Box, { marginTop: 1, borderStyle: 'single', borderColor: C.dim, paddingX: 1, flexDirection: 'column' },
            h(Text, { bold: true, color: C.primary }, '权限规则 (allow/deny/ask)'),
            filtered.length === 0
              ? h(Text, { color: C.dim }, '  无权限规则 — /permissions add <name> <key> <allow|deny|ask>')
              : filtered.map((r, i) => h(SelectRow, {
                key: `${r.source}:${r.key}`,
                label: `${r.name}:${r.ruleKey} · ${r.decision} · ${r.source}`,
                idx: permDialog.idx, i,
              })),
            h(Text, { color: C.dim }, `  filter: ${permDialog.filter || '(all)'}${filtered.length ? ` · ${filtered.length} 条` : ''} · ↑↓ 选择 · d 删除 · 字符过滤 · Esc 关闭`))
        })()
        : null,
      h(ThinkingBlock, { thinking: state.thinking }),
      h(Box, { marginTop: 1, borderStyle: 'round', borderColor: state.running ? C.primary : (leaderArmed ? C.primary : C.dim), paddingX: 1 },
        h(Text, { color: state.running ? C.primary : C.dim, bold: !state.running }, '❯ '),
        state.input
          ? h(Text, { color: C.assistant },
            state.input.slice(0, inputCursor),
            h(Text, { backgroundColor: C.primary, color: C.bgHighlight }, state.input[inputCursor] || ' '),
            state.input.slice(inputCursor + 1))
          : h(Text, { color: C.dim }, 'Ask anything…  Ctrl+X 快捷键 · / 命令 · Ctrl+P 面板 · Shift+Enter 换行'),
      ),
      // 输入框 meta 行（opencode prompt meta: mode · model · effort · running）
      h(Text, { color: C.dim }, `  ${state.mode}${state.modelName ? ` · ${state.modelName}` : ''} · effort:${state.effort}${state.running ? ` · ${tick}` : ''} · PgUp/PgDn 滚动`),
      leaderArmed ? h(Text, { color: C.primary }, '  ctrl+x leader: m 模型 · n 新会话 · l 列表 · g 时间线 · r rewind · e 编辑器 · q 退出') : null,
      h(StatusBar, { state, tick: state.running ? tick : '●', ctxK, extra: statusBarExtra, elapsedSec }),
  )
}



