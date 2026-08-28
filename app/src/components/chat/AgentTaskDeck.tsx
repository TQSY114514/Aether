import { useState, useMemo } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { ListChecks, CheckCircle2, ChevronDown, ChevronUp, Loader2, Check, Circle, Play } from 'lucide-react'

type AgentTaskDeckProps = {
  sessionId: number | null
}

export default function AgentTaskDeck({ sessionId }: { sessionId: number | null }) {
  const [expanded, setExpanded] = useState(false)
  const todosByMessage = useStore((s) => s.todosByMessage)
  const messages = useStore((s) => s.messages)

  // Find the most recent message's todos
  const latestTodos = useMemo(() => {
    // Strict session scoping: only find todos belonging to current sessionId
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.session_id === sessionId) {
        const tList = todosByMessage[msg.id]
        if (tList && tList.length > 0) {
          return tList
        }
      }
    }
    return []
  }, [messages, todosByMessage, sessionId])

  if (!latestTodos || latestTodos.length === 0) return null

  const total = latestTodos.length
  const completed = latestTodos.filter((t) => t.status === 'completed').length
  const allDone = completed === total
  const pct = Math.round((completed / total) * 100)

  // Find the active or next pending item
  const activeIndex = latestTodos.findIndex((t) => t.status === 'in_progress')
  const focusIndex = activeIndex >= 0 ? activeIndex : latestTodos.findIndex((t) => t.status !== 'completed')
  const focus = focusIndex >= 0 ? latestTodos[focusIndex] : null
  const focusLabel = focus ? (focus.status === 'in_progress' && focus.activeForm ? focus.activeForm : focus.content) : ''

  const accent = allDone ? 'var(--success)' : 'var(--accent)'
  const HeaderIcon = allDone ? CheckCircle2 : ListChecks

  return (
    <div className="mb-2 rounded-xl border overflow-hidden shadow-sm transition-all"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: accent,
      }}>
      {/* ── Header / Compact Bar ── */}
      <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[var(--border)] transition-colors"
        onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <HeaderIcon size={14} style={{ color: accent }} className="shrink-0" />
          <span className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>
            {allDone ? '任务全部完成' : '任务执行计划'}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold tabular-nums shrink-0"
            style={{ backgroundColor: accent, color: '#fff' }}>
            {completed}/{total}
          </span>
          {!expanded && focus && !allDone && (
            <div className="flex items-center gap-1 min-w-0 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span className="opacity-40">·</span>
              <Loader2 size={11} className="animate-spin text-amber-400 shrink-0" />
              <span className="truncate max-w-[280px] font-medium" style={{ color: 'var(--text-primary)' }}>
                {focusLabel}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono tabular-nums font-medium" style={{ color: 'var(--text-muted)' }}>
            {pct}%
          </span>
          <button type="button" aria-label="Toggle task drawer" className="p-1 rounded hover:bg-[var(--bg-primary)] text-[var(--text-muted)]">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* ── Progress Track ── */}
      <div className="h-1 w-full bg-[var(--border)]">
        <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: accent }} />
      </div>

      {/* ── Expanded Drawer ── */}
      {expanded && (
        <div className="px-3 py-2.5 space-y-1.5 border-t border-[var(--border)] max-h-56 overflow-y-auto bg-[var(--content-bg)]">
          {latestTodos.map((todo, i) => {
            const isCompleted = todo.status === 'completed'
            const isInProgress = todo.status === 'in_progress'
            const isFocus = i === focusIndex
            const label = isInProgress && todo.activeForm ? todo.activeForm : todo.content

            return (
              <div key={i} className="flex items-start gap-2 text-xs rounded-lg px-2 py-1.5 transition-all"
                style={isInProgress
                  ? { backgroundColor: 'var(--bg-secondary)', borderLeft: '3px solid var(--accent)' }
                  : { borderLeft: '3px solid transparent' }}>
                {isCompleted ? (
                  <Check size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
                ) : isInProgress ? (
                  <Loader2 size={13} className="shrink-0 mt-0.5 animate-spin text-amber-400" />
                ) : isFocus ? (
                  <Play size={12} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                ) : (
                  <Circle size={12} className="shrink-0 mt-0.5 opacity-40 text-gray-400" />
                )}
                <span className={isInProgress ? 'font-medium' : ''}
                  style={{
                    color: isCompleted ? 'var(--text-muted)' : isInProgress ? 'var(--text-primary)' : 'var(--text-secondary)',
                    textDecoration: isCompleted ? 'line-through' : 'none',
                  }}>
                  {label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
