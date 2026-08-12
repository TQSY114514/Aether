// ─────────────────────────────────────────────────────────────────────────────
// keyHandlers.test.js — opencode 风格键盘架构单测（模式解析 + 按键归一 + 命令表）
// 重构核心收益: useInput 的 if/else 金字塔 → 纯函数命令表, 可直接断言。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest'
import { normalizeKey, resolveMode, dispatchKey } from '../../tui/keyHandlers.js'
import { initialTuiState, tuiReducer } from '../../tui/reducer.js'

// mock ctx: 默认 stub, 测试覆写需要的字段
function makeCtx(overrides = {}) {
  const base = {
    state: initialTuiState,
    dispatch: vi.fn(),
    modelPicker: null, setModelPicker: vi.fn(),
    timeline: null, setTimeline: vi.fn(),
    paletteOpen: false, setPaletteOpen: vi.fn(),
    paletteIdx: 0, setPaletteIdx: vi.fn(),
    paletteFilter: '', setPaletteFilter: vi.fn(),
    permIdx: 0, setPermIdx: vi.fn(),
    leaderArmed: false, setLeaderArmed: vi.fn(),
    scrollOffset: 0, setScrollOffset: vi.fn(),
    slashIdx: 0, setSlashIdx: vi.fn(),
    helpOpen: false, setHelpOpen: vi.fn(),
    rewindOpen: false, setRewindOpen: vi.fn(),
    rewindIdx: 0, setRewindIdx: vi.fn(),
    rewindPoints: [], rewindOpen2: null,
    planChoice: 0, setPlanChoice: vi.fn(),
    escArmedRef: { current: false },
    keybindings: null,
    openRewind: vi.fn(), doRewind: vi.fn(), startPlan: vi.fn(),
    PALETTE_ITEMS: ['New chat', 'Model', 'History (sessions)', 'Quit'],
    historyRef: { current: [] },
    historyIdxRef: { current: -1 },
    openModelPicker: vi.fn(), openSessions: vi.fn(), openTimeline: vi.fn(),
    startSession: vi.fn(), handleCommand: vi.fn(),
    expandDiff: vi.fn(), doRollback: vi.fn(),
    decidePermission: vi.fn(),
    allowRulesRef: { current: {} }, resolveRef: { current: null },
    injectSteering: vi.fn(),
    ...overrides,
  }
  return base
}

// 派发辅助: 直接调用 dispatchKey(ctx, input, key)
const press = (ctx, key, input = '') => dispatchKey(ctx, input, key)

describe('normalizeKey — 按键归一', () => {
  it('方向键/翻页/回车/Esc/Tab/退格 → 稳定 keyId', () => {
    expect(normalizeKey('', { upArrow: true })).toBe('up')
    expect(normalizeKey('', { downArrow: true })).toBe('down')
    expect(normalizeKey('', { leftArrow: true })).toBe('left')
    expect(normalizeKey('', { rightArrow: true })).toBe('right')
    expect(normalizeKey('', { pageUp: true })).toBe('pageup')
    expect(normalizeKey('', { pageDown: true })).toBe('pagedown')
    expect(normalizeKey('', { return: true })).toBe('enter')
    expect(normalizeKey('', { escape: true })).toBe('esc')
    expect(normalizeKey('', { tab: true })).toBe('tab')
    expect(normalizeKey('', { backspace: true })).toBe('backspace')
  })

  it('修饰键组合 → 专有 keyId', () => {
    expect(normalizeKey('p', { ctrl: true })).toBe('ctrl-p')
    expect(normalizeKey('c', { ctrl: true })).toBe('ctrl-c')
    expect(normalizeKey('x', { ctrl: true })).toBe('ctrl-x')
    expect(normalizeKey('n', { ctrl: true })).toBe('ctrl-n')
    expect(normalizeKey('m', { alt: true })).toBe('alt-m')
    expect(normalizeKey('v', { alt: true })).toBe('alt-v')
    expect(normalizeKey('', { alt: true, upArrow: true })).toBe('alt-up')
  })

  it('真实终端退格 \x7f 和 \b → backspace(不再当字符追加)', () => {
    expect(normalizeKey('\x7f', {})).toBe('backspace')
    expect(normalizeKey('\b', {})).toBe('backspace')
    expect(normalizeKey('', { delete: true })).toBe('backspace')
  })

  it('可打印字符 → char', () => {
    expect(normalizeKey('a', {})).toBe('char')
    expect(normalizeKey('m', {})).toBe('char')   // m 不再被吞
    expect(normalizeKey(null, {})).toBeNull()
  })
})

