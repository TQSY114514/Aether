import { useState } from 'react'
import { FileText, ChevronRight, ChevronDown, Copy, Check } from 'lucide-react'
import { t } from '@/utils/i18n'
import type { InlineTextAttachment } from '@/utils/exportMarkdown'

interface UserAttachmentCardsProps {
  attachments: InlineTextAttachment[]
}

export default function UserAttachmentCards({ attachments }: UserAttachmentCardsProps) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  if (!attachments || attachments.length === 0) return null

  return (
    <div className="space-y-1.5 mb-2">
      {attachments.map((att, idx) => {
        const isOpen = Boolean(expanded[idx])
        const lineCount = att.body ? att.body.split('\n').length : 0
        const charCount = att.body.length
        const sizeLabel = charCount >= 1024 ? `${(charCount / 1024).toFixed(1)} KB` : `${charCount} B`

        return (
          <div
            key={`${att.label}-${idx}`}
            className="rounded-[8px] border overflow-hidden"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--content-bg, var(--bg-primary))',
            }}
          >
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
              <button
                type="button"
                onClick={() => setExpanded((prev) => ({ ...prev, [idx]: !isOpen }))}
                aria-expanded={isOpen}
                className="flex-1 min-w-0 flex items-center gap-1.5 text-left text-xs hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] rounded cursor-pointer"
                style={{ color: 'var(--text-primary)' }}
              >
                {isOpen ? (
                  <ChevronDown size={13} className="shrink-0 text-[var(--text-muted)]" />
                ) : (
                  <ChevronRight size={13} className="shrink-0 text-[var(--text-muted)]" />
                )}
                <FileText size={12.5} className="shrink-0 text-[var(--accent)]" />
                <span className="truncate font-medium font-mono text-[11.5px]">{att.label}</span>
                <span className="text-[10.5px] shrink-0 tabular-nums font-mono" style={{ color: 'var(--text-muted)' }}>
                  {lineCount}L · {sizeLabel}
                </span>
              </button>
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation()
                  try {
                    await navigator.clipboard.writeText(att.body)
                    setCopiedIdx(idx)
                    setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500)
                  } catch {}
                }}
                className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer shrink-0"
                title={t('chat.copy', 'Copy')}
                aria-label={t('chat.copy', 'Copy')}
              >
                {copiedIdx === idx ? (
                  <Check size={11} style={{ color: 'var(--success)' }} />
                ) : (
                  <Copy size={11} />
                )}
              </button>
            </div>
            {isOpen && (
              <pre
                className="px-2.5 py-2 border-t text-[11.5px] leading-relaxed font-mono overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap break-words"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text-secondary)',
                  backgroundColor: 'var(--bg-primary)',
                }}
              >
                {att.body}
              </pre>
            )}
          </div>
        )
      })}
    </div>
  )
}
