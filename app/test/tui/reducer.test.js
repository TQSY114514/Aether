// ─────────────────────────────────────────────────────────────────────────────
// reducer.test.js — TUI 状态机基线测试（todo 1：≥10 断言）
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { tuiReducer, initialTuiState, summarizeState, MODES } from '../../tui/reducer.js'
import { keyToAction } from '../../tui/keymap.js'

describe('tuiReducer', () => {
  it('INPUT updates input text', () => {
    const s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'hello' })
    expect(s.input).toBe('hello')
  })

  it('INPUT_BACKSPACE removes the last char', () => {
    const a = tuiReducer(initialTuiState, { type: 'INPUT', value: 'abc' })
    const b = tuiReducer(a, { type: 'INPUT_BACKSPACE' })
    expect(b.input).toBe('ab')
  })

  it('SUBMIT adds user message, clears input, starts running', () => {
    const a = tuiReducer(initialTuiState, { type: 'INPUT', value: 'hi' })
    const s = tuiReducer(a, { type: 'SUBMIT' })
    expect(s.running).toBe(true)
    expect(s.input).toBe('')
    expect(s.messages).toHaveLength(2)
    expect(s.messages[0]).toMatchObject({ role: 'user', text: 'hi' })
    expect(s.messages[1]).toMatchObject({ role: 'assistant', text: '' })
  })

  it('SUBMIT with empty input is a no-op', () => {
    const s = tuiReducer(initialTuiState, { type: 'SUBMIT' })
    expect(s.messages).toHaveLength(0)
    expect(s.running).toBe(false)
  })

  it('SUBMIT while running is a no-op', () => {
    const a = tuiReducer(initialTuiState, { type: 'INPUT', value: 'x' })
    const b = tuiReducer(a, { type: 'SUBMIT' })
    const c = tuiReducer(b, { type: 'SUBMIT' })
    expect(c.messages).toHaveLength(2) // unchanged
  })

  it('TEXT_DELTA appends to the last assistant message', () => {
    const a = tuiReducer(initialTuiState, { type: 'INPUT', value: 'q' })
    const b = tuiReducer(a, { type: 'SUBMIT' })
    const c = tuiReducer(b, { type: 'TEXT_DELTA', delta: 'Hel' })
    const d = tuiReducer(c, { type: 'TEXT_DELTA', delta: 'lo' })
    expect(d.messages[1].text).toBe('Hello')
  })

  it('AGENT_END stops running and resets status', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'q' })
    s = tuiReducer(s, { type: 'SUBMIT' })
    s = tuiReducer(s, { type: 'AGENT_END' })
    expect(s.running).toBe(false)
    expect(s.statusLine).toBe('idle')
  })

  it('APPEND_SYSTEM adds a visible system message (errors not swallowed)', () => {
    let s = tuiReducer(initialTuiState, { type: 'APPEND_SYSTEM', text: 'error: no database found' })
    expect(s.messages).toHaveLength(1)
    expect(s.messages[0]).toMatchObject({ role: 'system', text: 'error: no database found' })
    s = tuiReducer(s, { type: 'APPEND_SYSTEM', text: '   ' })
    expect(s.messages).toHaveLength(1) // 空白不入
    // 会话结束后错误消息仍在（不随 AGENT_END 消失）
    s = tuiReducer(s, { type: 'AGENT_END' })
    expect(s.messages).toHaveLength(1)
  })

  it('MOVE_SELECT navigates messages with ↑↓ and clamps at bounds', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'a' })
    s = tuiReducer(s, { type: 'SUBMIT' })
    expect(s.messages).toHaveLength(2)
    expect(s.selectedMessage).toBeNull()
    s = tuiReducer(s, { type: 'MOVE_SELECT', dir: 1 }) // ↓ → 0
    expect(s.selectedMessage).toBe(0)
    s = tuiReducer(s, { type: 'MOVE_SELECT', dir: 1 }) // ↓ → 1
    expect(s.selectedMessage).toBe(1)
    s = tuiReducer(s, { type: 'MOVE_SELECT', dir: 1 }) // 到底 clamp
    expect(s.selectedMessage).toBe(1)
    s = tuiReducer(s, { type: 'MOVE_SELECT', dir: -1 }) // ↑ → 0
    expect(s.selectedMessage).toBe(0)
    s = tuiReducer(s, { type: 'MOVE_SELECT', dir: -1 }) // 到顶 clamp
    expect(s.selectedMessage).toBe(0)
    // 无消息时选择重置
    s = tuiReducer(s, { type: 'RESET' })
    expect(tuiReducer(s, { type: 'MOVE_SELECT', dir: 1 }).selectedMessage).toBeNull()
  })

  it('AGENT_START records modelName and resets selection', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'a' })
    s = tuiReducer(s, { type: 'SUBMIT' })
    s = tuiReducer(s, { type: 'MOVE_SELECT', dir: 1 })
    s = tuiReducer(s, { type: 'AGENT_START', max: 5, modelName: 'deepseek-v4-flash' })
    expect(s.modelName).toBe('deepseek-v4-flash')
    expect(s.selectedMessage).toBeNull()
  })

  it('MODE_SET switches to any valid mode', () => {
    for (const m of MODES) {
      const s = tuiReducer(initialTuiState, { type: 'MODE_SET', mode: m })
      expect(s.mode).toBe(m)
    }
  })

  it('MODE_SET with an invalid mode is ignored', () => {
    const s = tuiReducer(initialTuiState, { type: 'MODE_SET', mode: 'yolo' })
    expect(s.mode).toBe('ask')
  })

  it('MODE_CYCLE rotates ask→plan→auto→ask', () => {
    const a = tuiReducer(initialTuiState, { type: 'MODE_CYCLE' })
    expect(a.mode).toBe('plan')
    const b = tuiReducer(a, { type: 'MODE_CYCLE' })
    expect(b.mode).toBe('auto')
    const c = tuiReducer(b, { type: 'MODE_CYCLE' })
    expect(c.mode).toBe('ask')
  })

  it('TOOL_START/TOOL_END track tool cards (done + error)', () => {
    let s = tuiReducer(initialTuiState, { type: 'TOOL_START', entry: { name: 'read' } })
    expect(s.toolCalls).toHaveLength(1)
    expect(s.toolCalls[0].status).toBe('running')
    s = tuiReducer(s, { type: 'TOOL_END', entry: { name: 'read', result: 'ok' } })
    expect(s.toolCalls[0].status).toBe('done')
    s = tuiReducer(s, { type: 'TOOL_START', entry: { name: 'write' } })
    s = tuiReducer(s, { type: 'TOOL_END', entry: { name: 'write', error: 'denied' } })
    expect(s.toolCalls[1].status).toBe('error')
  })

  it('TOOL_END with interleaved parallel tools updates the right card', () => {
    // toolLoop 并行调用：A start → B start → A end → B end。
    let s = tuiReducer(initialTuiState, { type: 'TOOL_START', entry: { name: 'read_a' } })
    s = tuiReducer(s, { type: 'TOOL_START', entry: { name: 'read_b' } })
    s = tuiReducer(s, { type: 'TOOL_END', entry: { name: 'read_a', result: 'a-ok' } })
    expect(s.toolCalls[0].status).toBe('done') // A 卡正确收尾
    expect(s.toolCalls[0].summary).toContain('a-ok')
    expect(s.toolCalls[1].status).toBe('running') // B 卡仍 running
    s = tuiReducer(s, { type: 'TOOL_END', entry: { name: 'read_b', result: 'b-ok' } })
    expect(s.toolCalls[1].status).toBe('done')
  })

  it('QUIT_INTENT sets quitRequested', () => {
    const s = tuiReducer(initialTuiState, { type: 'QUIT_INTENT' })
    expect(s.quitRequested).toBe(true)
  })

  it('RESET restores the initial state', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'x' })
    s = tuiReducer(s, { type: 'QUIT_INTENT' })
    const r = tuiReducer(s, { type: 'RESET' })
    expect(r.input).toBe('')
    expect(r.quitRequested).toBe(false)
    expect(r.messages).toHaveLength(0)
  })

  it('unknown action returns the state unchanged', () => {
    const s = tuiReducer(initialTuiState, { type: 'NOPE' })
    expect(s).toBe(initialTuiState)
  })
})

