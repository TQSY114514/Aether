import { useState } from 'react'
import { Check, Circle, Loader2, Play, ListChecks, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react'
import { t } from '@/utils/i18n'

// ───────────────────────────────────────────────────────────────────────────
// Agent task card — the "workbench" header of an assistant turn. Renders the
// live todo checklist (todo_write tool) as progress: "3/5" + a progress bar,
// the item the agent is working on right now (or the next one queued), the
// latest Plan→Act→Observe thought as a one-line summary, and any inline status
// lines. Collapsible via the header, same pattern as ToolCallBlock.
//
// Pure rendering: everything comes from the store maps that the existing
// onTodoUpdate / onPlanStep / onStatus pipeline already fills, so the card
// updates live during a multi-step run with zero new IPC.
// ───────────────────────────────────────────────────────────────────────────

type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }
type PlanStep = { step: number; depth: number; assistantText: string; kind?: 'plan' | 'act' | 'observe' }

// Same phase palette as AgentPlanTrace so the summary badge reads consistently.
const STEP_COLORS: Record<string, string> = {
  plan: 'var(--accent)',
  act: 'var(--warning)',
  observe: 'var(--success)',
}

// The `taskcard.*` keys are added to i18n.base.json centrally. Until they land,
// `t()` returns the raw key — so fall back to a readable label instead of
// showing "taskcard.running" in the UI. Once the keys exist this is a no-op.
function tx(key: string, fallback: string, ...args: (string | number)[]): string {
  const s = t(key, ...args)
  if (s !== key) return s
  return args.length ? fallback.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? '')) : fallback
}

export default function TaskCard({ todos, planSteps, statusLines }: { todos: Todo[]; planSteps?: PlanStep[]; statusLines?: string[] }) {
  const [open, setOpen] = useState(true)
  if (!todos || todos.length === 0) return null

  const total = todos.length
  const completed = todos.filter(x => x.status === 'completed').length
  const allDone = completed === total
  const pct = Math.round((completed / total) * 100)
  // Focus row: the in_progress item, or — when the agent hasn't claimed one yet —
  // the next item that still needs doing.
  const activeIndex = todos.findIndex(x => x.status === 'in_progress')
  const focusIndex = activeIndex >= 0 ? activeIndex : todos.findIndex(x => x.status !== 'completed')
  const focus = focusIndex >= 0 ? todos[focusIndex] : null
  const focusLabel = focus ? (focus.status === 'in_progress' && focus.activeForm ? focus.activeForm : focus.content) : ''

  const lastStep = planSteps && planSteps.length > 0 ? planSteps[planSteps.length - 1] : null
  const summary = lastStep ? lastStep.assistantText.trim() : ''
  const summaryKind = lastStep?.kind || 'plan'
  const summaryColor = STEP_COLORS[summaryKind] || 'var(--accent)'
  const summaryLabel = summaryKind === 'plan' ? 'Plan' : summaryKind === 'act' ? 'Act' : 'Observe'

  const accent = allDone ? 'var(--success)' : 'var(--accent)'
  const HeaderIcon = allDone ? CheckCircle2 : ListChecks
  const title = allDone ? tx('taskcard.completed', '任务完成') : tx('taskcard.running', '任务执行中')

  return (
    <div className="rounded-lg border mb-2 overflow-hidden" style={{ borderColor: accent, backgroundColor: 'var(--bg-secondary)' }}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--border)] transition-colors"
        title={tx('taskcard.toggle', '点击展开 / 收起任务进度')}>
        {open ? <ChevronDown size={12} style={{ color: accent }} /> : <ChevronRight size={12} style={{ color: accent }} />}
        <HeaderIcon size={12} style={{ color: accent }} />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{title}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums shrink-0" style={{ backgroundColor: accent, color: '#fff' }}>{completed}/{total}</span>
        {!open && focus && (
          <span className="ml-auto truncate max-w-[45%] text-[10px]" style={{ color: 'var(--text-muted)' }}>{focusLabel}</span>
        )}
        {(open || !focus) && (
          <span className="ml-auto text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{pct}%</span>
        )}
      </button>
      {/* Progress track — stays visible while collapsed so the turn reads at a glance. */}
      <div className="h-1 w-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: accent }} />
      </div>
      {open && (
        <div className="px-3 pb-2.5 pt-2 space-y-1.5">
          <div className="space-y-0.5">
            {todos.map((todo, i) => {
              const done = todo.status === 'completed'
              const active = todo.status === 'in_progress'
              const isFocus = i === focusIndex
              const label = active && todo.activeForm ? todo.activeForm : todo.content
              return (
                <div key={i} className="flex items-start gap-2 text-xs rounded px-1.5 py-1 -mx-1.5"
                  style={isFocus && !allDone
                    ? { backgroundColor: 'var(--bg-primary)', borderLeft: '2px solid var(--accent)' }
                    : { borderLeft: '2px solid transparent' }}>
                  {done ? <Check size={12} className="shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
                    : active ? <Loader2 size={12} className="shrink-0 mt-0.5 animate-spin" style={{ color: 'var(--accent)' }} />
                    : isFocus ? <Play size={12} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                    : <Circle size={12} className="shrink-0 mt-0.5 opacity-50" style={{ color: 'var(--text-muted)' }} />}
                  <span className={isFocus && !done ? 'font-medium' : ''}
                    style={{
                      color: done ? 'var(--text-muted)' : isFocus ? 'var(--text-primary)' : 'var(--text-secondary)',
                      textDecoration: done ? 'line-through' : 'none',
                    }}>{label}</span>
                </div>
              )
            })}
          </div>
          {/* Latest agent thought — one-line summary, full trace lives in AgentPlanTrace. */}
          {summary && (
            <div className="flex items-start gap-1.5 rounded border p-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}>
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: 'var(--bg-secondary)', color: summaryColor }}>{summaryLabel}</span>
              <span className="text-[11px] leading-relaxed line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{summary}</span>
            </div>
          )}
          {statusLines && statusLines.length > 0 && (
            <div className="space-y-0.5 pt-0.5">
              {statusLines.map((line, i) => (
                <div key={i} className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{line}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
