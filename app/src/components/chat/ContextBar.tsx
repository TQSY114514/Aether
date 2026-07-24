import { useMemo } from 'react'
import { useStore } from '@/store'
import { estimateTextTokens } from '@/utils/tokenEstimate'
import { DEFAULT_CONTEXT_WINDOW } from '@/utils/constants'

export default function ContextBar() {
  const messages = useStore((s) => s.messages)
  const modelsByProvider = useStore((s) => s.modelsByProvider)
  const sessionConfigs = useStore((s) => s.sessionConfigs)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const contextBudgetText = useStore((s) => s.contextBudgetText)

  const cfg = currentSessionId ? sessionConfigs[currentSessionId] : null
  const models = cfg?.providerId ? (modelsByProvider[cfg.providerId] || []) : []
  const currentModel = models.find(m => m.id === cfg?.modelId)
  const contextWindow = currentModel?.context_window || DEFAULT_CONTEXT_WINDOW

  // Memoize token estimation.
  const used = useMemo(() => messages.reduce((sum, m) => sum + estimateTextTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')) + 20, 0), [messages])
  const pct = Math.min(Math.round((used / contextWindow) * 100), 100)

  if (messages.length === 0 && !contextBudgetText) return null

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-b border-[var(--border)] bg-[var(--bg-secondary)]/50">
      <div className="flex-1 h-1 rounded-full bg-[var(--border)] overflow-hidden max-w-[200px]">
        <div className={`h-full rounded-full transition-all duration-500 ${pct > 90 ? 'ctx-danger' : pct > 70 ? 'ctx-warn' : 'ctx-safe'}`}
          style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">
        {formatTokens(used)} / {formatTokens(contextWindow)}
      </span>
      {contextBudgetText && (
        <span className="text-[11px] whitespace-nowrap" style={{ color: pct > 90 ? 'var(--error)' : pct > 70 ? 'var(--warning)' : 'var(--text-muted)' }}>
          {contextBudgetText}
        </span>
      )}
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toString()
}
