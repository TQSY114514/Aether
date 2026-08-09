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
    s = tuiReducer(s, { type: 'TOOL_END', entry: { name: 'read', error: null, resultSummary: 'ok' } })
    expect(s.toolCalls[0].status).toBe('done')
    s = tuiReducer(s, { type: 'TOOL_START', entry: { name: 'write' } })
    s = tuiReducer(s, { type: 'TOOL_END', entry: { name: 'write', error: 'denied' } })
    expect(s.toolCalls[1].status).toBe('error')
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

  it('maps m to MODE_CYCLE', () => {
    expect(keyToAction({ name: 'm' })).toEqual({ type: 'MODE_CYCLE' })
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
