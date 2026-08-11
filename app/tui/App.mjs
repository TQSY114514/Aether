// ─────────────────────────────────────────────────────────────────────────────
// App.mjs — TUI 根组件（todo 1）+ 权限审批面板 + diff/回滚（todo 4）
// createElement 风格、无 JSX：Node v24 无法加载 .jsx（ISSUE-01 实证），且引入
// 加载器会违反「新依赖仅限纯 JS」护栏——故组件一律用 react.createElement 手写。
// ─────────────────────────────────────────────────────────────────────────────
import { createElement as h, useEffect, useReducer, useRef, useCallback, useState, useMemo } from 'react'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { Box, Text, useInput, useApp } from 'ink'
import { tuiReducer, initialTuiState, APPROVAL_MODES, READ_ONLY_TOOLS } from './reducer.js'
import { runSession, createTuiPermissionHandler, decidePermission, toolToSnapshotPath, injectSteering } from './runSession.js'
import { createAllowRulesStore } from './allowRules.js'
import { buildDiff, rollbackChange } from './rollback.js'
import { parseSessionCommand, SLASH_COMMANDS } from './sessionCommands.js'
import { openSessionDb, listSessions, forkSession, getTimeline } from './sessionTree.js'
import { searchMemory } from './memorySearch.js'
import { TOOL_STATUS, summarizeArgs } from './toolCards.js'
import { listModels } from './models.js'
import { dispatchKey } from './keyHandlers.js'
import { loadKeybindings } from './keybindings.js'
import { loadAuthKeys, saveAuthKey } from './authStore.js'

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

