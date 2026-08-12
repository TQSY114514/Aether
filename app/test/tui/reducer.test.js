// ─────────────────────────────────────────────────────────────────────────────
// reducer.test.js — TUI 状态机基线测试（todo 1：≥10 断言）
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { tuiReducer, initialTuiState, summarizeState, MODES, messageDisplay } from '../../tui/reducer.js'
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
    // ink 把 \x7f 解析为 key.delete=true 且 input 置空——必须认 delete
    expect(keyToAction({ delete: true })).toEqual({ type: 'INPUT_BACKSPACE' })
    expect(keyToAction({ name: 'delete' })).toEqual({ type: 'INPUT_BACKSPACE' })
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

describe('USAGE — 实时 token 用量', () => {
  it('累计 input/output 并可在状态栏显示', () => {
    let s = tuiReducer(initialTuiState, { type: 'USAGE', usage: { input: 100, output: 20 } })
    expect(s.usage).toEqual({ input: 100, output: 20 })
    s = tuiReducer(s, { type: 'USAGE', usage: { input: 250, output: 55 } })
    expect(s.usage).toEqual({ input: 250, output: 55 })
  })

  it('非法 usage 忽略(保持现值)', () => {
    const s = tuiReducer(initialTuiState, { type: 'USAGE', usage: { input: NaN, output: 'x' } })
    expect(s.usage).toEqual({ input: 0, output: 0 })
  })
})

