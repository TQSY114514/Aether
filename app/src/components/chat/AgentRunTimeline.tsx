import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  History,
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Clock,
  ChevronDown,
  ChevronRight,
  FileCode,
  Terminal,
  Globe,
  FileEdit,
  Wrench,
  Search,
  RotateCcw,
} from 'lucide-react'
import { t } from '@/utils/i18n'
import { useStore } from '@/store'
import { useUI } from '@/components/ui/feedback'

interface AuditLogEntry {
  id: number
  session_id: number
  turn_id: number
  payload: {
    totalIterations?: number
    planId?: string
    finalStatus?: string
    toolCalls?: Array<{
      name: string
      args: Record<string, unknown>
      result: unknown
      error: string | null
      failure_kind?: string | null
      latencyMs?: number | null
      depth?: number
      diff?: string | null
      isTainted?: boolean
      approval?: string
    }>
  }
  created_at: string
}

const TOOL_ICONS: Record<string, typeof Terminal> = {
  run_command: Terminal,
  write_file: FileEdit,
  edit_file: FileEdit,
  apply_patch: FileCode,
  read_file: FileCode,
  list_dir: FileCode,
  grep_search: Search,
  glob_find: Search,
  web_search: Globe,
  web_fetch: Globe,
  read_url_content: Globe,
}

