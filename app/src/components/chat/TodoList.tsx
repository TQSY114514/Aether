import { Check, Loader2, Circle } from 'lucide-react'
import { t } from '@/utils/i18n'

type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }

// ───────────────────────────────────────────────────────────────────────────
// Agent task checklist (Claude-Code-style TodoWrite). The agent maintains this
// list via the todo_write tool; it renders live with a spinner on the
// in_progress item so the user can follow a multi-step task at a glance.
// ───────────────────────────────────────────────────────────────────────────
export default function TodoList({ todos }: { todos: Todo[] }) {
  if (!todos || todos.length === 0) return null
  return (
    <div className="rounded-lg border mb-2 px-3 py-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
      <div className="text-[10px] font-medium uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('agent.todos')}</div>
      <div className="space-y-1">
        {todos.map((todo, i) => {
          const done = todo.status === 'completed'
          const active = todo.status === 'in_progress'
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              {done ? <Check size={12} style={{ color: 'var(--success)' }} className="shrink-0" />
                : active ? <Loader2 size={12} style={{ color: 'var(--accent)' }} className="shrink-0 animate-spin" />
                : <Circle size={12} className="shrink-0 text-gray-300" />}
              <span style={{ color: done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none' }}>
                {active && todo.activeForm ? todo.activeForm : todo.content}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
