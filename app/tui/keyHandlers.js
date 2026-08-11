// ─────────────────────────────────────────────────────────────────────────────
// keyHandlers.js — opencode 风格键盘架构: 模式解析 + 按键归一 + 模式命令表
// useInput 的全部逻辑从 App.mjs 移到此处的纯函数命令表:
//   dispatchKey(ctx, input, key) → 解析当前模式 → 归一按键 → 查表执行
// ctx = App 每次渲染更新的 ref.current({ state, dispatch, setter们, 动作们 })。
// 纯函数、可单测; 新模态只需加一个 handler 表, 不再堆 if/else。
// ─────────────────────────────────────────────────────────────────────────────
import { SLASH_COMMANDS } from './sessionCommands.js'

// ── 按键归一: ink 的 (input, key) → 稳定 keyId ──────────────────────────────
export function normalizeKey(input, key) {
  if (!key || typeof key !== 'object') return null
  const ctrl = key.ctrl === true
  if (ctrl && input === 'c') return 'ctrl-c'
  if (ctrl && input === 'x') return 'ctrl-x'
  if (ctrl && input === 'p') return 'ctrl-p'
  if (ctrl && input === 'n') return 'ctrl-n'
  if (key.alt === true && input === 'm') return 'alt-m'
  if (key.alt === true && input === 'v') return 'alt-v'
  if (key.alt === true && key.upArrow === true) return 'alt-up'
  if (key.alt === true && key.downArrow === true) return 'alt-down'
  if (key.upArrow === true) return 'up'
  if (key.downArrow === true) return 'down'
  if (key.leftArrow === true) return 'left'
  if (key.rightArrow === true) return 'right'
  if (key.pageUp === true) return 'pageup'
  if (key.pageDown === true) return 'pagedown'
  if (key.return === true || key.enter === true || key.name === 'return' || key.name === 'enter') return 'enter'
  if (key.escape === true) return 'esc'
  if (key.tab === true || key.name === 'tab') return 'tab'
  if (key.backspace === true || key.name === 'backspace' || key.delete === true || key.name === 'delete' || input === '\x7f' || input === '\b') return 'backspace'
  if (input) return input.length === 1 ? 'char' : 'char'   // 可打印字符(含粘贴)
  return null
}

// ── 模式解析: 优先级 = 模态栈(UI 状态 > reducer 状态) ───────────────────────
export function resolveMode(ctx) {
  if (ctx.modelPicker) return 'modelPicker'
  if (ctx.leaderArmed) return 'leader'
  if (ctx.paletteOpen) return 'palette'
  if (ctx.timeline) return 'timeline'
  if (ctx.state.pendingPermission) return 'permission'
  if (ctx.state.expandedTool != null) return 'diff'
  if (ctx.state.steeringMode) return 'steering'
  return 'base'
}

// ── 工具函数 ────────────────────────────────────────────────────────────────
const slashMatches = (s) => (s.input.startsWith('/') ? SLASH_COMMANDS.filter((c) => c.startsWith(s.input)) : [])
const wrap = (i, len, d) => (i + d + Math.max(1, len)) % Math.max(1, len)
const backspaceChar = '\x7f'

// ── 模型选择器: ↑↓ 循环 / 输入过滤 / Enter 确认 / Esc 取消 ───────────────────
const pickerMove = (ctx, d) => ctx.setModelPicker((p) => ({ ...p, idx: wrap(p.idx, p.models.length, d) }))
const pickerChar = (ctx, input) => ctx.setModelPicker((p) => ({ ...p, filter: (p.filter + input).toLowerCase(), idx: 0 }))

// ── 面板: 过滤 + ↑↓ 循环 + Enter 执行 ───────────────────────────────────────
const paletteItems = (ctx) => ctx.PALETTE_ITEMS.filter((i) => i.toLowerCase().includes(ctx.paletteFilter))
const paletteRun = (ctx, item) => {
  if (item === 'New chat') ctx.dispatch({ type: 'RESET' })
  else if (item === 'Quit') ctx.dispatch({ type: 'QUIT_INTENT' })
  else if (item === 'Model') ctx.openModelPicker()
  else if (item === 'History (sessions)') ctx.openSessions()
}