// 顶部 Logo：标准 block 字体拼 AETHER（6 行 × 8 列/字母，逐行对齐），居中。
const _G = {
  A: ['█████╗  ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
  T: ['████████╗', '╚══██╔══╝', '   ██║  ', '   ██║  ', '   ██║  ', '   ╚═╝  '],
  H: ['██╗  ██╗', '██║  ██║', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
  R: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██║  ██║', '╚═╝  ╚═╝'],
}
const LOGO_WORD = 'AETHER'

function Logo({ tick }) {
  const rows = []
  for (let r = 0; r < 6; r++) {
    rows.push(LOGO_WORD.split('').map((ch) => (_G[ch] ? _G[ch][r] : '        ')).join('  ').replace(/\s+$/, ''))
  }
  return h(Box, { flexDirection: 'column', alignItems: 'center' },
    rows.map((line, i) => h(Text, { key: i, color: C.primary }, line)),
    h(Text, { color: C.dim }, `Terminal AI Workstation${tick ? `  ${tick}` : ''}`),
  )
}

// 通用列表行（opencode DialogSelect 行样式）：选中高亮 primary + bgHighlight
function SelectRow({ label, idx, i, marker = '❯' }) {
  return h(Text, {
    color: i === idx ? C.primary : C.dim,
    backgroundColor: i === idx ? C.bgHighlight : undefined,
  }, `  ${i === idx ? `${marker} ` : '  '}${label}`)
}

// 消息区窗口化常量: 最多渲染最近 MSG_WINDOW 条(其余靠 PgUp/PgDn 翻页)
const MSG_WINDOW = 40

function MessageLine({ msg, selected }) {
  const prefix = ROLE_PREFIX[msg.role] || '• '
  const label = ROLE_LABEL[msg.role] || msg.role
  let color = ROLE_COLOR[msg.role] || C.assistant
  if (msg.role === 'system' && String(msg.text).startsWith('error')) color = C.error
  const bg = selected ? C.bgHighlight : undefined
  if (!msg.text && msg.role === 'assistant') {
    return h(Text, { color: C.dim, backgroundColor: bg }, `${prefix}${label} …`)
  }
  const text = String(msg.text || '')
  // 超长回复截断, 避免撑爆终端(全文仍在会话 DB 中, 桌面版可看完整)
  const display = text.length > 4000 ? `${text.slice(0, 4000)} … (truncated)` : text
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

// 底部状态栏（紧凑单行）：审批模式 │ mode │ 模型 │ 上下文估算 │ 运行状态 │ 预算 │ 自定义
function StatusBar({ state, tick, ctxK, extra }) {
  const bits = [
    `approval:${state.approvalMode}`,
    `mode:${state.mode}`,
    state.modelName ? `model:${state.modelName}` : null,
    ctxK > 0 ? `ctx:~${ctxK}k` : null,
    `effort:${state.effort}`,
    state.running ? `${tick} running` : '● idle',
    state.statusLine && state.statusLine !== 'idle' ? state.statusLine : null,
    state.budget.max > 0 ? `it:${state.budget.used}/${state.budget.max}` : null,
    state.currentTool ? `tool:${state.currentTool}` : null,
    state.steeringQueue.length ? `steer:${state.steeringQueue.length}` : null,
    `tools:${state.toolCalls.length}`,
    extra || null,
  ].filter(Boolean)
  return h(Box, { marginTop: 1, borderStyle: 'single', borderColor: state.running ? C.primary : C.dim, paddingX: 1 },
    h(Text, { color: C.dim }, bits.join(' │ ')),
  )
}

export function App({ dbPath, modelName, apiKey, apiUrl, apiFormat, statusLineCmd }) {
  const { exit } = useApp()
  const [state, dispatch] = useReducer(tuiReducer, initialTuiState)
  const tick = useTicker(300, SPINNER, state.running)
  const sessionBusyRef = useRef(false)
  const allowRulesRef = useRef(createAllowRulesStore())
  const resolveRef = useRef(null)
  const workspaceRef = useRef(process.cwd())
  // 命令历史(↑↓ 回填, 上限 100 条, 去重)
  const historyRef = useRef([])
  const historyIdxRef = useRef(-1)
  // 斜杠补全 / Ctrl+P 面板 / 模型选择器 / leader key（UI 本地状态，不进核心状态机）
  const [slashIdx, setSlashIdx] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteIdx, setPaletteIdx] = useState(0)
  const [paletteFilter, setPaletteFilter] = useState('')
  // 模型选择器: null=关闭, { models, idx, filter }=打开（opencode DialogSelect 风格）
  const [modelPicker, setModelPicker] = useState(null)
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
  // leader key（opencode ctrl+x 风格）: 按下后 1.2s 内等待第二个键
  const [leaderArmed, setLeaderArmed] = useState(false)
  // 消息区滚动偏移（0 = 跟随最新）
  const [scrollOffset, setScrollOffset] = useState(0)
  const PALETTE_ITEMS = ['New chat', 'Model', 'History (sessions)', 'Timeline', 'Export JSONL', 'Help', 'Quit']

  // todo 4：TUI 键盘应答权限回调（B2 接线 a 方案 → agentCore.runAgent 透传）。
  // 审批模式包装(opencode 离散预设): manual=询问 / auto-edits=edit·write 自动放行 /
  // plan=写工具直接拒绝(只读规划)。保留 takeSnapshot 挂载。
  const basePermission = useMemo(
    () => createTuiPermissionHandler({ dispatch, allowRules: allowRulesRef.current, sessionId: 'tui', resolveRef }),
    [dispatch],
  )
  const tuiPermission = useCallback((perm) => {
    if (state.approvalMode === 'auto-edits' && (perm.name === 'edit' || perm.name === 'write')) {
      return Promise.resolve(true)
    }
    if (state.approvalMode === 'plan' && !READ_ONLY_TOOLS.includes(perm.name)) {
      return Promise.resolve(false)
    }
    return basePermission(perm)
  }, [basePermission, state.approvalMode])
  tuiPermission.takeSnapshot = basePermission.takeSnapshot

  const startSession = useCallback(async (promptText) => {
    if (sessionBusyRef.current) return
    sessionBusyRef.current = true
    try {
      await runSession({
        dbPath,
        modelName: state.modelName || modelName,   // /model 优先于 CLI 参数
        apiKey,
        apiUrl,
        apiFormat,
        prompt: promptText,
        agentMode: state.mode,
        personaId: state.currentPersonaId,
        dispatch,
        requestPermission: tuiPermission,
      })
    } catch (err) {
      // 错误以 [sys] 消息可见呈现（仅改状态栏会被 AGENT_END 重置吞掉）。
      dispatch({ type: 'APPEND_SYSTEM', text: `error: ${err && err.message ? err.message : String(err)}` })
      dispatch({ type: 'AGENT_END' })
    } finally {
      sessionBusyRef.current = false
    }
  }, [dbPath, modelName, state.mode, state.modelName, tuiPermission])

  // 打开模型选择器(读 DB 启用模型; /model、Ctrl+P Model、leader m 共用)
  const openModelPicker = useCallback(() => {
    const db = openSessionDb(dbPath)
    let models = []
    try { models = listModels(db) } catch {}
    try { db?.close() } catch {}
    if (models.length) setModelPicker({ models, idx: 0, filter: '' })
    else dispatch({ type: 'STATUS', text: 'no models configured — 先在桌面版设置中配置' })
  }, [dbPath])

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

  // leader key 待命计时: 1.2s 无后续按键自动解除
  useEffect(() => {
    if (!leaderArmed) return
    const t = setTimeout(() => setLeaderArmed(false), 1200)
    return () => clearTimeout(t)
  }, [leaderArmed])

  // 会话树/记忆/技能命令（todo 5/8/13/20）：解析 → 单次打开 DB → 处理后关闭，
  // 避免每次命令累积 better-sqlite3 连接（长会话内存泄漏）。
  const handleCommand = useCallback(async (text) => {
    const cmd = parseSessionCommand(text)
    if (!cmd) return
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
        // /permissions: 当前会话 allow-rules 列表
        const rules = allowRulesRef.current.list('tui')
        dispatch({ type: 'APPEND_SYSTEM', text: rules.length ? `allow rules (${rules.length}): ${rules.join(' · ')}` : 'allow rules: (none) — 审批时按 a 添加' })
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
    timeline, setTimeline,
    paletteOpen, setPaletteOpen, paletteIdx, setPaletteIdx, paletteFilter, setPaletteFilter,
    permIdx, setPermIdx,
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
    startSession, handleCommand, expandDiff, doRollback,
    decidePermission, allowRulesRef, resolveRef, injectSteering,
  }
  useInput((input, key) => { dispatchKey(ctxRef.current, input, key) })

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

  // 帮助屏内容(快捷键表)
  const HELP_ROWS = [
    ['Shift+Tab', '审批模式循环: manual → auto-edits → plan'],
    ['Ctrl+X 然后 m/n/l/g/q', 'leader: 模型 / 新会话 / 会话列表 / 时间线 / 退出'],
    ['Ctrl+P 或 x', '命令面板(New chat/Model/Timeline/Export/Help/Quit)'],
    ['?', '本帮助屏'],
    ['/命令', '斜杠命令(输入 / 弹出补全, Tab 填入)'],
    ['↑↓', '命令历史回填(空输入) / 斜杠候选(输入 / 时)'],
    ['Tab', '运行中: 排队下一条; 输入 / 时: 填入补全'],
    ['Esc', '清空输入(草稿入历史); 空输入两次: rewind 检查点'],
    ['PgUp/PgDn', '消息区翻页'],
    ['Alt+m / Alt+v', '切模式 / 展开最新 diff'],
    ['y / a / n', '权限审批: 允许一次 / 总是允许 / 拒绝'],
    ['←→ 或 h/l', '权限/选择器内移动选项'],
    ['exit / quit / :q', '退出'],
    ['/export [path]', '会话导出 JSONL'],
    ['/status · /permissions · /memory · /skills', '诊断与数据查看'],
  ]

  return h(Box, { flexDirection: 'column' },
    h(Logo, { tick: state.running ? tick : null }),
    h(Text, { color: C.dim }, `  ${state.mode} · Shift+Tab 审批模式 · Alt+m 模式 · ? 帮助 · x/Ctrl+P 面板 · Ctrl+C 退出`),
    ...visibleMessages.map((m, i) => h(MessageLine, {
      key: m.id, msg: m,
      selected: state.selectedMessage === (msgTotal - visibleMessages.length + i),
    })),
    ...state.toolCalls.map((card, i) => h(ToolCard, {
      key: `${card.name}-${i}`, card,
      expanded: state.expandedTool === i,
    })),
    state.pendingPermission ? h(PermissionPanel, { perm: state.pendingPermission, permIdx }) : null,
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
          `  [${s.id}] ${s.title || '(untitled)'}${s.parentId ? ` ← #${s.parentId}` : ''}`)),
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
          const groups = []
          for (const m of flat) {
            const last = groups[groups.length - 1]
            if (!last || last.name !== m.provider_name) groups.push({ name: m.provider_name, items: [m] })
            else last.items.push(m)
          }
          let flatIdx = 0
          return h(Box, { marginTop: 1, borderStyle: 'single', borderColor: C.primary, paddingX: 1, flexDirection: 'column' },
            h(Text, { bold: true, color: C.primary }, 'Select model — 输入过滤 · ↑↓ 选择 · Enter 确认 · Esc 取消'),
            h(Text, { color: C.dim }, `  filter: ${modelPicker.filter || '(all)'} · ${flat.length} 个模型`),
            groups.map((g) => [
              h(Text, { key: `g-${g.name}`, color: C.sys }, `  ${g.name}:`),
              ...g.items.map((m) => {
                const cur = flatIdx
                flatIdx += 1
                const isCurrent = state.modelName === m.model_name
                return h(SelectRow, {
                  key: `${m.provider_id}-${m.id}`,
                  label: `${m.model_name}${m.is_primary ? ' ★' : ''}${isCurrent ? ' ●' : ''}`,
                  idx: modelPicker.idx, i: cur,
                })
              }),
            ]))
        })()
        : null,
      timeline
        ? h(Box, { marginTop: 1, borderStyle: 'single', borderColor: C.primary, paddingX: 1, flexDirection: 'column' },
          h(Text, { bold: true, color: C.primary }, 'Session timeline — ↑↓ · Enter 切换 · Esc 关闭'),
          timeline.sessions.map((s, i) => h(SelectRow, {
            key: s.id,
            label: `#${s.id} ${s.title}${s.parentId ? ` ← #${s.parentId}` : ''}${s.createdAt ? ` · ${String(s.createdAt).slice(0, 16)}` : ''}`,
            idx: timeline.idx, i,
          })))
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
      h(Box, { marginTop: 1, borderStyle: 'round', borderColor: state.running ? C.primary : (leaderArmed ? C.primary : C.dim), paddingX: 1 },
        h(Text, { color: state.running ? C.primary : C.dim, bold: !state.running }, '❯ '),
        state.input
          ? h(Text, { color: C.assistant }, state.input)
          : h(Text, { color: C.dim }, 'Ask anything…  Ctrl+X 快捷键 · / 命令 · Ctrl+P 面板'),
      ),
      // 输入框 meta 行（opencode prompt meta: mode · model · effort · running）
      h(Text, { color: C.dim }, `  ${state.mode}${state.modelName ? ` · ${state.modelName}` : ''} · effort:${state.effort}${state.running ? ` · ${tick} running` : ''} · PgUp/PgDn 翻页`),
      leaderArmed ? h(Text, { color: C.primary }, '  ctrl+x leader: m 模型 · n 新会话 · l 列表 · g 时间线 · q 退出') : null,
      h(StatusBar, { state, tick: state.running ? tick : '●', ctxK, extra: statusBarExtra }),
  )
}



