import { useState, useEffect, useCallback } from 'react'
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
} from 'lucide-react'
import { t } from '@/utils/i18n'

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
  const [expandedTurns, setExpandedTurns] = useState<Record<number, boolean>>({})
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({})

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

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Slide-over drawer */}
      <div
        className="relative w-full max-w-xl h-full flex flex-col border-l shadow-2xl animate-fade-in"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <div className="flex items-center gap-2.5">
            <History size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('agent.timeline.title')}
            </h2>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-mono"
              style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)' }}
            >
              {logs.length} turns
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="p-1.5 rounded-lg border hover:bg-[var(--bg-primary)] transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              title="Refresh timeline"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border hover:bg-[var(--bg-primary)] transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {logs.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6">
              <History size={32} className="mb-2 opacity-30" style={{ color: 'var(--text-muted)' }} />
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
                  className="rounded-xl border overflow-hidden transition-all duration-150"
                  style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                >
                  {/* Turn Summary Bar */}
                  <button
                    onClick={() => toggleTurn(log.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--bg-primary)] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isExpanded ? (
                        <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
                      ) : (
                        <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                      )}
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Turn #{log.turn_id || log.id}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        ({toolCalls.length} tool calls)
                      </span>
                      {hasTaint && (
                        <span
                          className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--error)' }}
                        >
                          <ShieldAlert size={10} />
                          {t('agent.timeline.tainted_badge')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      <Clock size={11} />
                      <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                    </div>
                  </button>

                  {/* Expanded Turn Execution Trail */}
                  {isExpanded && (
                    <div className="border-t p-3 space-y-2.5" style={{ borderColor: 'var(--border)' }}>
                      {toolCalls.length === 0 ? (
                        <p className="text-[11px] px-2 py-1" style={{ color: 'var(--text-muted)' }}>
                          No tools invoked in this turn.
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
                              className="rounded-lg border p-2.5 space-y-2"
                              style={{
                                backgroundColor: 'var(--bg-primary)',
                                borderColor: tc.isTainted ? 'rgba(239,68,68,0.4)' : 'var(--border)',
                              }}
                            >
                              {/* Tool Call Row */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div
                                    className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                                    style={{
                                      backgroundColor: isOk ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                    }}
                                  >
                                    <Icon size={12} style={{ color: isOk ? 'var(--success)' : 'var(--error)' }} />
                                  </div>
                                  <span className="text-xs font-mono font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                    {tc.name}
                                  </span>
                                  {tc.depth !== undefined && (
                                    <span
                                      className="text-[9px] px-1 rounded"
                                      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                                    >
                                      d:{tc.depth}
                                    </span>
                                  )}
                                  {tc.isTainted && (
                                    <span
                                      className="text-[9px] px-1.5 py-0.2 rounded font-medium flex items-center gap-0.5"
                                      style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: 'var(--error)' }}
                                    >
                                      <ShieldAlert size={9} /> Tainted
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {tc.latencyMs !== undefined && tc.latencyMs !== null && (
                                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                      {tc.latencyMs}ms
                                    </span>
                                  )}
                                  {isOk ? (
                                    <span
                                      className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
                                      style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: 'var(--success)' }}
                                    >
                                      <CheckCircle2 size={10} /> OK
                                    </span>
                                  ) : (
                                    <span
                                      className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
                                      style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--error)' }}
                                    >
                                      <AlertCircle size={10} /> Fail
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Args snippet */}
                              {tc.args && Object.keys(tc.args).length > 0 && (
                                <pre
                                  className="text-[10px] font-mono rounded p-2 overflow-x-auto whitespace-pre-wrap break-all"
                                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                                >
                                  {JSON.stringify(tc.args, null, 2)}
                                </pre>
                              )}

                              {/* Error display */}
                              {tc.error && (
                                <div
                                  className="text-[11px] font-mono rounded p-2 border"
                                  style={{
                                    backgroundColor: 'rgba(239,68,68,0.06)',
                                    borderColor: 'rgba(239,68,68,0.2)',
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
                                    onClick={() => toggleDiff(diffKey)}
                                    className="flex items-center gap-1 text-[10px] font-medium hover:underline mb-1"
                                    style={{ color: 'var(--accent)' }}
                                  >
                                    <FileCode size={11} />
                                    {showDiff ? 'Hide Diff' : 'View Diff'}
                                  </button>
                                  {showDiff && (
                                    <pre
                                      className="text-[10px] font-mono rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-all"
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
    </div>
  )
}
