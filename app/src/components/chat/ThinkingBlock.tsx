import { useState, useEffect, useRef, useCallback } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'
import { t } from '@/utils/i18n'

type ThinkingBlockProps = {
  text: string
  collapsed?: boolean
  // When true: the block is actively receiving streaming chunks.
  streaming?: boolean
  // When true: show first 3 lines as preview (for finalized messages).
  preview?: boolean
}

/**
 * Collapsible extended-thinking / reasoning block (Hermes & Claude Code style).
 * Supports real-time elapsed timer, non-intrusive auto-following scroll,
 * and clear duration reporting upon completion.
 */
export default function ThinkingBlock({
  text,
  collapsed: initialCollapsed = true,
  streaming = false,
  preview = false,
}: ThinkingBlockProps) {
  const [open, setOpen] = useState(streaming || !initialCollapsed)
  const [startTime] = useState<number>(() => Date.now())
  const [elapsed, setElapsed] = useState<number>(0)
  const [duration, setDuration] = useState<number | null>(null)

  const contentRef = useRef<HTMLPreElement>(null)
  const followingRef = useRef<boolean>(true)

  // Auto-expand on streaming start
  useEffect(() => {
    if (streaming) {
      setOpen(true)
    }
  }, [streaming])

  // Live timer during streaming
  useEffect(() => {
    if (!streaming) {
      if (elapsed > 0 && duration === null) {
        setDuration(elapsed)
      }
      return
    }
    const interval = setInterval(() => {
      const sec = (Date.now() - startTime) / 1000
      setElapsed(sec)
    }, 100)
    return () => clearInterval(interval)
  }, [streaming, startTime, elapsed, duration])

  // Smart follow scroll: track if user manually scrolled up
  const handleScroll = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    followingRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 36
  }, [])

  // Auto-scroll to bottom only if user hasn't scrolled up to read earlier thoughts
  useEffect(() => {
    if (streaming && open && followingRef.current && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [text, streaming, open])

  if (!text || !text.trim()) return null

  // Format header status label
  let statusLabel: string
  if (streaming) {
    statusLabel = t('thinking.running', elapsed.toFixed(1))
  } else if (duration !== null && duration > 0) {
    statusLabel = duration < 1
      ? t('thinking.thought_briefly', '思考片刻')
      : t('thinking.thought_for', duration.toFixed(1))
  } else {
    statusLabel = open ? t('thinking.full', '思考过程') : t('thinking.collapsed', '思考过程')
  }

  const lines = text.split('\n')
  const previewText = preview && !open ? lines.slice(0, 3).join('\n') + (lines.length > 3 ? '\n…' : '') : text
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
        {open ? (
          <ChevronDown size={12} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
        ) : (
          <ChevronRight size={12} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
        )}
        <Brain
          size={12}
          className={`shrink-0 ${streaming ? 'animate-pulse' : ''}`}
          style={{ color: streaming ? 'var(--accent)' : 'var(--text-muted)' }}
        />
        <span
          className={`font-medium text-[11px] truncate ${streaming ? 'animate-pulse' : ''}`}
          style={{ color: streaming ? 'var(--text-primary)' : 'var(--text-secondary)' }}
        >
          {statusLabel}
        </span>
        <span className="ml-auto text-[10px] font-mono tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
          {text.length.toLocaleString()} {t('tool.chars', 'chars')}
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
            {open ? text : previewText}
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
