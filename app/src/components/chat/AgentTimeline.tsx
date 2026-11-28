import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import ToolCallBlock from './ToolCallBlock'
import ThinkingBlock from './ThinkingBlock'
import InlineStepsCard from './InlineStepsCard'
import { t } from '@/utils/i18n'
import { renderMarkdown } from '@/utils/markdown'
import {
  buildTimelineNodes,
  deriveActivityDurationMs,
  deriveLiveFocusLabel,
  formatElapsed,
  type PlanStep,
  type TodoItem,
  type ToolEntry,
} from './timelineHelpers'

type AgentTimelineProps = {
  messageId?: number | null
  sessionId?: number | null
  thinkingText?: string
  thinkingStreaming?: boolean
  thinkingDuration?: number | null
  thinkingStartedAt?: number | null
  toolCalls?: ToolEntry[]
  planSteps?: PlanStep[]
  todos?: TodoItem[]
  statusLines?: string[]
  latencyMs?: number | null
  turnStartedAt?: number | null
  streaming?: boolean
}

function StepNoteRow({ step }: { step: PlanStep }) {
  const [open, setOpen] = useState(false)
  const text = step.assistantText?.trim()
  if (!text) return null
  const firstLine = text.split('\n')[0].slice(0, 96)
  const hasMore = text.length > firstLine.length || text.includes('\n')

  return (
    <div className="text-[12px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 max-w-full py-0.5 px-1 rounded-[6px] text-left hover:bg-[var(--bg-secondary)]/70 active:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
        style={{ color: 'var(--text-secondary)' }}
      >
        <span className="truncate">{firstLine}{!open && hasMore ? '…' : ''}</span>
        {open
          ? <ChevronDown size={11} className="shrink-0 opacity-60" />
          : <ChevronRight size={11} className="shrink-0 opacity-60" />}
      </button>
      {open && (
        <div
          className="mc text-[12px] leading-relaxed break-words mt-1 mb-1.5 px-2.5 py-1.5 rounded-[6px] border"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
        />
      )}
    </div>
  )
}

