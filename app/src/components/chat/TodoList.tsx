import { Check, Loader2, Circle, FastForward, RotateCcw } from 'lucide-react'
import { t } from '@/utils/i18n'

export type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }

type TodoListProps = {
  todos: Todo[]
  interactive?: boolean
  onToggle?: (index: number) => void
  onSkip?: (index: number) => void
  onRetry?: (index: number) => void
}

// ───────────────────────────────────────────────────────────────────────────
// Agent task checklist (Claude-Code-style TodoWrite & Kiro-style interactive).
// ───────────────────────────────────────────────────────────────────────────
export default function TodoList({ todos, interactive = false, onToggle, onSkip, onRetry }: TodoListProps) {
  if (!todos || todos.length === 0) return null
  return (
    <div className="rounded-lg border mb-2 px-3 py-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
      <div className="text-[10px] font-medium uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {t('agent.todos')}
      </div>
      <div className="space-y-1">
        {todos.map((todo, i) => {
          const done = todo.status === 'completed'
          const active = todo.status === 'in_progress'
          return (
            <div key={i} className="group flex items-center justify-between gap-2 text-xs py-0.5">
              <div
                className={`flex items-center gap-2 min-w-0 flex-1 ${interactive ? 'cursor-pointer' : ''}`}
                onClick={() => interactive && onToggle?.(i)}
              >
                {done ? (
                  <Check size={12} style={{ color: 'var(--success)' }} className="shrink-0" />
                ) : active ? (
                  <Loader2 size={12} style={{ color: 'var(--accent)' }} className="shrink-0 animate-spin" />
                ) : (
                  <Circle size={12} className="shrink-0 text-gray-300 group-hover:text-gray-400" />
                )}
                <span style={{ color: done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none' }}>
                  {active && todo.activeForm ? todo.activeForm : todo.content}
                </span>
              </div>

              {interactive && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {!done ? (
                    <button
                      type="button"
                      onClick={() => onSkip?.(i)}
                      className="p-1 rounded hover:bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      title={t('chat.task_skip_step')}
                    >
                      <FastForward size={11} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRetry?.(i)}
                      className="p-1 rounded hover:bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--accent)]"
                      title={t('chat.task_retry_step')}
                    >
                      <RotateCcw size={11} />
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
