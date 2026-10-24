import { useState, useMemo } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { estimateTextTokens } from '@/utils/tokenEstimate'
import { DEFAULT_CONTEXT_WINDOW } from '@/utils/constants'
import { ChevronDown, ChevronUp, AlertCircle, Sparkles } from 'lucide-react'

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

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toString()
}

/** Display current context usage and compaction status when approaching limits. */
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

  // Only display ContextBar when context usage is high (>= 60%) or when an active budget text exists,
  // to avoid visual clutter and duplicate indicators during ordinary low-pressure chat turns.
  // The persistent ContextMeterBadge in the bottom composer handles everyday non-intrusive monitoring.
  if (messages.length === 0 || (pct < 60 && !contextBudgetText)) return null

  const compact = Object.entries(breakdown).map(([role, d]) => ({ role, ...d }))
    .sort((a, b) => b.tokens - a.tokens)

  const isUrgent = pct >= 80

  return (
    <div
      className={`border-b transition-colors select-none ${
        isUrgent
          ? 'bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-400'
          : 'bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-400'
      }`}
    >
      {/* Main bar */}
      <div className="flex items-center gap-3 px-4 py-1.5 w-full text-left">
        <div className="flex-1 flex items-center gap-2.5 cursor-pointer" onClick={() => setExpanded(e => !e)}>
          {isUrgent ? (
            <AlertCircle size={13} className="shrink-0 text-red-500 animate-pulse" />
          ) : (
            <Sparkles size={13} className="shrink-0 text-amber-500" />
          )}
          <div className="flex-1 flex rounded-full overflow-hidden h-1.5 gap-0.5 bg-black/10 dark:bg-white/10 max-w-[160px]">
            {compact.map(s => (
              <div
                key={s.role}
                title={`${s.role}: ${formatTokens(s.tokens)} (${s.count} msgs)`}
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(s.tokens / used) * 100}%`,
                  backgroundColor: ROLE_COLORS[s.role] || 'var(--text-muted)',
                  minWidth: s.tokens > 0 ? 3 : 0,
                }}
              />
            ))}
          </div>
          <span className="text-[11px] font-mono whitespace-nowrap tabular-nums font-medium">
            {formatTokens(used)} / {formatTokens(contextWindow)} ({pct}%)
          </span>
          {remaining < contextWindow * 0.4 && remaining > 0 && (
            <span className="text-[11px] opacity-80 whitespace-nowrap hidden sm:inline">
              {formatTokens(remaining)} left
            </span>
          )}
          {contextBudgetText && (
            <span className="text-[11px] font-medium whitespace-nowrap">
              {contextBudgetText}
            </span>
          )}
          <span className="opacity-70">{expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
        </div>
        
        {/* Compact button */}
        <button
          onClick={async (e) => {
            e.stopPropagation()
            if (!currentSessionId) return
            try {
              const res = await window.electronAPI.chat.compact(currentSessionId)
              if (res.ok) {
                if (useStore.getState().currentSessionId === currentSessionId) {
                  await useStore.getState().loadMessages(currentSessionId)
                }
                useStore.getState().triggerToast(
                  t('chat.compact_success', res.beforeCount ?? 0, res.afterCount ?? 0),
                  'success'
                )
              } else {
                useStore.getState().triggerToast(res.error || t('chat.compact_unnecessary', '无需压缩或压缩失败'), 'info')
              }
            } catch (err: any) {
              useStore.getState().triggerToast(err?.message || t('chat.compact_error', '压缩失败'), 'warning')
            }
          }}
          title={t('chat.compact_hint')}
          className="text-[11px] font-medium px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--content-bg)] hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] transition-colors shrink-0"
        >
          {t('chat.compact')}
        </button>
        
        {/* Fork button */}
        <button
          onClick={async (e) => {
            e.stopPropagation()
            if (!currentSessionId) return
            try {
              const res = await window.electronAPI.session.fork({ sessionId: currentSessionId })
              await useStore.getState().loadSessions()
              await useStore.getState().selectSession(res.id)
            } catch (err) {
              console.error('Fork failed:', err)
            }
          }}
          title={t('chat.fork_hint')}
          className="text-[11px] px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--content-bg)] hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
        >
          {t('chat.fork')}
        </button>
      </div>

      {/* Expandable breakdown */}
      {expanded && (
        <div className="px-4 pb-2 pt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] bg-black/5 dark:bg-white/5">
          {compact.map(s => {
            const rolePct = Math.round((s.tokens / used) * 100)
            return (
              <div key={s.role} className="flex items-center gap-1.5 py-0.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ROLE_COLORS[s.role] || 'var(--text-muted)' }} />
                <span className="capitalize w-16">{s.role}</span>
                <span className="tabular-nums opacity-80">{formatTokens(s.tokens)} ({rolePct}%)</span>
                <span className="opacity-60">×{s.count}</span>
              </div>
            )
          })}
          <div className="col-span-2 border-t border-[var(--border)] mt-1 pt-1 flex justify-between">
            <span>Compaction threshold</span>
            <span className="tabular-nums">{formatTokens(Math.floor(contextWindow * 0.8))} (80%)</span>
          </div>
          <div className="col-span-2 flex justify-between">
            <span>Warning threshold</span>
            <span className="tabular-nums">{formatTokens(Math.floor(contextWindow * 0.7))} (70%)</span>
          </div>
        </div>
      )}
    </div>
  )
}
