// ─────────────────────────────────────────────────────────────────────────────
// App.mjs — TUI 根组件（todo 1）+ 权限审批面板 + diff/回滚（todo 4）
// createElement 风格、无 JSX：Node v24 无法加载 .jsx（ISSUE-01 实证），且引入
// 加载器会违反「新依赖仅限纯 JS」护栏——故组件一律用 react.createElement 手写。
// ─────────────────────────────────────────────────────────────────────────────
import { createElement as h, useEffect, useReducer, useRef, useCallback, useState } from 'react'
import { readFileSync, existsSync } from 'node:fs'
import { Box, Text, useInput, useApp } from 'ink'
import { tuiReducer, initialTuiState } from './reducer.js'
import { keyToAction } from './keymap.js'
import { runSession, createTuiPermissionHandler, decidePermission, toolToSnapshotPath, injectSteering } from './runSession.js'
import { createAllowRulesStore } from './allowRules.js'
import { buildDiff, rollbackChange } from './rollback.js'
import { parseSessionCommand, SLASH_COMMANDS } from './sessionCommands.js'
import { openSessionDb, listSessions, forkSession } from './sessionTree.js'
import { searchMemory } from './memorySearch.js'
import { TOOL_STATUS, summarizeArgs } from './toolCards.js'

// Tokyo Night 风格配色（克制、低饱和，参考 opencode 现代终端观感）
const C = {
  primary: '#7aa2f7',   // 主色：logo / 提示符 / 运行中边框
  user: '#9ece6a',      // 用户消息
  assistant: '#c0caf5', // AI 回复
  tool: '#e0af68',      // 工具
  sys: '#565f89',       // 系统（灰）
  error: '#f7768e',     // 错误（红）
  dim: '#565f89',       // 次要文字
}

const ROLE_PREFIX = { user: '> ', assistant: '◆ ', system: '! ', tool: '⛭ ' }
const ROLE_LABEL = { user: 'you', assistant: 'aether', tool: 'tool', system: 'sys' }
const ROLE_COLOR = { user: C.user, assistant: C.assistant, tool: C.tool, system: C.sys }

// 轻量 ticker：驱动动画帧（spinner / 运行指示）。
function useTicker(intervalMs = 500, chars = ['●', '○']) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % chars.length), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs, chars.length])
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

