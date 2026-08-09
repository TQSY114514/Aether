import { useEffect, useMemo, useState } from 'react'
import { useStore, ensureTaskListeners, taskApi, type TaskInfo, type TaskStatus } from '@/store'
import { t } from '@/utils/i18n'
import { classifyAgentMode } from '../../../electron/llm/modeClassifier'
import { ListTodo, X, Play, Pause, ClipboardList, Loader2, CheckCircle2, CircleSlash, AlertTriangle, Cpu, Shield, ExternalLink, Trash2 } from 'lucide-react'

// ───────────────────────────────────────────────────────────────────────────
// Background-task panel (docs/p0-agent-workbench.md 功能 A / A5).
//
// A task is a full agent run (`runToolLoop`) in its own child session, started
// from here and reported back over the `task:*` events. This panel is the
// cockpit: compose a task (prompt + model), watch its live progress line, cancel
// it, and open its session to read the complete trace.
//
// Rendered as a non-modal drawer next to the sidebar — deliberately NOT a
// `ViewType` page, because the page switch lives in App.tsx and this feature
// must not touch it. Non-modal matters: clicking a task opens its session in the
// main area while the panel stays put, so you can read one task and start another.
// Mounted by Sidebar and anchored at its inline-start edge (260px = Sidebar's
// width), so collapsing the sidebar hides the drawer too; reopening restores it.
// z-[100] keeps it under PermissionDialog (z-101) — a background task's confirm
// prompt must stay clickable on top of the panel.
//
// Decisions worth knowing:
//  • Cancelled/errored tasks STAY in the list (a cancelled run is still a result
//    worth reading); the trash button removes a finished row on demand.
//  • Clicking ANY row — running included — opens that task's session.
//    `selectSession` works mid-run: the chunk listener routes by sessionId, so
//    the child session's assistant bubble streams live.
//  • The input is cleared only after a successful start, so a failed start
//    doesn't eat the prompt.
//  • The list is main-process memory (plan 明确不做 #2): it survives closing and
//    reopening the panel via the store, and is re-hydrated from `task.list()` on
//    mount, but an app restart empties it.
// ───────────────────────────────────────────────────────────────────────────

// The `task.*` / `sidebar.nav.tasks` i18n keys are added to i18n.base.json
// centrally. Until they land, `t()` echoes the key — so fall back to a readable
// label instead of rendering "task.title". A no-op once the keys exist.
// Exported for Sidebar's nav label (same temporary shim, one implementation).
export function tx(key: string, fallback: string, ...args: (string | number)[]): string {
  const s = t(key, ...args)
  if (s !== key) return s
  return args.length ? fallback.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? '')) : fallback
}

const STATUS_ICON = {
  queued: Loader2,
  plan: ClipboardList,
  paused: Pause,
  running: Loader2,
  done: CheckCircle2,
  cancelled: CircleSlash,
  error: AlertTriangle,
  pending: Loader2,
} as const

const STATUS_COLOR: Record<TaskStatus, string> = {
  queued: 'var(--text-muted)',
  plan: 'var(--accent)',
  paused: 'var(--warning)',
  running: 'var(--accent)',
  done: 'var(--success)',
  cancelled: 'var(--text-muted)',
  error: 'var(--error)',
  pending: 'var(--text-muted)',
}

// Running tasks pinned to the top, then everything else newest-first.
function sortTasks(tasks: TaskInfo[]): TaskInfo[] {
  return [...tasks].sort((a, b) => {
    const ra = a.status === 'running' ? 0 : 1
    const rb = b.status === 'running' ? 0 : 1
    if (ra !== rb) return ra - rb
    return (b.createdAt || 0) - (a.createdAt || 0)
  })
}

