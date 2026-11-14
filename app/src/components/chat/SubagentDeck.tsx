import { useState, useEffect } from 'react'
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Ban,
} from 'lucide-react'
import { t } from '@/utils/i18n'
import { taskApi } from '@/store'

export type EndpointKind = 'official_direct' | 'major_aggregator' | 'third_party_relay' | 'local_engine'

export type SwapHistoryEntry = {
  from?: string
  to?: string
  swappedAt?: string
  providerId?: string | number
  modelId?: string
  assignedAt?: string
  reason?: string
}

export type SubagentItem = {
  id: string
  name?: string
  task: string
  status: 'running' | 'done' | 'error' | 'cancelled' | 'timeout' | 'completed' | 'failed' | 'stalled_suspected'
  latencyMs?: number
  startedAt?: number
  output?: string
  error?: string
  taskId?: number
  currentTool?: string
  currentStatus?: string
  // Feature 25 additions
  providerName?: string
  providerId?: string | number
  endpointKind?: EndpointKind
  baseUrlCategory?: EndpointKind
  modelId?: string
  ttftMs?: number | null
  idleSinceLastActivityMs?: number
  idleSeconds?: number
  swapHistory?: SwapHistoryEntry[]
  recentThinkingTail?: string
  recentTextTail?: string
  thinking?: string
  liveThinkingTail?: string
  liveOutputTail?: string
  streamEvents?: any[]
  events?: any[]
}

export const SUBAGENT_PEEK_POLL_INTERVAL_MS = 500
export const STREAM_TABS = ['thinking', 'output', 'tools'] as const
export type StreamTab = (typeof STREAM_TABS)[number]

/**
 * Truncate provider name in UI badge per T2-F25-03:
 * Long provider name (>15 chars) truncated to 12 chars + '...'.
 */
export function truncateProviderName(name?: string): string {
  if (!name) return ''
  return name.length > 15 ? name.slice(0, 12) + '...' : name
}

/**
 * Formats idle time in seconds per T1-F25-03, T2-F25-01, T2-F25-02.
 */
export function formatIdleDisplay(ms?: number | null, seconds?: number | null): string {
  if (seconds != null) {
    return `${Math.floor(seconds)}s`
  }
  if (ms != null) {
    return `${Math.floor(ms / 1000)}s`
  }
  return '0s'
}

/**
 * Formats TTFT badge per T1-F25-02:
 * Number ms => `${ms}ms`, null/undefined => 'pending'.
 */
export function formatTtftBadge(ms?: number | null): string {
  return ms != null ? `${ms}ms` : 'pending'
}

/**
 * Human-readable label for endpoint kind.
 */
export function getEndpointKindLabel(kind: string): string {
  switch (kind) {
    case 'official_direct':
      return 'Official Direct'
    case 'major_aggregator':
      return 'Aggregator'
    case 'third_party_relay':
      return 'Relay'
    case 'local_engine':
      return 'Local Engine'
    default:
      return kind
  }
}

/**
 * Category tag styling (Anti-AI slop: zero gradients, solid neutral/theme-compatible colors).
 */
export function getCategoryTagClass(kind: string): string {
  switch (kind) {
    case 'official_direct':
      return 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10'
    case 'major_aggregator':
      return 'border-blue-500/30 text-blue-700 dark:text-blue-300 bg-blue-500/10'
    case 'third_party_relay':
      return 'border-amber-500/30 text-amber-700 dark:text-amber-300 bg-amber-500/10'
    case 'local_engine':
      return 'border-cyan-500/30 text-cyan-700 dark:text-cyan-300 bg-cyan-500/10'
    default:
      return 'border-[var(--border)] text-[var(--text-muted)] bg-[var(--bg-secondary)]'
  }
}

/**
 * Extracts sequential hot-swap entries from swapHistory per T1-F25-04 and T2-F25-05.
 */
