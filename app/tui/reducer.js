// ─────────────────────────────────────────────────────────────────────────────
// reducer.js — TUI 纯状态机（todo 1 测试目标）
// 纯函数：(state, action) => nextState。无 IO、无随机、无模块级可变状态。
// 事件流（todo 2 起）经 runSession 把 agent 事件翻译为下列 action 驱动本 reducer。
// 工具卡摘要格式化来自 ./toolCards.js（todo 3）。
// ─────────────────────────────────────────────────────────────────────────────
import { summarizeArgs, truncateLines } from './toolCards.js'

export const MODES = ['ask', 'plan', 'auto']

export const initialTuiState = Object.freeze({
  input: '',
  messages: [], // { id, role: 'user'|'assistant'|'system'|'tool', text }
  mode: 'ask',
  running: false,
  statusLine: 'idle',
  toolCalls: [], // { name, status: 'running'|'done'|'error', summary }
  quitRequested: false,
})

function nextMessageId(state) {
  return state.messages.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1
}

export function tuiReducer(state = initialTuiState, action) {
  switch (action.type) {
    case 'INPUT':
      return { ...state, input: String(action.value ?? '') }

    case 'INPUT_BACKSPACE':
      return { ...state, input: state.input.slice(0, -1) }

    case 'SUBMIT': {
      const text = state.input.trim()
      if (!text || state.running) return state
      return {
        ...state,
        input: '',
        running: true,
        statusLine: 'running',
        messages: [
          ...state.messages,
          { id: nextMessageId(state), role: 'user', text },
          { id: nextMessageId(state) + 1, role: 'assistant', text: '' },
        ],
      }
    }

    case 'TEXT_DELTA': {
      if (!state.running) return state
      const messages = [...state.messages]
      const last = messages[messages.length - 1]
      if (!last || last.role !== 'assistant') return state
      messages[messages.length - 1] = { ...last, text: last.text + String(action.delta ?? '') }
      return { ...state, messages }
    }

    case 'AGENT_END':
      return { ...state, running: false, statusLine: 'idle' }

    case 'STATUS':
      return { ...state, statusLine: String(action.text ?? action.status ?? '') }

    case 'MODE_SET': {
      if (!MODES.includes(action.mode)) return state
      return { ...state, mode: action.mode }
    }

    case 'MODE_CYCLE': {
      const i = MODES.indexOf(state.mode)
      return { ...state, mode: MODES[(i + 1) % MODES.length] }
    }

    case 'TOOL_START': {
      const entry = action.entry || {}
      return {
        ...state,
        toolCalls: [
          ...state.toolCalls,
          { name: entry.name || 'tool', status: 'running', summary: summarizeArgs(entry.args), latencyMs: null },
        ],
      }
    }

    case 'TOOL_END': {
      const entry = action.entry || {}
      const toolCalls = [...state.toolCalls]
      const last = toolCalls[toolCalls.length - 1]
      if (last && last.name === (entry.name || 'tool')) {
        toolCalls[toolCalls.length - 1] = {
          ...last,
          status: entry.error ? 'error' : 'done',
          summary: entry.error
            ? truncateLines(String(entry.error), 5)
            : truncateLines(entry.result, 80),
          latencyMs: typeof entry.latencyMs === 'number' ? entry.latencyMs : null,
        }
      }
      return { ...state, toolCalls }
    }

    case 'QUIT_INTENT':
      return { ...state, quitRequested: true }

    case 'RESET':
      return { ...initialTuiState }

    default:
      return state
  }
}

// `aether tui --smoke` 用的状态摘要（纯函数、可 JSON 序列化）
export function summarizeState(state) {
  return {
    mode: state.mode,
    running: state.running,
    statusLine: state.statusLine,
    messageCount: state.messages.length,
    lastMessageText: state.messages[state.messages.length - 1]?.text ?? '',
    toolCalls: state.toolCalls.map((t) => ({ name: t.name, status: t.status })),
    quitRequested: state.quitRequested,
  }
}
