import { memo, useCallback } from 'react'
import { CheckCircle2, Circle, Pause, Play, FastForward, RotateCcw } from 'lucide-react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { deriveStepVisualState, type TodoItem } from './timelineHelpers'

type InlineStepsCardProps = {
  todos: TodoItem[]
  streaming?: boolean
  messageId?: number | null
  sessionId?: number | null
}

/**
 * Quiet bordered inline steps checklist rendered inside the assistant turn.
 * Shows completed, active (4-dot pulse), paused (when stream stops mid-step),
 * and pending states using theme CSS tokens only.
 */
function InlineStepsCard({ todos, streaming = false, messageId = null, sessionId = null }: InlineStepsCardProps) {
  const sendMessage = useStore((s) => s.sendMessage)

  const handleToggleStep = useCallback(
    async (idx: number) => {
      const current = todos[idx]
      if (!current) return
      const nextStatus: 'pending' | 'completed' = current.status === 'completed' ? 'pending' : 'completed'
      if (messageId != null) {
        const updated = todos.map((item, i) => (i === idx ? { ...item, status: nextStatus } : item))
        useStore.setState((s) => ({
          todosByMessage: { ...s.todosByMessage, [messageId]: updated },
        }))
      }
      if (sessionId != null) {
        try {
          await window.electronAPI.planControl?.updateStep({
            sessionId,
            stepIndex: idx,
            status: nextStatus,
          })
        } catch {}
      }
    },
    [todos, messageId, sessionId]
  )

  const handleSkipStep = useCallback(
    async (idx: number, e: React.MouseEvent) => {
      e.stopPropagation()
      const current = todos[idx]
      if (!current) return
      if (messageId != null) {
        const updated = todos.map((item, i) => (i === idx ? { ...item, status: 'completed' as const } : item))
        useStore.setState((s) => ({
          todosByMessage: { ...s.todosByMessage, [messageId]: updated },
        }))
      }
      if (sessionId != null) {
        try {
          const stepId = String(current.id ?? idx + 1)
          await window.electronAPI.planControl?.skipStep({ sessionId, stepId })
          await window.electronAPI.planControl?.updateStep({
            sessionId,
            stepIndex: idx,
            status: 'completed',
          })
        } catch {}
      }
    },
    [todos, messageId, sessionId]
  )

  const handleRetryStep = useCallback(
    async (idx: number, e: React.MouseEvent) => {
      e.stopPropagation()
      const current = todos[idx]
      if (!current) return
      if (messageId != null) {
        const updated = todos.map((item, i) => (i === idx ? { ...item, status: 'pending' as const } : item))
        useStore.setState((s) => ({
          todosByMessage: { ...s.todosByMessage, [messageId]: updated },
        }))
      }
      if (sessionId != null) {
        try {
          const stepId = String(current.id ?? idx + 1)
          await window.electronAPI.planControl?.retryStep({ sessionId, stepId })
          await window.electronAPI.planControl?.updateStep({
            sessionId,
            stepIndex: idx,
            status: 'pending',
          })
        } catch {}
      }
    },
    [todos, messageId, sessionId]
  )

  const handleExecuteNow = useCallback(
    async (idx: number, e: React.MouseEvent) => {
      e.stopPropagation()
      const item = todos[idx]
      if (!item || streaming) return
      await sendMessage(`${t('chat.task_execute_prompt')}${item.content}`)
    },
    [todos, streaming, sendMessage]
  )

  if (!todos || todos.length === 0) return null

  return (
    <div
      className="rounded-[10px] border px-3 py-2 my-1.5"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--content-bg)',
      }}
    >
      <div className="space-y-0.5">
        {todos.map((todo, i) => {
          const visualState = deriveStepVisualState(todo, streaming)
          const isCompleted = visualState === 'completed'
          const isActive = visualState === 'in_progress'
          const label = isActive && todo.activeForm ? todo.activeForm : todo.content

          return (
            <div
              key={todo.id != null ? String(todo.id) : i}
              className="group/step flex items-center justify-between gap-2 py-1 text-[13px] leading-[1.45]"
            >
              <button
                type="button"
                onClick={() => handleToggleStep(i)}
                disabled={streaming}
                title={t('chat.task_toggle_status')}
                className="flex items-start gap-2.5 min-w-0 flex-1 text-left rounded-[6px] px-1 py-0.5 -mx-1 hover:bg-[var(--bg-secondary)]/70 active:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:cursor-default disabled:hover:bg-transparent transition-colors cursor-pointer"
              >
                <span className="w-4 h-4 flex items-center justify-center shrink-0 mt-[2px]">
                  {visualState === 'completed' ? (
                    <CheckCircle2 size={14} style={{ color: 'var(--text-muted)' }} />
                  ) : visualState === 'in_progress' ? (
                    <span className="aether-step-dots" style={{ color: 'var(--text-primary)' }} aria-hidden="true">
                      <span />
                      <span />
                      <span />
                      <span />
                    </span>
                  ) : visualState === 'paused' ? (
                    <Pause size={12} style={{ color: 'var(--text-muted)' }} />
                  ) : (
                    <Circle size={13} className="opacity-65" style={{ color: 'var(--text-muted)' }} />
                  )}
                </span>
                <span
                  className={`break-words select-text ${isActive ? 'font-medium' : ''}`}
                  style={{
                    color: isCompleted ? 'var(--text-muted)' : 'var(--text-primary)',
                  }}
                >
                  {label}
                </span>
              </button>

              <div className="flex items-center gap-1 opacity-0 group-hover/step:opacity-100 group-focus-within/step:opacity-100 transition-opacity shrink-0">
                {!isCompleted && !streaming && (
                  <button
                    type="button"
                    onClick={(e) => handleExecuteNow(i, e)}
                    title={t('chat.task_execute_now')}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-[6px] border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] active:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
                  >
                    <Play size={10} />
                    <span>{t('chat.task_execute')}</span>
                  </button>
                )}
                {!isCompleted ? (
                  <button
                    type="button"
                    onClick={(e) => handleSkipStep(i, e)}
                    disabled={streaming}
                    title={t('chat.task_skip_step')}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-[6px] border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] active:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <FastForward size={10} />
                    <span>{t('chat.task_skip')}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => handleRetryStep(i, e)}
                    disabled={streaming}
                    title={t('chat.task_retry_step')}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-[6px] border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] active:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <RotateCcw size={10} />
                    <span>{t('chat.task_retry')}</span>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default memo(InlineStepsCard)
