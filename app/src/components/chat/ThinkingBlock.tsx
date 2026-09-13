import { useState, useEffect, useMemo } from 'react'
import { Brain, ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { t } from '@/utils/i18n'

type ThinkingBlockProps = {
  text: string
  collapsed?: boolean
  // When true: the block is actively receiving streaming chunks.
  // Auto-expands immediately on first chunk; auto-collapses when streaming ends.
  streaming?: boolean
}

// Collapsible extended-thinking / reasoning block, styled like Claude Code / OpenCode.
// Shows a distinct slate-indigo container with brain icon, monospace font,
// and clear visual boundary separating internal thoughts from conversational replies.
export default function ThinkingBlock({ text, collapsed: initialCollapsed = true, streaming = false }: ThinkingBlockProps) {
  const [open, setOpen] = useState(streaming || !initialCollapsed)

  // Auto-expand during streaming, smoothly collapse after streaming ends
  useEffect(() => {
    if (streaming) {
      setOpen(true)
    } else if (initialCollapsed) {
      const t = setTimeout(() => setOpen(false), 500)
      return () => clearTimeout(t)
    }
  }, [streaming, initialCollapsed])

  if (!text || !text.trim()) return null

  const fullLabel = t('thinking.full', '思考过程 (Reasoning)')
  const collapsedLabel = t('thinking.collapsed', '查看思考过程')

  return (
    <div className="mb-2.5 rounded-md border overflow-hidden transition-all text-xs"
      style={{
        borderColor: streaming ? 'var(--accent)' : 'var(--border)',
        backgroundColor: 'var(--bg-secondary)',
      }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--border)]/50 transition-colors"
      >
        {open
          ? <ChevronDown size={13} className="text-[var(--text-muted)]" />
          : <ChevronRight size={13} className="text-[var(--text-muted)]" />}
        <Brain size={13} className={streaming ? 'text-[var(--text-primary)] animate-pulse' : 'text-[var(--text-muted)]'} />
        <span className="font-medium text-[11px] tracking-wide" style={{ color: 'var(--text-primary)' }}>
          {open ? fullLabel : collapsedLabel}
        </span>
        {streaming && (
          <span className="ml-1 text-[10px] font-mono text-[var(--text-secondary)] animate-pulse">
            thinking…
          </span>
        )}
        <span className="ml-auto text-[10px] font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {text.length.toLocaleString()} chars
        </span>
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-[var(--border)]" style={{ backgroundColor: 'var(--content-bg)' }}>
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}>
            {text}{streaming && <span className="animate-pulse font-bold text-[var(--accent)]">▋</span>}
          </pre>
        </div>
      )}
    </div>
  )
}