describe('cursor-aware input editing (W0-B2 todo 4)', () => {
  it('INPUT inserts at cursor and advances it (cursor mid-string)', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'abc' })
    expect(s.input).toBe('abc')
    expect(s.inputCursor).toBe(3)
    s = tuiReducer(s, { type: 'INPUT_LEFT' })
    s = tuiReducer(s, { type: 'INPUT_LEFT' })
    s = tuiReducer(s, { type: 'INPUT', value: 'X' })
    expect(s.input).toBe('aXbc')
    expect(s.inputCursor).toBe(2)
    s = tuiReducer(s, { type: 'INPUT_HOME' })
    s = tuiReducer(s, { type: 'INPUT', value: '> ' })
    expect(s.input).toBe('> aXbc')
    expect(s.inputCursor).toBe(2)
  })

  it('INPUT with empty value clears input (enter/esc/tab clear paths)', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'abc' })
    s = tuiReducer(s, { type: 'INPUT', value: '' })
    expect(s.input).toBe('')
    expect(s.inputCursor).toBe(0)
  })

  it('INPUT with replace:true sets the whole input, cursor at end (history/slash fill)', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'abc' })
    s = tuiReducer(s, { type: 'INPUT_LEFT' })
    s = tuiReducer(s, { type: 'INPUT', value: 'history fill', replace: true })
    expect(s.input).toBe('history fill')
    expect(s.inputCursor).toBe(12)
  })

  it('INPUT clamps cursor past end (paste after edit edge)', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'ab' })
    s = tuiReducer(s, { type: 'INPUT_END' })
    s = tuiReducer(s, { type: 'INPUT', value: '\nline2' })
    expect(s.input).toBe('ab\nline2')
    expect(s.inputCursor).toBe(8)
  })

  it('INPUT_BACKSPACE deletes the char before the cursor', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'abc' })
    s = tuiReducer(s, { type: 'INPUT_LEFT' })        // cursor 2
    s = tuiReducer(s, { type: 'INPUT_BACKSPACE' })   // 删 'b' → 'ac'
    expect(s.input).toBe('ac')
    expect(s.inputCursor).toBe(1)
  })

  it('INPUT_BACKSPACE at cursor 0 is a no-op (no negative index)', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'abc' })
    s = tuiReducer(s, { type: 'INPUT_HOME' })
    s = tuiReducer(s, { type: 'INPUT_BACKSPACE' })
    expect(s.input).toBe('abc')
    expect(s.inputCursor).toBe(0)
  })

  it('INPUT_BACKSPACE at end still removes the last char (compat)', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'abc' })
    s = tuiReducer(s, { type: 'INPUT_BACKSPACE' })
    expect(s.input).toBe('ab')
    expect(s.inputCursor).toBe(2)
  })

  it('INPUT_LEFT/RIGHT clamp at 0 and length', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'abc' })
    s = tuiReducer(s, { type: 'INPUT_LEFT' })
    expect(s.inputCursor).toBe(2)
    s = tuiReducer(s, { type: 'INPUT_RIGHT' })
    expect(s.inputCursor).toBe(3)
    s = tuiReducer(s, { type: 'INPUT_RIGHT' })
    expect(s.inputCursor).toBe(3) // 越界钳制
    s = tuiReducer(s, { type: 'INPUT_HOME' })
    expect(s.inputCursor).toBe(0)
    s = tuiReducer(s, { type: 'INPUT_LEFT' })
    expect(s.inputCursor).toBe(0) // 越界钳制
  })

  it('INPUT_HOME/END and INPUT_LINE_HOME/END move cursor', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'hello' })
    s = tuiReducer(s, { type: 'INPUT_END' })
    expect(s.inputCursor).toBe(5)
    s = tuiReducer(s, { type: 'INPUT_HOME' })
    expect(s.inputCursor).toBe(0)
    s = tuiReducer(s, { type: 'INPUT_LINE_END' })
    expect(s.inputCursor).toBe(5)
    s = tuiReducer(s, { type: 'INPUT_LINE_HOME' })
    expect(s.inputCursor).toBe(0)
  })

  it('INPUT_WORD_BACKWARD deletes word before cursor (Ctrl+W)', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'hello world' })
    s = tuiReducer(s, { type: 'INPUT_END' })
    s = tuiReducer(s, { type: 'INPUT_WORD_BACKWARD' })
    expect(s.input).toBe('hello ')
    expect(s.inputCursor).toBe(6)
    s = tuiReducer(s, { type: 'INPUT_WORD_BACKWARD' })
    expect(s.input).toBe('')
    expect(s.inputCursor).toBe(0)
    // 多空格: 跳过空格再删词
    let t = tuiReducer(initialTuiState, { type: 'INPUT', value: 'a  b' })
    t = tuiReducer(t, { type: 'INPUT_END' })
    t = tuiReducer(t, { type: 'INPUT_WORD_BACKWARD' })
    expect(t.input).toBe('a  ')
    expect(t.inputCursor).toBe(3)
    // cursor 0 → 无副作用
    let u = tuiReducer(initialTuiState, { type: 'INPUT', value: 'abc' })
    u = tuiReducer(u, { type: 'INPUT_HOME' })
    u = tuiReducer(u, { type: 'INPUT_WORD_BACKWARD' })
    expect(u.input).toBe('abc')
    expect(u.inputCursor).toBe(0)
  })

  it('INPUT_CLEAR_LINE deletes from start to cursor (Ctrl+U)', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'hello world' })
    s = tuiReducer(s, { type: 'INPUT_LEFT' })  // cursor 10
    s = tuiReducer(s, { type: 'INPUT_CLEAR_LINE' })
    expect(s.input).toBe('d')
    expect(s.inputCursor).toBe(0)
    // 空输入无副作用
    const e = tuiReducer(initialTuiState, { type: 'INPUT_CLEAR_LINE' })
    expect(e.input).toBe('')
    // cursor 0 无副作用
    const z = tuiReducer(initialTuiState, { type: 'INPUT', value: 'x' })
    const z0 = tuiReducer(z, { type: 'INPUT_HOME' })
    expect(tuiReducer(z0, { type: 'INPUT_CLEAR_LINE' }).input).toBe('x')
  })

  it('INPUT_TO_LINE_END deletes from cursor to end (Ctrl+K)', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'hello world' })
    s = tuiReducer(s, { type: 'INPUT_LEFT' })  // cursor 10
    s = tuiReducer(s, { type: 'INPUT_TO_LINE_END' })
    expect(s.input).toBe('hello worl')
    expect(s.inputCursor).toBe(10)
    // cursor at end → 无副作用
    s = tuiReducer(s, { type: 'INPUT_END' })
    const before = s
    expect(tuiReducer(s, { type: 'INPUT_TO_LINE_END' })).toBe(before)
  })

  it('SUBMIT resets inputCursor to 0', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'hi' })
    s = tuiReducer(s, { type: 'INPUT_LEFT' })
    s = tuiReducer(s, { type: 'SUBMIT' })
    expect(s.input).toBe('')
    expect(s.inputCursor).toBe(0)
  })
})

