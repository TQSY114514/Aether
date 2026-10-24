import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Brain, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/utils/i18n'

type ThinkingBlockProps = {
  text: string
  collapsed?: boolean
  // When true: the block is actively receiving streaming chunks.
  streaming?: boolean
  // When true: show first 3 lines as preview (for finalized messages).
  preview?: boolean
  // Pre-calculated or persisted duration in seconds from backend/store
  duration?: number | null
  // Start timestamp in ms from backend/store
  startedAt?: number | null
}

const GLUED_HEADING_RUN = /(?<!\*)\*{4}(?!\*)/g
const GLUED_AFTER_PROSE = /(?<=[^\s*])(\*\*(?=[^\s*])[^*\n]*\*\*)(?=\s*$)/gm

function separateGluedReasoningBlocks(raw: string): string {
  if (!raw) return ''
  return raw.replace(GLUED_HEADING_RUN, '**\n\n**').replace(GLUED_AFTER_PROSE, '\n\n$1')
}

/**
 * Collapsible extended-thinking / reasoning block (Hermes & Claude Code style).
 * Supports real-time elapsed timer, non-intrusive auto-following scroll,
 * clean heading separation, and clear duration reporting upon completion.
 */
export default function ThinkingBlock({
  text,
  collapsed: initialCollapsed = true,
  streaming = false,
  preview = false,
  duration: propDuration = null,
  startedAt = null,
}: ThinkingBlockProps) {
  const [open, setOpen] = useState(streaming || !initialCollapsed)
  const startTimeRef = useRef<number>(startedAt || Date.now())
  useEffect(() => {
    if (startedAt && startTimeRef.current !== startedAt) {
      startTimeRef.current = startedAt
    }
  }, [startedAt])
  const [elapsed, setElapsed] = useState<number>(0)
  const [duration, setDuration] = useState<number | null>(propDuration)

  useEffect(() => {
    if (propDuration !== undefined && propDuration !== null && propDuration > 0) {
      setDuration(propDuration)
    }
  }, [propDuration])

  const contentRef = useRef<HTMLPreElement | null>(null)
  const followingRef = useRef<boolean>(true)
  const prevStreamingRef = useRef<boolean>(streaming)

  // Auto-expand on streaming start, auto-collapse on streaming finish if initialCollapsed
  useEffect(() => {
    if (streaming) {
      setOpen(true)
    } else if (prevStreamingRef.current && !streaming) {
      if (initialCollapsed) {
        setOpen(false)
      }
    }
    prevStreamingRef.current = streaming
  }, [streaming, initialCollapsed])

  // Live timer during streaming
  useEffect(() => {
    if (!streaming) return
    const interval = setInterval(() => {
      const sec = Math.max(0, (Date.now() - startTimeRef.current) / 1000)
      setElapsed(sec)
    }, 100)
    return () => clearInterval(interval)
  }, [streaming])

  // Record duration upon stream completion, clearing cached duration if streaming resumes
  useEffect(() => {
    if (streaming) {
      if (duration !== null && propDuration == null) setDuration(null)
    } else if (elapsed > 0 && duration === null && propDuration == null) {
      setDuration(elapsed)
    }
  }, [streaming, elapsed, duration, propDuration])

  // Smart follow scroll: track if user manually scrolled up
  const handleScroll = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    followingRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 36
  }, [])

  const cleanText = useMemo(() => separateGluedReasoningBlocks(text), [text])

  // Auto-scroll to bottom only if user hasn't scrolled up to read earlier thoughts
  useEffect(() => {
    if (streaming && open && followingRef.current && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [cleanText, streaming, open])

  if (!cleanText || !cleanText.trim()) return null

  // Format header status label
  const finalDuration = propDuration != null && propDuration > 0 ? propDuration : duration
  let statusLabel: string
  if (streaming) {
    statusLabel = t('thinking.running', elapsed.toFixed(1))
  } else if (finalDuration !== null && finalDuration > 0) {
    statusLabel = finalDuration < 1
      ? t('thinking.thought_briefly', '思考片刻')
      : t('thinking.thought_for', finalDuration.toFixed(1))
  } else {
    statusLabel = open ? t('thinking.full', '思考过程') : t('thinking.collapsed', '思考过程')
  }

  const lines = cleanText.split('\n')
  const previewText = preview && !open ? lines.slice(0, 3).join('\n') + (lines.length > 3 ? '\n…' : '') : cleanText
  const showPreview = preview && !open && lines.length > 3

  return (
    <div
      className="mb-2 text-xs transition-colors"
      style={{
        borderLeft: `2px solid ${streaming ? 'var(--accent)' : 'var(--border)'}`,
        paddingLeft: '10px',
        opacity: streaming ? 1 : 0.85,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 py-1 text-xs hover:opacity-85 transition-opacity select-none text-left"
        aria-expanded={open}
      >
        <ChevronRight
          size={12}
          className={cn('shrink-0 transition-transform duration-200', open && 'rotate-90')}
          style={{ color: 'var(--text-muted)' }}
        />
        <Brain
          size={12}
          className={cn('shrink-0', streaming && 'animate-pulse text-[var(--accent)]')}
          style={!streaming ? { color: 'var(--text-muted)' } : {}}
        />
        <span
          className={cn('font-medium text-[11px] truncate', streaming && 'animate-pulse')}
          style={{ color: streaming ? 'var(--text-primary)' : 'var(--text-secondary)' }}
        >
          {statusLabel}
        </span>
        <span className="ml-auto text-[10px] font-mono tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
          {cleanText.length.toLocaleString()} {t('tool.chars', 'chars')}
        </span>
      </button>

      {/* Smooth height transition */}
      <div
        className="transition-[grid-template-rows] duration-200 ease-out"
        style={{
          display: 'grid',
          gridTemplateRows: open || showPreview ? '1fr' : '0fr',
        }}
      >
        <div className="overflow-hidden">
          <pre
            ref={contentRef}
            onScroll={handleScroll}
            className="text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed pt-1 pb-1.5 overscroll-y-contain"
            style={{
              color: 'var(--text-secondary)',
              maxHeight: open ? '18rem' : '4.5rem',
              overflowY: open ? 'auto' : 'hidden',
              transition: 'max-height 0.2s ease-out',
            }}
          >
            {open ? cleanText : previewText}
            {streaming && <span className="animate-pulse font-bold ml-0.5" style={{ color: 'var(--accent)' }}>▋</span>}
          </pre>
          {showPreview && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-[10px] font-mono pb-1 hover:opacity-75 transition-opacity"
              style={{ color: 'var(--accent)' }}
            >
              {t('thinking.expand', '展开完整思考过程')} ({lines.length} {t('thinking.lines', '行')})
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