// ── 时间线: 祖先链 ↑↓ / Enter 切换 / Esc 关闭 ────────────────────────────────
const timelineMove = (ctx, d) => ctx.setTimeline((t) => ({ ...t, idx: wrap(t.idx, t.sessions.length, d) }))

// ── 权限: ←→ 或 h/l 选择, Enter 确认, Esc/Ctrl+C 拒绝 ───────────────────────
const permDecide = (ctx, decision, remember = false) => ctx.decidePermission({
  decision, remember,
  allowRules: ctx.allowRulesRef.current, sessionId: 'tui', resolveRef: ctx.resolveRef, dispatch: ctx.dispatch,
})

// ── 模式命令表 ──────────────────────────────────────────────────────────────
export const modeHandlers = {
  modelPicker: {
    up: (ctx) => pickerMove(ctx, -1),
    'ctrl-p': (ctx) => pickerMove(ctx, -1),
    down: (ctx) => pickerMove(ctx, 1),
    'ctrl-n': (ctx) => pickerMove(ctx, 1),
    pageup: (ctx) => ctx.setModelPicker((p) => ({ ...p, idx: Math.max(0, p.idx - 10) })),
    pagedown: (ctx) => ctx.setModelPicker((p) => ({ ...p, idx: Math.min(p.models.length - 1, p.idx + 10) })),
    esc: (ctx) => ctx.setModelPicker(null),
    enter: (ctx) => {
      // 确认用过滤后的 flat 列表(与渲染高亮一致)——否则过滤后 Enter 选错模型
      const filter = (ctx.modelPicker.filter || '').toLowerCase()
      const flat = ctx.modelPicker.models.filter((m) =>
        !filter || `${m.provider_name} ${m.model_name}`.toLowerCase().includes(filter))
      const m = flat[ctx.modelPicker.idx]
      ctx.setModelPicker(null)
      if (m) {
        ctx.dispatch({ type: 'MODEL_SET', name: m.model_name })
        ctx.dispatch({ type: 'STATUS', text: `model: ${m.provider_name}/${m.model_name}${m.is_primary ? ' (primary)' : ''}` })
      }
    },
    backspace: (ctx) => ctx.setModelPicker((p) => ({ ...p, filter: p.filter.slice(0, -1), idx: 0 })),
    char: (ctx, input) => pickerChar(ctx, input),
  },

  // leader key 待命: 任意键解除, 仅 char 有动作(opencode timed leader)
  leader: {
    char: (ctx, input) => {
      ctx.setLeaderArmed(false)
      const ch = input.toLowerCase()
      if (ch === 'm') ctx.openModelPicker()
      else if (ch === 'n') { ctx.dispatch({ type: 'RESET' }); ctx.dispatch({ type: 'STATUS', text: 'new session' }) }
      else if (ch === 'l') ctx.openSessions()
      else if (ch === 'g') ctx.openTimeline()
      else if (ch === 'q') ctx.dispatch({ type: 'QUIT_INTENT' })
    },
  },

  palette: {
    up: (ctx) => ctx.setPaletteIdx((i) => wrap(i, paletteItems(ctx).length, -1)),
    'ctrl-p': (ctx) => ctx.setPaletteIdx((i) => wrap(i, paletteItems(ctx).length, -1)),
    down: (ctx) => ctx.setPaletteIdx((i) => wrap(i, paletteItems(ctx).length, 1)),
    'ctrl-n': (ctx) => ctx.setPaletteIdx((i) => wrap(i, paletteItems(ctx).length, 1)),
    esc: (ctx) => { ctx.setPaletteOpen(false); ctx.setPaletteFilter('') },
    enter: (ctx) => {
      const item = paletteItems(ctx)[ctx.paletteIdx]
      ctx.setPaletteOpen(false); ctx.setPaletteFilter('')
      if (item) paletteRun(ctx, item)
    },
    backspace: (ctx) => ctx.setPaletteFilter((f) => f.slice(0, -1)),
    char: (ctx, input) => ctx.setPaletteFilter((f) => (f + input).toLowerCase()),
  },

  timeline: {
    up: (ctx) => timelineMove(ctx, -1),
    'ctrl-p': (ctx) => timelineMove(ctx, -1),
    down: (ctx) => timelineMove(ctx, 1),
    'ctrl-n': (ctx) => timelineMove(ctx, 1),
    esc: (ctx) => ctx.setTimeline(null),
    enter: (ctx) => {
      const s = ctx.timeline.sessions[ctx.timeline.idx]
      ctx.setTimeline(null)
      if (s) {
        ctx.dispatch({ type: 'SESSION_USE', sessionId: s.id })
        ctx.dispatch({ type: 'STATUS', text: `switched to session #${s.id} ${s.title || ''}`.trim() })
      }
    },
  },

  permission: {
    left: (ctx) => ctx.setPermIdx((i) => wrap(i, 3, -1)),
    'char:h': (ctx) => ctx.setPermIdx((i) => wrap(i, 3, -1)),
    right: (ctx) => ctx.setPermIdx((i) => wrap(i, 3, 1)),
    'char:l': (ctx) => ctx.setPermIdx((i) => wrap(i, 3, 1)),
    esc: (ctx) => { ctx.setPermIdx(0); permDecide(ctx, 'deny') },
    'ctrl-c': (ctx) => { ctx.setPermIdx(0); permDecide(ctx, 'deny') },
    enter: (ctx) => {
      const decision = ['allow', 'always', 'deny'][ctx.permIdx]
      ctx.setPermIdx(0)
      permDecide(ctx, decision === 'always' ? 'allow' : decision, decision === 'always')
    },
  },

  diff: {
    enter: (ctx) => ctx.dispatch({ type: 'TOOL_EXPAND', index: ctx.state.expandedTool }),
    esc: (ctx) => ctx.dispatch({ type: 'TOOL_EXPAND', index: ctx.state.expandedTool }),
    'char:r': (ctx) => ctx.doRollback(),
  },

  steering: {
    'ctrl-c': (ctx) => { ctx.dispatch({ type: 'STEER_MODE', on: false }); ctx.dispatch({ type: 'STATUS', text: 'follow-up cancelled' }) },
    enter: (ctx) => {
      const text = ctx.state.input.trim()
      if (!text) return
      ctx.injectSteering('tui', text)
      ctx.dispatch({ type: 'STEER_ENQUEUE', text })
      ctx.dispatch({ type: 'INPUT', value: '' })
      ctx.dispatch({ type: 'STEER_MODE', on: false })
      ctx.dispatch({ type: 'STATUS', text: 'follow-up queued' })
    },
    backspace: (ctx) => ctx.dispatch({ type: 'INPUT_BACKSPACE' }),
    char: (ctx, input) => ctx.dispatch({ type: 'INPUT', value: ctx.state.input + input }),
  },

  base: {
    'alt-m': (ctx) => { if (!ctx.state.input) ctx.dispatch({ type: 'MODE_CYCLE' }) },
    'ctrl-p': (ctx) => {
      if (!ctx.state.input) { ctx.setPaletteOpen(true); ctx.setPaletteIdx(0); ctx.setPaletteFilter('') }
    },
    'ctrl-x': (ctx) => { if (!ctx.state.input) ctx.setLeaderArmed(true) },
    // Ctrl+C: 运行中 → 打断进入 follow-up; 空闲 → 退出
    'ctrl-c': (ctx) => {
      if (ctx.state.running) {
        ctx.dispatch({ type: 'STATUS', text: 'interrupted — type follow-up + Enter, or Ctrl+C to cancel' })
        ctx.dispatch({ type: 'STEER_MODE', on: true })
      } else {
        ctx.dispatch({ type: 'QUIT_INTENT' })
      }
    },
    up: (ctx) => {
      const s = ctx.state
      const sm = slashMatches(s)
      // 斜杠补全优先(输入 /m 时 ↑↓ 移动候选), 再是空输入历史回填
      if (sm.length > 0) { ctx.setSlashIdx((i) => wrap(i, sm.length, -1)); return }
      if (s.input) return
      const hist = ctx.historyRef.current
      if (hist.length === 0) return
      const next = ctx.historyIdxRef.current < 0 ? hist.length - 1 : Math.max(0, ctx.historyIdxRef.current - 1)
      ctx.historyIdxRef.current = next
      ctx.dispatch({ type: 'INPUT', value: hist[next] })
    },
    down: (ctx) => {
      const s = ctx.state
      const sm = slashMatches(s)
      if (sm.length > 0) { ctx.setSlashIdx((i) => wrap(i, sm.length, 1)); return }
      if (s.input) return
      const hist = ctx.historyRef.current
      if (ctx.historyIdxRef.current < 0) return
      const next = ctx.historyIdxRef.current + 1
      if (next >= hist.length) { ctx.historyIdxRef.current = -1; ctx.dispatch({ type: 'INPUT', value: '' }); return }
      ctx.historyIdxRef.current = next
      ctx.dispatch({ type: 'INPUT', value: hist[next] })
    },
    'alt-up': (ctx) => { if (!ctx.state.input) ctx.dispatch({ type: 'MOVE_SELECT', dir: -1 }) },
    'alt-down': (ctx) => { if (!ctx.state.input) ctx.dispatch({ type: 'MOVE_SELECT', dir: 1 }) },
    pageup: (ctx) => { if (!ctx.state.input) ctx.setScrollOffset((o) => o + 10) },
    pagedown: (ctx) => { if (!ctx.state.input) ctx.setScrollOffset((o) => Math.max(0, o - 10)) },
    esc: (ctx) => {
      const s = ctx.state
      if (!s.input) return
      const sm = slashMatches(s)
      // opencode prompt.clear: ≥20 字符草稿入历史; 斜杠态=取消补全不保留
      if (sm.length === 0 && s.input.length >= 20) {
        ctx.historyRef.current = [...ctx.historyRef.current.filter((x) => x !== s.input), s.input].slice(-100)
      }
      ctx.dispatch({ type: 'INPUT', value: '' })
      ctx.setSlashIdx(0)
    },
    tab: (ctx) => {
      const sm = slashMatches(ctx.state)
      if (sm.length > 0) { ctx.dispatch({ type: 'INPUT', value: sm[0] }); ctx.setSlashIdx(0) }
    },
    enter: (ctx) => {
      const s = ctx.state
      const text = s.input.trim()
      if (!text || s.running) return
      const sm = slashMatches(s)
      if (sm.length > 0 && ctx.slashIdx >= 0 && ctx.slashIdx < sm.length) {
        const full = sm[ctx.slashIdx]
        if (s.input !== full) { ctx.dispatch({ type: 'INPUT', value: full }); ctx.setSlashIdx(0); return }
      }
      ctx.historyRef.current = [...ctx.historyRef.current.filter((x) => x !== text), text].slice(-100)
      ctx.historyIdxRef.current = -1
      ctx.dispatch({ type: 'INPUT', value: '' })
      ctx.setScrollOffset(0)
      // opencode: exit / quit / :q 直接退出
      if (text === 'exit' || text === 'quit' || text === ':q') { ctx.dispatch({ type: 'QUIT_INTENT' }); return }
      if (text.startsWith('/')) { ctx.handleCommand(text); return }
      ctx.dispatch({ type: 'SUBMIT' })
      ctx.startSession(text)
    },
    'alt-v': (ctx) => {
      const s = ctx.state
      if (!s.running && !s.input && s.toolCalls.length > 0) ctx.expandDiff(s.toolCalls.length - 1)
    },
    char: (ctx, input) => {
      if (input === backspaceChar) { ctx.dispatch({ type: 'INPUT_BACKSPACE' }); return }
      ctx.dispatch({ type: 'INPUT', value: ctx.state.input + input })
    },
    backspace: (ctx) => ctx.dispatch({ type: 'INPUT_BACKSPACE' }),
  },
}

// ── 调度入口: 模式 → 归一 → 查表; 模态无匹配则吞键, base 兜底字符输入 ───────
export function dispatchKey(ctx, input, key) {
  const mode = resolveMode(ctx)
  const kid = normalizeKey(input, key)
  if (kid == null) return
  const table = modeHandlers[mode]
  let handler = table ? (table[kid] || null) : null
  // 单字符: 先匹配具体键('char:r' / 'char:h'), 无则落到通用 'char' 兜底
  if (!handler && kid === 'char' && input) {
    handler = table ? (table[`char:${input}`] || table.char || null) : null
  }
  if (handler) { handler(ctx, input); return }
  // 非模态: 未认出的键静默忽略(避免打字丢失)
}