describe('resolveMode — 模式优先级', () => {
  it('模态栈优先级: modelPicker > leader > palette > timeline > permission > diff > steering > base', () => {
    expect(resolveMode(makeCtx({ modelPicker: { models: [], idx: 0, filter: '' } }))).toBe('modelPicker')
    expect(resolveMode(makeCtx({ leaderArmed: true }))).toBe('leader')
    expect(resolveMode(makeCtx({ paletteOpen: true }))).toBe('palette')
    expect(resolveMode(makeCtx({ timeline: { sessions: [], idx: 0 } }))).toBe('timeline')
    expect(resolveMode(makeCtx({ state: { ...initialTuiState, pendingPermission: { name: 'bash' } } }))).toBe('permission')
    expect(resolveMode(makeCtx({ state: { ...initialTuiState, expandedTool: 0 } }))).toBe('diff')
    expect(resolveMode(makeCtx({ state: { ...initialTuiState, steeringMode: true } }))).toBe('steering')
    expect(resolveMode(makeCtx())).toBe('base')
  })
})

describe('base 模式 — 普通输入态', () => {
  it('字符输入追加(含 m, 不再被拦截)', () => {
    const ctx = makeCtx()
    press(ctx, {}, 'm')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT', value: 'm' })
  })

  it('退格删除(\x7f 真实终端)', () => {
    const ctx = makeCtx()
    press(ctx, {}, '\x7f')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT_BACKSPACE' })
  })

  it('空输入 Alt+m 切模式; 输入非空时 Alt+m 忽略(不吞字)', () => {
    const ctx = makeCtx()
    press(ctx, { alt: true }, 'm')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'MODE_CYCLE' })
    const ctx2 = makeCtx({ state: { ...initialTuiState, input: 'abc' } })
    ctx2.dispatch.mockClear()
    press(ctx2, { alt: true }, 'm')
    expect(ctx2.dispatch).not.toHaveBeenCalled()
  })

  it('Enter 提交: 历史记录 + 清空 + SUBMIT + startSession', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, input: 'hello' } })
    press(ctx, { return: true }, '')
    expect(ctx.historyRef.current).toContain('hello')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT', value: '' })
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'SUBMIT' })
    expect(ctx.startSession).toHaveBeenCalledWith('hello')
  })

  it('运行中 Enter 忽略', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, input: 'hello', running: true } })
    press(ctx, { return: true }, '')
    expect(ctx.startSession).not.toHaveBeenCalled()
  })

  it('exit/quit/:q 直接退出', () => {
    for (const t of ['exit', 'quit', ':q']) {
      const ctx = makeCtx({ state: { ...initialTuiState, input: t } })
      press(ctx, { return: true }, '')
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'QUIT_INTENT' })
      expect(ctx.startSession).not.toHaveBeenCalled()
    }
  })

  it('斜杠命令 Enter → handleCommand 而非 startSession', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, input: '/help' } })
    press(ctx, { return: true }, '')
    expect(ctx.handleCommand).toHaveBeenCalledWith('/help')
    expect(ctx.startSession).not.toHaveBeenCalled()
  })

  it('空输入 ↑ 回填历史, ↓ 回空', () => {
    const ctx = makeCtx({ historyRef: { current: ['first', 'second'] } })
    press(ctx, { upArrow: true }, '')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT', value: 'second' })
    press(ctx, { downArrow: true }, '')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT', value: '' })
  })

  it('Esc 清空: ≥20 字符草稿入历史', () => {
    const draft = 'this is a long draft message over twenty chars'
    const ctx = makeCtx({ state: { ...initialTuiState, input: draft } })
    press(ctx, { escape: true }, '')
    expect(ctx.historyRef.current).toContain(draft)
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT', value: '' })
  })

  it('Ctrl+C: 运行中 → steering 打断; 空闲 → 退出', () => {
    const running = makeCtx({ state: { ...initialTuiState, running: true } })
    press(running, { ctrl: true }, 'c')
    expect(running.dispatch).toHaveBeenCalledWith({ type: 'STEER_MODE', on: true })
    const idle = makeCtx()
    press(idle, { ctrl: true }, 'c')
    expect(idle.dispatch).toHaveBeenCalledWith({ type: 'QUIT_INTENT' })
  })
})

