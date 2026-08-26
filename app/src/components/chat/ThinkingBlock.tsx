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
  const [open, setOpen] = useState(streaming ? true : !initialCollapsed)

  // Auto-expand when streaming starts, auto-collapse when it ends.
  useEffect(() => {
    if (streaming) {
      setOpen(true)
    } else {
      // Streaming just ended — collapse into compact mode so the main reply
      // gets focus. A small delay makes the transition feel intentional.
      const t = setTimeout(() => setOpen(false), 300)
      return () => clearTimeout(t)
    }
  }, [streaming])

  if (!text || !text.trim()) return null

  const fullLabel = t('thinking.full', '思考过程 (Reasoning)')
  const collapsedLabel = t('thinking.collapsed', '查看思考过程')

  return (
    <div className="mb-3 rounded-xl border overflow-hidden transition-all shadow-sm"
      style={{
        borderColor: streaming ? 'rgba(129, 140, 248, 0.4)' : 'var(--border)',
        backgroundColor: 'rgba(99, 102, 241, 0.04)',
      }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--border)] transition-colors"
      >
        {open
          ? <ChevronDown size={13} className="text-indigo-400" />
          : <ChevronRight size={13} className="text-indigo-400" />}
        <Brain size={13} className={streaming ? 'text-indigo-400 animate-pulse' : 'text-indigo-400 opacity-80'} />
        <span className="font-semibold text-[11px] tracking-wide" style={{ color: 'var(--text-primary)' }}>
          {open ? fullLabel : collapsedLabel}
        </span>
        {streaming && (
          <span className="ml-1 text-[10px] font-medium text-indigo-500 animate-pulse">
            深度推理中…
          </span>
        )}
        <span className="ml-auto text-[10px] font-mono tabular-nums opacity-60" style={{ color: 'var(--text-muted)' }}>
          {text.length.toLocaleString()} chars
        </span>
      </button>
      {open && (
        <div className="px-3.5 pb-3 pt-1 border-t border-[var(--border)]" style={{ backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto leading-relaxed opacity-90"
            style={{ color: 'var(--text-secondary)' }}>
            {text}{streaming && <span className="animate-pulse text-indigo-500 font-bold">▋</span>}
          </pre>
        </div>
      )}
    </div>
  )
}
