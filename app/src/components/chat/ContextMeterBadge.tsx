import { useState, useMemo, useRef, useEffect } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { estimateTextTokens, formatTokens } from '@/utils/tokenEstimate'
import { DEFAULT_CONTEXT_WINDOW } from '@/utils/constants'
import { Gauge, AlertTriangle, AlertCircle, ChevronUp, Layers, GitFork, Minimize2, Check } from 'lucide-react'

function tokenFor(msg: { role: string; content: string }): number {
  const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '')
  const overhead = msg.role === 'system' ? 100 : msg.role === 'tool' ? 30 : 20
  return estimateTextTokens(text) + overhead
}

export default function ContextMeterBadge() {
  const [open, setOpen] = useState(false)
  const [compacting, setCompacting] = useState(false)
  const [compactedSuccess, setCompactedSuccess] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const messages = useStore((s) => s.messages)
  const modelsByProvider = useStore((s) => s.modelsByProvider)
  const sessionConfigs = useStore((s) => s.sessionConfigs)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const contextBudgetText = useStore((s) => s.contextBudgetText)

  const cfg = currentSessionId ? sessionConfigs[currentSessionId] : null
  const allModels = useMemo(() => Object.values(modelsByProvider).flat(), [modelsByProvider])
  const activeModel = useMemo(() => {
    if (cfg?.providerId && cfg?.modelId) {
      const found = (modelsByProvider[cfg.providerId] || []).find((m) => m.id === cfg.modelId)
      if (found) return found
    }
    if (cfg?.modelId) {
      const found = allModels.find((m) => m.id === cfg.modelId)
      if (found) return found
    }
    const primary = allModels.find((m) => m.is_primary)
    if (primary) return primary
    return allModels[0] || null
  }, [cfg, modelsByProvider, allModels])

  const contextWindow = activeModel?.context_window || DEFAULT_CONTEXT_WINDOW

  const { used, breakdown } = useMemo(() => {
    const bk: Record<string, { tokens: number; count: number }> = {}
    let total = 0
    for (const m of messages) {
      const tok = tokenFor(m)
      const role = m.role || 'unknown'
      if (!bk[role]) bk[role] = { tokens: 0, count: 0 }
      bk[role].tokens += tok
      bk[role].count++
      total += tok
    }
    return { used: total, breakdown: bk }
  }, [messages])

  const pct = Math.min(Math.round((used / contextWindow) * 100), 100)
  const isWarning = pct >= 70 && pct < 85
  const isCritical = pct >= 85

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  const handleCompact = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!currentSessionId || compacting) return
    setCompacting(true)
    try {
      const res = await window.electronAPI.chat.compact(currentSessionId)
      if (res.ok) {
        setCompactedSuccess(true)
        await useStore.getState().selectSession(currentSessionId)
        useStore.getState().triggerToast(
          t('chat.compact_success', `上下文已压缩：从 ${res.beforeCount} 条优化为 ${res.afterCount} 条`),
          'success'
        )
        setTimeout(() => setCompactedSuccess(false), 3000)
      } else {
        useStore.getState().triggerToast(res.error || '无需压缩或压缩失败', 'info')
      }
    } catch (err: any) {
      useStore.getState().triggerToast(err.message || '压缩失败', 'warning')
    } finally {
      setCompacting(false)
    }
  }

  const handleFork = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentSessionId) return
    try {
      const res = await window.electronAPI.session.fork({ sessionId: currentSessionId })
      await useStore.getState().loadSessions()
      await useStore.getState().selectSession(res.id)
      setOpen(false)
      useStore.getState().triggerToast(t('context_meter.fork_success', '已分叉新会话'), 'success')
    } catch {
      useStore.getState().triggerToast(t('context_meter.fork_failed', '会话分叉失败'), 'warning')
    }
  }

  if (messages.length === 0 && !contextBudgetText) return null

  return (
    <div className="relative inline-flex items-center" ref={popoverRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-mono transition-all press-scale ${
          isCritical
            ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/15'
            : isWarning
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/15'
            : 'bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border)]'
        }`}
        title={
          isCritical
            ? t('context_meter.critical_title', pct)
            : isWarning
            ? t('context_meter.warning_title', pct)
            : t('context_meter.estimate_title', formatTokens(used), formatTokens(contextWindow), pct)
        }
      >
        {isCritical ? (
          <AlertCircle size={11} className="shrink-0 text-red-500 animate-pulse" />
        ) : isWarning ? (
          <AlertTriangle size={11} className="shrink-0 text-amber-500" />
        ) : (
          <Gauge size={11} className="shrink-0 opacity-70" />
        )}
        <span className="tabular-nums">
          {formatTokens(used)}/{formatTokens(contextWindow)} ({pct}%)
        </span>
      </button>

      {isCritical && (
        <button
          type="button"
          onClick={handleCompact}
          disabled={compacting}
          className="ml-1 px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-mono hover:bg-red-500 transition-colors disabled:opacity-50 cursor-pointer"
          aria-label={t('context_meter.compact', '压缩')}
          title={t('context_meter.compact', '压缩')}
        >
          {compacting ? '...' : compactedSuccess ? 'OK' : t('context_meter.compact', '压缩')}
        </button>
      )}

      {/* Popover Breakdown Deck */}
      {open && (
        <div
          className="absolute right-0 bottom-full mb-2 w-64 rounded-lg border shadow-xl p-3 z-50 animate-spring-up text-left"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border)] mb-2.5">
            <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
              <Layers size={13} className="text-[var(--accent)]" />
              <span>{t('context_meter.overview', '上下文预算概览')}</span>
            </span>
            <span className="text-[10px] font-mono tabular-nums text-[var(--text-muted)]">
              {pct}% ({formatTokens(used)} / {formatTokens(contextWindow)})
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 w-full rounded-full overflow-hidden bg-[var(--border)] mb-3">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-[var(--accent)]'
              }`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>

          {/* Role breakdown */}
          <div className="space-y-1.5 text-[11px] mb-3">
            {Object.entries(breakdown).map(([role, data]) => {
              const rolePct = used > 0 ? Math.round((data.tokens / used) * 100) : 0
              return (
                <div key={role} className="flex items-center justify-between text-[10px]">
                  <span className="capitalize text-[var(--text-secondary)]">{role}</span>
                  <span className="font-mono text-[var(--text-muted)] tabular-nums">
                    {formatTokens(data.tokens)} ({rolePct}%) · {data.count}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Threshold hints */}
          <div className="border-t border-[var(--border)] pt-2 space-y-1 text-[10px] text-[var(--text-muted)] mb-3">
            <div className="flex justify-between">
              <span>{t('context_meter.recommended_threshold', '压缩推荐阈值 (80%)')}</span>
              <span className="font-mono tabular-nums">{formatTokens(Math.floor(contextWindow * 0.8))}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('context_meter.safety_margin', '剩余安全余量')}</span>
              <span className="font-mono tabular-nums">
                {contextWindow > used ? formatTokens(contextWindow - used) : '0'}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--border)]">
            <button
              onClick={handleCompact}
              disabled={compacting}
              className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[11px] border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-primary)] disabled:opacity-50"
            >
              <Minimize2 size={11} />
              <span>{compacting ? t('context_meter.compacting', '压缩中...') : compactedSuccess ? t('context_meter.compacted', '已压缩') : t('context_meter.compact', '执行压缩')}</span>
            </button>
            <button
              onClick={handleFork}
              className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[11px] border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-primary)]"
            >
              <GitFork size={11} />
              <span>{t('context_meter.fork_session', '分叉新会话')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
