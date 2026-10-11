import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'

export interface StreamingStatusBarProps {
  sessionId: number | null
}

export default function StreamingStatusBar({ sessionId }: StreamingStatusBarProps) {
  const statusLines = useStore((s) => s.statusLinesByMessage)
  const turnUsage = useStore((s) => (sessionId ? s.turnUsageBySession[sessionId] : null))
  const cumUsage = useStore((s) => (sessionId ? s.usageBySession[sessionId] : null))
  const [status, setStatus] = useState('')
  const [stopped, setStopped] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    let latest = ''
    for (const [, lines] of Object.entries(statusLines)) {
      if (lines.length > 0 && lines[lines.length - 1].length > latest.length) {
        latest = lines[lines.length - 1]
      }
    }
    setStatus(latest)
  }, [statusLines, sessionId])

  // Listen for stop generation event
  useEffect(() => {
    const handler = () => setStopped(true)
    window.addEventListener('aether:generation-stopped', handler)
    return () => window.removeEventListener('aether:generation-stopped', handler)
  }, [])

  // Reset stopped state when streaming resumes
  useEffect(() => {
    if (status) setStopped(false)
  }, [status])

  if (!status && !stopped) return null
  const turnCost = turnUsage?.costUsd || 0
  const cumCost = cumUsage?.costUsd || 0
  const showCost = turnCost > 0 || cumCost > 0

  return (
    <div className="px-0.5 mt-1.5 min-w-0 animate-blur-fade">
      <div className="flex items-center gap-1.5 text-[11px] min-w-0" style={{ color: 'var(--text-muted)' }}>
        {stopped ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>{t('chat.generation_stopped_hint', '生成已停止 · 按 Continue 继续')}</span>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shrink-0" />
            <span className="min-w-0 truncate" title={status}>{status}</span>
          </>
        )}
        {showCost && (
          <span className="tabular-nums shrink-0 ml-auto">
            {t('usage.cost_line', `$${turnCost.toFixed(4)}`, `$${cumCost.toFixed(3)}`)}
          </span>
        )}
      </div>
    </div>
  )
}
