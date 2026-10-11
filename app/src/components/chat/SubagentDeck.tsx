import { useState } from 'react'
import { Bot, CheckCircle2, ChevronDown, ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import { t } from '@/utils/i18n'

export type SubagentItem = {
  id: string
  name?: string
  task: string
  status: 'running' | 'done' | 'error'
  latencyMs?: number
  startedAt?: number
  output?: string
  error?: string
}

export default function SubagentDeck({ items }: { items: SubagentItem[] }) {
  const [open, setOpen] = useState(true)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  if (!items || items.length === 0) return null

  const total = items.length
  const completed = items.filter(x => x.status === 'done').length
  const hasError = items.some(x => x.status === 'error')
  const isAllDone = items.length > 0 && items.every(x => x.status === 'done')
  const isFinished = items.length > 0 && items.every(x => x.status === 'done' || x.status === 'error')

  const accentColor = hasError ? 'var(--error)' : isAllDone ? 'var(--success)' : 'var(--accent)'

  const titleText = isAllDone
    ? t('chat.subagent_completed')
    : isFinished && hasError
    ? t('chat.subagent_failed')
    : t('chat.subagent_running')

  return (
    <div
      className="rounded-lg border mb-2 overflow-hidden"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--bg-secondary)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--border)]/40 transition-colors"
      >
        {open ? <ChevronDown size={12} style={{ color: accentColor }} /> : <ChevronRight size={12} style={{ color: accentColor }} />}
        <Bot size={13} style={{ color: accentColor }} />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }} aria-live="polite">
          {titleText}
        </span>
        <span
          className="text-[10px] px-1.5 py-0.2 rounded-full tabular-nums shrink-0"
          style={{ backgroundColor: accentColor, color: 'var(--accent-contrast, #ffffff)' }}
        >
          {completed}/{total}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-2 pt-1 space-y-1.5 border-t border-[var(--border)]/50">
          {items.map((item, idx) => {
            const isDone = item.status === 'done'
            const isRunning = item.status === 'running'
            const isItemError = item.status === 'error'
            const isOutputExpanded = expandedIndex === idx

            return (
              <div
                key={item.id || idx}
                className="rounded border border-[var(--border)]/60 bg-[var(--bg-primary)] p-2 text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isRunning && <Loader2 size={12} className="animate-spin text-[var(--accent)] shrink-0" />}
                    {isDone && <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />}
                    {isItemError && <AlertCircle size={12} className="text-red-500 shrink-0" />}
                    <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0">#{idx + 1}</span>
                    <span className="font-medium truncate text-[var(--text-primary)]" title={item.task}>
                      {item.task}
                    </span>
                  </div>
                  {item.latencyMs != null && (
                    <span className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums shrink-0">
                      {(item.latencyMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>

                {isItemError && item.error && (
                  <div className="text-[11px] text-red-500 bg-red-50 dark:bg-red-950/20 p-1.5 rounded font-mono break-all">
                    {item.error}
                  </div>
                )}

                {item.output && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setExpandedIndex(isOutputExpanded ? null : idx)}
                      className="text-[10px] text-[var(--accent)] hover:underline flex items-center gap-1 mt-0.5"
                    >
                      {isOutputExpanded ? t('chat.subagent_hide_output', '收起详情') : t('chat.subagent_view_output', '查看执行结果')}
                    </button>
                    {isOutputExpanded && (
                      <div className="mt-1 p-2 rounded bg-[var(--bg-secondary)] border border-[var(--border)] text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                        {item.output}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
