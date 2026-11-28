import { useState, memo, useMemo, useCallback, useEffect } from 'react'
import { useStore } from '@/store'
import type { Message } from '@/types'
import { cn } from '@/lib/utils'
import { Copy, Check, RefreshCw, Pencil, Play, GitFork, Brain, Pin, X, Maximize2 } from 'lucide-react'
import { renderMarkdown, sanitizeHtml } from '@/utils/markdown'
import { t } from '@/utils/i18n'
import ToolCallBlock from './ToolCallBlock'
import AgentPlanTrace from './AgentPlanTrace'
import TaskCard from './TaskCard'
import ThinkingBlock from './ThinkingBlock'
import AgentTimeline from './AgentTimeline'
import FileSummaryDeck from './FileSummaryDeck'
import SubagentDeck from './SubagentDeck'
import ImageLightboxModal from './ImageLightboxModal'

function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

const ForkContinueActions = memo(function ForkContinueActions({
  messageId,
  isStreaming,
  isAborted = false,
  showEdit = false,
  onStartEdit,
  forkSession,
  continueMessage,
}: {
  messageId: number
  isStreaming: boolean
  isAborted?: boolean
  showEdit?: boolean
  onStartEdit?: () => void
  forkSession: (id: number) => void
  continueMessage?: () => void
}) {
  const sending = useStore((s) => s.sending)
  return (
    <>
      {!isStreaming && showEdit && onStartEdit && (
        <button
          onClick={onStartEdit}
          disabled={sending}
          className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]/50 icon-btn-silky disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          title={t('chat.edit')}
          aria-label={t('chat.edit')}
        >
          <Pencil size={12} />
        </button>
      )}
      {!isStreaming && (
        <button
          className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]/50 icon-btn-silky disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          title={t('chat.fork')}
          aria-label={t('chat.fork')}
          onClick={() => forkSession(messageId)}
          disabled={sending}
        >
          <GitFork size={12} />
        </button>
      )}
      {isAborted && !isStreaming && continueMessage && (
        <button
          className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] transition-opacity transition-transform press-scale hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          title={t('chat.continue_tooltip')}
          aria-label={t('chat.continue')}
          onClick={() => continueMessage()}
          disabled={sending}
        >
          <Play size={10} />
          <span>{t('chat.continue')}</span>
        </button>
      )}
    </>
  )
})

