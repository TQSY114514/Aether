// ─────────────────────────────────────────────────────────────────────────────
// app/src/components/chat/input/SessionUsageRollbackBadge.tsx
//
// HUD Control 4: Session Tokens / Usage & One-Click Snapshot Rollback.
// High-contrast industrial monochrome design (Post-Digital Minimalist).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { RotateCcw, Layers } from 'lucide-react'
import { estimateTextTokens, formatTokens } from '@/utils/tokenEstimate'
import { DEFAULT_CONTEXT_WINDOW } from '@/utils/constants'

interface SessionUsageRollbackBadgeProps {
  sessionId?: number | null
}

export default function SessionUsageRollbackBadge({ sessionId }: SessionUsageRollbackBadgeProps) {
  const messages = useStore((s) => s.messages)
  const setCheckpointsOpen = useStore((s) => s.setCheckpointsOpen)
  const allModels = useStore((s) => s.allModels)
  const sessionConfigs = useStore((s) => s.sessionConfigs)

  const [hasCheckpoints, setHasCheckpoints] = useState(false)
  const [latestCheckpointId, setLatestCheckpointId] = useState<number | null>(null)
  const [rollingBack, setRollingBack] = useState(false)

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

  // Check recent checkpoints for session
  useEffect(() => {
    let cancelled = false
    if (!sessionId) {
      setHasCheckpoints(false)
      setLatestCheckpointId(null)
      return
    }
    window.electronAPI.agentCheckpoint?.list?.({ sessionId })
      .then((list: any[]) => {
        if (cancelled) return
        if (Array.isArray(list) && list.length > 0) {
          const sorted = list.slice().sort((a, b) => b.id - a.id)
          setHasCheckpoints(true)
          setLatestCheckpointId(sorted[0].id)
        } else {
          setHasCheckpoints(false)
          setLatestCheckpointId(null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasCheckpoints(false)
          setLatestCheckpointId(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, messages.length])

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
          useStore.getState().triggerToast('已一键回退到上一次写前快照', 'success')
        } else {
          useStore.getState().triggerToast(res.error || '回退失败', 'warning')
        }
      } catch (err: any) {
        useStore.getState().triggerToast(err.message || '回退失败', 'warning')
      } finally {
        setRollingBack(false)
      }
    },
    [latestCheckpointId, rollingBack, setCheckpointsOpen]
  )

  return (
    <div className="flex items-center gap-1 shrink-0 select-none">
      {/* Session Tokens Badge */}
      <div
        onClick={() => setCheckpointsOpen(true)}
        className="h-6.5 px-2 rounded-[6px] border text-[10px] font-mono font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--content-bg)',
          color: pct >= 80 ? 'var(--error)' : 'var(--text-secondary)',
        }}
        title={`当前会话已用 ${formatTokens(usedTokens)} / ${formatTokens(contextWindow)} tokens (${pct}%) · 点击打开时间旅行时光机`}
      >
        <Layers size={11} className="shrink-0 text-[var(--text-muted)]" />
        <span className="tabular-nums">
          {formatTokens(usedTokens)}
          <span className="hidden sm:inline text-[var(--text-muted)]"> ({pct}%)</span>
        </span>
      </div>

      {/* Snapshot Rollback Trigger */}
      <button
        type="button"
        onClick={handleQuickRollback}
        className={`h-6.5 px-2 rounded-[6px] border text-[10px] font-mono font-medium flex items-center gap-1 transition-colors cursor-pointer ${
          hasCheckpoints
            ? 'hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border)]'
            : 'text-[var(--text-muted)] border-[var(--border)] opacity-60'
        }`}
        style={{ backgroundColor: 'var(--content-bg)' }}
        title={hasCheckpoints ? '一键回退到写前快照 (或打开快照时光机)' : '查看文件修改快照与时光机'}
      >
        <RotateCcw size={11} className={`shrink-0 ${rollingBack ? 'animate-spin' : ''}`} />
        <span className="hidden md:inline">{rollingBack ? '回退中...' : '快照回退'}</span>
      </button>
    </div>
  )
}