describe('multiline input (W0-B2 todo 5)', () => {
  it('Shift+Enter inserts \\n at cursor, Enter submits the whole multiline text', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'line1' })
    s = tuiReducer(s, { type: 'INPUT', value: '\n' })          // Shift+Enter
    expect(s.input).toBe('line1\n')
    s = tuiReducer(s, { type: 'INPUT', value: 'line2' })
    expect(s.input).toBe('line1\nline2')
    expect(s.inputCursor).toBe(11)
    s = tuiReducer(s, { type: 'SUBMIT' })
    expect(s.running).toBe(true)
    expect(s.messages[0]).toMatchObject({ role: 'user', text: 'line1\nline2' }) // 内部换行保留
    expect(s.input).toBe('')
  })

  it('SUBMIT trims outer whitespace but keeps internal newlines', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: '  line1\nline2  ' })
    s = tuiReducer(s, { type: 'SUBMIT' })
    expect(s.messages[0].text).toBe('line1\nline2')
    expect(s.messages).toHaveLength(2)
  })

  it('pasted text with newlines is preserved (char path keeps \\n)', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'a\nb\nc' })
    expect(s.input).toBe('a\nb\nc')
    expect(s.inputCursor).toBe(5)
    // 粘贴到光标处
    let t = tuiReducer(initialTuiState, { type: 'INPUT', value: 'ab' })
    t = tuiReducer(t, { type: 'INPUT_HOME' })
    t = tuiReducer(t, { type: 'INPUT', value: 'x\ny' })
    expect(t.input).toBe('x\nyab')
    expect(t.inputCursor).toBe(3)
  })

  it('multiline empty-after-trim submit is still a no-op', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: '\n\n' })
    s = tuiReducer(s, { type: 'SUBMIT' })
    expect(s.messages).toHaveLength(0)
    expect(s.running).toBe(false)
  })
})

describe('dbSessionId（W0-t3 会话落库映射）', () => {
  it('initial 为 null', () => {
    expect(initialTuiState.dbSessionId).toBeNull()
  })

  it('SESSION_ID_SET 设置 dbSessionId', () => {
    const s = tuiReducer(initialTuiState, { type: 'SESSION_ID_SET', sessionId: 7 })
    expect(s.dbSessionId).toBe(7)
  })

  it('SESSION_ID_SET null 清除 dbSessionId', () => {
    let s = tuiReducer(initialTuiState, { type: 'SESSION_ID_SET', sessionId: 7 })
    s = tuiReducer(s, { type: 'SESSION_ID_SET', sessionId: null })
    expect(s.dbSessionId).toBeNull()
  })

  it('SESSION_USE 同时设置 currentSessionId 与 dbSessionId', () => {
    const s = tuiReducer(initialTuiState, { type: 'SESSION_USE', sessionId: 3 })
    expect(s.currentSessionId).toBe(3)
    expect(s.dbSessionId).toBe(3)
  })

  it('SESSION_FORK 把 dbSessionId 指向新建会话行', () => {
    const s = tuiReducer(initialTuiState, { type: 'SESSION_FORK', sessionId: 9, parentId: 3, title: 'f' })
    expect(s.currentSessionId).toBe(9)
    expect(s.dbSessionId).toBe(9)
  })
})

