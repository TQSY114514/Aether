// ─────────────────────────────────────────────────────────────────────────────
// App.mjs — TUI 根组件（todo 1）+ 权限审批面板 + diff/回滚（todo 4）
// createElement 风格、无 JSX：Node v24 无法加载 .jsx（ISSUE-01 实证），且引入
// 加载器会违反「新依赖仅限纯 JS」护栏——故组件一律用 react.createElement 手写。
// ─────────────────────────────────────────────────────────────────────────────
import { createElement as h, useEffect, useReducer, useRef, useCallback } from 'react'
import { readFileSync, existsSync } from 'node:fs'
import { Box, Text, useInput, useApp } from 'ink'
import { tuiReducer, initialTuiState } from './reducer.js'
import { keyToAction } from './keymap.js'
import { runSession, createTuiPermissionHandler, decidePermission, toolToSnapshotPath } from './runSession.js'
import { createAllowRulesStore } from './allowRules.js'
import { buildDiff, rollbackChange } from './rollback.js'
import { TOOL_STATUS } from './toolCards.js'

const ROLE_LABEL = { user: 'you', assistant: 'aether', tool: 'tool', system: 'sys' }
const ROLE_COLOR = { user: 'green', assistant: 'white', tool: 'yellow', system: 'gray' }

function MessageLine({ msg }) {
  const label = ROLE_LABEL[msg.role] || msg.role
  const color = ROLE_COLOR[msg.role] || 'white'
  if (!msg.text && msg.role === 'assistant') {
    return h(Text, { color: 'gray' }, `[${label}] …`)
  }
  return h(Text, { color }, `[${label}] ${msg.text}`)
}

// 工具调用卡（todo 3）：running 圆框 / done|error 单框，状态色边框 + 标签。
// 完成态且带快照时标注可审阅（v: diff / r: rollback）。
function ToolCard({ card, index, expanded, onExpand }) {
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
    h(Text, { color: 'gray' }, `args: ${JSON.stringify(perm.args)} | risk: ${perm.risk}`),
    h(Text, { color: 'gray' }, 'y: 允许  n: 拒绝  a: 总是允许(本会话)  Ctrl+C: 中止'),
  )
}

export function App({ dbPath, modelName }) {
  const { exit } = useApp()
  const [state, dispatch] = useReducer(tuiReducer, initialTuiState)
  const sessionBusyRef = useRef(false)
  const allowRulesRef = useRef(createAllowRulesStore())
  const resolveRef = useRef(null)
  const workspaceRef = useRef(process.cwd())

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
        prompt: promptText,
        agentMode: state.mode,
        dispatch,
        requestPermission: tuiPermission,
      })
    } catch (err) {
      dispatch({ type: 'STATUS', text: `error: ${err && err.message ? err.message : String(err)}` })
      dispatch({ type: 'AGENT_END' })
    } finally {
      sessionBusyRef.current = false
    }
  }, [dbPath, modelName, state.mode, tuiPermission])

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
    // 1) 权限等待态：y/n/a 应答，Ctrl+C 中止（=拒绝）。
    if (state.pendingPermission) {
      const ctrlC = key && key.ctrl && key.name === 'c'
      if (ctrlC) { decidePermission({ decision: 'deny', allowRules: allowRulesRef.current, sessionId: 'tui', resolveRef, dispatch }); return }
      const ch = (input || '').toLowerCase()
      if (ch === 'y') { decidePermission({ decision: 'allow', allowRules: allowRulesRef.current, sessionId: 'tui', resolveRef, dispatch }); return }
      if (ch === 'n') { decidePermission({ decision: 'deny', allowRules: allowRulesRef.current, sessionId: 'tui', resolveRef, dispatch }); return }
      if (ch === 'a') { decidePermission({ decision: 'allow', remember: true, allowRules: allowRulesRef.current, sessionId: 'tui', resolveRef, dispatch }); return }
      return // 等待期吞掉其他键
    }
    // 2) diff 视图态：Enter/Esc 关闭（接受），r 回滚。
    if (state.expandedTool != null) {
      if (key && (key.name === 'return' || key.name === 'enter')) { dispatch({ type: 'TOOL_EXPAND', index: state.expandedTool }); return }
      if (key && key.name === 'escape') { dispatch({ type: 'TOOL_EXPAND', index: state.expandedTool }); return }
      if ((input || '') === 'r') { doRollback(); return }
      return
    }
    // 3) 普通态：Enter 提交、v 展开最近完成卡、其余走 keymap/输入。
    if (key && (key.name === 'return' || key.name === 'enter')) {
      const text = state.input.trim()
      if (text && !state.running) {
        dispatch({ type: 'SUBMIT' })
        startSession(text)
      }
      return
    }
    if ((input || '') === 'v' && !state.running && state.toolCalls.length > 0) {
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
    h(Box, { borderStyle: 'round', borderColor: 'cyan', paddingX: 1 },
      h(Text, { bold: true }, 'AetherAI TUI'),
      h(Text, { color: 'gray' }, '  — interactive terminal agent (m: mode, q: quit, v: diff)'),
    ),
    ...state.messages.map((m) => h(MessageLine, { key: m.id, msg: m })),
    ...state.toolCalls.map((card, i) => h(ToolCard, {
      key: `${card.name}-${i}`, card, index: i,
      expanded: state.expandedTool === i,
    })),
    state.pendingPermission ? h(PermissionPanel, { perm: state.pendingPermission }) : null,
    h(Box, { marginTop: 1 },
      h(Text, { color: 'gray' }, '> '),
      h(Text, {}, state.input),
    ),
    h(Box, { marginTop: 1 },
      h(Text, { color: 'gray' },
        `[${state.mode}] ${state.statusLine}${state.running ? ' (running)' : ''} tools:${state.toolCalls.length}`),
    ),
  )
}
