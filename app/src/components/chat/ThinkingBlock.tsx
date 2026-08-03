import { useState, useMemo } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'
import { t } from '@/utils/i18n'

type ThinkingBlockProps = {
  text: string
  collapsed?: boolean
}

// Collapsible extended-thinking / reasoning block, styled like Claude Code's
// thinking sections. Shows a one-line indicator when collapsed, full text
// (rendered as plain text, not markdown) when expanded.
export default function ThinkingBlock({ text, collapsed: initialCollapsed }: ThinkingBlockProps) {
  const [open, setOpen] = useState(!initialCollapsed)

  const preview = useMemo(() => {
    const trimmed = (text || '').trim()
    if (!trimmed) return ''
    if (trimmed.length <= 80) return trimmed
    return trimmed.slice(0, 80) + '…'
  }, [text])

  if (!text || !text.trim()) return null

  const fullLabel = t('thinking.full')
  const collapsedLabel = t('thinking.collapsed')

  return (
    <div className="mb-2 rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs hover:bg-[var(--border)] transition-colors"
      >
        {open
          ? <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />
          : <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />}
        <Brain size={12} style={{ color: 'var(--accent)' }} />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {open ? fullLabel : collapsedLabel}
        </span>
        <span className="ml-auto text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {text.length.toLocaleString()} chars
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2.5">
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-60 overflow-y-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {text}
          </pre>
        </div>
      )}
    </div>
  )
}
