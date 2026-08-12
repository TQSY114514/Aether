// ─────────────────────────────────────────────────────────────────────────────
// keyHandlers.js — opencode 风格键盘架构: 模式解析 + 按键归一 + 模式命令表
// useInput 的全部逻辑从 App.mjs 移到此处的纯函数命令表:
//   dispatchKey(ctx, input, key) → 解析当前模式 → 归一按键 → 查表执行
// ctx = App 每次渲染更新的 ref.current({ state, dispatch, setter们, 动作们 })。
// 纯函数、可单测; 新模态只需加一个 handler 表, 不再堆 if/else。
// ─────────────────────────────────────────────────────────────────────────────
import { SLASH_COMMANDS } from './sessionCommands.js'
import { filterRules } from './permDialog.js' // W4-t25: 权限对话框过滤

// ── 按键归一: ink 的 (input, key) → 稳定 keyId ──────────────────────────────
export function normalizeKey(input, key) {
  if (!key || typeof key !== 'object') return null
  const ctrl = key.ctrl === true
  if (ctrl && input === 'c') return 'ctrl-c'
  if (ctrl && input === 'x') return 'ctrl-x'
  if (ctrl && input === 't') return 'ctrl-t'   // W1-t9: todo 清单面板
  if (ctrl && input === 'f') return 'ctrl-f'   // W3-t22: 模型收藏切换
  if (ctrl && input === 'p') return 'ctrl-p'
  if (ctrl && input === 'n') return 'ctrl-n'
  if (ctrl && input === 'w') return 'ctrl-w'
  if (ctrl && input === 'u') return 'ctrl-u'
  if (ctrl && input === 'k') return 'ctrl-k'
  if (ctrl && input === 'a') return 'ctrl-a'
  if (ctrl && input === 'e') return 'ctrl-e'
  if (key.alt === true && input === 'm') return 'alt-m'
  if (key.alt === true && input === 'v') return 'alt-v'
  if (key.alt === true && key.upArrow === true) return 'alt-up'
  if (key.alt === true && key.downArrow === true) return 'alt-down'
  if (key.upArrow === true) return 'up'
  if (key.downArrow === true) return 'down'
  // W3-t22: F2 最近模型循环（ink 5.2 解析 F2 为 key.name==='f2'; 双防御）
  if (key.f2 === true || key.name === 'f2') return 'f2'
  if (key.leftArrow === true) return 'left'
  if (key.rightArrow === true) return 'right'
  if (key.home === true) return 'home'
  if (key.end === true) return 'end'
  if (key.pageUp === true) return 'pageup'
  if (key.pageDown === true) return 'pagedown'
  // Shift+Enter: 换行(多行输入)而非提交
  if (key.shift === true && (key.return === true || key.enter === true || key.name === 'return' || key.name === 'enter')) return 'shift-enter'
  if (key.return === true || key.enter === true || key.name === 'return' || key.name === 'enter') return 'enter'
  if (key.escape === true) return 'esc'
  if (key.tab === true || key.name === 'tab') {
    if (key.shift === true) return 'shift-tab'   // Shift+Tab 模式循环(行业标准)
    return 'tab'
  }
  if (key.backspace === true || key.name === 'backspace' || key.delete === true || key.name === 'delete' || input === '\x7f' || input === '\b') return 'backspace'
  if (input) return input.length === 1 ? 'char' : 'char'   // 可打印字符(含粘贴)
  return null
}