/** Render the live agent run as a chronological status timeline. */
export default function AgentRunTimeline({
  sessionId,
  isOpen,
  onClose,
}: {
  sessionId: number
  isOpen: boolean
  onClose: () => void
}) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)
  const [expandedTurns, setExpandedTurns] = useState<Record<number, boolean>>({})
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({})
  const { confirm } = useUI()

  const handleRollback = async () => {
    const ok = await confirm({
      title: t('agent.timeline.rollback_title', '撤销修改'),
      description: t('agent.timeline.rollback_confirm', '确定要撤销 Agent 上一次对工作区进行的修改吗？'),
      danger: true,
      confirmText: t('common.rollback', '撤销'),
      cancelText: t('common.cancel', '取消'),
    })
    if (!ok) return
    setRollingBack(true)
    try {
      const res = await useStore.getState().undoLastAction()
      if (res.ok) {
        useStore.getState().triggerToast(res.message || t('agent.timeline.rollback_success', '工作区变更已成功撤销'), 'success')
        fetchLogs()
      } else {
        useStore.getState().triggerToast(res.error || '回滚失败', 'error')
      }
    } catch (e: any) {
      useStore.getState().triggerToast(e?.message || '回滚发生异常', 'error')
    } finally {
      setRollingBack(false)
    }
  }

  const fetchLogs = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    try {
      const data = await window.electronAPI.agent.getAuditLog(sessionId, 40)
      setLogs(Array.isArray(data) ? data : [])
      // Auto-expand latest turn
      if (Array.isArray(data) && data.length > 0) {
        setExpandedTurns((prev) => ({ ...prev, [data[0].id]: true }))
      }
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    if (isOpen) {
      fetchLogs()
    }
  }, [isOpen, fetchLogs])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const toggleTurn = (turnId: number) => {
    setExpandedTurns((prev) => ({ ...prev, [turnId]: !prev[turnId] }))
  }

  const toggleDiff = (key: string) => {
    setExpandedDiffs((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 lg:p-8 animate-fade-in">
      {/* Backdrop — covers the entire screen including sidebar */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Centered Floating Window */}
      <div
        className="relative w-full max-w-3xl h-[82vh] max-h-[820px] rounded-xl border shadow-2xl flex flex-col overflow-hidden animate-spring-up"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border)',
          boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.35)',
        }}
      >
        {/* Header: Title on Left, Actions + Close on Right */}
        <div
          className="h-12 flex items-center justify-between px-4 border-b shrink-0"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <div className="flex items-center gap-2.5 truncate">
            <History size={15} style={{ color: 'var(--accent)' }} className="shrink-0" />
            <h2 className="text-[13px] font-semibold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
              {t('agent.timeline.title')}
            </h2>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-mono tabular-nums shrink-0 border"
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              {logs.length} 轮
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                onClose()
                useStore.getState().setCheckpointsOpen(true)
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium hover:bg-[var(--bg-primary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)' }}
              title={t('checkpoints.title', '打开文件检查点时光机')}
            >
              <Clock size={11} style={{ color: 'var(--accent)' }} />
              <span>{t('checkpoints.title', '检查点时光机')}</span>
            </button>
            <button
              type="button"
              onClick={handleRollback}
              disabled={rollingBack || loading}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium hover:bg-[var(--bg-primary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 transition-colors cursor-pointer"
              style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}
              title={t('agent.timeline.rollback', '撤销上次修改')}
            >
              <RotateCcw size={11} className={rollingBack ? 'animate-spin' : ''} />
              <span>{t('agent.timeline.rollback', '撤销上次变更')}</span>
            </button>
            <button
              type="button"
              onClick={fetchLogs}
              disabled={loading}
              className="p-1.5 rounded-md border hover:bg-[var(--bg-primary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              title="Refresh timeline"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <div className="h-4 w-px bg-[var(--border)] shrink-0 mx-0.5" />
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium hover:bg-[var(--bg-primary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer shrink-0"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              title="关闭运行轨迹 (Esc)"
              aria-label="关闭运行轨迹"
            >
              <X size={13} />
              <kbd className="text-[10px] font-mono px-1 py-0.2 rounded bg-[var(--bg-primary)] border text-[var(--text-muted)]" style={{ borderColor: 'var(--border)' }}>Esc</kbd>
            </button>
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {logs.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6">
              <History size={28} className="mb-2 opacity-30" style={{ color: 'var(--text-muted)' }} />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('agent.timeline.empty')}
              </p>
            </div>
          ) : (
            logs.map((log) => {
              const payload = log.payload || {}
              const toolCalls = payload.toolCalls || []
              const isExpanded = !!expandedTurns[log.id]
              const hasTaint = toolCalls.some((tc) => tc.isTainted)

              return (
                <div
                  key={log.id}
                  className="rounded-lg border overflow-hidden transition-colors duration-150"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                >
                  {/* Turn Summary Bar */}
                  <button
                    type="button"
                    onClick={() => toggleTurn(log.id)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 text-left hover:bg-[var(--bg-primary)] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isExpanded ? (
                        <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
                      ) : (
                        <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
                      )}
                      <span className="text-xs font-mono font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                        Turn #{log.turn_id || log.id}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        · {toolCalls.length} 次工具调用
                      </span>
                      {hasTaint && (
                        <span
                          className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono font-medium border"
                          style={{
                            backgroundColor: 'color-mix(in srgb, var(--error) 12%, transparent)',
                            borderColor: 'color-mix(in srgb, var(--error) 35%, transparent)',
                            color: 'var(--error)',
                          }}
                        >
                          <ShieldAlert size={10} />
                          {t('agent.timeline.tainted_badge')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      <Clock size={11} />
                      <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                    </div>
                  </button>

                  {/* Expanded Turn Execution Trail */}
                  {isExpanded && (
                    <div className="border-t p-3 space-y-2" style={{ borderColor: 'var(--border)' }}>
                      {toolCalls.length === 0 ? (
                        <p className="text-[11px] font-mono px-2 py-1" style={{ color: 'var(--text-muted)' }}>
                          本轮未调用任何工具
                        </p>
                      ) : (
                        toolCalls.map((tc, idx) => {
                          const Icon = TOOL_ICONS[tc.name] || Wrench
                          const isOk = !tc.error
                          const diffKey = `${log.id}-${idx}`
                          const showDiff = !!expandedDiffs[diffKey]

                          return (
                            <div
                              key={idx}
                              className="rounded-md border p-2.5 space-y-2"
                              style={{
                                backgroundColor: 'var(--bg-primary)',
                                borderColor: tc.isTainted ? 'color-mix(in srgb, var(--error) 40%, var(--border))' : 'var(--border)',
                              }}
                            >
                              {/* Tool Call Row */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div
                                    className="w-5 h-5 rounded border flex items-center justify-center shrink-0"
                                    style={{
                                      backgroundColor: isOk
                                        ? 'color-mix(in srgb, var(--success) 10%, transparent)'
                                        : 'color-mix(in srgb, var(--error) 10%, transparent)',
                                      borderColor: isOk
                                        ? 'color-mix(in srgb, var(--success) 30%, transparent)'
                                        : 'color-mix(in srgb, var(--error) 30%, transparent)',
                                    }}
                                  >
                                    <Icon size={11} style={{ color: isOk ? 'var(--success)' : 'var(--error)' }} />
                                  </div>
                                  <span className="text-xs font-mono font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                    {tc.name}
                                  </span>
                                  {tc.depth !== undefined && (
                                    <span
                                      className="text-[9px] px-1 rounded border font-mono tabular-nums"
                                      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                                    >
                                      d:{tc.depth}
                                    </span>
                                  )}
                                  {tc.isTainted && (
                                    <span
                                      className="text-[9px] px-1.5 py-0.2 rounded font-mono font-medium flex items-center gap-0.5 border"
                                      style={{
                                        backgroundColor: 'color-mix(in srgb, var(--error) 12%, transparent)',
                                        borderColor: 'color-mix(in srgb, var(--error) 35%, transparent)',
                                        color: 'var(--error)',
                                      }}
                                    >
                                      <ShieldAlert size={9} /> Tainted
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {tc.latencyMs !== undefined && tc.latencyMs !== null && (
                                    <span className="text-[10px] font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
                                      {tc.latencyMs}ms
                                    </span>
                                  )}
                                  {isOk ? (
                                    <span
                                      className="flex items-center gap-1 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border"
                                      style={{
                                        backgroundColor: 'color-mix(in srgb, var(--success) 10%, transparent)',
                                        borderColor: 'color-mix(in srgb, var(--success) 30%, transparent)',
                                        color: 'var(--success)',
                                      }}
                                    >
                                      <CheckCircle2 size={10} /> OK
                                    </span>
                                  ) : (
                                    <span
                                      className="flex items-center gap-1 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border"
                                      style={{
                                        backgroundColor: 'color-mix(in srgb, var(--error) 10%, transparent)',
                                        borderColor: 'color-mix(in srgb, var(--error) 30%, transparent)',
                                        color: 'var(--error)',
                                      }}
                                    >
                                      <AlertCircle size={10} /> FAIL
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Args snippet */}
                              {tc.args && Object.keys(tc.args).length > 0 && (
                                <pre
                                  className="text-[10px] font-mono rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all border border-[var(--border)]"
                                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                                >
                                  {JSON.stringify(tc.args, null, 2)}
                                </pre>
                              )}

                              {/* Error display */}
                              {tc.error && (
                                <div
                                  className="text-[11px] font-mono rounded-md p-2 border"
                                  style={{
                                    backgroundColor: 'color-mix(in srgb, var(--error) 8%, transparent)',
                                    borderColor: 'color-mix(in srgb, var(--error) 25%, transparent)',
                                    color: 'var(--error)',
                                  }}
                                >
                                  {tc.error}
                                </div>
                              )}

                              {/* Diff Toggle and View */}
                              {tc.diff && (
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => toggleDiff(diffKey)}
                                    className="flex items-center gap-1 text-[10px] font-medium hover:underline mb-1 cursor-pointer"
                                    style={{ color: 'var(--accent)' }}
                                  >
                                    <FileCode size={11} />
                                    {showDiff ? '隐藏差异' : '查看差异'}
                                  </button>
                                  {showDiff && (
                                    <pre
                                      className="text-[10px] font-mono rounded-md p-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-all border border-[var(--border)]"
                                      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                                    >
                                      {tc.diff}
                                    </pre>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
