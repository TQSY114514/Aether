// ─────────────────────────────────────────────────────────────────────────────
// app/src/components/chat/input/SessionUsageRollbackBadge.tsx
//
// HUD Control 4: Session Context % Ring, One-Click Compaction & Snapshot Rollback.
// High-contrast industrial monochrome design (Post-Digital Minimalist).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useStore } from '@/store'
import { RotateCcw, Minimize2, History } from 'lucide-react'
import { estimateTextTokens, formatTokens } from '@/utils/tokenEstimate'
import { DEFAULT_CONTEXT_WINDOW } from '@/utils/constants'
import { t } from '@/utils/i18n'

interface SessionUsageRollbackBadgeProps {
  sessionId?: number | null
}

const RING_RADIUS = 5.5
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export default function SessionUsageRollbackBadge({ sessionId }: SessionUsageRollbackBadgeProps) {
  const messages = useStore((s) => s.messages)
  const setCheckpointsOpen = useStore((s) => s.setCheckpointsOpen)
  const loadMessages = useStore((s) => s.loadMessages)
  const allModels = useStore((s) => s.allModels)
  const sessionConfigs = useStore((s) => s.sessionConfigs)

  const [hasCheckpoints, setHasCheckpoints] = useState(false)
  const [checkpointCount, setCheckpointCount] = useState(0)
  const [latestCheckpointId, setLatestCheckpointId] = useState<number | null>(null)
  const [rollingBack, setRollingBack] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [compacting, setCompacting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Context window calculation
  const cfg = sessionId ? sessionConfigs[sessionId] : null
  const activeModel = useMemo(() => {
    if (cfg?.modelId) {
      const found = allModels.find((m) => m.id === cfg.modelId)
      if (found) return found
    }
    const primary = allModels.find((m) => m.is_primary)
    return primary || allModels[0] || null
  }, [cfg, allModels])

  const contextWindow = activeModel?.context_window || DEFAULT_CONTEXT_WINDOW

  // Token estimate
  const usedTokens = useMemo(() => {
    let total = 0
    for (const m of messages) {
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')
      const overhead = m.role === 'system' ? 100 : 20
      total += estimateTextTokens(text) + overhead
    }
    return total
  }, [messages])

  const pct = Math.min(100, Math.round((usedTokens / contextWindow) * 100))
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - pct / 100)
  const ringColor = pct >= 90 ? 'var(--error)' : pct >= 75 ? 'var(--warning)' : 'var(--text-secondary)'
  const labelColor = pct >= 90 ? 'var(--error)' : pct >= 75 ? 'var(--warning)' : 'var(--text-muted)'

  // Check recent checkpoints for session
  useEffect(() => {
    let cancelled = false
    if (!sessionId) {
      setHasCheckpoints(false)
      setCheckpointCount(0)
      setLatestCheckpointId(null)
      return
    }
    window.electronAPI.agentCheckpoint?.list?.({ sessionId })
      .then((list: any[]) => {
        if (cancelled) return
        if (Array.isArray(list) && list.length > 0) {
          const activeCheckpoints = list.filter((cp: any) => !cp.rolled_back_at)
          setCheckpointCount(activeCheckpoints.length)
          if (activeCheckpoints.length > 0) {
            const sorted = activeCheckpoints.slice().sort((a, b) => b.id - a.id)
            setHasCheckpoints(true)
            setLatestCheckpointId(sorted[0].id)
          } else {
            setHasCheckpoints(false)
            setLatestCheckpointId(null)
          }
        } else {
          setHasCheckpoints(false)
          setCheckpointCount(0)
          setLatestCheckpointId(null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasCheckpoints(false)
          setCheckpointCount(0)
          setLatestCheckpointId(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, messages.length])

  // Close popover on outside click or Escape
  useEffect(() => {
    if (!popoverOpen) return
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopoverOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [popoverOpen])

  const handleCompact = useCallback(async () => {
    if (!sessionId || compacting || messages.length === 0) return
    setCompacting(true)
    try {
      const res = await window.electronAPI.chat.compact(sessionId)
      if (res?.ok) {
        await loadMessages(sessionId)
        useStore.getState().triggerToast(
          t('chat.compact_success', res.beforeCount ?? 0, res.afterCount ?? 0),
          'success'
        )
        setPopoverOpen(false)
      } else {
        useStore.getState().triggerToast(
          res?.error || t('chat.compact_unnecessary'),
          'info'
        )
      }
    } catch (err: any) {
      useStore.getState().triggerToast(err?.message || 'Compact failed', 'error')
    } finally {
      setCompacting(false)
    }
  }, [sessionId, compacting, messages.length, loadMessages])

  const handleQuickRollback = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!latestCheckpointId || rollingBack) {
        setCheckpointsOpen(true)
        return
      }
      setRollingBack(true)
      try {
        const res = await window.electronAPI.agentCheckpoint.rollback({
          id: latestCheckpointId,
        })
        if (res.success) {
          useStore.getState().triggerToast(t('hud.rollback_success'), 'success')
        } else {
          useStore.getState().triggerToast(res.error || t('hud.rollback_failed'), 'warning')
        }
      } catch (err: any) {
        useStore.getState().triggerToast(err.message || t('hud.rollback_failed'), 'warning')
      } finally {
        setRollingBack(false)
      }
    },
    [latestCheckpointId, rollingBack, setCheckpointsOpen]
  )

  const tooltipText = t('hud.context_usage', formatTokens(usedTokens), formatTokens(contextWindow), pct)

  return (
    <div ref={containerRef} className="relative flex items-center gap-0.5 shrink-0 select-none">
      {/* Context % Ring Pill */}
      <button
        type="button"
        onClick={() => setPopoverOpen((v) => !v)}
        aria-expanded={popoverOpen}
        aria-label={tooltipText}
        title={tooltipText}
        className="h-6 px-1.5 rounded-[6px] text-[11px] font-mono flex items-center gap-1.5 hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
        style={{ color: labelColor }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" className="shrink-0 -rotate-90" aria-hidden="true">
          <circle
            cx="8"
            cy="8"
            r={RING_RADIUS}
            fill="none"
            stroke="var(--border)"
            strokeWidth="2"
          />
          <circle
            cx="8"
            cy="8"
            r={RING_RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            className="transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none"
          />
        </svg>
        <span className="tabular-nums font-medium">{pct}%</span>
      </button>

      {/* Popover: Token details + One-Click Compact + Outputs Drawer */}
      {popoverOpen && (
        <div
          className="absolute bottom-full right-0 mb-2 w-60 rounded-[10px] border p-2.5 shadow-md z-30"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="flex items-center justify-between text-[11px] font-mono mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            <span>{formatTokens(usedTokens)} / {formatTokens(contextWindow)}</span>
            <span className="tabular-nums font-semibold" style={{ color: ringColor }}>{pct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-[6px] overflow-hidden mb-2.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <div
              className="h-full rounded-[6px] transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${pct}%`, backgroundColor: ringColor }}
            />
          </div>
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleCompact}
              disabled={!sessionId || compacting || messages.length === 0}
              className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-[6px] border text-[11px] font-medium hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', backgroundColor: 'var(--content-bg)' }}
            >
              <span className="flex items-center gap-1.5">
                <Minimize2 size={12} className="shrink-0 text-[var(--accent)]" />
                <span>{compacting ? t('hud.compacting') : t('hud.compact_now')}</span>
              </span>
              <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>/compact</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPopoverOpen(false)
                setCheckpointsOpen(true)
              }}
              className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-[6px] text-[11px] hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="flex items-center gap-1.5">
                <History size={12} className="shrink-0" />
                <span>{t('hud.open_outputs')}</span>
              </span>
              {checkpointCount > 0 && (
                <span className="font-mono text-[10px] tabular-nums px-1 rounded-[4px]" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                  {checkpointCount}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Snapshot Rollback Trigger (only highlighted when checkpoints exist) */}
      {hasCheckpoints && (
        <button
          type="button"
          onClick={handleQuickRollback}
          disabled={rollingBack}
          className="h-6 px-1.5 rounded-[6px] text-[10.5px] font-mono flex items-center gap-1 hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          title={t('hud.rollback_tooltip')}
        >
          <RotateCcw size={10.5} className={`shrink-0 ${rollingBack ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">{rollingBack ? t('hud.rolling_back') : t('hud.rollback_btn')}</span>
        </button>
      )}
    </div>
  )
}