// ── 模式解析: 优先级 = 模态栈(UI 状态 > reducer 状态) ───────────────────────
export function resolveMode(ctx) {
  // W3-t18: @文件候选面板优先于一切(base 打字继续编辑输入; Tab 归候选导航,
  // 不再走斜杠补全——本模态必须最先解析, 否则 tab 冲突)
  if (ctx.filePick) return 'filePick'
  // W4-t25: /permissions 对话框（模态, 优先于 base 与 todo）
  if (ctx.permDialog) return 'permDialog'
  // W1-t9: todo 面板优先于 base（App 本地状态, 与 paletteOpen 同级）
  if (ctx.todoOpen) return 'todo'
  if (ctx.modelPicker) return 'modelPicker'
  if (ctx.leaderArmed) return 'leader'
  if (ctx.paletteOpen) return 'palette'
  if (ctx.timeline) return 'timeline'
  if (ctx.helpOpen) return 'help'
  if (ctx.rewindOpen) return 'rewind'
  if (ctx.state.askUser) return 'askUser'
  if (ctx.state.planDone) return 'planDone'
  if (ctx.state.pendingPermission) return 'permission'
  // W3-t23: /diff 聚合查看器（App 本地状态, 与 timeline 同级）
  if (ctx.diffView) return 'diffView'
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
  else if (item === 'Timeline') ctx.openTimeline()
  else if (item === 'Export JSONL') ctx.handleCommand('/export')
  else if (item === 'Help') ctx.setHelpOpen(true)
}

// ── 时间线: 祖先链 ↑↓ / Enter 切换 / Esc 关闭 ────────────────────────────────
const timelineMove = (ctx, d) => ctx.setTimeline((t) => ({ ...t, idx: wrap(t.idx, t.sessions.length, d) }))

// ── 权限: ←→ 或 h/l 选择, Enter 确认, Esc/Ctrl+C 拒绝 ───────────────────────
const permDecide = (ctx, decision, remember = false) => {
  // W4-t24 #4: 'a'（always allow）在写入会话规则前, 先同步落持久化层
  // （persistPendingAllow 从 resolveRef 读取待决 perm; 必须在 decidePermission
  // 消费前调用, 否则 pending 已清空）
  if (remember && ctx.persistPendingAllow) ctx.persistPendingAllow()
  ctx.decidePermission({
    decision, remember,
    allowRules: ctx.allowRulesRef.current, sessionId: 'tui', resolveRef: ctx.resolveRef, dispatch: ctx.dispatch,
  })
}

