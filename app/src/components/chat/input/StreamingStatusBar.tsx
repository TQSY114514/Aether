import { useStore } from '@/store'
import { t } from '@/utils/i18n'

export interface StreamingStatusBarProps {
  sessionId: number | null
}

export default function StreamingStatusBar({ sessionId }: StreamingStatusBarProps) {
  const streamMsgId = useStore((s) => (sessionId ? (s.streamingBySession[sessionId]?.messageId ?? null) : null))
  const status = useStore((s) => {
    if (!streamMsgId) return ''
    const lines = s.statusLinesByMessage[streamMsgId]
    return lines && lines.length > 0 ? lines[lines.length - 1] : ''
  })
  const turnCost = useStore((s) => (sessionId ? (s.turnUsageBySession[sessionId]?.costUsd || 0) : 0))
  const cumCost = useStore((s) => (sessionId ? (s.usageBySession[sessionId]?.costUsd || 0) : 0))

  if (!status) return null
  const showCost = turnCost > 0 || cumCost > 0

  return (
    <div className="flex items-center gap-2 min-w-0 animate-blur-fade">
      <div className="flex items-center gap-1.5 text-[11px] min-w-0 flex-1" style={{ color: 'var(--text-muted)' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shrink-0" />
        <span className="min-w-0 truncate" title={status} aria-live="polite">{status}</span>
      </div>
      {showCost && (
        <span className="text-[10.5px] font-mono tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
          {t('usage.cost_line', `$${turnCost.toFixed(4)}`, `$${cumCost.toFixed(3)}`)}
        </span>
      )}
    </div>
  )
}