describe('modelPicker 模式', () => {
  it('输入过滤 + Enter 确认 + Esc 关闭', () => {
    const models = [{ id: 1, model_name: 'gpt-4o', provider_id: 1, is_primary: 1, provider_name: 'openai' }]
    const ctx = makeCtx({ modelPicker: { models, idx: 0, filter: '' } })
    press(ctx, {}, 'g')
    expect(ctx.setModelPicker).toHaveBeenCalledWith(expect.any(Function))
    press(ctx, { escape: true }, '')
    expect(ctx.setModelPicker).toHaveBeenCalledWith(null)
    ctx.modelPicker = { models, idx: 0, filter: 'g' }
    press(ctx, { return: true }, '')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'MODEL_SET', name: 'gpt-4o' })
  })

  it('↑↓ 循环移动', () => {
    const models = [{ id: 1 }, { id: 2 }]
    const ctx = makeCtx({ modelPicker: { models, idx: 0, filter: '' } })
    press(ctx, { upArrow: true }, '')   // 0 - 1 = -1 → wrap 到 1
    expect(ctx.setModelPicker).toHaveBeenCalledWith(expect.any(Function))
  })

  it('过滤后 Enter 选中过滤列表中的模型(不是原始列表)', () => {
    const models = [
      { id: 1, model_name: 'gpt-4o', provider_id: 1, is_primary: 1, provider_name: 'openai' },
      { id: 2, model_name: 'gpt-4o-mini', provider_id: 1, is_primary: 0, provider_name: 'openai' },
      { id: 3, model_name: 'claude-3-5-sonnet', provider_id: 2, is_primary: 0, provider_name: 'anthropic' },
    ]
    const ctx = makeCtx({ modelPicker: { models, idx: 0, filter: 'claude' } })
    press(ctx, { return: true }, '')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'MODEL_SET', name: 'claude-3-5-sonnet' })
  })
})

describe('palette 模式', () => {
  it('过滤 + Enter 分发动作', () => {
    const ctx = makeCtx({ paletteOpen: true })
    press(ctx, {}, 'm')   // filter 'm' → Model
    expect(ctx.setPaletteFilter).toHaveBeenCalled()
    ctx.paletteFilter = 'm'
    ctx.paletteIdx = 0    // Model
    press(ctx, { return: true }, '')
    expect(ctx.openModelPicker).toHaveBeenCalled()
  })
})

describe('permission 模式', () => {
  it('←→ 选择, Enter 确认, Esc 拒绝', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, pendingPermission: { name: 'bash' } } })
    press(ctx, { rightArrow: true }, '')
    expect(ctx.setPermIdx).toHaveBeenCalled()
    ctx.permIdx = 1   // Always
    press(ctx, { return: true }, '')
    expect(ctx.decidePermission).toHaveBeenCalledWith(expect.objectContaining({ decision: 'allow', remember: true }))
    press(ctx, { escape: true }, '')
    expect(ctx.decidePermission).toHaveBeenCalledWith(expect.objectContaining({ decision: 'deny' }))
  })
})

describe('diff 模式', () => {
  it('Enter/Esc 关闭, r 回滚', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, expandedTool: 1 } })
    press(ctx, { return: true }, '')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'TOOL_EXPAND', index: 1 })
    press(ctx, {}, 'r')
    expect(ctx.doRollback).toHaveBeenCalled()
  })
})

describe('steering 模式', () => {
  it('Enter 注入 follow-up, Ctrl+C 取消', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, steeringMode: true, input: 'keep going' } })
    press(ctx, { return: true }, '')
    expect(ctx.injectSteering).toHaveBeenCalledWith('tui', 'keep going')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'STEER_ENQUEUE', text: 'keep going' })
    const ctx2 = makeCtx({ state: { ...initialTuiState, steeringMode: true } })
    press(ctx2, { ctrl: true }, 'c')
    expect(ctx2.dispatch).toHaveBeenCalledWith({ type: 'STEER_MODE', on: false })
  })
})

