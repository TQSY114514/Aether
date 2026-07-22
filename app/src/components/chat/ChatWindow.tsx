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

// Lightweight placeholder: rendered once, updated via direct DOM writes
// to avoid re-rendering ChatWindow on every streaming token.
// Uses rAF-throttled scrollIntoView with an isAtBottom guard — skips scroll
// when the user has scrolled up to read history (no more jarring yanks).
function StreamingBubble({ sessionId, isAtBottom }: { sessionId: number; isAtBottom: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const msgIdRef = useRef<number>(-1)
  const rafRef = useRef<number>(0)
  const lastLenRef = useRef<number>(0)

  useEffect(() => {
    const unsub = useStore.subscribe((s) => {
      const buf = s.streamingBySession[sessionId]
      // No buffer and nothing initialized — skip entirely.
      if (!buf && msgIdRef.current === -1) return
      if (!ref.current) return
      // New message ID assigned — re-render from scratch.
      if (buf && buf.messageId && buf.messageId !== msgIdRef.current) {
        msgIdRef.current = buf.messageId
        lastLenRef.current = 0
        ref.current.innerHTML = renderMarkdown(buf.content)
        ref.current.style.display = ''
        queueScroll()
        return
      }
      // Buffer cleared (stream finished) — hide the placeholder.
      if (!buf && msgIdRef.current !== -1) {
        msgIdRef.current = -1
        lastLenRef.current = 0
        ref.current.innerHTML = ''
        ref.current.style.display = 'none'
        return
      }
      // Buffer exists but we haven't initialized yet (messageId is null
      // during streaming — we render directly from the buffer content).
      if (buf && msgIdRef.current === -1) {
        msgIdRef.current = 0
        lastLenRef.current = 0
        ref.current.innerHTML = renderMarkdown(buf.content)
        ref.current.style.display = ''
        queueScroll()
        return
      }
      // Same message, content growing — update DOM on every rAF for smooth
      // character-by-character rendering. The rAF throttle in flushStreamUpdates
      // already prevents excessive repaints.
      if (buf && msgIdRef.current === 0) {
        const newLen = buf.content.length
        if (newLen === lastLenRef.current) return
        lastLenRef.current = newLen
        ref.current.innerHTML = renderMarkdown(buf.content)
        queueScroll()
        return
      }
    })
    function queueScroll() {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        if (!isAtBottom) return
        ref.current?.scrollIntoView({ behavior: 'auto' })
      })
    }
    return () => {
      unsub()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [sessionId, isAtBottom])

  return <div ref={ref} style={{ display: 'none' }} />
}

export default function ChatWindow() {
  const [isAtBottom, setIsAtBottom] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  useOverscrollSpring(scrollRef)

  // Batch selectors with shallow comparison: only re-renders when selected
  // values actually change, not on every store update.
  const {
    messages, currentSessionId, sending, streamingBySession,
    toolCallsByMessage, arenaResults, arenaAggregate, arenaError,
    proposedHabits, activeHints, loadMessages,
    resolveHabit, dismissHint, arenaVote,
  } = useStore((s) => ({
    messages: s.messages,
    currentSessionId: s.currentSessionId,
    sending: s.sending,
    streamingBySession: s.streamingBySession,
    toolCallsByMessage: s.toolCallsByMessage,
    arenaResults: s.arenaResults,
    arenaAggregate: s.arenaAggregate,
    arenaError: s.arenaError,
    proposedHabits: s.proposedHabits,
    activeHints: s.activeHints,
    loadMessages: s.loadMessages,
    resolveHabit: s.resolveHabit,
    dismissHint: s.dismissHint,
    arenaVote: s.arenaVote,
  }), shallow)

  const [searchQuery, setSearchQuery] = useState('')
  const [activeMsgId, setActiveMsgId] = useState<number | null>(null)
  const scrollToMsg = useCallback((id: number) => {
    document.getElementById('msg-' + id)?.scrollIntoView({ behavior: 'smooth' })
  }, [])

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
                className="p-0.5 rounded hover:bg-[var(--border)] disabled:opacity-30">
                <ChevronUp size={13} className="text-gray-400" />
              </button>
              <button onClick={() => jumpTo(1)} disabled={matchCount === 0} title={t('chat.search_next')}
                className="p-0.5 rounded hover:bg-[var(--border)] disabled:opacity-30">
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
      {sending && streamingStatus && (
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

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} searchHighlight={searchQuery} />
          ))}

          {/* Streaming bubble — rendered once, updated via DOM writes for perf */}
          {currentSessionId && <StreamingBubble sessionId={currentSessionId} isAtBottom={isAtBottom} />}

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
          {arenaResults.length > 0 && (
            <div className="space-y-3">
              {arenaAggregate && (
                <div className="border-2 rounded-xl overflow-hidden" style={{ borderColor: 'var(--warning)', backgroundColor: 'var(--bg-secondary)' }}>
                  <div className="px-3 py-2 border-b flex items-center gap-2 text-sm font-medium" style={{ borderColor: 'var(--warning)' }}>
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: 'var(--warning)', color: '#fff' }}>MoA</span>
                    <span style={{ color: 'var(--text-primary)' }}>{t('chat.arena.aggregate')}</span>
                    <span className="ml-auto text-[10px]" style={{ color: 'var(--text-muted)' }}>{arenaAggregate.model_name}</span>
                  </div>
                  <div className="p-3 text-sm leading-relaxed max-h-96 overflow-y-auto">
                    <div className="mc" dangerouslySetInnerHTML={{ __html: renderMarkdown(arenaAggregate.content) }} />
                  </div>
                </div>
              )}
              <div className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>🏟 {t('chat.arena.result')}</div>
              {arenaResults.map((r) => {
                const others = arenaResults.filter(x => x.model_id !== r.model_id)
                const voted = arenaResults.length === 1 // collapsed to winner after voting
                return (
                  <div key={r.model_id} className="border rounded-xl overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                    <div className="px-3 py-2 border-b flex items-center justify-between text-sm font-medium" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                      <span style={{ color: 'var(--text-primary)' }}>{r.model_name}</span>
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{r.provider_name}</span>
                    </div>
                    <div className="p-3 text-sm leading-relaxed max-h-60 overflow-y-auto">
                      <div className="mc" dangerouslySetInnerHTML={{ __html: renderMarkdown(r.content) }} />
                    </div>
                    {!voted && (
                      <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                        <button onClick={() => arenaVote({ model_id: r.model_id, model_name: r.model_name }, others.map(x => ({ model_id: x.model_id, model_name: x.model_name })))}
                          className="text-xs px-3 py-1 rounded-lg border bg-white hover:bg-amber-50 hover:border-amber-300 transition-colors" style={{ borderColor: 'var(--border)' }}>
                          ⭐ {t('chat.arena.vote')}
                        </button>
                      </div>
                    )}
                    {voted && (
                      <div className="px-3 py-2 border-t text-xs" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>✅ {t('chat.arena.voted')}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <MessageNav messages={messages} activeId={activeMsgId} scrollTo={scrollToMsg} />
    </div>
  )
}
