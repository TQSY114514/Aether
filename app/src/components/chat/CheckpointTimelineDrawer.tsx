// ─────────────────────────────────────────────────────────────────────────────
// app/src/components/chat/CheckpointTimelineDrawer.tsx
//
// Time-Travel Checkpoint Timeline Drawer (Cursor / Windsurf / Codex alignment).
// Lets users inspect the chronological history of file modification snapshots
// and roll back any change to a precise point in time.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import {
  History,
  X,
  RotateCcw,
  FileCode,
  Check,
  Search,
  RefreshCw,
  Clock,
  Layers,
  AlertCircle,
} from 'lucide-react'

interface CheckpointRecord {
  id: number
  session_id: number
  message_id?: number
  tool_name: string
  affected_paths: string | string[]
  created_at: string
  rolled_back_at?: string | null
}

function parsePaths(val: string | string[]): string[] {
  if (Array.isArray(val)) return val
  try {
    const parsed = JSON.parse(val)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatRelativeTime(dateStr: string): string {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return `${diffSec}秒前`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}分钟前`
    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return `${diffHour}小时前`
    return `${Math.floor(diffHour / 24)}天前`
  } catch {
    return dateStr
  }
}

function getFileName(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() || p
}

export default function CheckpointTimelineDrawer() {
  const open = useStore((s) => s.checkpointsOpen)
  const setOpen = useStore((s) => s.setCheckpointsOpen)
  const currentSessionId = useStore((s) => s.currentSessionId)

  const [checkpoints, setCheckpoints] = useState<CheckpointRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [rollingId, setRollingId] = useState<number | null>(null)

  const loadCheckpoints = useCallback(async () => {
    if (!currentSessionId) {
      setCheckpoints([])
      return
    }
    setLoading(true)
    try {
      const list = await window.electronAPI.agentCheckpoint.list({ sessionId: currentSessionId })
      // Sort newest first
      const sorted = (list || []).slice().sort((a: any, b: any) => b.id - a.id)
      setCheckpoints(sorted)
    } catch {
      setCheckpoints([])
    } finally {
      setLoading(false)
    }
  }, [currentSessionId])

  useEffect(() => {
    if (open) {
      loadCheckpoints()
    }
  }, [open, loadCheckpoints])

  const handleRollback = useCallback(
    async (cp: CheckpointRecord) => {
      if (rollingId !== null || cp.rolled_back_at || !currentSessionId) return
      const ok = window.confirm(
        `确定要回滚到检查点 #${cp.id} 吗？\n将撤销本次工具调用 (${cp.tool_name}) 写入的文件更改。`
      )
      if (!ok) return

      setRollingId(cp.id)
      try {
        const res = await window.electronAPI.agentCheckpoint.rollback({
          id: cp.id,
          sessionId: currentSessionId,
        })
        if (res.success) {
          useStore
            .getState()
            .triggerToast(`已回滚至检查点 #${cp.id}`, 'success')
          await loadCheckpoints()
          await useStore.getState().loadMessages(currentSessionId)
        } else {
          useStore
            .getState()
            .triggerToast(`回滚失败：${res.error || '未知错误'}`, 'error')
        }
      } catch (e: any) {
        useStore.getState().triggerToast(`回滚异常：${e.message || e}`, 'error')
      } finally {
        setRollingId(null)
      }
    },
    [rollingId, currentSessionId, loadCheckpoints]
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return checkpoints
    const q = search.trim().toLowerCase()
    return checkpoints.filter((cp) => {
      const paths = parsePaths(cp.affected_paths)
      const pathMatch = paths.some((p) => p.toLowerCase().includes(q))
      const toolMatch = (cp.tool_name || '').toLowerCase().includes(q)
      const idMatch = `#${cp.id}`.includes(q)
      return pathMatch || toolMatch || idMatch
    })
  }, [checkpoints, search])

  if (!open) return null

  return (
    <aside
      className="fixed top-0 bottom-0 end-0 w-[380px] z-[110] flex flex-col animate-blur-fade shadow-2xl"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderInlineStart: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="h-12 flex items-center gap-2 px-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <History size={16} style={{ color: 'var(--accent)' }} />
        <span
          className="text-sm font-semibold tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {t('checkpoints.title', '检查点时光机')}
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums font-mono text-[var(--text-muted)]"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          {checkpoints.length}
        </span>

        <button
          onClick={loadCheckpoints}
          disabled={loading}
          className="ms-auto p-1.5 rounded-md hover:bg-[var(--border)] transition-colors cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          title={t('checkpoints.refresh', '刷新')}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>

        <button
          onClick={() => setOpen(false)}
          className="p-1.5 rounded-md hover:bg-[var(--border)] transition-colors cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          title={t('common.close', '关闭')}
          aria-label={t('common.close', '关闭')}
        >
          <X size={14} />
        </button>
      </div>

      {/* Subheader / Search */}
      <div
        className="p-2.5 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div
          className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border)',
          }}
        >
          <Search size={13} className="text-[var(--text-muted)] shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('checkpoints.search_placeholder', '搜索文件名、工具或 #ID…')}
            className="flex-1 bg-transparent outline-none text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Timeline List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {loading && checkpoints.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-xs text-[var(--text-muted)] gap-2">
            <RefreshCw size={14} className="animate-spin" />
            <span>{t('checkpoints.loading', '正在读取会话检查点…')}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center px-4">
            <Layers size={28} className="text-[var(--text-muted)] opacity-40 mb-2" />
            <p className="text-xs font-medium text-[var(--text-primary)]">
              {search ? t('checkpoints.no_search_results', '未找到匹配的检查点') : t('checkpoints.empty_title', '暂无代码修改检查点')}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              {t('checkpoints.empty_desc', '当 Agent 写入或编辑文件时，系统会自动生成快照。')}
            </p>
          </div>
        ) : (
          filtered.map((cp) => {
            const paths = parsePaths(cp.affected_paths)
            const isRolledBack = !!cp.rolled_back_at
            const isRolling = rollingId === cp.id

            return (
              <div
                key={cp.id}
                className="rounded-lg border p-2.5 transition-all text-xs relative group"
                style={{
                  backgroundColor: isRolledBack
                    ? 'var(--bg-secondary)'
                    : 'var(--bg-primary)',
                  borderColor: 'var(--border)',
                  opacity: isRolledBack ? 0.7 : 1,
                }}
              >
                {/* Top row: ID, Tool, Time */}
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono font-semibold text-[11px] text-[var(--accent)] shrink-0">
                      #{cp.id}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded-[4px] text-[10px] font-mono shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {cp.tool_name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] shrink-0">
                    <Clock size={10} />
                    <span>{formatRelativeTime(cp.created_at)}</span>
                  </div>
                </div>

                {/* Affected files */}
                {paths.length > 0 && (
                  <div className="my-1.5 space-y-1">
                    {paths.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--text-muted)] truncate"
                        title={p}
                      >
                        <FileCode size={11} className="shrink-0 text-[var(--accent)] opacity-80" />
                        <span className="truncate">{getFileName(p)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action footer */}
                <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-[var(--border)]">
                  {isRolledBack ? (
                    <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] italic">
                      <Check size={11} style={{ color: 'var(--text-muted)' }} />
                      <span>{t('checkpoints.already_rolled_back', '已回滚')}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-[var(--success)] font-medium">
                      ● {t('checkpoints.active_snapshot', '当前活动状态')}
                    </span>
                  )}

                  {!isRolledBack && (
                    <button
                      type="button"
                      onClick={() => handleRollback(cp)}
                      disabled={isRolling}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer hover:bg-[var(--border)] disabled:opacity-50 text-[var(--text-primary)]"
                      style={{ borderColor: 'var(--border)' }}
                      title={t('checkpoints.rollback_btn', '回滚到此状态')}
                    >
                      <RotateCcw size={10} className={isRolling ? 'animate-spin' : ''} />
                      <span>{isRolling ? t('checkpoints.rolling', '回滚中…') : t('checkpoints.rollback_action', '回滚改动')}</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