/** Render one conversation message with its rich content and status metadata. */
function MessageBubble({ message, searchHighlight, active }: { message: Message; searchHighlight?: string; active?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const attachment = useMemo(() => {
    if (!message.attachment) return null
    if (typeof message.attachment === 'string') {
      try {
        return JSON.parse(message.attachment)
      } catch {
        return null
      }
    }
    return message.attachment
  }, [message.attachment])

  const imageList = useMemo(() => {
    if (!attachment || attachment.kind !== 'image') return []
    const list = attachment.all && attachment.all.length > 0
      ? attachment.all
      : [{ name: attachment.name, preview: attachment.preview || attachment.mime }]
    return list.filter((img: any) => Boolean(img?.preview))
  }, [attachment])

  const bubbleWidth = useStore(s => s.bubbleWidth)
  const toolCalls = useStore(s => s.toolCallsByMessage[message.id])
  const planSteps = useStore(s => s.planStepsByMessage[message.id])
  const todos = useStore(s => s.todosByMessage[message.id])
  const subagents = useStore(s => s.subagentsByMessage[message.id])
  const thinkingBlocks = useStore(s => s.thinkingBlocksByMessage[message.id]) || message.thinking_content
  const thinkingDuration = useStore(s => s.thinkingDurationsByMessage[message.id]) ?? (message.thinking_duration_ms != null ? message.thinking_duration_ms / 1000 : undefined)
  const thinkingStartedAt = useStore(s => s.thinkingStartsByMessage[message.id])
  const statusLines = useStore(s => s.statusLinesByMessage[message.id])
  const fileSummary = useStore(s => s.fileSummariesByMessage[message.id])

  const regenerate = useStore(s => s.regenerate)
  const editMessage = useStore(s => s.editMessage)
  const continueMessage = useStore(s => s.continueMessage)
  const forkSession = useStore(s => s.forkSession)

  const [memoryPopoverOpen, setMemoryPopoverOpen] = useState(false)
  const [pinnedHitIds, setPinnedHitIds] = useState<Set<number>>(new Set())
  const [removedHitIds, setRemovedHitIds] = useState<Set<number>>(new Set())
  const storeMemoryHits = useStore(s => s.memoryHitsByMessage[message.id])
  const memoryHits = useMemo(() => {
    if (storeMemoryHits && storeMemoryHits.length > 0) return storeMemoryHits
    if (message.memory_hits) {
      try {
        const parsed = JSON.parse(message.memory_hits)
        return Array.isArray(parsed) ? parsed : []
      } catch { return [] }
    }
    return []
  }, [storeMemoryHits, message.memory_hits])
  const visibleMemoryHits = useMemo(() => memoryHits.filter((h: any) => !removedHitIds.has(h.id)), [memoryHits, removedHitIds])

  const isUser = message.role === 'user'
  // An assistant turn with a live todo checklist renders as a task card.
  const hasTask = !!todos && todos.length > 0
  const isError = message.status === 'error'
  const isFallback = message.status === 'fallback'
  const isAborted = message.status === 'aborted'
  // A message is "streaming" when it's the last message (assistant, empty content)
  // and the session has an active stream buffer. Scoped selector prevents historical
  // messages from re-rendering on every stream token.
  const isStreamingCandidate = !isUser && message.content === ''
  const isStreaming = useStore(s => isStreamingCandidate && s.streamingBySession[message.session_id]?.messageId === message.id)
  const isAnswerStreaming = useStore(s => isStreaming && Boolean(s.streamingBySession[message.session_id]?.content))
  const hasActiveTool = Boolean(toolCalls && toolCalls.some(t => t.result === null && !t.error))
  const isThinkingActive = useStore(s => Boolean(s.thinkingActiveByMessage?.[message.id]))
  const isThinkingStreaming = !isAborted && !isError && Boolean(
    isStreaming && (isThinkingActive || (!isAnswerStreaming && !hasActiveTool && thinkingBlocks && !thinkingDuration))
  )

  const hlRe = useMemo(() => searchHighlight ? new RegExp(`(${escapeRegex(searchHighlight)})`, 'gi') : null, [searchHighlight])

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(message.content) } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [message.content])

  const startEdit = useCallback(() => { setDraft(message.content); setEditing(true) }, [message.content])
  const submitEdit = useCallback(async () => {
    const c = draft.trim()
    if (!c || c === message.content) { setEditing(false); return }
    setEditing(false)
    await editMessage(message.id, c)
  }, [draft, message.id, message.content, editMessage])

  const onBubbleClick = useCallback((e: React.MouseEvent) => {
    const fold = (e.target as HTMLElement).closest('.code-fold') as HTMLElement | null
    if (fold) {
      const pre = fold.closest('pre.code-block')
      if (pre) {
        const collapsed = pre.classList.toggle('collapsed')
        const n = fold.getAttribute('data-lines') || ''
        fold.textContent = collapsed ? '▸' : '▾'
        fold.setAttribute('data-folded', collapsed ? '1' : '0')
        if (collapsed) fold.setAttribute('title', `${n} lines — click to expand`)
      }
      return
    }
    const target = (e.target as HTMLElement).closest('.code-copy') as HTMLElement | null
    if (!target) return
    const raw = target.getAttribute('data-code') || ''
    // getAttribute() already resolves HTML entities — decoding again here
    // would corrupt code that literally contains e.g. "&amp;" (double-escape).
    navigator.clipboard.writeText(raw)
    const prev = target.textContent
    target.textContent = 'Copied!'
    target.classList.add('copied')
    setTimeout(() => { target.textContent = prev; target.classList.remove('copied') }, 1200)
  }, [])

  const renderContent = useCallback((text: string) => {
    if (!searchHighlight) {
      return isUser ? text : <div className="mc" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
    }
    const q = searchHighlight.toLowerCase()
    const idx = text.toLowerCase().indexOf(q)
    if (idx === -1) {
      return isUser ? text : <div className="mc" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
    }
    const before = text.slice(0, idx)
    const match = text.slice(idx, idx + q.length)
    const after = text.slice(idx + q.length)
    if (isUser) {
      return <>{before}<mark className="px-0.5 rounded-sm" style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>{match}</mark>{after}</>
    }
    const html = renderMarkdown(text)
    if (hlRe) {
      // String substitution over sanitized HTML can re-form markup (e.g. a
      // keyword matching inside a tag or entity); re-sanitize the result so
      // only the allowed <mark> highlight survives. mark/style are in
      // DOMPurify's default allowlist, so the highlight itself is kept.
      const highlighted = sanitizeHtml(html.replace(hlRe,
        '<mark class="search-hl" style="background:var(--accent);color:#fff;border-radius:2px;padding:0 1px">$1</mark>'))
      return <div className="mc" dangerouslySetInnerHTML={{ __html: highlighted }} />
    }
    return <div className="mc" dangerouslySetInnerHTML={{ __html: html }} />
  }, [searchHighlight, isUser, hlRe])

  const renderedContent = useMemo(() => {
    return renderContent(message.content)
  }, [renderContent, message.content])


  return (
    <div id={`msg-${message.id}`} className={`w-full flex flex-col message-enter group py-3 ${active ? 'msg-anchor-flash' : ''}`}>
      {isUser ? (
        <div className="flex flex-col items-end w-full">
          <div
            className="max-w-[82%] rounded-[10px] border px-4 py-2.5 text-[13.5px] leading-[1.65] tracking-[-0.004em] break-words relative transition-colors"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      submitEdit()
                    }
                    if (e.key === 'Escape') setEditing(false)
                  }}
                  rows={3}
                  className="w-full px-2.5 py-1.5 text-[13px] rounded-md border outline-none resize-none bg-[var(--content-bg)]"
                  style={{ borderColor: 'var(--accent)' }}
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditing(false)}
                    className="px-2.5 py-1 text-xs rounded-md border hover:bg-[var(--bg-secondary)] transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    {t('chat.cancel')}
                  </button>
                  <button
                    onClick={submitEdit}
                    disabled={!draft.trim()}
                    className="px-2.5 py-1 text-xs rounded-md text-white disabled:opacity-40 transition-opacity focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    {t('chat.edit.submit')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {imageList.length > 0 && (
                  <div className={`flex flex-col items-end ${message.content ? 'mb-2' : ''}`}>
                    {imageList.length === 1 ? (
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={t('chat.attachment.double_click_zoom')}
                        className="rounded-[6px] overflow-hidden border max-w-[280px] max-h-[220px] cursor-zoom-in hover:opacity-95 transition-opacity relative group/img bg-black/5 focus-visible:ring-2 focus-visible:ring-[var(--accent)] outline-none"
                        style={{ borderColor: 'var(--border)' }}
                        onClick={() => setLightboxIndex(0)}
                        onDoubleClick={() => setLightboxIndex(0)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setLightboxIndex(0)
                          }
                        }}
                        title={t('chat.attachment.double_click_zoom')}
                      >
                        <img
                          src={imageList[0].preview}
                          alt={imageList[0].name || 'image'}
                          className="max-w-full max-h-[220px] object-contain select-none"
                        />
                        <div className="absolute top-1.5 right-1.5 p-1 rounded bg-black/60 text-white opacity-0 group-hover/img:opacity-100 transition-opacity backdrop-blur-sm pointer-events-none shadow-sm">
                          <Maximize2 size={11} />
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`grid gap-1.5 ${
                          imageList.length === 2
                            ? 'grid-cols-2 max-w-[260px]'
                            : imageList.length === 3
                            ? 'grid-cols-3 max-w-[280px]'
                            : 'grid-cols-2 max-w-[260px]'
                        }`}
                      >
                        {(imageList.length > 4 ? imageList.slice(0, 4) : imageList).map((att: any, i: number) => {
                          const isOverflowTile = imageList.length > 4 && i === 3
                          const remainingCount = imageList.length - 3
                          const sizeClass = imageList.length === 3 ? 'w-22 h-22' : 'w-28 h-28'

                          return (
                            <div
                              key={i}
                              role="button"
                              tabIndex={0}
                              aria-label={att.name || `image-${i + 1}`}
                              className={`aspect-square ${sizeClass} rounded-[6px] overflow-hidden border cursor-zoom-in hover:opacity-95 transition-opacity relative group/img bg-black/5 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[var(--accent)] outline-none`}
                              style={{ borderColor: 'var(--border)' }}
                              onClick={() => setLightboxIndex(i)}
                              onDoubleClick={() => setLightboxIndex(i)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  setLightboxIndex(i)
                                }
                              }}
                              title={t('chat.attachment.double_click_zoom')}
                            >
                              <img
                                src={att.preview}
                                alt={att.name || `image-${i + 1}`}
                                className="w-full h-full object-cover select-none"
                              />
                              {!isOverflowTile && (
                                <div className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover/img:opacity-100 transition-opacity backdrop-blur-sm pointer-events-none shadow-sm">
                                  <Maximize2 size={10} />
                                </div>
                              )}
                              {isOverflowTile && (
                                <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center text-white font-mono font-semibold text-base transition-colors hover:bg-black/70">
                                  +{remainingCount}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
                {renderedContent}
              </>
            )}
          </div>
          <div className="flex items-center gap-1 px-1 mt-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
            {message.created_at && (
              <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={handleCopy}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]/50 icon-btn-silky focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
              title={t('chat.copy')}
              aria-label={t('chat.copy')}
            >
              {copied ? <Check size={12} className="animate-scale-pop" style={{ color: 'var(--success)' }} /> : <Copy size={12} />}
            </button>
            <ForkContinueActions
              messageId={message.id}
              isStreaming={isStreaming}
              showEdit={!editing}
              onStartEdit={startEdit}
              forkSession={forkSession}
            />
          </div>
        </div>
      ) : (
        <div className="w-full">
          {/* Assistant contextual badges row — only rendered when contextual pills or error states exist */}
          {(isError || isAborted || visibleMemoryHits.length > 0 || (isFallback && message.model_used) || message.arena_model) && (
            <div className="flex items-center gap-2 mb-2 px-0.5 flex-wrap">
              {(isError || isAborted) && (
                <span className="text-xs font-medium" style={{ color: isError ? 'var(--error)' : 'var(--text-muted)' }}>
                  {isError ? t('chat.error_short') : t('chat.aborted')}
                </span>
              )}
              {visibleMemoryHits.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMemoryPopoverOpen((o) => !o)}
                    className="h-5 px-2 rounded-[5px] border text-[10px] font-mono flex items-center gap-1 hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer select-none"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)', color: 'var(--text-secondary)' }}
                    title="查看本轮注入的记忆上下文"
                  >
                    <Brain size={11} className="shrink-0 text-[var(--accent)]" />
                    <span>Memory · {visibleMemoryHits.length} hit{visibleMemoryHits.length > 1 ? 's' : ''}</span>
                  </button>

                  {memoryPopoverOpen && (
                    <div
                      className="absolute left-0 top-full mt-1.5 w-80 rounded-lg border shadow-xl p-2.5 z-50 text-left animate-spring-up"
                      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border)] mb-2">
                        <span className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                          <Brain size={12} className="text-[var(--accent)]" />
                          <span>Injected Memory ({visibleMemoryHits.length})</span>
                        </span>
                        <button
                          onClick={() => setMemoryPopoverOpen(false)}
                          className="p-0.5 rounded hover:bg-[var(--border)] text-[var(--text-muted)] cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </div>

                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {visibleMemoryHits.map((hit: any) => {
                          const isPinned = pinnedHitIds.has(hit.id)
                          return (
                            <div
                              key={hit.id}
                              className="p-2 rounded border text-[11px] space-y-1.5"
                              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
                            >
                              <div className="text-[11px] leading-snug line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                                {hit.content}
                              </div>
                              <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[var(--border)]/50">
                                <span className="font-mono text-[var(--text-muted)] truncate max-w-[140px]" title={hit.why}>
                                  Why: {hit.why || 'relevant'}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={async () => {
                                      const res = await window.electronAPI.memory.pinToAgentsMd({
                                        id: hit.id,
                                        content: hit.content,
                                      })
                                      if (res.success) {
                                        setPinnedHitIds((prev) => new Set([...prev, hit.id]))
                                        useStore.getState().triggerToast('已固定到 AGENTS.md', 'success')
                                      } else {
                                        useStore.getState().triggerToast(res.error || '固定失败', 'warning')
                                      }
                                    }}
                                    disabled={isPinned}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] hover:bg-[var(--border)] transition-colors disabled:opacity-50 cursor-pointer"
                                    style={{ borderColor: 'var(--border)', color: isPinned ? 'var(--accent)' : 'var(--text-secondary)' }}
                                    title="Pin 固定到 AGENTS.md"
                                  >
                                    <Pin size={10} className={isPinned ? 'fill-current' : ''} />
                                    <span>{isPinned ? '已固定' : 'Pin'}</span>
                                  </button>
                                  <button
                                    onClick={async () => {
                                      await window.electronAPI.memory.delete(hit.id)
                                      setRemovedHitIds((prev) => new Set([...prev, hit.id]))
                                      useStore.getState().triggerToast('已移除该条记忆', 'info')
                                    }}
                                    className="flex items-center gap-0.5 px-1 py-0.5 rounded border hover:bg-red-500/10 text-red-500 transition-colors cursor-pointer"
                                    style={{ borderColor: 'var(--border)' }}
                                    title="移除记忆"
                                  >
                                    <X size={10} />
                                    <span>移除</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {isFallback && message.model_used && (
                <span className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800 font-mono">
                  {t('chat.fallback_label', message.model_used)}
                </span>
              )}
              {message.arena_model && (
                <span className="text-[10px] px-1.5 py-0.5 rounded border font-mono" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  {message.arena_model}
                </span>
              )}
            </div>
          )}

          <div
            onClick={onBubbleClick}
            className={`w-full text-[13.5px] leading-[1.7] tracking-[-0.005em] break-words relative ${
              isError ? 'p-3.5 rounded-lg bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400' : ''
            }`}
          >
            {(thinkingBlocks || (toolCalls && toolCalls.length > 0) || (planSteps && planSteps.length > 0)) && (
              <AgentTimeline
                thinkingText={thinkingBlocks || undefined}
                thinkingStreaming={isThinkingStreaming}
                thinkingDuration={thinkingDuration}
                thinkingStartedAt={thinkingStartedAt}
                toolCalls={toolCalls && toolCalls.length > 0 ? toolCalls : undefined}
                planSteps={planSteps || undefined}
              />
            )}
            {subagents && subagents.length > 0 && (
              <SubagentDeck items={subagents} />
            )}
            {renderedContent}
            {fileSummary && (
              <FileSummaryDeck
                summary={fileSummary}
                sessionId={message.session_id}
                messageId={message.id}
              />
            )}
            {isStreaming && (
              <span className="inline-flex items-center gap-0.5 ml-1 mt-1">
                <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] typing-dot" />
                <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] typing-dot" />
                <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] typing-dot" />
              </span>
            )}
            {isError && message.error_message && (
              <details className="mt-2 text-xs text-red-400">
                <summary className="cursor-pointer">{t('chat.error.detail')}</summary>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{message.error_message}</pre>
              </details>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 px-0.5 mt-1.5 min-w-0">
            {/* Claude Code & Cursor-style Turn Telemetry Footer */}
            {!isStreaming && (message.model_used || message.latency_ms || message.token_count) ? (
              <div className="flex items-center gap-2 text-[10px] font-mono select-none" style={{ color: 'var(--text-muted)' }}>
                {message.model_used && (
                  <span className="truncate max-w-[140px] opacity-75" title={message.model_used}>
                    {message.model_used}
                  </span>
                )}
                {message.latency_ms != null && message.latency_ms > 0 && (
                  <span className="tabular-nums opacity-75">
                    {(message.latency_ms / 1000).toFixed(1)}s
                  </span>
                )}
                {message.token_count != null && message.token_count > 0 && (
                  <span className="tabular-nums opacity-75">
                    {message.token_count.toLocaleString()} toks
                  </span>
                )}
              </div>
            ) : <div />}

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 ml-auto">
              <button
                onClick={handleCopy}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]/50 icon-btn-silky focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                title={t('chat.copy')}
                aria-label={t('chat.copy')}
              >
                {copied ? <Check size={12} className="animate-scale-pop" style={{ color: 'var(--success)' }} /> : <Copy size={12} />}
              </button>
              {!isStreaming && !isError && (
                <button
                  className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]/50 icon-btn-silky focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                  title={t('chat.regenerate')}
                  aria-label={t('chat.regenerate')}
                  onClick={() => regenerate()}
                >
                  <RefreshCw size={12} />
                </button>
              )}
              <ForkContinueActions
                messageId={message.id}
                isStreaming={isStreaming}
                isAborted={isAborted}
                forkSession={forkSession}
                continueMessage={continueMessage}
              />
              {isError && !isStreaming && (
                <button
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] transition-opacity transition-transform press-scale hover:opacity-90 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                  style={{ backgroundColor: 'var(--error)', color: '#fff' }}
                  title={t('chat.retry')}
                  aria-label={t('chat.retry')}
                  onClick={() => regenerate()}
                >
                  <RefreshCw size={10} />
                  <span>{t('chat.retry')}</span>
                </button>
              )}
            </div>
        </div>
        </div>
      )}
      {lightboxIndex !== null && imageList.length > 0 && (
        <ImageLightboxModal
          images={imageList}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}

export default memo(MessageBubble)