export function extractSwaps(history?: SwapHistoryEntry[]): { index: number; label: string; details?: string }[] {
  if (!Array.isArray(history) || history.length === 0) return []
  const swapEntries = history.filter((h, idx) => h.from || (h.reason && h.reason !== 'initial_spawn') || idx > 0)
  if (swapEntries.length > 0) {
    return swapEntries.map((h, i) => {
      const origIdx = history.indexOf(h)
      const prev = origIdx > 0 ? history[origIdx - 1] : undefined
      const fromPart = h.from || (prev ? (prev.providerId && prev.modelId ? `${prev.providerId}/${prev.modelId}` : prev.modelId) : undefined)
      const toPart = h.to || (h.providerId && h.modelId ? `${h.providerId}/${h.modelId}` : h.modelId)
      const details = fromPart && toPart ? `${fromPart} -> ${toPart}` : (toPart ? String(toPart) : undefined)
      return {
        index: i + 1,
        label: `swap ${i + 1}`,
        details,
      }
    })
  }
  return []
}

export default function SubagentDeck({ items }: { items: SubagentItem[] }) {
  const [open, setOpen] = useState(true)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [activeTabs, setActiveTabs] = useState<Record<number, StreamTab>>({})
  const [now, setNow] = useState(Date.now())

  // T3-P19: 500ms ticker for non-blocking live elapsed and idle inspection
  useEffect(() => {
    const hasRunning = items && items.some((x) => x.status === 'running')
    if (!hasRunning) return
    const timer = setInterval(() => {
      setNow(Date.now())
    }, SUBAGENT_PEEK_POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [items])

  if (!items || items.length === 0) return null

  const total = items.length
  const completed = items.filter((x) => x.status === 'done' || x.status === 'completed').length
  const hasError = items.some((x) => x.status === 'error' || x.status === 'failed' || x.status === 'timeout')
  const hasCancelled = items.some((x) => x.status === 'cancelled')
  const isAllDone = items.length > 0 && items.every((x) => x.status === 'done' || x.status === 'completed')
  const isFinished = items.length > 0 && items.every((x) => x.status !== 'running')

  const accentColor = hasError
    ? 'var(--error)'
    : hasCancelled
    ? 'var(--text-muted)'
    : isAllDone
    ? 'var(--success)'
    : 'var(--accent)'

  const titleText = isAllDone
    ? t('chat.subagent_completed', '子代理执行完成')
    : isFinished && hasError
    ? t('chat.subagent_failed', '子代理执行失败')
    : isFinished && hasCancelled
    ? t('task.status.cancelled', 'Cancelled')
    : t('chat.subagent_running', '子代理运行中')

  return (
    <div
      className="rounded-lg border mb-2 overflow-hidden"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--bg-secondary)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--border)]/40 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] active:scale-[0.99]"
      >
        {open ? <ChevronDown size={12} style={{ color: accentColor }} /> : <ChevronRight size={12} style={{ color: accentColor }} />}
        <Bot size={13} style={{ color: accentColor }} />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }} aria-live="polite">
          {titleText}
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-md tabular-nums shrink-0 border font-mono"
          style={{ borderColor: accentColor, color: accentColor, backgroundColor: 'transparent' }}
        >
          {completed}/{total}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-2 pt-1 space-y-2 border-t border-[var(--border)]/50">
          {items.map((item, idx) => {
            const isDone = item.status === 'done' || item.status === 'completed'
            const isRunning = item.status === 'running'
            const isItemError = item.status === 'error' || item.status === 'failed' || item.status === 'timeout'
            const isCancelled = item.status === 'cancelled'
            const isStalled = item.status === 'stalled_suspected'
            const isExpanded = expandedIndex === idx
            const activeTab: StreamTab = activeTabs[idx] || (item.output ? 'output' : item.recentThinkingTail || item.thinking ? 'thinking' : 'output')

            const rawProvider = item.providerName || (item.providerId != null ? String(item.providerId) : undefined)
            const providerDisplay = truncateProviderName(rawProvider)
            const endpointKind = item.endpointKind || item.baseUrlCategory
            const swaps = extractSwaps(item.swapHistory)
            const hasSwapped = (item.swapHistory && item.swapHistory.length > 0) || swaps.length > 0

            const effectiveIdleMs = item.idleSinceLastActivityMs != null
              ? item.idleSinceLastActivityMs
              : item.idleSeconds != null
              ? item.idleSeconds * 1000
              : isRunning && item.startedAt
              ? Math.max(0, now - item.startedAt)
              : undefined

            const idleDisplay = formatIdleDisplay(effectiveIdleMs, item.idleSeconds)

            const elapsedMs = item.latencyMs != null
              ? item.latencyMs
              : item.startedAt
              ? Math.max(0, now - item.startedAt)
              : undefined
            const elapsedDisplay = elapsedMs != null ? `${(elapsedMs / 1000).toFixed(1)}s` : '0s'

            const thinkingContent = item.recentThinkingTail || item.liveThinkingTail || item.thinking || ''
            const outputContent = item.output || item.recentTextTail || item.liveOutputTail || ''
            const streamEvents = Array.isArray(item.streamEvents) ? item.streamEvents : Array.isArray(item.events) ? item.events : []

            return (
              <div
                key={item.id || idx}
                className="rounded-md border border-[var(--border)]/70 bg-[var(--bg-primary)] p-2.5 text-xs space-y-1.5"
              >
                {/* Header Row: Status Icon, Index, Task Title, Active Tool, Cancel, Elapsed */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isRunning && <Loader2 size={12} className="animate-spin text-[var(--accent)] shrink-0" />}
                    {isDone && <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />}
                    {isItemError && <AlertCircle size={12} className="text-red-500 shrink-0" />}
                    {isCancelled && <Ban size={12} className="text-[var(--text-muted)] shrink-0" />}
                    {isStalled && <AlertTriangle size={12} className="text-amber-500 shrink-0" />}
                    <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0">#{idx + 1}</span>
                    <span className="font-medium truncate text-[var(--text-primary)]" title={item.task}>
                      {item.task}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isRunning && item.currentTool && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--accent)] bg-[var(--bg-secondary)] shrink-0">
                        {t('chat.subagent_running_tool', item.currentTool)}
                      </span>
                    )}

                    {isRunning && item.taskId != null && (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation()
                          const api = taskApi()
                          if (api && item.taskId != null) {
                            await api.cancel(item.taskId).catch(() => {})
                          }
                        }}
                        style={{ color: 'var(--error)', borderColor: 'var(--border)' }}
                        className="px-2 py-0.5 text-[10px] rounded border hover:bg-[var(--bg-secondary)] active:scale-95 transition-all shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--error)] disabled:opacity-50 disabled:pointer-events-none"
                        title={t('chat.cancel', '取消')}
                      >
                        {t('chat.cancel', '取消')}
                      </button>
                    )}

                    <span className="font-mono text-[10px] text-[var(--text-muted)] tabular-nums shrink-0">
                      {elapsedDisplay}
                    </span>
                  </div>
                </div>

                {/* Feature 25 Metadata Bar: Provider, baseUrl Category, ModelId, TTFT, Idle, Swaps */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px] font-mono">
                  {providerDisplay && (
                    <span
                      className="px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] shrink-0 font-medium"
                      title={rawProvider}
                    >
                      {providerDisplay}
                    </span>
                  )}

                  {endpointKind && (
                    <span
                      className={`px-1.5 py-0.5 rounded border font-medium shrink-0 ${getCategoryTagClass(endpointKind)}`}
                      title={`Endpoint category: ${endpointKind}`}
                    >
                      {getEndpointKindLabel(endpointKind)}
                    </span>
                  )}

                  {item.modelId && (
                    <span
                      className="px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-muted)] truncate max-w-[150px] shrink-0"
                      title={item.modelId}
                    >
                      {item.modelId}
                    </span>
                  )}

                  <span
                    className="px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-muted)] tabular-nums shrink-0"
                    title="Time To First Token"
                  >
                    TTFT: {formatTtftBadge(item.ttftMs)}
                  </span>

                  {(isRunning || effectiveIdleMs != null || item.idleSeconds != null) && (
                    <span
                      className={`px-1.5 py-0.5 rounded border tabular-nums shrink-0 ${
                        (effectiveIdleMs ?? 0) >= 15000
                          ? 'border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10'
                          : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                      }`}
                      title="Idle time elapsed since last token"
                    >
                      Idle: {idleDisplay}
                    </span>
                  )}

                  {hasSwapped && swaps.length > 0 && swaps.map((sw, sIdx) => (
                    <span
                      key={sIdx}
                      className="px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-700 dark:text-amber-300 bg-amber-500/10 font-medium shrink-0"
                      title={sw.details ? `Swapped: ${sw.details}` : 'Hot-swap occurred'}
                    >
                      {sw.details && sw.details.includes(' -> ') ? `Swapped: ${sw.details} (${sw.label})` : sw.label}
                    </span>
                  ))}
                  {hasSwapped && swaps.length === 0 && (
                    <span
                      className="px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-700 dark:text-amber-300 bg-amber-500/10 font-medium shrink-0"
                      title="Hot-swap occurred"
                    >
                      swap 1
                    </span>
                  )}
                </div>

                {isRunning && item.currentStatus && (
                  <div className="text-[10px] text-[var(--text-muted)] italic truncate pl-4">
                    {item.currentStatus}
                  </div>
                )}

                {isItemError && item.error && (
                  <div className="text-[11px] text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded border border-red-500/30 font-mono break-all">
                    {item.error}
                  </div>
                )}

                {isCancelled && (
                  <div className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-secondary)] p-2 rounded font-mono break-all border border-[var(--border)]">
                    {item.output || t('task.status.cancelled', 'Cancelled')}
                  </div>
                )}

                {/* Expand / Collapse Stream Details Toggle */}
                <div>
                  <button
                    type="button"
                    onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                    className="text-[10px] text-[var(--accent)] hover:underline flex items-center gap-1 mt-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] rounded active:scale-[0.98] transition-all"
                  >
                    {isExpanded
                      ? t('chat.subagent_hide_output', '收起详情')
                      : t('chat.subagent_view_output', '查看执行结果')}
                  </button>

                  {/* Expanded Stream Inspection Tabs (T1-F25-05: thinking, output, tools) */}
                  {isExpanded && (
                    <div className="mt-1.5 p-2 rounded bg-[var(--bg-secondary)] border border-[var(--border)] text-[11px] space-y-1.5">
                      <div className="flex items-center gap-1 border-b border-[var(--border)] pb-1">
                        {STREAM_TABS.map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTabs((prev) => ({ ...prev, [idx]: tab }))}
                            className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] active:scale-95 ${
                              activeTab === tab
                                ? 'bg-[var(--accent)] text-white'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)]'
                            }`}
                          >
                            {tab === 'thinking'
                              ? t('chat.thinking', 'Thinking')
                              : tab === 'output'
                              ? t('chat.output', 'Output')
                              : t('chat.tools', 'Tools')}
                          </button>
                        ))}
                      </div>

                      {activeTab === 'thinking' && (
                        <div className="text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                          {thinkingContent || (
                            <span className="italic text-[var(--text-muted)]">
                              {isRunning
                                ? t('chat.subagent_thinking_live', '(Thinking stream active...)')
                                : t('chat.subagent_no_thinking', '(No thinking content recorded)')}
                            </span>
                          )}
                        </div>
                      )}

                      {activeTab === 'output' && (
                        <div className="text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                          {outputContent || (
                            <span className="italic text-[var(--text-muted)]">
                              {isRunning
                                ? t('chat.subagent_streaming_live', '(Output streaming...)')
                                : t('chat.subagent_no_output', '(No output produced yet)')}
                            </span>
                          )}
                        </div>
                      )}

                      {activeTab === 'tools' && (
                        <div className="space-y-1 max-h-48 overflow-y-auto font-mono text-[10px]">
                          {item.currentTool && (
                            <div className="p-1 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--accent)]">
                              Active tool: <span className="font-semibold">{item.currentTool}</span>
                            </div>
                          )}
                          {streamEvents.length > 0 ? (
                            streamEvents.map((evt, eIdx) => (
                              <div
                                key={evt.seq || evt.id || eIdx}
                                className="p-1 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-muted)]"
                              >
                                <span className="font-semibold text-[var(--text-secondary)]">
                                  {evt.type || 'event'}:
                                </span>{' '}
                                {typeof evt.content === 'string'
                                  ? evt.content.slice(0, 200)
                                  : JSON.stringify(evt).slice(0, 200)}
                              </div>
                            ))
                          ) : (
                            !item.currentTool && (
                              <div className="italic text-[var(--text-muted)] py-1">
                                {t('chat.subagent_no_events')}
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
