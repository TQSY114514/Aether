import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'

export interface StreamingStatusBarProps {
  sessionId: number | null
}

export default function StreamingStatusBar({ sessionId }: StreamingStatusBarProps) {
  const statusLines = useStore((s) => s.statusLinesByMessage)
  const streamingBySession = useStore((s) => s.streamingBySession)
  const turnUsage = useStore((s) => (sessionId ? s.turnUsageBySession[sessionId] : null))
  const cumUsage = useStore((s) => (sessionId ? s.usageBySession[sessionId] : null))
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!sessionId) {
      setStatus('')
      return
    }
    const currentStream = streamingBySession[sessionId]
    const msgId = currentStream?.messageId
    if (!msgId) {
      setStatus('')
      return
    }
    const lines = statusLines[msgId]
    if (lines && lines.length > 0) {
      setStatus(lines[lines.length - 1])
    } else {
      setStatus('')
    }
  }, [statusLines, sessionId, streamingBySession])

  if (!status) return null
  const turnCost = turnUsage?.costUsd || 0
  const cumCost = cumUsage?.costUsd || 0
  const showCost = turnCost > 0 || cumCost > 0

  return (
    <div className="px-0.5 mt-1.5 min-w-0 animate-blur-fade">
      <div className="flex items-center gap-1.5 text-[11px] min-w-0" style={{ color: 'var(--text-muted)' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shrink-0" />
        <span className="min-w-0 truncate" title={status} aria-live="polite">{status}</span>
        {showCost && (
          <span className="tabular-nums shrink-0 ml-auto">
            {t('usage.cost_line', `$${turnCost.toFixed(4)}`, `$${cumCost.toFixed(3)}`)}
          </span>
        )}
      </div>
    </div>
  )
}