describe('leader 模式', () => {
  it('char 键触发动作并解除待命', () => {
    const ctx = makeCtx({ leaderArmed: true })
    press(ctx, {}, 'm')
    expect(ctx.setLeaderArmed).toHaveBeenCalledWith(false)
    expect(ctx.openModelPicker).toHaveBeenCalled()
    const ctx2 = makeCtx({ leaderArmed: true })
    press(ctx2, {}, 'g')
    expect(ctx2.openTimeline).toHaveBeenCalled()
  })
})

describe('timeline 模式', () => {
  it('Enter 切换到选中会话', () => {
    const sessions = [{ id: 3, title: 'child' }, { id: 1, title: 'root' }]
    const ctx = makeCtx({ timeline: { sessions, idx: 0 } })
    press(ctx, { return: true }, '')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'SESSION_USE', sessionId: 3 })
    expect(ctx.setTimeline).toHaveBeenCalledWith(null)
  })
})

describe('斜杠补全', () => {
  it('输入 /m 后 ↑↓ 循环移动选择', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, input: '/m' } })
    press(ctx, { upArrow: true }, '')
    expect(ctx.setSlashIdx).toHaveBeenCalledWith(expect.any(Function))
  })

  it('Tab 填入第一个匹配', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, input: '/m' } })
    press(ctx, { tab: true }, '')
    expect(ctx.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'INPUT' }))
  })

  it('完全匹配时 Enter 直接执行(不重复填入)', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, input: '/help' }, slashIdx: 0 })
    press(ctx, { return: true }, '')
    expect(ctx.handleCommand).toHaveBeenCalledWith('/help')
  })
})

// 防回归: 真实 reducer 链上跑一次 Enter 全流程
describe('审批模式(Shift+Tab)与 planDone', () => {
  it('Shift+Tab 循环审批模式 manual → auto-edits → plan', () => {
    const ctx = makeCtx()
    press(ctx, { tab: true, shift: true }, '')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'APPROVAL_MODE_SET', mode: 'auto-edits' })
  })

  it('审批单键 y/a/n 直达(Codex 模式)', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, pendingPermission: { name: 'bash' } } })
    press(ctx, {}, 'y')
    expect(ctx.decidePermission).toHaveBeenCalledWith(expect.objectContaining({ decision: 'allow', remember: false }))
    ctx.decidePermission.mockClear()
    press(ctx, {}, 'a')
    expect(ctx.decidePermission).toHaveBeenCalledWith(expect.objectContaining({ decision: 'allow', remember: true }))
    ctx.decidePermission.mockClear()
    press(ctx, {}, 'n')
    expect(ctx.decidePermission).toHaveBeenCalledWith(expect.objectContaining({ decision: 'deny' }))
  })

  it('planDone 三选项: 自动接受 → auto-edits + startPlan', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, planDone: true }, planChoice: 0, setPlanChoice: vi.fn(), startPlan: vi.fn() })
    press(ctx, { return: true }, '')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'PLAN_DONE', on: false })
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'APPROVAL_MODE_SET', mode: 'auto-edits' })
    expect(ctx.startPlan).toHaveBeenCalled()
  })

  it('planDone Esc = 继续规划(留在 plan 模式)', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, planDone: true }, startPlan: vi.fn() })
    press(ctx, { escape: true }, '')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'PLAN_DONE', on: false })
    expect(ctx.startPlan).not.toHaveBeenCalled()
  })
})