function MessageLine({ msg, selected }) {
  const prefix = ROLE_PREFIX[msg.role] || '• '
  const label = ROLE_LABEL[msg.role] || msg.role
  let color = ROLE_COLOR[msg.role] || C.assistant
  if (msg.role === 'system' && String(msg.text).startsWith('error')) color = C.error
  const bg = selected ? '#24283b' : undefined
  if (!msg.text && msg.role === 'assistant') {
    return h(Text, { color: C.dim, backgroundColor: bg }, `${prefix}${label} …`)
  }
  return h(Text, { color, backgroundColor: bg }, `${prefix}${label} ${msg.text}`)
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

// 权限审批面板（todo 4）：awaitingPermission 态，y/n/a 应答。
function PermissionPanel({ perm }) {
  return h(Box, { borderStyle: 'round', borderColor: 'yellow', paddingX: 1, marginTop: 1, flexDirection: 'column' },
    h(Text, { bold: true, color: 'yellow' }, `[权限请求] ${perm.name}`),
    h(Text, { color: 'gray' }, `args: ${summarizeArgs(perm.args)} | risk: ${perm.risk}`),
    h(Text, { color: 'gray' }, 'y: 允许  n: 拒绝  a: 总是允许(本会话)  Ctrl+C: 中止'),
  )
}

// 底部状态栏（紧凑单行）：mode │ 状态 │ 预算 │ 当前工具 │ steering │ 工具数
function StatusBar({ state, tick }) {
  const bits = [
    `mode:${state.mode}`,
    `effort:${state.effort}`,
    state.running ? `${tick} running` : '● idle',
    state.statusLine && state.statusLine !== 'idle' ? state.statusLine : null,
    state.budget.max > 0 ? `it:${state.budget.used}/${state.budget.max}` : null,
    state.currentTool ? `tool:${state.currentTool}` : null,
    state.steeringQueue.length ? `steer:${state.steeringQueue.length}` : null,
    `tools:${state.toolCalls.length}`,
  ].filter(Boolean)
  return h(Box, { marginTop: 1, borderStyle: 'single', borderColor: state.running ? C.primary : C.dim, paddingX: 1 },
    h(Text, { color: C.dim }, bits.join(' │ ')),
  )
}

export function App({ dbPath, modelName, apiKey, apiUrl, apiFormat }) {
  const { exit } = useApp()
  const [state, dispatch] = useReducer(tuiReducer, initialTuiState)
  const tick = useTicker(120, SPINNER)
  const sessionBusyRef = useRef(false)
  const allowRulesRef = useRef(createAllowRulesStore())
  const resolveRef = useRef(null)
  const workspaceRef = useRef(process.cwd())
  // 斜杠补全 / Ctrl+P 面板（UI 本地状态，不进核心状态机）
  const [slashIdx, setSlashIdx] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteIdx, setPaletteIdx] = useState(0)
  const PALETTE_ITEMS = ['New chat', 'History (sessions)', 'Quit']

  // todo 4：TUI 键盘应答权限回调（B2 接线 a 方案 → agentCore.runAgent 透传）。
  const tuiPermission = useCallback(
    createTuiPermissionHandler({ dispatch, allowRules: allowRulesRef.current, sessionId: 'tui', resolveRef }),
    [dispatch],
  )

  const startSession = useCallback(async (promptText) => {
    if (sessionBusyRef.current) return
    sessionBusyRef.current = true
    try {
      await runSession({
        dbPath,
        modelName,
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
  }, [dbPath, modelName, state.mode, tuiPermission])

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
      } else if (cmd.type === 'model') {
        // /model <name>：切换后续会话模型（状态栏/运行面板显示）
        dispatch({ type: 'MODEL_SET', name: cmd.name })
        dispatch({ type: 'STATUS', text: cmd.name ? `model: ${cmd.name}` : 'usage: /model <name> (或 /model 查看当前)' })
      } else if (cmd.type === 'effort') {
        // /effort <low|medium|high>：thinking 力度（reasoning_effort）
        if (!['low', 'medium', 'high'].includes(cmd.level)) {
          dispatch({ type: 'STATUS', text: 'usage: /effort <low|medium|high>' })
        } else {
          dispatch({ type: 'EFFORT_SET', level: cmd.level })
          dispatch({ type: 'STATUS', text: `effort: ${cmd.level}` })
        }
      } else if (cmd.type === 'quit') {
        dispatch({ type: 'QUIT_INTENT' })
      } else if (cmd.type === 'help') {
        dispatch({ type: 'APPEND_SYSTEM', text: `commands: ${SLASH_COMMANDS.join(' ')} | 快捷键: m 模式 / v diff / ↑↓ 选消息 / Ctrl+P 面板 / Ctrl+C 退出` })
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

  useInput((input, key) => {
    // 0) Ctrl+P 命令面板（模态，最优先）
    if (paletteOpen) {
      if (key?.upArrow === true) { setPaletteIdx((i) => Math.max(0, i - 1)); return }
      if (key?.downArrow === true) { setPaletteIdx((i) => Math.min(PALETTE_ITEMS.length - 1, i + 1)); return }
      if (key?.escape === true || (key?.ctrl === true && input === 'p')) { setPaletteOpen(false); return }
      if (key?.return === true) {
        const item = PALETTE_ITEMS[paletteIdx]
        setPaletteOpen(false)
        if (item === 'New chat') dispatch({ type: 'RESET' })
        else if (item === 'Quit') dispatch({ type: 'QUIT_INTENT' })
        else if (item === 'History (sessions)') {
          const db = openSessionDb(dbPath)
          try { dispatch({ type: 'SESSIONS_SET', sessions: listSessions(db) }) } catch {}
          try { db?.close() } catch {}
        }
        return
      }
      return // 模态吞掉其他键
    }
    // 1) 权限等待态：y/n/a 应答，Ctrl+C 中止（=拒绝）。
    if (state.pendingPermission) {
      const ctrlC = key?.ctrl === true && input === 'c'
      if (ctrlC) { decidePermission({ decision: 'deny', allowRules: allowRulesRef.current, sessionId: 'tui', resolveRef, dispatch }); return }
      const ch = (input || '').toLowerCase()
      if (ch === 'y') { decidePermission({ decision: 'allow', allowRules: allowRulesRef.current, sessionId: 'tui', resolveRef, dispatch }); return }
      if (ch === 'n') { decidePermission({ decision: 'deny', allowRules: allowRulesRef.current, sessionId: 'tui', resolveRef, dispatch }); return }
      if (ch === 'a') { decidePermission({ decision: 'allow', remember: true, allowRules: allowRulesRef.current, sessionId: 'tui', resolveRef, dispatch }); return }
      return // 等待期吞掉其他键
    }
    // 2) diff 视图态：Enter/Esc 关闭（接受），r 回滚。
    if (state.expandedTool != null) {
      if (key?.return === true) { dispatch({ type: 'TOOL_EXPAND', index: state.expandedTool }); return }
      if (key?.escape === true) { dispatch({ type: 'TOOL_EXPAND', index: state.expandedTool }); return }
      if ((input || '') === 'r') { doRollback(); return }
      return
    }
    // 3) steeringMode（todo 6）：Enter 注入 follow-up，Ctrl+C 取消打断态。
    if (state.steeringMode) {
      const ctrlC = key?.ctrl === true && input === 'c'
      if (ctrlC) {
        dispatch({ type: 'STEER_MODE', on: false })
        dispatch({ type: 'STATUS', text: 'follow-up cancelled' })
        return
      }
      if (key?.return === true) {
        const text = state.input.trim()
        if (text) {
          injectSteering('tui', text)
          dispatch({ type: 'STEER_ENQUEUE', text })
          dispatch({ type: 'INPUT', value: '' })
          dispatch({ type: 'STEER_MODE', on: false })
          dispatch({ type: 'STATUS', text: 'follow-up queued' })
        }
        return
      }
      const action = keyToAction(key)
      if (action) dispatch(action)
      else if (input) dispatch({ type: 'INPUT', value: state.input + input })
      return
    }
    // 4) Ctrl+C 运行中打断 → 进入 follow-up 输入态（todo 6）。
    if (state.running && key?.ctrl === true && input === 'c') {
      dispatch({ type: 'STATUS', text: 'interrupted — type follow-up + Enter, or Ctrl+C to cancel' })
      dispatch({ type: 'STEER_MODE', on: true })
      return
    }
    // 5) 普通态：字母快捷方式按 input 判定（ink 对字母键不保证给 key.name，
    //    只靠 key.name==='m' 会把 m 吞成输入字符）。
    if ((input || '').toLowerCase() === 'm') { dispatch({ type: 'MODE_CYCLE' }); return }
    // Ctrl+P 打开命令面板（输入框为空时）
    if (state.input === '' && key?.ctrl === true && input === 'p') { setPaletteOpen(true); setPaletteIdx(0); return }
    // 斜杠补全：输入以 / 开头时 ↑↓ 在候选间移动
    const slashMode = state.input.startsWith('/')
    const slashMatches = slashMode ? SLASH_COMMANDS.filter((c) => c.startsWith(state.input)) : []
    if (slashMatches.length > 0 && key?.upArrow === true) { setSlashIdx((i) => Math.max(0, i - 1)); return }
    if (slashMatches.length > 0 && key?.downArrow === true) { setSlashIdx((i) => Math.min(slashMatches.length - 1, i + 1)); return }
    // ↑↓ 消息导航（输入框为空时）
    if (state.input === '' && key?.upArrow === true) { dispatch({ type: 'MOVE_SELECT', dir: -1 }); return }
    if (state.input === '' && key?.downArrow === true) { dispatch({ type: 'MOVE_SELECT', dir: 1 }); return }
    if (key?.return === true) {
      const text = state.input.trim()
      if (text && !state.running) {
        // 斜杠补全：有选中候选 → 填入完整命令（可补参数后再次 Enter 执行）
        if (slashMatches.length > 0 && slashIdx >= 0 && slashIdx < slashMatches.length) {
          dispatch({ type: 'INPUT', value: slashMatches[slashIdx] })
          setSlashIdx(0)
          return
        }
        dispatch({ type: 'INPUT', value: '' })
        if (text.startsWith('/')) { handleCommand(text); return }
        dispatch({ type: 'SUBMIT' })
        startSession(text)
      }
      return
    }
    if ((input || '') === 'v' && !state.running && state.input === '' && state.toolCalls.length > 0) {
      // 输入框为空时才响应 v（避免输入含 v 的文本时误触 diff 展开）
      const last = state.toolCalls.length - 1
      expandDiff(last)
      return
    }
    const action = keyToAction(key)
    if (action) dispatch(action)
    else if (input) dispatch({ type: 'INPUT', value: state.input + input })
  })

  useEffect(() => {
    if (state.quitRequested) exit()
  }, [state.quitRequested, exit])

  return h(Box, { flexDirection: 'column' },
    h(Logo, { tick: state.running ? tick : null }),
    h(Text, { color: C.dim }, `  ${state.mode} · m 切模式 · q/Ctrl+C 退出 · v diff · ↑↓ 选消息`),
    ...state.messages.map((m, i) => h(MessageLine, {
      key: m.id, msg: m,
      selected: state.selectedMessage === i,
    })),
    ...state.toolCalls.map((card, i) => h(ToolCard, {
      key: `${card.name}-${i}`, card,
      expanded: state.expandedTool === i,
    })),
    state.pendingPermission ? h(PermissionPanel, { perm: state.pendingPermission }) : null,
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
      state.steeringQueue.length
        ? h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, { bold: true, color: C.primary }, 'steering queue:'),
          state.steeringQueue.map((q, i) => h(Text, { key: i, color: C.primary }, `  ⤷ ${q}`)))
        : null,
      (state.input.startsWith('/')
        ? h(Box, { marginTop: 1, flexDirection: 'column' },
          SLASH_COMMANDS.filter((c) => c.startsWith(state.input))
            .map((c, i) => h(Text, {
              key: c,
              color: i === slashIdx ? C.primary : C.dim,
              backgroundColor: i === slashIdx ? '#24283b' : undefined,
            }, `  ${c}`)))
        : null),
      paletteOpen
        ? h(Box, { marginTop: 1, borderStyle: 'single', borderColor: C.primary, paddingX: 1, flexDirection: 'column' },
          h(Text, { bold: true, color: C.primary }, 'Ctrl+P — commands'),
          PALETTE_ITEMS.map((item, i) => h(Text, {
            key: item,
            color: i === paletteIdx ? C.primary : C.dim,
            backgroundColor: i === paletteIdx ? '#24283b' : undefined,
          }, `  ${i === paletteIdx ? '❯ ' : '  '}${item}`)))
        : null,
      h(Box, { marginTop: 1, borderStyle: 'round', borderColor: state.running ? C.primary : C.dim, paddingX: 1 },
        h(Text, { color: state.running ? C.primary : C.dim, bold: !state.running }, '❯ '),
        h(Text, { color: C.assistant }, state.input),
      ),
      h(StatusBar, { state, tick: state.running ? tick : '●' }),
  )
}

