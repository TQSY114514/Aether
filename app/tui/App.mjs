// ─────────────────────────────────────────────────────────────────────────────
// App.mjs — TUI 根组件（todo 1）
// createElement 风格、无 JSX：Node v24 无法加载 .jsx（ISSUE-01 实证），且引入
// 加载器会违反「新依赖仅限纯 JS」护栏——故组件一律用 react.createElement 手写。
// ─────────────────────────────────────────────────────────────────────────────
import { createElement as h, useEffect, useReducer, useRef, useCallback } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { tuiReducer, initialTuiState } from './reducer.js'
import { keyToAction } from './keymap.js'
import { runSession } from './runSession.js'
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
function ToolCard({ card }) {
  const meta = TOOL_STATUS[card.status] || TOOL_STATUS.done
  const borderStyle = card.status === 'running' ? 'round' : 'single'
  return h(Box, { borderStyle, borderColor: meta.color, paddingX: 1, marginTop: 1, flexDirection: 'column' },
    h(Text, { color: meta.color },
      `[${meta.label}] ${card.name}${card.latencyMs != null ? ` (${card.latencyMs}ms)` : ''}`),
    h(Text, { color: 'gray' }, String(card.summary || '')),
  )
}

export function App({ dbPath, modelName }) {
  const { exit } = useApp()
  const [state, dispatch] = useReducer(tuiReducer, initialTuiState)
  // 防抖：同一轮 running 中只允许一个会话（reducer 也守卫 SUBMIT）。
  const sessionBusyRef = useRef(false)

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
      })
    } catch (err) {
      // 无 provider/无 DB 等：红字状态不崩溃，回到 idle。
      dispatch({ type: 'STATUS', text: `error: ${err && err.message ? err.message : String(err)}` })
      dispatch({ type: 'AGENT_END' })
    } finally {
      sessionBusyRef.current = false
    }
  }, [dbPath, modelName, state.mode])

  useInput((input, key) => {
    if (key && (key.name === 'return' || key.name === 'enter')) {
      const text = state.input.trim()
      if (text && !state.running) {
        dispatch({ type: 'SUBMIT' })
        startSession(text)
      }
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
      h(Text, { color: 'gray' }, '  — interactive terminal agent (m: mode, q: quit)'),
    ),
    ...state.messages.map((m) => h(MessageLine, { key: m.id, msg: m })),
    ...state.toolCalls.map((card, i) => h(ToolCard, { key: `${card.name}-${i}`, card })),
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
