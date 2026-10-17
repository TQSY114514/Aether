// ─────────────────────────────────────────────────────────────────────────────
// app/src/components/chat/QueueDock.tsx
//
// Interactive Message Queue Dock (QueueDock)
// Displays queued follow-up instructions, allowing reordering, editing,
// and cancellation while the agent is running/streaming.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import {
  ListOrdered,
  ChevronUp,
  ChevronDown,
  Trash2,
  X,
  Edit3,
  Layers,
} from 'lucide-react'

interface QueueDockProps {
  onEditInComposer?: (content: string) => boolean | void
}

export default function QueueDock({ onEditInComposer }: QueueDockProps) {
  const queuedMessages = useStore((s) => s.queuedMessages)
  const removeQueued = useStore((s) => s.removeQueued)
  const reorderQueued = useStore((s) => s.reorderQueued)
  const clearQueued = useStore((s) => s.clearQueued)

  const [expanded, setExpanded] = useState(true)

  if (!queuedMessages || queuedMessages.length === 0) return null

  return (
    <div
      className="mb-2 rounded-lg border overflow-hidden transition-all shadow-sm page-fade-in"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header bar */}
      <div
        className="px-3 py-1.5 flex items-center justify-between text-xs cursor-pointer select-none border-b border-[var(--border)]"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ListOrdered size={14} style={{ color: 'var(--accent)' }} className="shrink-0" />
          <span className="font-medium text-[var(--text-primary)]">
            {t('queue.dock_title', '待发消息队列')}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-md font-mono font-medium"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--text-on-accent, var(--content-bg))',
            }}
          >
            {queuedMessages.length}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] truncate hidden sm:inline">
            {t('queue.dock_hint', '当前回合结束后将依次自动发送')}
          </span>
        </div>

        <div
          className="flex items-center gap-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={clearQueued}
            className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            title={t('queue.clear_all', '清空队列')}
          >
            <Trash2 size={11} />
            <span>{t('queue.clear_all', '清空')}</span>
          </button>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            aria-label={t('queue.toggle_dock', '展开/折叠队列')}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Expanded items list */}
      {expanded && (
        <div className="p-1.5 space-y-1.5 max-h-[160px] overflow-y-auto">
          {queuedMessages.map((item, idx) => {
            const isFirst = idx === 0
            const isLast = idx === queuedMessages.length - 1

            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-xs group transition-colors"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  borderColor: isFirst ? 'var(--accent)' : 'var(--border)',
                }}
              >
                {/* Index / Next badge */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold"
                    style={{
                      backgroundColor: isFirst ? 'var(--accent)' : 'var(--border)',
                      color: isFirst ? 'var(--text-on-accent, var(--content-bg))' : 'var(--text-secondary)',
                    }}
                  >
                    #{idx + 1}
                  </span>
                  {isFirst && (
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: 'var(--accent)' }}
                    >
                      {t('queue.item_next', '即将发送')}
                    </span>
                  )}
                </div>

                {/* Content preview */}
                <div className="flex-1 min-w-0 text-[var(--text-primary)] truncate font-mono text-[11px]">
                  {item.content}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {/* Reorder buttons */}
                  <button
                    type="button"
                    disabled={isFirst}
                    onClick={() => reorderQueued(idx, idx - 1)}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] disabled:opacity-20 disabled:cursor-not-allowed transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                    title={t('queue.move_up', '上移')}
                    aria-label={t('queue.move_up', '上移')}
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    type="button"
                    disabled={isLast}
                    onClick={() => reorderQueued(idx, idx + 1)}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] disabled:opacity-20 disabled:cursor-not-allowed transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                    title={t('queue.move_down', '下移')}
                    aria-label={t('queue.move_down', '下移')}
                  >
                    <ChevronDown size={12} />
                  </button>

                  {/* Edit in composer button */}
                  {onEditInComposer && (
                    <button
                      type="button"
                      onClick={() => {
                        const ok = onEditInComposer(item.content)
                        if (ok !== false) {
                          removeQueued(item.id)
                        }
                      }}
                      className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                      title={t('queue.edit_in_input', '回填编辑')}
                      aria-label={t('queue.edit_in_input', '回填编辑')}
                    >
                      <Edit3 size={11} />
                    </button>
                  )}

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => removeQueued(item.id)}
                    className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--border)] transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                    title={t('queue.remove_item', '移出队列')}
                    aria-label={t('queue.remove_item', '移出队列')}
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
