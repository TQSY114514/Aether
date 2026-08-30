import { useState, useMemo, useCallback } from 'react'
import { useStore } from '@/store'
import { estimateTextTokens } from '@/utils/tokenEstimate'
import { DEFAULT_CONTEXT_WINDOW } from '@/utils/constants'
import { ChevronDown, ChevronUp } from 'lucide-react'

const ROLE_COLORS: Record<string, string> = {
  system: 'var(--accent)',
  user: 'var(--text-primary)',
  assistant: 'var(--success)',
  tool: 'var(--warning)',
}

function tokenFor(msg: { role: string; content: string }): number {
  const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '')
  // System messages carry a ~100 token overhead (role header + instructions)
  const overhead = msg.role === 'system' ? 100 : msg.role === 'tool' ? 30 : 20
  return estimateTextTokens(text) + overhead
}

export default function ContextBar() {
  const messages = useStore((s) => s.messages)
  const modelsByProvider = useStore((s) => s.modelsByProvider)
  const sessionConfigs = useStore((s) => s.sessionConfigs)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const contextBudgetText = useStore((s) => s.contextBudgetText)
  const [expanded, setExpanded] = useState(false)

  const cfg = currentSessionId ? sessionConfigs[currentSessionId] : null
  const models = cfg?.providerId ? (modelsByProvider[cfg.providerId] || []) : []
  const currentModel = models.find(m => m.id === cfg?.modelId)
  const contextWindow = currentModel?.context_window || DEFAULT_CONTEXT_WINDOW

  const { used, breakdown } = useMemo(() => {
    const bk: Record<string, { tokens: number; count: number }> = {}
    let total = 0
    for (const m of messages) {
      const t = tokenFor(m)
      const role = m.role || 'unknown'
      if (!bk[role]) bk[role] = { tokens: 0, count: 0 }
      bk[role].tokens += t
      bk[role].count++
      total += t
    }
    return { used: total, breakdown: bk }
  }, [messages])

  const pct = Math.min(Math.round((used / contextWindow) * 100), 100)
  const remaining = contextWindow - used

  if (messages.length === 0 && !contextBudgetText) return null

  const compact = Object.entries(breakdown).map(([role, d]) => ({ role, ...d }))
    .sort((a, b) => b.tokens - a.tokens)

  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)]/50">
      {/* Main bar */}
      <div className="flex items-center gap-3 px-4 py-1.5 w-full text-left hover:bg-[var(--bg-secondary)] transition-colors">
        <div className="flex-1 flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(e => !e)}>
          <div className="flex-1 flex rounded-full overflow-hidden h-1.5 gap-0.5 bg-[var(--border)] max-w-[200px]">
            {compact.map(s => (
              <div key={s.role} title={`${s.role}: ${formatTokens(s.tokens)} (${s.count} msgs)`}
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(s.tokens / used) * 100}%`, backgroundColor: ROLE_COLORS[s.role] || 'var(--text-muted)', minWidth: s.tokens > 0 ? 3 : 0 }} />
            ))}
          </div>
          <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap tabular-nums">
            {formatTokens(used)} / {formatTokens(contextWindow)} ({pct}%)
          </span>
          {remaining < contextWindow * 0.3 && remaining > 0 && (
            <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">
              {formatTokens(remaining)} left
            </span>
          )}
          {contextBudgetText && (
            <span className="text-[11px] whitespace-nowrap" style={{ color: pct > 90 ? 'var(--error)' : pct > 70 ? 'var(--warning)' : 'var(--text-muted)' }}>
              {contextBudgetText}
            </span>
          )}
          <span className="text-[var(--text-muted)]">{expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
        </div>
        
        {/* Compact button */}
        <button
          onClick={async (e) => {
            e.stopPropagation()
            if (!currentSessionId) return
            try {
              const res = await window.electronAPI.chat.compact(currentSessionId)
              if (res.ok) {
                console.log(`Compacted from ${res.beforeCount} to ${res.afterCount} messages.`)
              } else {
                console.error('Compact failed or unnecessary:', res.error)
              }
            } catch (err) {
              console.error('Compact error:', err)
            }
          }}
          title="Compact session context"
          className="text-[11px] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
        >
          Compact
        </button>
        
        {/* Fork button */}
        <button
          onClick={async (e) => {
            e.stopPropagation()
            if (!currentSessionId) return
            try {
              const res = await window.electronAPI.session.fork({ sessionId: currentSessionId })
              useStore.getState().loadSessions()
              useStore.getState().selectSession(res.id)
            } catch (err) {
              console.error('Fork failed:', err)
            }
          }}
          title="Fork session from current state"
          className="text-[11px] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
        >
          Fork
        </button>
      </div>

      {/* Expandable breakdown */}
      {expanded && (
        <div className="px-4 pb-2 pt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
          {compact.map(s => {
            const rolePct = Math.round((s.tokens / used) * 100)
            return (
              <div key={s.role} className="flex items-center gap-1.5 py-0.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ROLE_COLORS[s.role] || 'var(--text-muted)' }} />
                <span className="text-[var(--text-secondary)] capitalize w-16">{s.role}</span>
                <span className="text-[var(--text-muted)] tabular-nums">{formatTokens(s.tokens)} ({rolePct}%)</span>
                <span className="text-[var(--text-muted)]">×{s.count}</span>
              </div>
            )
          })}
          <div className="col-span-2 border-t border-[var(--border)] mt-1 pt-1 flex justify-between">
            <span className="text-[var(--text-secondary)]">Compaction threshold</span>
            <span className="text-[var(--text-muted)] tabular-nums">{formatTokens(Math.floor(contextWindow * 0.8))} (80%)</span>
          </div>
          <div className="col-span-2 flex justify-between">
            <span className="text-[var(--text-secondary)]">Warning threshold</span>
            <span className="text-[var(--text-muted)] tabular-nums">{formatTokens(Math.floor(contextWindow * 0.7))} (70%)</span>
          </div>
        </div>
      )}
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toString()
}