describe('summarizeState', () => {  it('produces a serializable snapshot', () => {
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

// ── W1-t9: agent todo 清单（TODO_SET 状态）──────────────────────────────────
describe('W1-t9 todos (TODO_SET)', () => {
  const sample = [
    { id: 1, content: 'read config', status: 'completed' },
    { id: 2, content: 'patch file', status: 'in_progress' },
    { id: 3, content: 'run tests', status: 'pending' },
  ]

  it('initial 为 []', () => {
    expect(initialTuiState.todos).toEqual([])
  })

  it('TODO_SET 设置 todos 数组', () => {
    const s = tuiReducer(initialTuiState, { type: 'TODO_SET', todos: sample })
    expect(s.todos).toEqual(sample)
  })

  it('TODO_SET 空数组清空', () => {
    let s = tuiReducer(initialTuiState, { type: 'TODO_SET', todos: sample })
    s = tuiReducer(s, { type: 'TODO_SET', todos: [] })
    expect(s.todos).toEqual([])
  })

  it('TODO_SET 非数组忽略（保持现值, 不崩溃）', () => {
    let s = tuiReducer(initialTuiState, { type: 'TODO_SET', todos: sample })
    for (const bad of ['nope', 42, null, undefined, { content: 'x' }]) {
      expect(tuiReducer(s, { type: 'TODO_SET', todos: bad }).todos).toEqual(sample)
    }
  })

  it('RESET 清空 todos', () => {
    let s = tuiReducer(initialTuiState, { type: 'TODO_SET', todos: sample })
    s = tuiReducer(s, { type: 'RESET' })
    expect(s.todos).toEqual([])
  })

  it('TRUNCATE 保留 todos（与重放检查点无关, 不清清单）', () => {
    let s = tuiReducer(initialTuiState, { type: 'TODO_SET', todos: sample })
    s = tuiReducer(s, { type: 'TRUNCATE', messages: [], toolCalls: [] })
    expect(s.todos).toEqual(sample)
  })

  it('summarizeState 只输出计数（smoke JSON 紧凑）', () => {
    const s = tuiReducer(initialTuiState, { type: 'TODO_SET', todos: sample })
    const sum = summarizeState(s)
    expect(sum.todos).toBe(3)
    expect(JSON.parse(JSON.stringify(sum))).toEqual(sum)
  })
})

// ── W3-t21: 思考过程块（THINKING_START/DELTA/END/TOGGLE）───────────────────
describe('W3-t21 thinking block', () => {
  it('initial 为 { open: false, text: \'\' }（无思考块不渲染）', () => {
    expect(initialTuiState.thinking).toEqual({ open: false, text: '' })
  })

  it('THINKING_START: 开块并清空旧文本（新一轮思考复位）', () => {
    let s = tuiReducer(initialTuiState, { type: 'THINKING_START' })
    s = tuiReducer(s, { type: 'THINKING_DELTA', delta: 'old' })
    s = tuiReducer(s, { type: 'THINKING_END' })
    s = tuiReducer(s, { type: 'THINKING_START' })
    expect(s.thinking).toEqual({ open: true, text: '' })
  })

  it('THINKING_DELTA: 累积文本, 保持 open 态', () => {
    let s = tuiReducer(initialTuiState, { type: 'THINKING_START' })
    s = tuiReducer(s, { type: 'THINKING_DELTA', delta: 'abc' })
    s = tuiReducer(s, { type: 'THINKING_DELTA', delta: 'def' })
    expect(s.thinking.text).toBe('abcdef')
    expect(s.thinking.open).toBe(true)
  })

  it('THINKING_DELTA 非字符串忽略（不崩溃, 不污染缓冲）', () => {
    let s = tuiReducer(initialTuiState, { type: 'THINKING_START' })
    for (const bad of [42, null, undefined, {}, ['a'], true]) {
      s = tuiReducer(s, { type: 'THINKING_DELTA', delta: bad })
    }
    expect(s.thinking.text).toBe('')
  })

  it('巨大 delta 突发: 缓冲封顶 4000 且保留尾部', () => {
    let s = tuiReducer(initialTuiState, { type: 'THINKING_START' })
    s = tuiReducer(s, { type: 'THINKING_DELTA', delta: 'A'.repeat(5000) })
    expect(s.thinking.text).toHaveLength(4000)
    expect(s.thinking.text).toBe('A'.repeat(4000)) // 尾部保留 = 全 A 无差异
    // 头部截断验证: 前段不同后段相同
    s = tuiReducer(initialTuiState, { type: 'THINKING_START' })
    s = tuiReducer(s, { type: 'THINKING_DELTA', delta: 'HEAD' + 'x'.repeat(5000) })
    expect(s.thinking.text).toHaveLength(4000)
    expect(s.thinking.text.startsWith('x')).toBe(true) // HEAD 被裁掉, 只剩尾部
    expect(s.thinking.text.endsWith('x')).toBe(true)
  })

  it('连续小 delta 累积到超限后同样封顶保留尾部', () => {
    let s = tuiReducer(initialTuiState, { type: 'THINKING_START' })
    for (let i = 0; i < 500; i++) s = tuiReducer(s, { type: 'THINKING_DELTA', delta: '1234567890' })
    expect(s.thinking.text).toHaveLength(4000)
  })

  it('THINKING_END: 折叠但保留全文（块持久到下一次 START/RESET）', () => {
    let s = tuiReducer(initialTuiState, { type: 'THINKING_START' })
    s = tuiReducer(s, { type: 'THINKING_DELTA', delta: 'reasoning...' })
    s = tuiReducer(s, { type: 'THINKING_END' })
    expect(s.thinking).toEqual({ open: false, text: 'reasoning...' })
  })

  it('AGENT_END 不触碰思考块（运行结束块仍在, 供 Enter 展开回顾）', () => {
    let s = tuiReducer(initialTuiState, { type: 'THINKING_START' })
    s = tuiReducer(s, { type: 'THINKING_DELTA', delta: 'deep' })
    s = tuiReducer(s, { type: 'AGENT_END' })
    expect(s.thinking).toEqual({ open: true, text: 'deep' })
  })

  it('THINKING_TOGGLE: 折叠 ⇄ 展开', () => {
    let s = tuiReducer(initialTuiState, { type: 'THINKING_START' })
    s = tuiReducer(s, { type: 'THINKING_DELTA', delta: 'x' })
    s = tuiReducer(s, { type: 'THINKING_END' })
    expect(s.thinking.open).toBe(false)
    s = tuiReducer(s, { type: 'THINKING_TOGGLE' })
    expect(s.thinking.open).toBe(true)
    s = tuiReducer(s, { type: 'THINKING_TOGGLE' })
    expect(s.thinking.open).toBe(false)
  })

  it('THINKING_TOGGLE 无思考文本时 no-op（Enter 回落既有行为）', () => {
    const s = tuiReducer(initialTuiState, { type: 'THINKING_TOGGLE' })
    expect(s.thinking).toEqual(initialTuiState.thinking)
  })

  it('RESET 清空思考块（新一轮会话不残留旧思考）', () => {
    let s = tuiReducer(initialTuiState, { type: 'THINKING_START' })
    s = tuiReducer(s, { type: 'THINKING_DELTA', delta: 'secret plan' })
    s = tuiReducer(s, { type: 'RESET' })
    expect(s.thinking).toEqual({ open: false, text: '' })
  })

  it('TRUNCATE 保留思考块（rewind 回滚不清思考历史）', () => {
    let s = tuiReducer(initialTuiState, { type: 'THINKING_START' })
    s = tuiReducer(s, { type: 'THINKING_DELTA', delta: 'keep me' })
    s = tuiReducer(s, { type: 'THINKING_END' })
    s = tuiReducer(s, { type: 'TRUNCATE', messages: [], toolCalls: [] })
    expect(s.thinking).toEqual({ open: false, text: 'keep me' })
  })

  it('summarizeState 输出 thinkingLen 计数（smoke JSON 紧凑）', () => {
    let s = tuiReducer(initialTuiState, { type: 'THINKING_START' })
    s = tuiReducer(s, { type: 'THINKING_DELTA', delta: 'abc' })
    expect(summarizeState(s).thinkingLen).toBe(3)
    expect(summarizeState(initialTuiState).thinkingLen).toBe(0)
    expect(JSON.parse(JSON.stringify(summarizeState(s)))).toEqual(summarizeState(s))
  })
})

// ── W0-t7: 长消息可展开（expandedMessage 状态）──────────────────────────────
describe('W0-t7 expandedMessage', () => {
  const longMsg = { id: 7, role: 'assistant', text: 'x'.repeat(5000) }
  const withMsgs = (extra = {}) => tuiReducer(
    { ...initialTuiState, messages: [{ id: 1, role: 'user', text: 'hi' }, longMsg] },
    { type: 'TOGGLE_EXPAND', ...extra },
  )

  it('initial 为 null（消息 id, 非索引）', () => {
    expect(initialTuiState.expandedMessage).toBeNull()
  })

  it('TOGGLE_EXPAND 开启: 设置消息 id', () => {
    const s = withMsgs({ messageId: 7 })
    expect(s.expandedMessage).toBe(7)
  })

  it('TOGGLE_EXPAND 再按同一 id 折叠回 null', () => {
    let s = withMsgs({ messageId: 7 })
    s = tuiReducer(s, { type: 'TOGGLE_EXPAND', messageId: 7 })
    expect(s.expandedMessage).toBeNull()
  })

  it('TOGGLE_EXPAND 未知 id 无副作用（no-op）', () => {
    const s = withMsgs({ messageId: 999 })
    expect(s.expandedMessage).toBeNull()
    expect(s.messages).toHaveLength(2)
  })

  it('TOGGLE_EXPAND 切换不同消息: 替换为新 id', () => {
    let s = withMsgs({ messageId: 7 })
    s = tuiReducer(s, { type: 'TOGGLE_EXPAND', messageId: 1 })
    expect(s.expandedMessage).toBe(1)
  })

  it('TRUNCATE 重置 expandedMessage 为 null', () => {
    let s = withMsgs({ messageId: 7 })
    expect(s.expandedMessage).toBe(7)
    s = tuiReducer(s, { type: 'TRUNCATE', messages: s.messages.slice(0, 1), toolCalls: [] })
    expect(s.expandedMessage).toBeNull()
  })

  it('RESET 重置 expandedMessage 为 null', () => {
    let s = withMsgs({ messageId: 7 })
    s = tuiReducer(s, { type: 'RESET' })
    expect(s.expandedMessage).toBeNull()
    expect(s.messages).toHaveLength(0)
  })

  it('MOVE_SELECT 不自动展开（不改动 expandedMessage）', () => {
    let s = withMsgs({ messageId: 7 })
    s = tuiReducer(s, { type: 'MOVE_SELECT', dir: -1 }) // 首按落末尾（索引 1）
    expect(s.selectedMessage).toBe(1)
    expect(s.expandedMessage).toBe(7) // 保持展开消息不变
    s = tuiReducer(s, { type: 'MOVE_SELECT', dir: -1 })
    expect(s.selectedMessage).toBe(0)
    expect(s.expandedMessage).toBe(7)
    s = tuiReducer(s, { type: 'MOVE_SELECT', dir: 1 })
    expect(s.selectedMessage).toBe(1)
    expect(s.expandedMessage).toBe(7)
  })

  it('TOGGLE_EXPAND 缺 messageId 无副作用', () => {
    const s = withMsgs({})
    expect(s.expandedMessage).toBeNull()
  })
})

// ── W0-t7: messageDisplay 纯函数（App 渲染截断/展开共用）───────────────────
describe('W0-t7 messageDisplay', () => {
  it('短文本原样返回（不截断）', () => {
    expect(messageDisplay('hello', false)).toBe('hello')
  })

  it('>4000 字未展开: 截断 + 展开提示', () => {
    const long = 'a'.repeat(5000)
    const out = messageDisplay(long, false)
    expect(out).toHaveLength(4000 + ' … (truncated, Enter 展开)'.length)
    expect(out.startsWith('a'.repeat(4000))).toBe(true)
    expect(out.endsWith('… (truncated, Enter 展开)')).toBe(true)
  })

  it('>4000 字展开: 完整文本（不截断、无提示）', () => {
    const long = 'a'.repeat(5000)
    expect(messageDisplay(long, true)).toBe(long)
  })

  it('恰好 4000 字不截断', () => {
    const s = 'b'.repeat(4000)
    expect(messageDisplay(s, false)).toBe(s)
  })

  it('null/undefined 文本安全返回空串', () => {
    expect(messageDisplay(null, false)).toBe('')
    expect(messageDisplay(undefined, true)).toBe('')
  })
})

// ── W2-t15: MESSAGES_LOAD（启动 resume 历史加载）────────────────────────────
describe('W2-t15 MESSAGES_LOAD', () => {
  it('载入 messages 原样 + 清空选中/展开消息', () => {
    let s = tuiReducer(initialTuiState, { type: 'INPUT', value: 'x' })
    s = tuiReducer(s, { type: 'SUBMIT' })
    s = tuiReducer(s, { type: 'MOVE_SELECT', dir: 1 })
    s = tuiReducer(s, { type: 'TOGGLE_EXPAND', messageId: 1 })
    const loaded = [
      { id: 9, role: 'user', text: '历史消息一' },
      { id: 10, role: 'assistant', text: '历史回复' },
    ]
    const out = tuiReducer(s, { type: 'MESSAGES_LOAD', messages: loaded })
    expect(out.messages).toEqual(loaded)
    expect(out.selectedMessage).toBeNull()
    expect(out.expandedMessage).toBeNull()
  })

  it('非数组忽略（保持现值, 不崩溃）', () => {
    for (const bad of ['nope', 42, null, undefined, { messages: [] }]) {
      const s = tuiReducer(initialTuiState, { type: 'MESSAGES_LOAD', messages: bad })
      expect(s.messages).toEqual([])
      expect(s.selectedMessage).toBeNull()
      expect(s.expandedMessage).toBeNull()
    }
  })

  it('RESET 后仍可载入（resume 不依赖既有消息）', () => {
    const s = tuiReducer(initialTuiState, { type: 'RESET' })
    const out = tuiReducer(s, { type: 'MESSAGES_LOAD', messages: [{ id: 1, role: 'user', text: 'a' }] })
    expect(out.messages).toHaveLength(1)
  })
})

describe('RESET 新会话语义（W1-t12 /clear）', () => {
  it('RESET 清空 dbSessionId（下一条消息建新会话行）', () => {
    const state = { ...initialTuiState, dbSessionId: 7, currentSessionId: 7, usage: { input: 5, output: 6 } }
    const out = tuiReducer(state, { type: 'RESET' })
    expect(out.dbSessionId).toBeNull()
    expect(out.currentSessionId).toBeNull()
    expect(out.usage).toEqual({ input: 0, output: 0 })
  })

  it('RESET 清空 todos / expandedMessage / selectedMessage / 消息', () => {
    const state = {
      ...initialTuiState,
      todos: [{ content: 'x', status: 'pending' }],
      expandedMessage: 3,
      selectedMessage: 2,
      messages: [{ id: 1, role: 'user', text: 'x' }],
    }
    const out = tuiReducer(state, { type: 'RESET' })
    expect(out.todos).toEqual([])
    expect(out.expandedMessage).toBeNull()
    expect(out.selectedMessage).toBeNull()
    expect(out.messages).toEqual([])
  })
})

describe('APPEND_USER — W3-t19 !shell 用户消息追加', () => {
  it('追加 user 消息, 不置 running, 不建 assistant 行', () => {
    const s = tuiReducer(initialTuiState, {
      type: 'APPEND_USER',
      text: '!git status\n\n[shell: !git status]\nclean\n[/shell] (exit 0)',
    })
    expect(s.messages).toHaveLength(1)
    expect(s.messages[0].role).toBe('user')
    expect(s.messages[0].text).toContain('[shell: !git status]')
    expect(s.running).toBe(false)
  })

  it('空文本 no-op', () => {
    expect(tuiReducer(initialTuiState, { type: 'APPEND_USER', text: '' })).toBe(initialTuiState)
    expect(tuiReducer(initialTuiState, { type: 'APPEND_USER' })).toBe(initialTuiState)
  })

  it('消息 id 递增（与既有消息不冲突）', () => {
    const s = tuiReducer({ ...initialTuiState, messages: [{ id: 5, role: 'user', text: 'a' }] }, {
      type: 'APPEND_USER', text: '!dir',
    })
    expect(s.messages.map((m) => m.id)).toEqual([5, 6])
  })
})

// ── W4-t26: dontask 审批模式（SET 接受; CYCLE 不进环）────────────────────────
describe('dontask 审批模式（W4-t26）', () => {
  it('APPROVAL_MODE_SET 接受 dontask', () => {
    const s = tuiReducer(initialTuiState, { type: 'APPROVAL_MODE_SET', mode: 'dontask' })
    expect(s.approvalMode).toBe('dontask')
  })

  it('APPROVAL_MODE_SET 拒绝未知模式（不残留旧值）', () => {
    const s = tuiReducer({ ...initialTuiState, approvalMode: 'manual' }, { type: 'APPROVAL_MODE_SET', mode: 'bogus' })
    expect(s.approvalMode).toBe('manual')
  })

  it('APPROVAL_MODE_CYCLE 只在三态间循环（manual → auto-edits → plan → manual）', () => {
    let s = tuiReducer(initialTuiState, { type: 'APPROVAL_MODE_CYCLE' })
    expect(s.approvalMode).toBe('auto-edits')
    s = tuiReducer(s, { type: 'APPROVAL_MODE_CYCLE' })
    expect(s.approvalMode).toBe('plan')
    s = tuiReducer(s, { type: 'APPROVAL_MODE_CYCLE' })
    expect(s.approvalMode).toBe('manual')
  })

  it('处于 dontask 时 CYCLE 回落 manual（dontask 不进环）', () => {
    const s = tuiReducer({ ...initialTuiState, approvalMode: 'dontask' }, { type: 'APPROVAL_MODE_CYCLE' })
    expect(s.approvalMode).toBe('manual')
  })

  it('APPROVAL_MODE_SET 重置 planDone', () => {
    const s = tuiReducer({ ...initialTuiState, planDone: true }, { type: 'APPROVAL_MODE_SET', mode: 'dontask' })
    expect(s.approvalMode).toBe('dontask')
    expect(s.planDone).toBe(false)
  })
})
