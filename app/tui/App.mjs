// ─────────────────────────────────────────────────────────────────────────────
// App.mjs — TUI 根组件（todo 1）
// createElement 风格、无 JSX：Node v24 无法加载 .jsx（ISSUE-01 实证），且引入
// 加载器会违反「新依赖仅限纯 JS」护栏——故组件一律用 react.createElement 手写。
// ─────────────────────────────────────────────────────────────────────────────
import { createElement as h, useEffect, useReducer } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { tuiReducer, initialTuiState } from './reducer.js'
import { keyToAction } from './keymap.js'

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

export function App() {
  const { exit } = useApp()
  const [state, dispatch] = useReducer(tuiReducer, initialTuiState)

  useInput((input, key) => {
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
