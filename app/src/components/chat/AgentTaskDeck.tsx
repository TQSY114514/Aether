import { useState, useMemo, useCallback } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import {
  ListChecks,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  Circle,
  Play,
  RotateCcw,
  FastForward,
  CornerDownLeft,
} from 'lucide-react'
import HoverMarquee from '@/components/ui/HoverMarquee'

type AgentTaskDeckProps = {
  sessionId: number | null
}

/** Render background agent tasks associated with the current session (Kiro-style interactive checklist). */
export default function AgentTaskDeck({ sessionId }: AgentTaskDeckProps) {
  const [expanded, setExpanded] = useState(false)
  const todosByMessage = useStore((s) => s.todosByMessage)
  const messages = useStore((s) => s.messages)
  const streamingBySession = useStore((s) => s.streamingBySession)
  const sendMessage = useStore((s) => s.sendMessage)
  const isStreaming = !!(sessionId && streamingBySession[sessionId])

  // Find the target message ID holding the current todos
  const { targetMsgId, rawTodos } = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.session_id === sessionId) {
        const tList = todosByMessage[msg.id]
        if (tList && tList.length > 0) {
          return { targetMsgId: msg.id, rawTodos: tList }
        }
      }
    }
    const streamMsgId = sessionId ? streamingBySession[sessionId]?.messageId : null
    if (streamMsgId && todosByMessage[streamMsgId]?.length) {
      return { targetMsgId: streamMsgId, rawTodos: todosByMessage[streamMsgId] }
    }
    return { targetMsgId: null, rawTodos: [] }
  }, [messages, todosByMessage, sessionId, streamingBySession])

  const latestTodos = rawTodos

  // Handlers for interactive checklist
  const handleToggleStep = useCallback(
    async (idx: number) => {
      if (!targetMsgId || !latestTodos[idx]) return
      const current = latestTodos[idx]
      const nextStatus: 'pending' | 'completed' = current.status === 'completed' ? 'pending' : 'completed'
      const updated = latestTodos.map((item, i) => (i === idx ? { ...item, status: nextStatus } : item))

      useStore.setState((s) => ({
        todosByMessage: { ...s.todosByMessage, [targetMsgId]: updated },
      }))

      if (sessionId) {
        try {
          await window.electronAPI.planControl?.updateStep({
            sessionId,
            stepIndex: idx,
            status: nextStatus,
          })
        } catch {}
      }
    },
    [targetMsgId, latestTodos, sessionId]
  )

  const handleSkipStep = useCallback(
    async (idx: number, e: React.MouseEvent) => {
      e.stopPropagation()
      if (!targetMsgId || !latestTodos[idx]) return
      const updated = latestTodos.map((item, i) => (i === idx ? { ...item, status: 'completed' as const } : item))
      useStore.setState((s) => ({
        todosByMessage: { ...s.todosByMessage, [targetMsgId]: updated },
      }))

      if (sessionId) {
        try {
          const stepId = (latestTodos[idx] as any)?.id || String(idx + 1)
          await window.electronAPI.planControl?.skipStep({
            sessionId,
            stepId,
          })
          await window.electronAPI.planControl?.updateStep({
            sessionId,
            stepIndex: idx,
            status: 'completed',
          })
        } catch {}
      }
    },
    [targetMsgId, latestTodos, sessionId]
  )

  const handleRetryStep = useCallback(
    async (idx: number, e: React.MouseEvent) => {
      e.stopPropagation()
      if (!targetMsgId || !latestTodos[idx]) return
      const updated = latestTodos.map((item, i) => (i === idx ? { ...item, status: 'pending' as const } : item))
      useStore.setState((s) => ({
        todosByMessage: { ...s.todosByMessage, [targetMsgId]: updated },
      }))

      if (sessionId) {
        try {
          const stepId = (latestTodos[idx] as any)?.id || String(idx + 1)
          await window.electronAPI.planControl?.retryStep({
            sessionId,
            stepId,
          })
          await window.electronAPI.planControl?.updateStep({
            sessionId,
            stepIndex: idx,
            status: 'pending',
          })
        } catch {}
      }
    },
    [targetMsgId, latestTodos, sessionId]
  )

  const handleExecuteNow = useCallback(
    async (idx: number, e: React.MouseEvent) => {
      e.stopPropagation()
      const item = latestTodos[idx]
      if (!item) return
      const prompt = `${t('chat.task_execute_prompt', '请立即执行该步骤：')}${item.content}`
      await sendMessage(prompt)
    },
    [latestTodos, sendMessage]
  )

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
    <div
      className="mb-2 rounded-lg border overflow-hidden shadow-sm transition-all"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: accent,
      }}
    >
      {/* ── Header / Compact Bar ── */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[var(--border)] transition-colors select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <HeaderIcon size={14} style={{ color: accent }} className="shrink-0" />
          <span className="font-semibold text-xs shrink-0" style={{ color: 'var(--text-primary)' }}>
            {allDone ? t('chat.tasks_all_completed', '任务全部完成') : t('chat.task_execution_plan', '任务执行计划')}
          </span>
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold tabular-nums shrink-0"
            style={{ backgroundColor: accent, color: '#fff' }}
          >
            {completed}/{total}
          </span>
          {!expanded && focus && !allDone && (
            <div className="flex items-center gap-1 min-w-0 flex-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span className="opacity-40 shrink-0">·</span>
              {isStreaming && <Loader2 size={11} className="animate-spin text-amber-400 shrink-0" />}
              <HoverMarquee text={focusLabel} className="max-w-[320px] font-medium" style={{ color: 'var(--text-primary)' }} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono tabular-nums font-medium" style={{ color: 'var(--text-muted)' }}>
            {pct}%
          </span>
          <button type="button" aria-label={t('chat.task_toggle_drawer', '折叠/展开任务抽屉')} className="p-1 rounded hover:bg-[var(--bg-primary)] text-[var(--text-muted)]">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* ── Progress Track ── */}
      <div className="h-1 w-full bg-[var(--border)]">
        <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: accent }} />
      </div>

      {/* ── Expanded Drawer with Smooth Accordion Transition ── */}
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-3 py-2.5 space-y-1.5 border-t border-[var(--border)] max-h-64 overflow-y-auto bg-[var(--content-bg)]">
            {latestTodos.map((todo, i) => {
              const isCompleted = todo.status === 'completed'
              const isInProgress = todo.status === 'in_progress' && isStreaming
              const isFocus = i === focusIndex && isStreaming
              const label = isInProgress && todo.activeForm ? todo.activeForm : todo.content

              return (
                <div
                  key={i}
                  className="group flex items-center justify-between text-xs rounded-lg px-2.5 py-1.5 transition-all hover:bg-[var(--bg-secondary)]"
                  style={
                    isInProgress
                      ? { backgroundColor: 'var(--bg-secondary)', borderLeft: '3px solid var(--accent)' }
                      : { borderLeft: '3px solid transparent' }
                  }
                >
                  <div
                    className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer"
                    onClick={() => handleToggleStep(i)}
                    title={t('chat.task_toggle_status', '点击切换完成状态')}
                  >
                    <button
                      type="button"
                      className="shrink-0 mt-0.5 focus:outline-none"
                      aria-label={isCompleted ? t('chat.task_mark_incomplete', '标记未完成') : t('chat.task_mark_complete', '标记已完成')}
                    >
                      {isCompleted ? (
                        <Check size={13} style={{ color: 'var(--success)' }} />
                      ) : isInProgress ? (
                        <Loader2 size={13} className="animate-spin text-amber-400" />
                      ) : isFocus ? (
                        <Play size={12} style={{ color: 'var(--accent)' }} />
                      ) : (
                        <Circle size={12} className="opacity-40 text-gray-400 hover:opacity-100" />
                      )}
                    </button>
                    <span
                      className={`break-words select-text ${isInProgress ? 'font-medium' : ''}`}
                      style={{
                        color: isCompleted ? 'var(--text-muted)' : isInProgress ? 'var(--text-primary)' : 'var(--text-secondary)',
                        textDecoration: isCompleted ? 'line-through' : 'none',
                      }}
                    >
                      {label}
                    </span>
                  </div>

                  {/* Kiro-style interactive actions on hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                    {!isCompleted && !isStreaming && (
                      <button
                        type="button"
                        onClick={(e) => handleExecuteNow(i, e)}
                        className="px-1.5 py-0.5 text-[10px] rounded flex items-center gap-0.5 border border-[var(--border)] hover:bg-[var(--bg-primary)] hover:border-[var(--accent)] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                        title={t('chat.task_execute_now', '立即优先执行该步骤')}
                      >
                        <CornerDownLeft size={10} />
                        <span>{t('chat.task_execute', '执行')}</span>
                      </button>
                    )}
                    {!isCompleted ? (
                      <button
                        type="button"
                        onClick={(e) => handleSkipStep(i, e)}
                        className="px-1.5 py-0.5 text-[10px] rounded flex items-center gap-0.5 border border-[var(--border)] hover:bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        title={t('chat.task_skip_step', '跳过此步')}
                      >
                        <FastForward size={10} />
                        <span>{t('chat.task_skip', '跳过')}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => handleRetryStep(i, e)}
                        className="px-1.5 py-0.5 text-[10px] rounded flex items-center gap-0.5 border border-[var(--border)] hover:bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                        title={t('chat.task_retry_step', '重试此步')}
                      >
                        <RotateCcw size={10} />
                        <span>{t('chat.task_retry', '重试')}</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