describe("'?'/x 面板与 rewind", () => {
  it('空输入 ? 打开帮助屏; 输入中 ? 正常输入', () => {
    const ctx = makeCtx({ setHelpOpen: vi.fn() })
    press(ctx, {}, '?')
    expect(ctx.setHelpOpen).toHaveBeenCalledWith(true)
    const ctx2 = makeCtx({ state: { ...initialTuiState, input: 'abc' } })
    press(ctx2, {}, '?')
    expect(ctx2.setHelpOpen).not.toHaveBeenCalled()
  })

  it('空输入 x 打开命令面板', () => {
    const ctx = makeCtx({ setPaletteOpen: vi.fn(), setPaletteIdx: vi.fn(), setPaletteFilter: vi.fn() })
    press(ctx, {}, 'x')
    expect(ctx.setPaletteOpen).toHaveBeenCalledWith(true)
  })

  it('rewind 面板: Enter 触发 doRewind 并关闭', () => {
    const ctx = makeCtx({
      rewindOpen: true, rewindPoints: [{ i: 2, card: { name: 'edit' } }], rewindIdx: 0,
      setRewindOpen: vi.fn(), setRewindIdx: vi.fn(), doRewind: vi.fn(),
    })
    press(ctx, { return: true }, '')
    expect(ctx.doRewind).toHaveBeenCalled()
    expect(ctx.setRewindOpen).toHaveBeenCalledWith(false)
  })

  it('分层 Esc: 空输入第一次 armed, 第二次退出(双击 Esc)', () => {
    const escArmedRef = { current: false }
    const ctx = makeCtx({ escArmedRef, openRewind: vi.fn() })
    press(ctx, { escape: true }, '')
    expect(escArmedRef.current).toBe(true)
    expect(ctx.dispatch).not.toHaveBeenCalledWith({ type: 'QUIT_INTENT' })
    press(ctx, { escape: true }, '')
    expect(escArmedRef.current).toBe(false)
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'QUIT_INTENT' })
  })

  it('rewind 移到 leader: ctrl+x r', () => {
    const ctx = makeCtx({ leaderArmed: true, openRewind: vi.fn(), setLeaderArmed: vi.fn() })
    press(ctx, {}, 'r')
    expect(ctx.openRewind).toHaveBeenCalled()
  })

  it('Tab 运行中排队下一条(Codex 模式)', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, running: true, input: 'next task' }, injectSteering: vi.fn() })
    press(ctx, { tab: true }, '')
    expect(ctx.injectSteering).toHaveBeenCalledWith('tui', 'next task')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'STEER_ENQUEUE', text: 'next task' })
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT', value: '' })
  })

  it('keybindings 重绑/禁用', () => {
    const ctx = makeCtx({ keybindings: { 'char:?': null, 'shift-tab': 'ctrl-t' } })
    press(ctx, {}, '?')
    expect(ctx.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'APPROVAL_MODE_CYCLE' }))
    // '?' 被禁用 → 无动作
    expect(ctx.setHelpOpen).not.toHaveBeenCalled()
  })
})

describe('askUser 模式(ask_user 工具结构化提问)', () => {
  const mkAsk = (over = {}) => {
    const state = {
      ...initialTuiState,
      askUser: { questions: [{ question: 'Q1', options: [{ label: 'A' }, { label: 'B' }] }], qIdx: 0, idx: 0, answers: [] },
    }
    return makeCtx({ state, askUserResolveRef: { current: null }, ...over })
  }

  it('Enter 回答唯一问题 → resolve 选项数组并关闭面板', () => {
    const ctx = mkAsk()
    let resolved = null
    ctx.askUserResolveRef.current = (a) => { resolved = a }
    ctx.dispatch({ type: 'ASK_USER_SET', questions: ctx.state.askUser.questions })
    press(ctx, { return: true }, '')
    expect(resolved).toEqual(['A'])
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'ASK_USER_DONE' })
  })

  it('多问题依次回答, 最后一个 resolve 全部答案', () => {
    const ctx = makeCtx({
      state: {
        ...initialTuiState,
        askUser: {
          questions: [
            { question: 'Q1', options: [{ label: 'A' }, { label: 'B' }] },
            { question: 'Q2', options: [{ label: 'X' }, { label: 'Y' }] },
          ],
          qIdx: 0, idx: 1, answers: [],
        },
      },
      askUserResolveRef: { current: null },
    })
    let resolved = null
    ctx.askUserResolveRef.current = (a) => { resolved = a }
    press(ctx, { return: true }, '')   // 第一问(选 B) → NEXT
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'ASK_USER_NEXT' })
    ctx.state.askUser = { ...ctx.state.askUser, qIdx: 1, idx: 0, answers: ['B'] }
    press(ctx, { return: true }, '')   // 第二问(选 X) → resolve
    expect(resolved).toEqual(['B', 'X'])
  })

  it('Esc 取消 → resolve null', () => {
    const ctx = mkAsk()
    let resolved = 'unset'
    ctx.askUserResolveRef.current = (a) => { resolved = a }
    press(ctx, { escape: true }, '')
    expect(resolved).toBeNull()
  })

  it('↑↓ 移动选项(循环)', () => {
    const ctx = mkAsk()
    press(ctx, { downArrow: true }, '')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'ASK_USER_MOVE', dir: 1 })
  })
})