// ── 模式命令表 ──────────────────────────────────────────────────────────────
export const modeHandlers = {
  // W3-t18: @文件候选面板（opencode/Claude Code @mention 风格）。
  // 与 modelPicker 同构: ↑↓/Tab 导航, Enter 插入完整 @path（替换部分 token,
  // 不提交——候选态 Enter 语义写死为"接受并继续编辑"）, Esc 取消, 打字继续
  // 过滤（经 syncFilePick 重算候选）。Tab 在此时归候选导航, 不冲突斜杠补全
  // （resolveMode 中 filePick 优先于 base）。
  filePick: {
    up: (ctx) => ctx.setFilePick((p) => ({ ...p, idx: wrap(p.idx, p.items.length, -1) })),
    'ctrl-p': (ctx) => ctx.setFilePick((p) => ({ ...p, idx: wrap(p.idx, p.items.length, -1) })),
    down: (ctx) => ctx.setFilePick((p) => ({ ...p, idx: wrap(p.idx, p.items.length, 1) })),
    'ctrl-n': (ctx) => ctx.setFilePick((p) => ({ ...p, idx: wrap(p.idx, p.items.length, 1) })),
    tab: (ctx) => ctx.setFilePick((p) => ({ ...p, idx: wrap(p.idx, p.items.length, 1) })),
    'shift-tab': (ctx) => ctx.setFilePick((p) => ({ ...p, idx: wrap(p.idx, p.items.length, -1) })),
    enter: (ctx) => ctx.acceptFilePick(),
    esc: (ctx) => ctx.setFilePick(null),
    backspace: (ctx) => { ctx.dispatch({ type: 'INPUT_BACKSPACE' }); ctx.syncFilePick() },
    char: (ctx, input) => {
      if (input === backspaceChar) { ctx.dispatch({ type: 'INPUT_BACKSPACE' }); ctx.syncFilePick(); return }
      ctx.dispatch({ type: 'INPUT', value: input })
      ctx.syncFilePick()
    },
  },

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
      else if (ch === 'r') ctx.openRewind()
      else if (ch === 'q') ctx.dispatch({ type: 'QUIT_INTENT' })
      // W3-t20: 外部编辑器（opencode ctrl+x e; $EDITOR/$VISUAL 回退 notepad）
      else if (ch === 'e') { if (ctx.openEditor) ctx.openEditor() }
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
    // 单键直达(Codex 模式): y=once / a=always / n=deny
    'char:y': (ctx) => { ctx.setPermIdx(0); permDecide(ctx, 'allow') },
    'char:a': (ctx) => { ctx.setPermIdx(0); permDecide(ctx, 'allow', true) },
    'char:n': (ctx) => { ctx.setPermIdx(0); permDecide(ctx, 'deny') },
    esc: (ctx) => { ctx.setPermIdx(0); permDecide(ctx, 'deny') },
    'ctrl-c': (ctx) => { ctx.setPermIdx(0); permDecide(ctx, 'deny') },
    enter: (ctx) => {
      const decision = ['allow', 'always', 'deny'][ctx.permIdx]
      ctx.setPermIdx(0)
      permDecide(ctx, decision === 'always' ? 'allow' : decision, decision === 'always')
    },
  },

  // W4-t25: /permissions 交互对话框（Claude Code 同款）:
  // ↑↓/Ctrl+P/N 导航（按过滤后列表）; 'd' 删除选中规则; backspace 删过滤字符;
  // 其余字符过滤（palette 式）; Esc 关闭。
  permDialog: {
    up: (ctx) => ctx.setPermDialog((p) => ({ ...p, idx: wrap(p.idx, filterRules(p.rules, p.filter).length, -1) })),
    'ctrl-p': (ctx) => ctx.setPermDialog((p) => ({ ...p, idx: wrap(p.idx, filterRules(p.rules, p.filter).length, -1) })),
    down: (ctx) => ctx.setPermDialog((p) => ({ ...p, idx: wrap(p.idx, filterRules(p.rules, p.filter).length, 1) })),
    'ctrl-n': (ctx) => ctx.setPermDialog((p) => ({ ...p, idx: wrap(p.idx, filterRules(p.rules, p.filter).length, 1) })),
    esc: (ctx) => ctx.setPermDialog(null),
    'char:d': (ctx) => { if (ctx.permDialogDelete) ctx.permDialogDelete() },
    backspace: (ctx) => ctx.setPermDialog((p) => ({ ...p, filter: p.filter.slice(0, -1), idx: 0 })),
    char: (ctx, input) => ctx.setPermDialog((p) => ({ ...p, filter: (p.filter + input).toLowerCase(), idx: 0 })),
  },

  diff: {
    enter: (ctx) => ctx.dispatch({ type: 'TOOL_EXPAND', index: ctx.state.expandedTool }),
    esc: (ctx) => ctx.dispatch({ type: 'TOOL_EXPAND', index: ctx.state.expandedTool }),
    'char:r': (ctx) => ctx.doRollback(),
  },

  // W3-t23: /diff 查看器模态: ↑↓ 切文件 · ←→ 切"全部/当前文件"视图 · Esc 关闭
  diffView: {
    up: (ctx) => ctx.setDiffView((v) => ({ ...v, idx: wrap(v.idx, v.files.length, -1) })),
    'ctrl-p': (ctx) => ctx.setDiffView((v) => ({ ...v, idx: wrap(v.idx, v.files.length, -1) })),
    down: (ctx) => ctx.setDiffView((v) => ({ ...v, idx: wrap(v.idx, v.files.length, 1) })),
    'ctrl-n': (ctx) => ctx.setDiffView((v) => ({ ...v, idx: wrap(v.idx, v.files.length, 1) })),
    left: (ctx) => ctx.setDiffView((v) => ({ ...v, mode: v.mode === 'all' ? 'file' : 'all' })),
    right: (ctx) => ctx.setDiffView((v) => ({ ...v, mode: v.mode === 'all' ? 'file' : 'all' })),
    esc: (ctx) => ctx.setDiffView(null),
  },

  // ask_user 结构化提问(Claude Code 式): ↑↓ 选择选项 / Enter 确认(多问依次) / Esc 取消
  askUser: {
    up: (ctx) => ctx.dispatch({ type: 'ASK_USER_MOVE', dir: -1 }),
    'ctrl-p': (ctx) => ctx.dispatch({ type: 'ASK_USER_MOVE', dir: -1 }),
    down: (ctx) => ctx.dispatch({ type: 'ASK_USER_MOVE', dir: 1 }),
    'ctrl-n': (ctx) => ctx.dispatch({ type: 'ASK_USER_MOVE', dir: 1 }),
    enter: (ctx) => {
      const au = ctx.state.askUser
      if (!au) return
      const q = au.questions[au.qIdx]
      const answers = [...au.answers, q && q.options[au.idx] ? q.options[au.idx].label : '']
      if (au.qIdx + 1 >= au.questions.length) {
        // 全部回答完 → resolve 给 agent
        ctx.dispatch({ type: 'ASK_USER_DONE' })
        const resolve = ctx.askUserResolveRef.current
        ctx.askUserResolveRef.current = null
        if (resolve) resolve(answers)
      } else {
        ctx.dispatch({ type: 'ASK_USER_NEXT' })
      }
    },
    esc: (ctx) => {
      ctx.dispatch({ type: 'ASK_USER_DONE' })
      const resolve = ctx.askUserResolveRef.current
      ctx.askUserResolveRef.current = null
      if (resolve) resolve(null)
    },
  },

  // plan 模式完成后的三选项(Claude ExitPlanMode / Gemini 双选项 / Codex 三选项)
  planDone: {
    up: (ctx) => ctx.setPlanChoice((i) => wrap(i, 3, -1)),
    'ctrl-p': (ctx) => ctx.setPlanChoice((i) => wrap(i, 3, -1)),
    down: (ctx) => ctx.setPlanChoice((i) => wrap(i, 3, 1)),
    'ctrl-n': (ctx) => ctx.setPlanChoice((i) => wrap(i, 3, 1)),
    enter: (ctx) => {
      const choice = ['auto', 'manual', 'continue'][ctx.planChoice]
      ctx.dispatch({ type: 'PLAN_DONE', on: false })
      if (choice === 'auto') { ctx.dispatch({ type: 'APPROVAL_MODE_SET', mode: 'auto-edits' }); ctx.startPlan() }
      else if (choice === 'manual') { ctx.dispatch({ type: 'APPROVAL_MODE_SET', mode: 'manual' }); ctx.startPlan() }
      // 'continue': 留在 plan 模式继续规划
    },
    esc: (ctx) => ctx.dispatch({ type: 'PLAN_DONE', on: false }),
    'char:c': (ctx) => ctx.dispatch({ type: 'PLAN_DONE', on: false }),
  },

  // rewind 检查点面板(Claude checkpoint / Codex backtrack): 恢复快照 + 截断对话
  rewind: {
    up: (ctx) => ctx.setRewindIdx((i) => wrap(i, ctx.rewindPoints.length, -1)),
    'ctrl-p': (ctx) => ctx.setRewindIdx((i) => wrap(i, ctx.rewindPoints.length, -1)),
    down: (ctx) => ctx.setRewindIdx((i) => wrap(i, ctx.rewindPoints.length, 1)),
    'ctrl-n': (ctx) => ctx.setRewindIdx((i) => wrap(i, ctx.rewindPoints.length, 1)),
    enter: (ctx) => { ctx.doRewind(); ctx.setRewindOpen(false) },
    esc: (ctx) => ctx.setRewindOpen(false),
  },

  // 帮助屏: 任意键关闭(lazygit '?' 自动生成式; 我们为静态表)
  help: {
    esc: (ctx) => ctx.setHelpOpen(false),
    enter: (ctx) => ctx.setHelpOpen(false),
    char: (ctx) => ctx.setHelpOpen(false),
    up: (ctx) => ctx.setHelpOpen(false),
    down: (ctx) => ctx.setHelpOpen(false),
  },

  // W1-t9: todo 清单面板（只读展示, 任意键关闭——不吞后续打字）
  todo: {
    esc: (ctx) => ctx.setTodoOpen(false),
    enter: (ctx) => ctx.setTodoOpen(false),
    char: (ctx) => ctx.setTodoOpen(false),
    'ctrl-t': (ctx) => ctx.setTodoOpen(false),
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
    char: (ctx, input) => {
      // 光标先置行尾 → 逐字符追加(与既有 steering 行为一致; todo 4 光标感知后)
      ctx.dispatch({ type: 'INPUT_LINE_END' })
      ctx.dispatch({ type: 'INPUT', value: input })
    },
  },

  base: {
    'alt-m': (ctx) => { if (!ctx.state.input) ctx.dispatch({ type: 'MODE_CYCLE' }) },
    // W1-t9: Ctrl+T todo 清单面板（Claude Code 同款; 空输入才响应）
    'ctrl-t': (ctx) => { if (!ctx.state.input) ctx.setTodoOpen(!ctx.todoOpen) },
    'ctrl-p': (ctx) => {
      if (!ctx.state.input) { ctx.setPaletteOpen(true); ctx.setPaletteIdx(0); ctx.setPaletteFilter('') }
    },
    // W3-t22: Ctrl+F 收藏/取消当前模型（空输入才响应, 不吞输入框打字）
    'ctrl-f': (ctx) => { if (!ctx.state.input && ctx.toggleModelFavorite) ctx.toggleModelFavorite() },
    // W3-t22: F2 循环最近使用模型（空输入才响应）
    f2: (ctx) => { if (!ctx.state.input && ctx.cycleRecentModel) ctx.cycleRecentModel() },
    'ctrl-x': (ctx) => { if (!ctx.state.input) ctx.setLeaderArmed(true) },
    // Ctrl+C: 运行中 → 打断进入 follow-up; 空闲 → 退出
    'ctrl-c': (ctx) => {
      if (ctx.state.running) {
        ctx.dispatch({ type: 'STATUS', text: 'interrupted — type follow-up + Enter, or Ctrl+C to cancel' })
        // 光标置行尾: steering 输入按"逐字符追加"既有语义工作(todo 4 光标感知后)
        ctx.dispatch({ type: 'INPUT_LINE_END' })
        ctx.dispatch({ type: 'STEER_MODE', on: true })
      } else {
        ctx.dispatch({ type: 'QUIT_INTENT' })
      }
    },
    'shift-tab': (ctx) => {
      // 审批模式循环(全行业标准): manual → auto-edits → plan
      const modes = ['manual', 'auto-edits', 'plan']
      const i = modes.indexOf(ctx.state.approvalMode)
      const next = modes[(i + 1) % modes.length]
      ctx.dispatch({ type: 'APPROVAL_MODE_SET', mode: next })
      ctx.dispatch({ type: 'STATUS', text: `approval: ${next}${next === 'plan' ? ' — 只读规划' : ''} (Shift+Tab 循环)` })
    },
    'char:?': (ctx) => { if (!ctx.state.input) ctx.setHelpOpen(true) },
    'char:x': (ctx) => {
      // x 上下文菜单(打开命令面板; lazygit x 菜单模式)
      if (!ctx.state.input) { ctx.setPaletteOpen(true); ctx.setPaletteIdx(0); ctx.setPaletteFilter('') }
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
      ctx.dispatch({ type: 'INPUT', value: hist[next], replace: true })
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
      ctx.dispatch({ type: 'INPUT', value: hist[next], replace: true })
    },
    'alt-up': (ctx) => { if (!ctx.state.input) ctx.dispatch({ type: 'MOVE_SELECT', dir: -1 }) },
    'alt-down': (ctx) => { if (!ctx.state.input) ctx.dispatch({ type: 'MOVE_SELECT', dir: 1 }) },
    pageup: (ctx) => { if (!ctx.state.input) ctx.setScrollOffset((o) => o + 1) },
    pagedown: (ctx) => { if (!ctx.state.input) ctx.setScrollOffset((o) => Math.max(0, o - 1)) },
    esc: (ctx) => {
      const s = ctx.state
      if (s.input) {
        // 有输入: 清空 + 草稿保留(opencode prompt.clear: ≥20 字符入历史; 斜杠态=取消补全)
        const sm = slashMatches(s)
        if (sm.length === 0 && s.input.length >= 20) {
          ctx.historyRef.current = [...ctx.historyRef.current.filter((x) => x !== s.input), s.input].slice(-100)
        }
        ctx.dispatch({ type: 'INPUT', value: '' })
        ctx.setSlashIdx(0)
        return
      }
      // 空输入: 分层 Esc —— 第一次 armed, 1.5s 内再按退出(双击 Esc 退出)
      if (ctx.escArmedRef.current) {
        ctx.escArmedRef.current = false
        ctx.dispatch({ type: 'QUIT_INTENT' })
        return
      }
      ctx.escArmedRef.current = true
      ctx.dispatch({ type: 'STATUS', text: 'Esc 再按一次退出 · Ctrl+X r rewind 检查点' })
    },
    tab: (ctx) => {
      const s = ctx.state
      // 运行中 Tab=排队下一条(Codex 模式, 不打断 agent)
      if (s.running && s.input) {
        ctx.injectSteering('tui', s.input)
        ctx.dispatch({ type: 'STEER_ENQUEUE', text: s.input })
        ctx.dispatch({ type: 'INPUT', value: '' })
        ctx.dispatch({ type: 'STATUS', text: `queued follow-up (${s.steeringQueue.length + 1})` })
        return
      }
      const sm = slashMatches(s)
      if (sm.length > 0) { ctx.dispatch({ type: 'INPUT', value: sm[0], replace: true }); ctx.setSlashIdx(0) }
    },
    enter: (ctx) => {
      const s = ctx.state
      // W0-t7: 选中消息 + 空输入 + 非运行 → Enter 展开/折叠长消息（不提交）
      if (!s.input && !s.running && s.selectedMessage != null) {
        const m = s.messages[s.selectedMessage]
        if (m) { ctx.dispatch({ type: 'TOGGLE_EXPAND', messageId: m.id }); return }
      }
      // W3-t21: 无选中消息 + 空输入 + 思考块存在 → Enter 切换思考块折叠/展开（不提交）。
      // 优先级: 选中消息展开 > 思考块展开 > 提交（无内容/运行中回落既有行为）。
      if (!s.input && !s.running && s.selectedMessage == null && s.thinking && s.thinking.text) {
        ctx.dispatch({ type: 'THINKING_TOGGLE' }); return
      }
      const text = s.input.trim()
      if (!text || s.running) return
      const sm = slashMatches(s)
      if (sm.length > 0 && ctx.slashIdx >= 0 && ctx.slashIdx < sm.length) {
        const full = sm[ctx.slashIdx]
        if (s.input !== full) { ctx.dispatch({ type: 'INPUT', value: full, replace: true }); ctx.setSlashIdx(0); return }
      }
      ctx.historyRef.current = [...ctx.historyRef.current.filter((x) => x !== text), text].slice(-100)
      ctx.historyIdxRef.current = -1
      ctx.dispatch({ type: 'INPUT', value: '' })
      ctx.setScrollOffset(0)
      // opencode: exit / quit / :q 直接退出
      if (text === 'exit' || text === 'quit' || text === ':q') { ctx.dispatch({ type: 'QUIT_INTENT' }); return }
      if (text.startsWith('/')) { ctx.handleCommand(text); return }
      // W3-t19: !shell 模式（'!' 开头且非 '!!' 转义）→ 不提交 agent, 执行命令
      if (text.startsWith('!') && !text.startsWith('!!') && ctx.runShell) { ctx.runShell(text); return }
      ctx.dispatch({ type: 'SUBMIT' })
      ctx.startSession(text)
    },
    'alt-v': (ctx) => {
      const s = ctx.state
      if (!s.running && !s.input && s.toolCalls.length > 0) ctx.expandDiff(s.toolCalls.length - 1)
    },
    // ── 输入编辑(todo 4): 光标移动/删词/清行/行首尾; 仅输入非空时捕获(不吞键) ──
    left: (ctx) => { if (ctx.state.input) ctx.dispatch({ type: 'INPUT_LEFT' }) },
    right: (ctx) => { if (ctx.state.input) ctx.dispatch({ type: 'INPUT_RIGHT' }) },
    home: (ctx) => { if (ctx.state.input) ctx.dispatch({ type: 'INPUT_HOME' }) },
    end: (ctx) => { if (ctx.state.input) ctx.dispatch({ type: 'INPUT_END' }) },
    'ctrl-w': (ctx) => { if (ctx.state.input) ctx.dispatch({ type: 'INPUT_WORD_BACKWARD' }) },
    'ctrl-u': (ctx) => { if (ctx.state.input) ctx.dispatch({ type: 'INPUT_CLEAR_LINE' }) },
    'ctrl-k': (ctx) => { if (ctx.state.input) ctx.dispatch({ type: 'INPUT_TO_LINE_END' }) },
    'ctrl-a': (ctx) => { if (ctx.state.input) ctx.dispatch({ type: 'INPUT_LINE_HOME' }) },
    'ctrl-e': (ctx) => { if (ctx.state.input) ctx.dispatch({ type: 'INPUT_LINE_END' }) },
    // Shift+Enter: 多行输入换行(todo 5), 不提交
    'shift-enter': (ctx) => { ctx.dispatch({ type: 'INPUT', value: '\n' }) },
    char: (ctx, input) => {
      if (input === backspaceChar) { ctx.dispatch({ type: 'INPUT_BACKSPACE' }); if (ctx.syncFilePick) ctx.syncFilePick(); return }
      // 在光标处插入(含粘贴的多字符/换行; reducer 处理光标推进)
      ctx.dispatch({ type: 'INPUT', value: input })
      // W3-t18: 输入变化后同步 @候选面板（词首 @ 打开, 否则关闭）
      if (ctx.syncFilePick) ctx.syncFilePick()
    },
    backspace: (ctx) => { ctx.dispatch({ type: 'INPUT_BACKSPACE' }); if (ctx.syncFilePick) ctx.syncFilePick() },
  },
}