function timeOf(createdAt: number): string {
  if (!createdAt) return ''
  const d = new Date(createdAt)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function TaskPanel() {
  const tasksOpen = useStore((s) => s.tasksOpen)
  const setTasksOpen = useStore((s) => s.setTasksOpen)
  const tasks = useStore((s) => s.tasks)
  const removeTask = useStore((s) => s.removeTask)
  const selectSession = useStore((s) => s.selectSession)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const sessionConfigs = useStore((s) => s.sessionConfigs)
  const providers = useStore((s) => s.providers)
  const allModels = useStore((s) => s.allModels)
  const language = useStore((s) => s.language)

  const [input, setInput] = useState('')
  const [pickedModelId, setPickedModelId] = useState<number | null>(null)
  const [planMode, setPlanMode] = useState(false)
  // 用户是否显式操作过 ask/plan 切换：一旦手动选择，即以手动为准（「可手覆」）；
  // 未操作时由 classifyAgentMode 按输入内容兜底判定默认模式。
  const [modeTouched, setModeTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Install the task listeners (idempotent — also called by ensureAllListeners)
  // and hydrate from the main process so tasks started before this mount, or
  // before the panel was ever opened, show up.
  useEffect(() => {
    ensureTaskListeners()
    const api = taskApi()
    if (!api) return
    let cancelled = false
    api.list().then((list) => {
      if (cancelled || !Array.isArray(list)) return
      const upsert = useStore.getState().upsertTask
      for (const item of list) {
        if (item && typeof item.id === 'number') upsert(item)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Default model = the current session's, else the primary/first known model.
  const defaultModelId = useMemo(() => {
    if (currentSessionId) {
      const cfgModelId = sessionConfigs[currentSessionId]?.modelId
      if (cfgModelId) return cfgModelId
    }
    const primary = allModels.find((m) => m.is_primary)
    return primary?.id ?? allModels[0]?.id ?? null
  }, [currentSessionId, sessionConfigs, allModels])
  const modelId = pickedModelId ?? defaultModelId

  const modelGroups = useMemo(() => providers
    .map((p) => {
      const models = allModels.filter((m) => m.provider_id === p.id)
      return models.length ? { providerId: p.id, providerName: p.name, models } : null
    })
    .filter((g): g is { providerId: number; providerName: string; models: typeof allModels } => g !== null),
  [providers, allModels])

  const statusLabel = useMemo<Record<TaskStatus, string>>(() => ({
    queued: tx('task.status.queued', '排队中'),
    plan: tx('task.status.plan', '规划中'),
    paused: tx('task.status.paused', '已暂停'),
    running: tx('task.status.running', '运行中'),
    done: tx('task.status.done', '已完成'),
    cancelled: tx('task.status.cancelled', '已取消'),
    error: tx('task.status.error', '出错'),
    pending: tx('task.status.pending', '排队中'),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [language])

  const sorted = useMemo(() => sortTasks(tasks), [tasks])
  const runningCount = useMemo(() => tasks.filter((x) => x.status === 'running').length, [tasks])

  const start = async () => {
    const content = input.trim()
    if (!content || busy) return
    const api = taskApi()
    if (!api) { setError(tx('task.unavailable', '后台任务需要完全重启应用后才可用')); return }
    if (!modelId) { setError(tx('task.no_model', '请先在「模型」页配置一个可用模型')); return }
    setBusy(true)
    setError(null)
    try {
      // agentMode 'ask' — dangerous tools raise the normal permission dialog,
      // which PermissionDialog renders globally (plan A5), so a background task
      // can be approved from any session. planMode queues the task in the
      // plan state first — the agent investigates read-only, then the task
      // waits for approval (the ▶ 恢复 button approves it).
      // Default mode = shared classifier (todo 7); explicit manual toggle wins.
      const cls = classifyAgentMode({ prompt: content }).mode
      const effectivePlan = modeTouched ? planMode : cls === 'plan'
      const r = await api.start({ content, modelId, agentMode: effectivePlan ? 'plan' : 'ask' })
      if (r?.error) { setError(r.error); return }
      // `task:started` is the source of truth for the row; this upsert is only a
      // fallback so the task is visible even if that broadcast is missed. Merge
      // is by id, so the event's canonical title/createdAt win.
      if (typeof r?.taskId === 'number') {
        useStore.getState().upsertTask({
          id: r.taskId,
          sessionId: r.sessionId,
          status: 'running',
          title: content.slice(0, 40),
        })
      }
      setInput('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const openTask = (task: TaskInfo) => {
    if (!task.sessionId) return
    selectSession(task.sessionId)
    setCurrentView('chat')
  }

  const cancelTask = (task: TaskInfo) => {
    const api = taskApi()
    if (!api) return
    // Optimistic: the `task:cancelled` event confirms it.
    api.cancel(task.id).catch(() => {})
  }

  const pauseTask = (task: TaskInfo) => {
    const api = taskApi()
    if (!api) return
    // Optimistic: engine broadcasts a 'status' progress event but no dedicated
    // task:changed for pause/resume, so flip the row locally first.
    useStore.getState().upsertTask({ id: task.id, status: 'paused' })
    api.pause(task.id).catch(() => {})
  }

  const resumeTask = (task: TaskInfo) => {
    const api = taskApi()
    if (!api) return
    // resume also approves plan-mode tasks (plan → queued/running per engine).
    useStore.getState().upsertTask({ id: task.id, status: 'running' })
    api.resume(task.id).catch(() => {})
  }

  if (!tasksOpen) return null

  return (
    <aside className="fixed top-0 bottom-0 w-[360px] z-[100] flex flex-col animate-blur-fade"
      style={{
        insetInlineStart: 260,
        backgroundColor: 'var(--bg-primary)',
        borderInlineEnd: '1px solid var(--border)',
        boxShadow: '0 0 24px rgba(0,0,0,0.14)',
      }}>
      {/* Header */}
      <div className="h-12 flex items-center gap-2 px-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <ListTodo size={15} style={{ color: 'var(--accent)' }} />
        <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {tx('task.title', '后台任务')}
        </span>
        {runningCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums" style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
            {runningCount}
          </span>
        )}
        <button onClick={() => setTasksOpen(false)}
          className="ms-auto p-1.5 rounded-md hover:bg-[var(--border)] transition-colors"
          title={tx('task.close', '关闭')} aria-label={tx('task.close', '关闭')}>
          <X size={14} className="text-[var(--text-muted)]" />
        </button>
      </div>

      {/* Composer */}
      <div className="p-2.5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="rounded-xl border p-2" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); start() } }}
            rows={3} placeholder={tx('task.placeholder', '描述一个让 agent 在后台独立完成的任务…')}
            className="w-full bg-transparent resize-none outline-none text-[12px] leading-relaxed" />
          <div className="flex items-center gap-1.5 mt-1.5">
            <Cpu size={12} className="text-gray-400 shrink-0" />
            <select value={String(modelId ?? '')} onChange={(e) => setPickedModelId(Number(e.target.value) || null)}
              className="flex-1 min-w-0 text-[11px] rounded-lg border px-2 py-1 outline-none bg-[var(--content-bg)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              title={tx('task.model', '任务使用的模型')}>
              <option value="" disabled>{tx('task.select_model', '选择模型')}</option>
              {modelGroups.map((g) => (
                <optgroup key={g.providerId} label={g.providerName}>
                  {g.models.map((m) => (
                    <option key={m.id} value={m.id}>{m.display_name || m.model_name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button onClick={start} disabled={busy || !input.trim()}
              className="shrink-0 flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {busy ? tx('task.starting', '启动中…') : tx('task.start', '开始任务')}
            </button>
          </div>
          <div className="flex items-center gap-1 mt-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <Shield size={10} className="shrink-0" />
            <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => { setPlanMode(false); setModeTouched(true) }}
                className="px-1.5 py-0.5 rounded-md transition-colors"
                style={planMode ? { color: 'var(--text-muted)' } : { backgroundColor: 'var(--border)', color: 'var(--text-primary)' }}>
                {tx('task.mode_ask', 'ask')}
              </button>
              <button onClick={() => { setPlanMode(true); setModeTouched(true) }}
                className="px-1.5 py-0.5 rounded-md transition-colors"
                style={planMode ? { backgroundColor: 'var(--border)', color: 'var(--text-primary)' } : { color: 'var(--text-muted)' }}
                title={tx('task.mode_plan_hint', '先只读调查并给出计划，批准后才执行')}>
                {tx('task.mode_plan', 'plan')}
              </button>
            </div>
            <span className="flex-1 truncate">
              {planMode
                ? tx('task.mode_plan_desc', '只读调查 → 计划 → 等批准')
                : tx('task.mode_ask_desc', '危险操作弹确认框')}
            </span>
            <kbd className="ms-auto shrink-0 rounded border px-1 font-mono" style={{ borderColor: 'var(--border)' }}>Ctrl+↵</kbd>
          </div>
        </div>
        {error && (
          <p className="text-[11px] mt-1.5 px-0.5" role="alert" style={{ color: 'var(--error)' }}>⚠ {error}</p>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scroll-bounce">
        {sorted.length === 0 && (
          <div className="flex flex-col items-center gap-2 text-center px-4 py-10">
            <ListTodo size={22} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {tx('task.empty', '还没有后台任务。写下任务描述、选个模型，agent 会在独立会话里执行。')}
            </p>
          </div>
        )}
        {sorted.map((task) => {
          const color = STATUS_COLOR[task.status]
          const Icon = STATUS_ICON[task.status]
          const running = task.status === 'running'
          const detail = task.status === 'error' && task.error ? task.error : task.lastProgress
          return (
            <div key={task.id} onClick={() => openTask(task)}
              className="group rounded-xl border px-2.5 py-2 cursor-pointer transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: running ? color : 'var(--border)' }}
              title={tx('task.open_hint', '点击打开任务会话，查看完整轨迹')}>
              <div className="flex items-center gap-1.5">
                <Icon size={12} className={running ? 'shrink-0 animate-spin' : 'shrink-0'} style={{ color }} />
                <span className="flex-1 min-w-0 truncate text-[12px]" style={{ color: 'var(--text-primary)' }}>
                  {task.title || tx('task.untitled', '未命名任务')}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {timeOf(task.createdAt)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: running ? color : 'transparent', color: running ? '#fff' : color, boxShadow: running ? 'none' : `inset 0 0 0 1px ${color}` }}>
                  {statusLabel[task.status]}
                </span>
                {detail && (
                  <span className="flex-1 min-w-0 truncate text-[11px]" style={{ color: task.status === 'error' ? 'var(--error)' : 'var(--text-secondary)' }}>
                    {detail}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); openTask(task) }}
                  className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border hover:bg-[var(--border)] transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  <ExternalLink size={9} /> {tx('task.open', '打开')}
                </button>
                {running ? (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); pauseTask(task) }}
                      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border hover:bg-[var(--border)] transition-colors"
                      style={{ borderColor: 'var(--border)', color: 'var(--warning)' }}
                      title={tx('task.pause_hint', '暂停（在当前工具步骤结束后生效）')}>
                      <Pause size={9} /> {tx('task.pause', '暂停')}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); cancelTask(task) }}
                      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border hover:bg-[var(--border)] transition-colors"
                      style={{ borderColor: 'var(--border)', color: 'var(--error)' }}>
                      <CircleSlash size={9} /> {tx('task.cancel', '取消')}
                    </button>
                  </>
                ) : task.status === 'paused' || task.status === 'plan' ? (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); resumeTask(task) }}
                      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border hover:bg-[var(--border)] transition-colors"
                      style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}>
                      <Play size={9} /> {tx('task.resume', '恢复')}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); removeTask(task.id) }}
                      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border hover:bg-[var(--border)] transition-colors"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                      title={tx('task.dismiss', '从列表移除（会话保留）')}>
                      <Trash2 size={9} /> {tx('task.dismiss_short', '移除')}
                    </button>
                  </>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); removeTask(task.id) }}
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border hover:bg-[var(--border)] transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    title={tx('task.dismiss', '从列表移除（会话保留）')}>
                    <Trash2 size={9} /> {tx('task.dismiss_short', '移除')}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="px-3 py-2 shrink-0 text-[10px] leading-relaxed" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
        {tx('task.volatile_note', '任务状态存在主进程内存中，重启应用后列表清空（会话与结果仍在历史里）。')}
      </div>
    </aside>
  )
}
