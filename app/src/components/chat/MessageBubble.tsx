import { useState, memo, useMemo, useCallback, useEffect, useRef, Fragment } from 'react'
import { useStore } from '@/store'
import type { Message } from '@/types'
import { cn } from '@/lib/utils'
import { Copy, Check, RefreshCw, Pencil, Play, GitFork, Brain, Pin, X, Quote, FileText } from 'lucide-react'
import { renderMarkdown, sanitizeHtml, getHighlightVersion, subscribeHighlightReady } from '@/utils/markdown'
import { handleMarkdownContainerClick, useLocalImageFallback } from '@/utils/markdownDom'
import { stripMarkdownToPlainText, parseInlineTextAttachments } from '@/utils/exportMarkdown'
import { t } from '@/utils/i18n'
import ToolCallBlock from './ToolCallBlock'
import AgentPlanTrace from './AgentPlanTrace'
import TaskCard from './TaskCard'
import ThinkingBlock from './ThinkingBlock'
import AgentTimeline from './AgentTimeline'
import FileSummaryDeck from './FileSummaryDeck'
import SubagentDeck from './SubagentDeck'
import ImageLightboxModal, { type LightboxImage } from './ImageLightboxModal'
import MessageImageGrid from './MessageImageGrid'
import UserAttachmentCards from './UserAttachmentCards'

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
  const [copiedPlain, setCopiedPlain] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [lightboxState, setLightboxState] = useState<{ images: LightboxImage[]; index: number } | null>(null)
  const assistantBodyRef = useRef<HTMLDivElement>(null)

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

  const imageList = useMemo<LightboxImage[]>(() => {
    if (!attachment) return []
    const all = Array.isArray(attachment.all) ? attachment.all : []
    if (all.length > 0) {
      return all.filter((img: any) =>
        Boolean(img?.preview) &&
        (attachment.kind === 'image' ||
          /^data:image\//i.test(String(img.preview)) ||
          /\.(png|jpe?g|gif|webp|bmp|avif|ico|svg)$/i.test(String(img.name || '')))
      )
    }
    if (attachment.kind === 'image' && (attachment.preview || attachment.mime)) {
      return [{ name: attachment.name, preview: attachment.preview || attachment.mime }]
    }
    return []
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
  const editAndForkMessage = useStore(s => s.editAndForkMessage)
  const continueMessage = useStore(s => s.continueMessage)
  const forkSession = useStore(s => s.forkSession)
  const sending = useStore(s => s.sending)

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

  const handleCopyPlain = useCallback(async () => {
    try { await navigator.clipboard.writeText(stripMarkdownToPlainText(message.content)) } catch {}
    setCopiedPlain(true)
    setTimeout(() => setCopiedPlain(false), 2000)
  }, [message.content])

  const handleQuote = useCallback(() => {
    const sel = typeof window !== 'undefined' ? window.getSelection()?.toString().trim() : ''
    const source = sel || stripMarkdownToPlainText(message.content)
    const snippet = source.slice(0, 400)
    if (!snippet) return
    window.dispatchEvent(new CustomEvent('aether:quote-message', {
      detail: { role: message.role, content: snippet, messageId: message.id },
    }))
  }, [message.content, message.role, message.id])

  const startEdit = useCallback(() => { setDraft(message.content); setEditing(true) }, [message.content])
  const submitEdit = useCallback(async () => {
    if (sending) return
    const c = draft.trim()
    if (!c || c === message.content) { setEditing(false); return }
    setEditing(false)
    await editMessage(message.id, c)
  }, [sending, draft, message.id, message.content, editMessage])

  const submitEditAndFork = useCallback(async () => {
    if (sending) return
    const c = draft.trim()
    if (!c) { setEditing(false); return }
    setEditing(false)
    await editAndForkMessage(message.id, c)
  }, [sending, draft, message.id, editAndForkMessage])

  const [hlVersion, setHlVersion] = useState(getHighlightVersion)
  useEffect(() => {
    if (!message.content || !message.content.includes('```')) return
    return subscribeHighlightReady(() => setHlVersion(getHighlightVersion()))
  }, [message.content])

  useLocalImageFallback(assistantBodyRef, message.content)

  const onBubbleClick = useCallback((e: React.MouseEvent) => {
    handleMarkdownContainerClick(
      e,
      assistantBodyRef.current,
      (images, index) => setLightboxState({ images, index }),
      imageList
    )
  }, [imageList])

  const { attachments: inlineAttachments, rest: userDisplayText } = useMemo(
    () => (isUser ? parseInlineTextAttachments(message.content) : { attachments: [], rest: message.content }),
    [isUser, message.content]
  )

  const renderContent = useCallback((text: string) => {
    if (!searchHighlight || !hlRe) {
      return isUser ? text : <div className="mc" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
    }
    const q = searchHighlight.toLowerCase()
    if (!text.toLowerCase().includes(q)) {
      return isUser ? text : <div className="mc" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
    }
    if (isUser) {
      const parts = text.split(hlRe)
      return (
        <>
          {parts.map((part, i) =>
            i % 2 === 1 ? (
              <mark key={i} className="px-0.5 rounded-sm" style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
                {part}
              </mark>
            ) : (
              <Fragment key={i}>{part}</Fragment>
            )
          )}
        </>
      )
    }
    const html = renderMarkdown(text)
    // Split by HTML tags so highlight markup never corrupts tag attributes like src/href.
    const highlighted = sanitizeHtml(
      html
        .split(/(<[^>]+>)/g)
        .map((seg) => (seg.startsWith('<') ? seg : seg.replace(hlRe, '<mark class="search-hl" style="background:var(--accent);color:#fff;border-radius:2px;padding:0 1px">$1</mark>')))
        .join('')
    )
    return <div className="mc" dangerouslySetInnerHTML={{ __html: highlighted }} />
  }, [searchHighlight, isUser, hlRe])

  const renderedContent = useMemo(() => {
    return renderContent(userDisplayText)
  }, [renderContent, userDisplayText, hlVersion])


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
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) {
                      e.preventDefault()
                      submitEdit()
                    }
                    if (e.key === 'Escape') setEditing(false)
                  }}
                  rows={3}
                  className="w-full px-2.5 py-1.5 text-[13px] rounded-md border outline-none resize-none bg-[var(--content-bg)]"
                  style={{ borderColor: 'var(--accent)' }}
                />
                <div className="flex gap-2 justify-end flex-wrap">
                  <button
                    onClick={() => setEditing(false)}
                    className="px-2.5 py-1 text-xs rounded-md border hover:bg-[var(--bg-secondary)] transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    {t('chat.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={submitEditAndFork}
                    disabled={!draft.trim() || sending}
                    className="px-2.5 py-1 text-xs rounded-md border hover:bg-[var(--bg-secondary)] disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer flex items-center gap-1"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    title={t('chat.edit.fork_tooltip', '保留原会话并分叉到新分支重发')}
                  >
                    <GitFork size={11} />
                    <span>{t('chat.edit.fork_submit', '编辑并分叉')}</span>
                  </button>
                  <button
                    onClick={submitEdit}
                    disabled={!draft.trim() || sending}
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
                  <div className={userDisplayText || inlineAttachments.length > 0 ? 'mb-2' : ''}>
                    <MessageImageGrid
                      images={imageList}
                      align="end"
                      onOpen={(idx) => setLightboxState({ images: imageList, index: idx })}
                    />
                  </div>
                )}
                {inlineAttachments.length > 0 && (
                  <UserAttachmentCards attachments={inlineAttachments} />
                )}
                {userDisplayText && renderedContent}
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
            <button
              onClick={handleQuote}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]/50 icon-btn-silky focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
              title={t('chat.quote', '引用回复')}
              aria-label={t('chat.quote', '引用回复')}
            >
              <Quote size={12} />
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
            ref={assistantBodyRef}
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
            {imageList.length > 0 && (
              <div className={message.content ? 'mb-2' : ''}>
                <MessageImageGrid
                  images={imageList}
                  align="start"
                  onOpen={(idx) => setLightboxState({ images: imageList, index: idx })}
                />
              </div>
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
              <button
                onClick={handleCopyPlain}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]/50 icon-btn-silky focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                title={t('chat.copy_plain', '复制纯文本')}
                aria-label={t('chat.copy_plain', '复制纯文本')}
              >
                {copiedPlain ? <Check size={12} className="animate-scale-pop" style={{ color: 'var(--success)' }} /> : <FileText size={12} />}
              </button>
              <button
                onClick={handleQuote}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]/50 icon-btn-silky focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                title={t('chat.quote', '引用回复')}
                aria-label={t('chat.quote', '引用回复')}
              >
                <Quote size={12} />
              </button>
              {!isStreaming && !isError && (
                <button
                  className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]/50 icon-btn-silky focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                  title={t('chat.regenerate')}
                  aria-label={t('chat.regenerate')}
                  onClick={() => regenerate(message.id)}
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
                  onClick={() => regenerate(message.id)}
                >
                  <RefreshCw size={10} />
                  <span>{t('chat.retry')}</span>
                </button>
              )}
            </div>
        </div>
        </div>
      )}
      {lightboxState && lightboxState.images.length > 0 && (
        <ImageLightboxModal
          images={lightboxState.images}
          initialIndex={lightboxState.index}
          onClose={() => setLightboxState(null)}
        />
      )}
    </div>
  )
}

export default memo(MessageBubble)
