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
  toolCalls: [], // { name, args, status, summary, latencyMs, snapshot, diff, rollbackResult }
  currentTool: null,       // todo 6: 正在执行的工具名（状态栏显示）
  budget: { used: 0, max: 0 }, // todo 6: 迭代预算 used/max
  steeringQueue: [],       // todo 6: 待注入 follow-up 队列
  steeringMode: false,     // todo 6: Ctrl+C 打断后的 follow-up 输入态
  pendingPermission: null, // { reqId, name, args, risk, snapshot } — awaitingPermission 态
  expandedTool: null,      // 展开的 diff 视图工具卡下标
  sessions: [],            // todo 5: [{ id, title, parentId, createdAt }]
  currentSessionId: null,  // todo 5: 活动会话 id（fork 父指针用）
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
        currentTool: entry.name || 'tool',
        toolCalls: [
          ...state.toolCalls,
          {
            name: entry.name || 'tool',
            args: entry.args || {},
            status: 'running',
            summary: summarizeArgs(entry.args),
            latencyMs: null,
            snapshot: entry.snapshot || null,
            diff: null,
            rollbackResult: null,
          },
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
      return { ...state, toolCalls, currentTool: null }
    }

    // ── 预算 / steering（todo 6）────────────────────────────────────────
    case 'AGENT_START': {
      const max = Number.isFinite(action.max) ? action.max : 0
      return { ...state, running: true, statusLine: 'running', budget: { used: 0, max } }
    }

    case 'BUDGET': {
      const used = Number.isFinite(action.used) ? action.used : state.budget.used
      return { ...state, budget: { ...state.budget, used } }
    }

    case 'STEER_ENQUEUE': {
      const text = String(action.text || '').trim()
      if (!text) return state
      return { ...state, steeringQueue: [...state.steeringQueue, text] }
    }

    case 'STEER_DEQUEUE': {
      if (!state.steeringQueue.length) return state
      return { ...state, steeringQueue: state.steeringQueue.slice(1) }
    }

    case 'STEER_MODE':
      return { ...state, steeringMode: !!action.on }

    // ── 权限审批（todo 4）──────────────────────────────────────────────
    case 'PERMISSION_REQUEST': {
      const p = action.payload || {}
      return {
        ...state,
        pendingPermission: {
          reqId: p.reqId || `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          name: p.name || 'tool',
          args: p.args || {},
          risk: p.risk || 'unknown',
          snapshot: p.snapshot || null,
        },
      }
    }

    case 'PERMISSION_DECIDE':
      return { ...state, pendingPermission: null }

    // ── diff 视图与回滚（todo 4）───────────────────────────────────────
    case 'TOOL_EXPAND': {
      const idx = Number(action.index)
      if (!Number.isInteger(idx) || idx < 0 || idx >= state.toolCalls.length) return state
      const card = state.toolCalls[idx]
      // 展开时若快照存在，就地计算 diff（纯函数 buildDiff 由调用方注入结果或此处惰性计算）
      return { ...state, expandedTool: state.expandedTool === idx ? null : idx }
    }

    case 'TOOL_DIFF_SET': {
      // 把 buildDiff 结果挂到卡上（调用方已算好，reducer 只存）
      const idx = Number(action.index)
      if (!Number.isInteger(idx) || idx < 0 || idx >= state.toolCalls.length) return state
      const toolCalls = [...state.toolCalls]
      toolCalls[idx] = { ...toolCalls[idx], diff: action.diff || null }
      return { ...state, toolCalls }
    }

    case 'TOOL_ROLLBACK': {
      const idx = Number(action.index)
      if (!Number.isInteger(idx) || idx < 0 || idx >= state.toolCalls.length) return state
      const toolCalls = [...state.toolCalls]
      toolCalls[idx] = { ...toolCalls[idx], rollbackResult: action.result || { ok: false, error: 'unknown' } }
      return { ...state, toolCalls, expandedTool: null }
    }

    case 'QUIT_INTENT':
      return { ...state, quitRequested: true }

    // ── 会话树（todo 5）────────────────────────────────────────────────
    case 'SESSIONS_SET':
      return { ...state, sessions: Array.isArray(action.sessions) ? action.sessions : [] }

    case 'SESSION_USE':
      return { ...state, currentSessionId: action.sessionId ?? null }

    case 'SESSION_FORK': {
      const sessionId = action.sessionId
      const parentId = action.parentId ?? null
      const entry = {
        id: sessionId,
        title: action.title || 'fork',
        parentId,
        createdAt: action.createdAt || new Date().toISOString(),
      }
      return {
        ...state,
        sessions: [entry, ...state.sessions.filter((s) => s.id !== sessionId)],
        currentSessionId: sessionId,
      }
    }

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