function StepsProgressRing({ completed, total }: { completed: number; total: number }) {
  const size = 13
  const stroke = 1.6
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const ratio = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0
  const dashOffset = circ * (1 - ratio)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" aria-hidden="true">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth={stroke}
      />
      {ratio > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--text-secondary)"
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

/**
 * Dual-state inline steps card + collapsible execution activity timeline.
 * - Streaming: expanded inline steps card on top, live focus + elapsed timer header,
 *   compact tool trace, and subtle `Working` footer.
 * - Settled/paused: single-line `Worked for Xm ▾` + `done/total steps` summary row;
 *   activity auto-collapses, while incomplete steps remain visible with paused state.
 */
function AgentTimeline({
  messageId = null,
  sessionId = null,
  thinkingText,
  thinkingStreaming,
  thinkingDuration,
  thinkingStartedAt,
  toolCalls,
  planSteps,
  todos,
  statusLines,
  latencyMs,
  turnStartedAt,
  streaming = false,
}: AgentTimelineProps) {
  const hasThinking = Boolean(thinkingText)
  const hasTools = Boolean(toolCalls && toolCalls.length > 0)
  const hasSteps = Boolean(planSteps && planSteps.length > 0)
  const hasActivity = hasThinking || hasTools || hasSteps
  const hasTodos = Boolean(todos && todos.length > 0)

  const totalTodos = todos?.length ?? 0
  const completedTodos = useMemo(
    () => (todos ? todos.filter((item) => item.status === 'completed').length : 0),
    [todos]
  )
  const hasIncompleteTodos = hasTodos && completedTodos < totalTodos

  const [activityOpen, setActivityOpen] = useState<boolean>(() => Boolean(streaming))
  const [stepsOpen, setStepsOpen] = useState<boolean>(() => Boolean(streaming || hasIncompleteTodos))
  const userToggledActivityRef = useRef(false)
  const userToggledStepsRef = useRef(false)
  const prevStreamingRef = useRef(streaming)

  useEffect(() => {
    const prev = prevStreamingRef.current
    prevStreamingRef.current = streaming
    if (prev && !streaming) {
      if (!userToggledActivityRef.current) setActivityOpen(false)
      if (!userToggledStepsRef.current) setStepsOpen(hasIncompleteTodos)
    } else if (!prev && streaming) {
      if (!userToggledActivityRef.current) setActivityOpen(true)
      if (!userToggledStepsRef.current) setStepsOpen(true)
    }
  }, [streaming, hasIncompleteTodos])

  useEffect(() => {
    if (!streaming && !userToggledStepsRef.current) {
      setStepsOpen(hasIncompleteTodos)
    }
  }, [streaming, hasIncompleteTodos])

  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    if (!streaming || (!hasActivity && !hasTodos)) return
    setNow(Date.now())
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [streaming, hasActivity, hasTodos])

  const timelineNodes = useMemo(() => buildTimelineNodes(planSteps, toolCalls), [planSteps, toolCalls])

  const durationMs = useMemo(
    () =>
      deriveActivityDurationMs({
        toolCalls,
        thinkingDuration,
        thinkingStartedAt,
        turnStartedAt,
        latencyMs,
        now,
        streaming,
      }),
    [toolCalls, thinkingDuration, thinkingStartedAt, turnStartedAt, latencyMs, now, streaming]
  )

  const liveFocusLabel = useMemo(
    () => deriveLiveFocusLabel({ toolCalls, todos, statusLines, tFn: t }),
    [toolCalls, todos, statusLines]
  )

  if (!hasActivity && !hasTodos) return null

  const toggleActivity = () => {
    userToggledActivityRef.current = true
    setActivityOpen((v) => !v)
  }

  const toggleSteps = () => {
    userToggledStepsRef.current = true
    setStepsOpen((v) => !v)
  }

  const activityBody = (
    <div className="pl-3 mt-1 space-y-1">
      {hasThinking && (
        <ThinkingBlock
          text={thinkingText!}
          streaming={thinkingStreaming}
          collapsed={!thinkingStreaming}
          duration={thinkingDuration}
          startedAt={thinkingStartedAt}
        />
      )}
      {timelineNodes.map((node) =>
        node.kind === 'step' ? (
          <StepNoteRow key={node.key} step={node.step} />
        ) : (
          <ToolCallBlock key={node.key} tool={node.tool} compact />
        )
      )}
    </div>
  )

  if (streaming) {
    return (
      <div className="mb-2.5">
        {hasTodos && (
          <InlineStepsCard
            todos={todos!}
            streaming
            messageId={messageId}
            sessionId={sessionId}
          />
        )}
        {hasActivity && (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={toggleActivity}
              aria-expanded={activityOpen}
              aria-label={t('timeline.toggle_activity')}
              className="inline-flex items-center gap-2 max-w-full py-0.5 px-1 -mx-1 rounded-[6px] text-[12px] hover:bg-[var(--bg-secondary)]/70 active:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                {liveFocusLabel || t('timeline.activity')}
              </span>
              {durationMs != null && (
                <span className="tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {formatElapsed(durationMs)}
                </span>
              )}
              {activityOpen
                ? <ChevronDown size={12} className="shrink-0 opacity-70" />
                : <ChevronRight size={12} className="shrink-0 opacity-70" />}
            </button>

            {activityOpen && activityBody}
          </div>
        )}
        <div className="pl-3 mt-1.5 text-[12px] shimmer-text select-none">
          {t('timeline.working')}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-2">
      <div className="flex items-center gap-3 flex-wrap text-[12px] mb-1">
        {hasActivity && (
          <button
            type="button"
            onClick={toggleActivity}
            aria-expanded={activityOpen}
            aria-label={t('timeline.toggle_activity')}
            className="inline-flex items-center gap-1 py-0.5 px-1 -mx-1 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]/70 active:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
          >
            <span>
              {durationMs != null
                ? t('timeline.worked_for', formatElapsed(durationMs))
                : t('timeline.activity')}
            </span>
            {activityOpen
              ? <ChevronDown size={12} className="shrink-0 opacity-75" />
              : <ChevronRight size={12} className="shrink-0 opacity-75" />}
          </button>
        )}
        {hasTodos && (
          <button
            type="button"
            onClick={toggleSteps}
            aria-expanded={stepsOpen}
            aria-label={t('timeline.toggle_steps')}
            className="inline-flex items-center gap-1.5 py-0.5 px-1.5 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]/70 active:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer tabular-nums"
          >
            <StepsProgressRing completed={completedTodos} total={totalTodos} />
            <span>{t('timeline.steps_progress', completedTodos, totalTodos)}</span>
          </button>
        )}
      </div>

      {hasActivity && activityOpen && (
        <div className="mb-1.5">{activityBody}</div>
      )}
      {hasTodos && stepsOpen && (
        <InlineStepsCard
          todos={todos!}
          streaming={false}
          messageId={messageId}
          sessionId={sessionId}
        />
      )}
    </div>
  )
}

export default memo(AgentTimeline)
