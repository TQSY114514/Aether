import { useState, useEffect, useRef, useCallback } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'
import { t } from '@/utils/i18n'

type ThinkingBlockProps = {
  text: string
  collapsed?: boolean
  // When true: the block is actively receiving streaming chunks.
  // Auto-expands immediately on first chunk; auto-collapses when streaming ends.
  streaming?: boolean
  // When true: show first 3 lines as preview (for finalized messages).
  preview?: boolean
}

// Collapsible extended-thinking / reasoning block.
// Redesigned: uses a left accent bar instead of a full border box to feel
// integrated into the message flow rather than a jarring separate card.
// Smooth height transition via grid-template-rows for expand/collapse.
export default function ThinkingBlock({ text, collapsed: initialCollapsed = true, streaming = false, preview = false }: ThinkingBlockProps) {
  const [open, setOpen] = useState(streaming || !initialCollapsed)
  const contentRef = useRef<HTMLPreElement>(null)

  // Auto-expand during streaming, collapse after streaming ends with delay.
  // Long thinking (> 200 chars) stays open longer so user can read.
  useEffect(() => {
    if (streaming) {
      setOpen(true)
    } else if (initialCollapsed && !preview) {
      const delay = text.length > 200 ? 2500 : 1500
      const timer = setTimeout(() => setOpen(false), delay)
      return () => clearTimeout(timer)
    }
  }, [streaming, initialCollapsed, preview, text.length])

  // Auto-scroll to bottom during streaming so latest thinking is visible
  useEffect(() => {
    if (streaming && open && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [text, streaming, open])

  if (!text || !text.trim()) return null

  const fullLabel = t('thinking.full', '思考过程 (Reasoning)')
  const collapsedLabel = t('thinking.collapsed', '查看思考过程')
  const lines = text.split('\n')
  const previewText = preview && !open ? lines.slice(0, 3).join('\n') + (lines.length > 3 ? '\n…' : '') : text
  const showPreview = preview && !open && lines.length > 3

  return (
    <div
      className="mb-2 text-xs transition-colors"
      style={{
        borderLeft: `2px solid ${streaming ? 'var(--accent)' : 'var(--text-muted)'}`,
        paddingLeft: '10px',
        opacity: streaming ? 1 : 0.85,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 py-1 text-xs hover:opacity-80 transition-opacity"
      >
        {open
          ? <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />
          : <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />}
        <Brain
          size={12}
          style={{ color: streaming ? 'var(--text-primary)' : 'var(--text-muted)' }}
          className={streaming ? 'animate-pulse' : ''}
        />
        <span className="font-medium text-[11px]" style={{ color: 'var(--text-primary)' }}>
          {open ? fullLabel : collapsedLabel}
        </span>
        {streaming && (
          <span className="text-[10px] font-mono animate-pulse" style={{ color: 'var(--text-secondary)' }}>
            thinking…
          </span>
        )}
        <span className="ml-auto text-[10px] font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {text.length.toLocaleString()} chars
        </span>
      </button>

      {/* Smooth height transition using grid trick */}
      <div
        className="transition-[grid-template-rows] duration-300 ease-out"
        style={{
          display: 'grid',
          gridTemplateRows: open || showPreview ? '1fr' : '0fr',
        }}
      >
        <div className="overflow-hidden">
          <pre
            ref={contentRef}
            className="text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed pt-1 pb-1.5"
            style={{
              color: 'var(--text-secondary)',
              maxHeight: open ? '20rem' : '4.5rem',
              overflowY: open ? 'auto' : 'hidden',
              transition: 'max-height 0.3s ease-out',
            }}
          >
            {open ? text : previewText}
            {streaming && <span className="animate-pulse font-bold" style={{ color: 'var(--accent)' }}>▋</span>}
          </pre>
          {showPreview && (
            <button
              onClick={() => setOpen(true)}
              className="text-[10px] font-mono pb-1 hover:opacity-70 transition-opacity"
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