describe('cursor editing + multiline keys (W0-B2 todo 4/5)', () => {
  it('normalizeKey: home/end/ctrl-w/u/k/a/e/shift-enter 归一', () => {
    expect(normalizeKey('', { home: true })).toBe('home')
    expect(normalizeKey('', { end: true })).toBe('end')
    expect(normalizeKey('w', { ctrl: true })).toBe('ctrl-w')
    expect(normalizeKey('u', { ctrl: true })).toBe('ctrl-u')
    expect(normalizeKey('k', { ctrl: true })).toBe('ctrl-k')
    expect(normalizeKey('a', { ctrl: true })).toBe('ctrl-a')
    expect(normalizeKey('e', { ctrl: true })).toBe('ctrl-e')
    expect(normalizeKey('', { return: true, shift: true })).toBe('shift-enter')
    expect(normalizeKey('', { name: 'return', shift: true })).toBe('shift-enter')
    expect(normalizeKey('', { return: true })).toBe('enter') // 无 Shift 仍是提交
  })

  it('base: ←→/Home/End 移动光标(仅输入非空时捕获)', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, input: 'abc', inputCursor: 2 } })
    press(ctx, { leftArrow: true }, '')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT_LEFT' })
    press(ctx, { rightArrow: true }, '')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT_RIGHT' })
    press(ctx, { home: true }, '')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT_HOME' })
    press(ctx, { end: true }, '')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT_END' })
    // 空输入不捕获(不吞键)
    const empty = makeCtx()
    press(empty, { leftArrow: true }, '')
    press(empty, { home: true }, '')
    expect(empty.dispatch).not.toHaveBeenCalled()
  })

  it('base: Ctrl+W/U/K/A/E 编辑键(空输入不捕获)', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, input: 'hello world', inputCursor: 6 } })
    press(ctx, { ctrl: true }, 'w')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT_WORD_BACKWARD' })
    press(ctx, { ctrl: true }, 'u')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT_CLEAR_LINE' })
    press(ctx, { ctrl: true }, 'k')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT_TO_LINE_END' })
    press(ctx, { ctrl: true }, 'a')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT_LINE_HOME' })
    press(ctx, { ctrl: true }, 'e')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT_LINE_END' })
    const empty = makeCtx()
    press(empty, { ctrl: true }, 'w')
    expect(empty.dispatch).not.toHaveBeenCalled()
  })

  it('base: Shift+Enter 插入换行而非提交', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, input: 'line1', inputCursor: 5 } })
    press(ctx, { return: true, shift: true }, '')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT', value: '\n' })
    expect(ctx.startSession).not.toHaveBeenCalled()
    expect(ctx.dispatch).not.toHaveBeenCalledWith({ type: 'SUBMIT' })
  })

  it('base: 单字符与多字符粘贴都经 INPUT 在光标处插入, 换行不剥离', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, input: 'abc', inputCursor: 1 } })
    press(ctx, {}, 'x')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT', value: 'x' })
    press(ctx, {}, 'line1\nline2')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT', value: 'line1\nline2' })
  })

  it('steering 模式仍逐字符追加(先把光标移到行尾, 兼容既有行为)', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, steeringMode: true, input: 'ab', inputCursor: 0 } })
    press(ctx, {}, 'x')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT_LINE_END' })
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT', value: 'x' })
  })

  it('Enter 提交后历史/斜杠补全走 replace 语义(不重复拼接)', () => {
    const ctx = makeCtx({ state: { ...initialTuiState, input: '/m', inputCursor: 2 } })
    press(ctx, { tab: true }, '')
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'INPUT', value: '/memory', replace: true })
  })
})

describe('集成: dispatchKey + tuiReducer', () => {
  it('输入 → Enter → running → 结束', () => {
    let state = initialTuiState
    const dispatch = (a) => { state = tuiReducer(state, a) }
    const ctx = makeCtx({ state, dispatch })
    ctx.state = state
    press(ctx, {}, 'hi')
    ctx.state = state
    expect(state.input).toBe('hi')
    ctx.startSession.mockImplementation(() => { dispatch({ type: 'AGENT_END' }) })
    press(ctx, { return: true }, '')
    expect(state.input).toBe('')
    expect(state.running).toBe(false)
  })
})