describe('keyToAction', () => {
  it('maps Enter to SUBMIT', () => {
    expect(keyToAction({ name: 'return' })).toEqual({ type: 'SUBMIT' })
  })

  it('maps Ctrl+C to QUIT_INTENT', () => {
    expect(keyToAction({ ctrl: true, name: 'c' })).toEqual({ type: 'QUIT_INTENT' })
  })

  it('maps backspace to INPUT_BACKSPACE', () => {
    expect(keyToAction({ backspace: true })).toEqual({ type: 'INPUT_BACKSPACE' })
  })

  it('maps real-terminal DEL (\\x7f) to INPUT_BACKSPACE (root cause of "backspace does nothing")', () => {
    expect(keyToAction({}, '\x7f')).toEqual({ type: 'INPUT_BACKSPACE' })
    expect(keyToAction({}, '\b')).toEqual({ type: 'INPUT_BACKSPACE' })
    expect(keyToAction({ name: 'backspace' })).toEqual({ type: 'INPUT_BACKSPACE' })
  })

  it('m is NOT consumed by keymap (App decides: only when input empty)', () => {
    expect(keyToAction({ name: 'm' })).toBeNull()
    expect(keyToAction({}, 'm')).toBeNull()
  })

  it('returns null for ordinary printable input and junk', () => {
    expect(keyToAction({ name: 'a' })).toBeNull()
    expect(keyToAction(undefined)).toBeNull()
    expect(keyToAction(null)).toBeNull()
  })
})

describe('summarizeState', () => {
  it('produces a serializable snapshot', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'hello world' })
    s = tuiReducer(s, { type: 'SUBMIT' })
    s = tuiReducer(s, { type: 'TEXT_DELTA', delta: 'answer' })
    const sum = summarizeState(s)
    expect(sum.mode).toBe('ask')
    expect(sum.running).toBe(true)
    expect(sum.messageCount).toBe(2)
    expect(sum.lastMessageText).toBe('answer')
    expect(JSON.parse(JSON.stringify(sum))).toEqual(sum)
  })
})