// ── 调度入口: 模式 → 归一 → keybinding 映射 → 查表; 模态无匹配则吞键 ───────
export function dispatchKey(ctx, input, key) {
  const mode = resolveMode(ctx)
  let kid = normalizeKey(input, key)
  if (kid == null) return
  // keybindings.json 重绑/禁用: { "shift-tab": "ctrl-t", "char:?": null }
  // 单字符键用具体键名映射('char:?'), 通用 'char' 不参与映射
  if (ctx.keybindings) {
    const specific = kid === 'char' && input ? `char:${input}` : null
    const mapKey = specific && Object.prototype.hasOwnProperty.call(ctx.keybindings, specific) ? specific : kid
    if (Object.prototype.hasOwnProperty.call(ctx.keybindings, mapKey)) kid = ctx.keybindings[mapKey]
  }
  if (kid == null) return
  const table = modeHandlers[mode]
  let handler = null
  // 单字符: 具体键('char:? / char:y / char:r')优先, 通用 'char' 兜底
  if (kid === 'char' && input) {
    handler = table ? (table[`char:${input}`] || null) : null
  }
  if (!handler) handler = table ? (table[kid] || null) : null
  if (handler) { handler(ctx, input); return }
  // 非模态: 未认出的键静默忽略(避免打字丢失)
}
