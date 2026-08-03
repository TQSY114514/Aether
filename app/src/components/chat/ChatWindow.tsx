import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store'
import MessageBubble from './MessageBubble'
import EmptyState from './EmptyState'
import { renderMarkdown } from '@/utils/markdown'
import { t } from '@/utils/i18n'
import { useOverscrollSpring } from '@/utils/useOverscrollSpring'
import MessageNav from './MessageNav'
import { Search, X, Brain, Lightbulb, ChevronUp, ChevronDown } from 'lucide-react'
import { shallow } from 'zustand/shallow'
import { useVirtualizer } from '@tanstack/react-virtual'

// Arena results display component with streaming-like animation
function ArenaResults({ results, voted, winnerId, onVote, t, renderMarkdown }: {
  results: { model_id: number; model_name: string; provider_name: string; content: string }[]
  voted: boolean
  winnerId: number | null
  onVote: (winner: { model_id: number; model_name: string }, losers: { model_id: number; model_name: string }[]) => Promise<void>
  t: (key: string) => string
  renderMarkdown: (md: string) => string
}) {
  const [revealed, setRevealed] = useState(new Set<string>())
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Reset when new results arrive
    setRevealed(new Set())
    setDone(false)
  }, [results.length])

  useEffect(() => {
    if (results.length === 0) return
    if (done) return

    const modelIds = results.map(r => String(r.model_id))
    const toReveal = modelIds.filter(id => !revealed.has(id))
    if (toReveal.length === 0) {
      setDone(true)
      return
    }

    // Reveal one at a time with short delay
    let idx = 0
    const interval = setInterval(() => {
      if (idx >= toReveal.length) {
        clearInterval(interval)
        setDone(true)
        return
      }
      setRevealed(prev => new Set([...prev, toReveal[idx]]))
      idx++
    }, 200)

    return () => clearInterval(interval)
  }, [results.length, revealed, done])

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>🏟 {t('chat.arena.result')}</div>
      {results.map((r) => {
        const key = String(r.model_id)
        const isRevealed = revealed.has(key)
        const isWinner = voted && r.model_id === winnerId
        const isLoser = voted && r.model_id !== winnerId
        return (
          <div key={r.model_id} className="border rounded-xl overflow-hidden animate-blur-fade"
            style={{
              borderColor: isWinner ? 'var(--success)' : isLoser ? 'var(--border)' : 'var(--border)',
              opacity: isLoser ? 0.5 : isRevealed ? 1 : 0,
              backgroundColor: isLoser ? 'var(--bg-secondary)' : undefined,
              maxHeight: isLoser ? 120 : undefined,
              overflow: isLoser ? 'hidden' : undefined,
              transform: isLoser ? 'scale(0.98)' : undefined,
              filter: isLoser ? 'grayscale(0.3)' : undefined,
            }}>
            <div className="px-3 py-2 border-b flex items-center justify-between text-sm font-medium" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
              <span style={{ color: isWinner ? 'var(--success)' : isLoser ? 'var(--text-muted)' : 'var(--text-primary)' }}>{r.model_name}</span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{r.provider_name}</span>
            </div>
            <div className="p-3 text-sm leading-relaxed max-h-60 overflow-y-auto">
              <div className="mc" dangerouslySetInnerHTML={{ __html: renderMarkdown(r.content) }} />
            </div>
            {!voted && (
              <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                <button onClick={() => onVote(
                  { model_id: r.model_id, model_name: r.model_name },
                  results.filter(x => x.model_id !== r.model_id).map(x => ({ model_id: x.model_id, model_name: x.model_name }))
                )}
                  className="text-xs px-3 py-1 rounded-lg border bg-[var(--content-bg)] hover:bg-amber-50 hover:border-amber-300 transition-colors" style={{ borderColor: 'var(--border)' }}>
                  ⭐ {t('chat.arena.vote')}
                </button>
              </div>
            )}
            {isWinner && voted && (
              <div className="px-3 py-2 border-t text-xs" style={{ borderColor: 'var(--success)', backgroundColor: 'rgba(34,197,94,0.08)', color: 'var(--success)' }}>✅ {t('chat.arena.voted')}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Lightweight streaming bubble: rendered inside the message flow, updated via
// direct DOM writes to avoid re-rendering ChatWindow on every streaming token.
// Styled as a proper assistant message bubble with AI avatar, border, and
// auto-growing height. Uses rAF-throttled scrollIntoView with an isAtBottom
// guard — skips scroll when the user has scrolled up to read history.
function StreamingBubble({ sessionId, isAtBottom }: { sessionId: number; isAtBottom: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const lastLenRef = useRef<number>(0)

  useEffect(() => {
    const unsub = useStore.subscribe((s) => {
      const buf = s.streamingBySession[sessionId]
      if (!buf || !ref.current) return
      const newLen = buf.content.length
      if (newLen === lastLenRef.current) return
      lastLenRef.current = newLen
      // During streaming, render plain escaped text (not full markdown) for
      // performance: re-parsing markdown + highlight.js on every token is O(n²)
      // for long messages. The final rendered version is produced by
      // MessageBubble via renderMarkdown when the stream completes.
      const escaped = buf.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')
      ref.current.innerHTML = escaped
      // Auto-grow the bubble height based on content.
      if (bubbleRef.current) {
        bubbleRef.current.style.minHeight = ''
        bubbleRef.current.style.minHeight = bubbleRef.current.scrollHeight + 'px'
      }
      // Auto-scroll only if user is at the bottom.
      if (isAtBottom) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0
          ref.current?.scrollIntoView({ behavior: 'auto' })
        })
      }
    })
    return () => {
      unsub()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [sessionId, isAtBottom])

  return (
    <div id={`msg-streaming-${sessionId}`} className="flex justify-start message-enter">
      <div className="w-full" style={{ maxWidth: '85%' }}>
        <div className="flex items-center gap-2 mb-1.5 px-1">
          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))' }}>
            <span className="text-white text-[10px] font-medium">AI</span>
          </div>
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Assistant</span>
          <span className="flex items-center gap-0.5 ml-1">
            <span className="w-1 h-1 rounded-full bg-[var(--accent)] typing-dot" />
            <span className="w-1 h-1 rounded-full bg-[var(--accent)] typing-dot" />
            <span className="w-1 h-1 rounded-full bg-[var(--accent)] typing-dot" />
          </span>
        </div>
        <div ref={bubbleRef} className="rounded-2xl rounded-bl-md border px-4 py-3 text-sm leading-relaxed break-words"
          style={{ backgroundColor: 'var(--content-bg)', borderColor: 'var(--border)', transition: 'min-height 0.1s ease' }}>
          <div ref={ref} className="mc" />
        </div>
      </div>
    </div>
  )
}

export default function ChatWindow() {
  const [isAtBottom, setIsAtBottom] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  useOverscrollSpring(scrollRef)

  // Batch selectors with shallow comparison: only re-renders when selected
  // values actually change, not on every store update.
  const {
    messages, currentSessionId, streamingBySession, chatMode,
    toolCallsByMessage, arenaResults, arenaResultsSessionId, arenaPending, arenaError,
    proposedHabits, activeHints, loadMessages,
    resolveHabit, dismissHint, arenaVote, arenaVoted, arenaVoteWinnerId,
  } = useStore((s) => ({
    messages: s.messages,
    currentSessionId: s.currentSessionId,
    streamingBySession: s.streamingBySession,
    chatMode: s.chatMode,
    toolCallsByMessage: s.toolCallsByMessage,
    arenaResults: s.arenaResults,
    arenaResultsSessionId: s.arenaResultsSessionId,
    arenaPending: s.arenaPending,
    arenaError: s.arenaError,
    proposedHabits: s.proposedHabits,
    activeHints: s.activeHints,
    loadMessages: s.loadMessages,
    resolveHabit: s.resolveHabit,
    dismissHint: s.dismissHint,
    arenaVote: s.arenaVote,
    arenaVoted: s.arenaVoted,
    arenaVoteWinnerId: s.arenaVoteWinnerId,
  }), shallow)

  // Memoize the messages array for referential stability. Streaming chunks
  // update streamingBySession (also in the selector above) which triggers a
  // ChatWindow re-render, but the messages reference itself is unchanged —
  // useMemo ensures the virtualizer sees the same array and skips re-rendering
  // its (memoized) MessageBubble children, eliminating flicker during streaming.
  //
  // When the current session is streaming, hide the empty assistant placeholder
  // that the main process already wrote to the DB (chat.handler.js adds an empty
  // assistant row before streaming starts). The StreamingBubble renders the live
  // content instead. Without this filter, switching away and back during a stream
  // shows TWO bubbles: an empty one (DB placeholder) + the streaming one.
  const virtualMessages = useMemo(() => {
    const buf = currentSessionId ? streamingBySession[currentSessionId] : null
    if (!buf) return messages
    // Filter out the assistant placeholder that the main process writes to the
    // DB before streaming starts. We have two cases:
    //   1. buf.messageId is set (first chunk arrived): filter by id.
    //   2. buf.messageId is null (chunk not yet arrived): filter the last
    //      assistant message if it has empty content — that's the placeholder.
    if (buf.messageId != null) {
      return messages.filter(m => m.id !== buf.messageId)
    }
    // No messageId yet — drop a trailing empty assistant message if present.
    const last = messages[messages.length - 1]
    if (last && last.role === 'assistant' && (last.content == null || last.content === '')) {
      return messages.slice(0, -1)
    }
    return messages
  }, [messages, currentSessionId, streamingBySession])

  // Virtual scroller: only renders visible message rows (+ overscan) instead
  // of the full list. Mounted on the existing scrollRef container. Uses
  // measureElement for dynamic heights (markdown, code blocks, images).
  const virtualizer = useVirtualizer({
    count: virtualMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    overscan: 6,
    getItemKey: (index) => virtualMessages[index].id,
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [activeMsgId, setActiveMsgId] = useState<number | null>(null)
  // Use the virtualizer to jump to a message — works even for off-screen rows
  // (which are not in the DOM under virtual scrolling) by index lookup.
  const scrollToMsg = useCallback((id: number) => {
    const idx = virtualMessages.findIndex(m => m.id === id)
    if (idx >= 0) {
      virtualizer.scrollToIndex(idx, { align: 'start' })
    }
  }, [virtualMessages, virtualizer])

  // Compute streaming status for the header bar — derive from specific keys
  // so the memo only invalidates when tool-call state actually changes.
  const streamingStatus = useMemo(() => {
    if (!currentSessionId) return ''
    const buf = streamingBySession[currentSessionId]
    if (!buf) return ''
    const hasToolCalls = Object.values(toolCallsByMessage).some(tcs =>
      tcs.some(tc => tc.result === null && tc.error === null)
    )
    if (hasToolCalls) return t('status.using_tools')
    return t('status.thinking')
  }, [currentSessionId, toolCallsByMessage])

  // Reload messages when window regains focus (fix: text disappearing on alt-tab).
  // Skipped while a stream is active for this session — reloading mid-stream
  // would discard the in-progress assistant bubble.
  useEffect(() => {
    const onFocus = () => {
      const st = useStore.getState()
      if (currentSessionId && !st.streamingBySession[currentSessionId]) {
        loadMessages(currentSessionId)
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [currentSessionId, loadMessages])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }, [])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Always reload messages when switching sessions. The messages array belongs
  // to whichever session was active when it was last set; switching back needs
  // a fresh load so cross-session streaming completion doesn't leave stale data.
  useEffect(() => {
    if (currentSessionId) {
      loadMessages(currentSessionId)
    }
    setSearchQuery('')
    setTimeout(scrollToBottom, 50)
  }, [currentSessionId, loadMessages, scrollToBottom])

  // Only auto-scroll when the user is already near the bottom (normal reading
  // position). If they scrolled up to read history, don't yank them back down.
  useEffect(() => {
    if (isAtBottom) scrollToBottom()
  }, [messages, isAtBottom, scrollToBottom])

  // Search: debounce the query used for filtering so typing doesn't trigger
  // a filter + scrollIntoView on every keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>()
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setSearchQuery(q)
    clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => setDebouncedQuery(q), 200)
  }
  // Cleanup timer on unmount.
  useEffect(() => () => clearTimeout(debounceTimer.current), [])

  // Search: don't filter — keep the full conversation visible and highlight
  // matches (prev/next jumps to each). Uses debouncedQuery so filtering only
  // runs 200ms after the user stops typing.
  const matchIds = useMemo(() => {
    if (!debouncedQuery.trim()) return [] as number[]
    const q = debouncedQuery.toLowerCase()
    return messages.filter(m => m.content.toLowerCase().includes(q)).map(m => m.id)
  }, [messages, debouncedQuery])
  const [matchIdx, setMatchIdx] = useState(0)
  const matchCount = matchIds.length
  // Clamp the active index when the match set shrinks (query changed).
  useEffect(() => { if (matchIdx > matchCount - 1) setMatchIdx(Math.max(0, matchCount - 1)) }, [matchCount, matchIdx])
  const jumpTo = (delta: number) => {
    if (matchIds.length === 0) return
    const next = (matchIdx + delta + matchIds.length) % matchIds.length
    setMatchIdx(next)
    scrollToMsg(matchIds[next])
  }
  // When the debounced query changes, jump to the first match so the counter
  // is live (only fires after the 200ms debounce).
  useEffect(() => { if (matchIds.length > 0) { setMatchIdx(0); scrollToMsg(matchIds[0]) } /* eslint-disable-next-line */ }, [debouncedQuery])

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ position: "relative" }}>
      {/* Search bar */}
      <div className="px-4 py-1.5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg" style={{ backgroundColor: 'var(--content-secondary, var(--bg-secondary))', border: '1px solid var(--border)' }}>
          <Search size={12} className="text-gray-400 shrink-0" />
          <input value={searchQuery} onChange={handleSearchChange}
            placeholder={t('chat.search_placeholder')} autoComplete="off"
            className="w-full bg-transparent outline-none text-xs" style={{ color: 'var(--text-primary)' }} />
          {searchQuery && (
            <>
              <span className="text-[10px] tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                {matchCount > 0 ? `${matchIdx + 1}/${matchCount}` : `0/${matchCount}`}
              </span>
              <button onClick={() => jumpTo(-1)} disabled={matchCount === 0} title={t('chat.search_prev')}
                aria-label={t('chat.search_prev')} className="p-0.5 rounded hover:bg-[var(--border)] disabled:opacity-30">
                <ChevronUp size={13} className="text-gray-400" />
              </button>
              <button onClick={() => jumpTo(1)} disabled={matchCount === 0} title={t('chat.search_next')}
                aria-label={t('chat.search_next')} className="p-0.5 rounded hover:bg-[var(--border)] disabled:opacity-30">
                <ChevronDown size={13} className="text-gray-400" />
              </button>
              <button onClick={() => setSearchQuery('')} className="p-0.5 rounded hover:bg-[var(--border)]">
                <X size={12} className="text-gray-400" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Streaming status bar */}
      {(currentSessionId && streamingBySession[currentSessionId]) && streamingStatus && (
        <div className="px-4 py-1 shrink-0 animate-blur-fade" style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="max-w-3xl mx-auto flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{streamingStatus}</span>
          </div>
        </div>
      )}

      <div ref={scrollRef} onScroll={handleScroll} className="scroll-bounce flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto chat-gap">
          {messages.length === 0 && !(currentSessionId && streamingBySession[currentSessionId]) && arenaResults.length === 0 && (
            <EmptyState />
          )}

          {/* Virtualized message list — only visible rows are mounted. The
              relative container height tracks the total measured size so the
              scrollbar reflects the full conversation. Each row is absolutely
              positioned via translateY(start) and measured dynamically via
              measureElement (handles markdown, code blocks, images). The
              14px paddingBottom mirrors the chat-gap spacing that flex gap
              can no longer apply to absolutely-positioned children. */}
          {virtualMessages.length > 0 && (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
              {virtualizer.getVirtualItems().map((vi) => {
                const msg = virtualMessages[vi.index]
                return (
                  <div
                    key={msg.id}
                    data-index={vi.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vi.start}px)`,
                      paddingBottom: '14px',
                    }}
                  >
                    <MessageBubble message={msg} searchHighlight={searchQuery} />
                  </div>
                )
              })}
            </div>
          )}

          {/* Streaming bubble — render ONLY for the current session. Other
              sessions keep streaming in the background but their output is not
              shown here, preventing double-output when switching chats. */}
          {chatMode !== 'arena' && currentSessionId && streamingBySession[currentSessionId] && (
            <StreamingBubble sessionId={currentSessionId} isAtBottom={isAtBottom} />
          )}

          {/* Arena results */}
          {arenaError && (
            <div className="border rounded-xl p-3 text-sm" style={{ borderColor: 'var(--error)', color: 'var(--error)', backgroundColor: 'var(--bg-secondary)' }}>⚠ {arenaError}</div>
          )}
          {activeHints.map((h) => (
            <div key={h.flag} className="rounded-xl p-3 border flex items-start gap-2" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)' }}>
              <Lightbulb size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
              <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>{h.text}</span>
              <button onClick={() => dismissHint(h.flag)} className="text-[10px] shrink-0 px-2 py-0.5 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>{t('hint.got_it')}</button>
            </div>
          ))}
          {proposedHabits.map((h) => (
            <div key={h.key} className="rounded-xl p-3 border-2" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)' }}>
              <div className="flex items-start gap-2">
                <Brain size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {t('habit.proposed.prefix')} <span className="font-medium">{h.imperative}</span>
                  </p>
                  {h.reason && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{h.reason}</p>}
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => resolveHabit(h.key, true)} className="px-3 py-1 text-xs rounded-lg text-white" style={{ backgroundColor: 'var(--accent)' }}>{t('habit.proposed.accept')}</button>
                    <button onClick={() => resolveHabit(h.key, false)} className="px-3 py-1 text-xs rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>{t('habit.proposed.dismiss')}</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {arenaResults.length > 0 && arenaResultsSessionId === currentSessionId && (
            <ArenaResults
              results={arenaResults}
              voted={arenaVoted}
              winnerId={arenaVoteWinnerId}
              onVote={arenaVote}
              t={t}
              renderMarkdown={renderMarkdown}
            />
          )}
          {arenaPending > 0 && arenaResultsSessionId === currentSessionId && (
            <div className="text-[11px] px-1 py-1 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              <span>{t('chat.arena.running', String(arenaPending))}</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <MessageNav messages={messages} activeId={activeMsgId} scrollTo={scrollToMsg} scrollRef={scrollRef} />
    </div>
  )
}
