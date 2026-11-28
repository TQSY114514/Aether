import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store'
import MessageBubble from './MessageBubble'
import EmptyState from './EmptyState'
import { renderMarkdown, renderMarkdownTail, splitMarkdownBlocks, getHighlightVersion } from '@/utils/markdown'
import { t } from '@/utils/i18n'
import MessageNav from './MessageNav'
import { Search, X, Brain, Lightbulb, ChevronUp, ChevronDown, History, ShieldAlert, Star, Check, Sparkles } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useVirtualizer } from '@tanstack/react-virtual'
import ArenaResultsDeck from '@/components/arena/ArenaResultsDeck'
import ThinkingBlock from './ThinkingBlock'
import ToolCallBlock from './ToolCallBlock'
import TaskCard from './TaskCard'
import AgentRunTimeline from './AgentRunTimeline'
import AgentTimeline from './AgentTimeline'

const EMPTY_ARRAY: any[] = []

// Lightweight streaming bubble: rendered inside the message flow, updated via
// direct DOM writes to avoid re-rendering ChatWindow on every streaming token.
// Splits markdown into immutable finalized blocks (appended once) + an active
// trailing block so long responses render in O(1) per update without O(N^2) churn.
function StreamingBubble({ sessionId, isAtBottom }: { sessionId: number; isAtBottom: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const committedRef = useRef<HTMLDivElement>(null)
  const tailRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLElement | null>(null)
  const rafRef = useRef<number>(0)
  const thinkingRafRef = useRef<number>(0)
  const mdTimerRef = useRef<number>(0)
  const lastLenRef = useRef<number>(0)
  const lastMdRenderTimeRef = useRef<number>(0)
  const activeMidRef = useRef<number | null>(null)
  const committedCountRef = useRef<number>(0)
  const committedHlVerRef = useRef<number>(getHighlightVersion())

  // Dedupe refs to avoid scheduling React re-renders when auxiliary metadata hasn't changed
  const lastDurRef = useRef<number | null>(null)
  const lastStartRef = useRef<number | null>(null)
  const lastToolCallsRef = useRef<any[]>(EMPTY_ARRAY)
  const lastThinkingTextRef = useRef<string>('')
  const lastThinkingStreamingRef = useRef<boolean>(false)

  // Live streaming states: React state so blocks re-render on each new chunk/step.
  const [thinkingText, setThinkingText] = useState('')
  const [thinkingStreaming, setThinkingStreaming] = useState(false)
  const [thinkingDuration, setThinkingDuration] = useState<number | null>(null)
  const [thinkingStartedAt, setThinkingStartedAt] = useState<number | null>(null)
  const [toolCalls, setToolCalls] = useState<any[]>(EMPTY_ARRAY)

  const renderIncrementalContent = useCallback((rawContent: string) => {
    const committedEl = committedRef.current
    const tailEl = tailRef.current
    if (!committedEl || !tailEl) return

    const { committed, tail } = splitMarkdownBlocks(rawContent)
    const hlVer = getHighlightVersion()
    if (hlVer !== committedHlVerRef.current || committed.length < committedCountRef.current) {
      committedEl.innerHTML = ''
      committedCountRef.current = 0
      committedHlVerRef.current = hlVer
    }

    if (committed.length > committedCountRef.current) {
      const frag = document.createDocumentFragment()
      const scratch = document.createElement('div')
      for (let i = committedCountRef.current; i < committed.length; i++) {
        scratch.innerHTML = renderMarkdown(committed[i])
        while (scratch.firstChild) frag.appendChild(scratch.firstChild)
      }
      committedEl.appendChild(frag)
      committedCountRef.current = committed.length
    }

    tailEl.innerHTML = renderMarkdownTail(tail)
  }, [])

  const resetLocalState = useCallback(() => {
    lastThinkingTextRef.current = ''
    lastThinkingStreamingRef.current = false
    lastDurRef.current = null
    lastStartRef.current = null
    lastToolCallsRef.current = EMPTY_ARRAY
    committedCountRef.current = 0
    setThinkingText('')
    setThinkingStreaming(false)
    setThinkingDuration(null)
    setThinkingStartedAt(null)
    setToolCalls(EMPTY_ARRAY)
    lastLenRef.current = 0
    lastMdRenderTimeRef.current = 0
    if (committedRef.current) committedRef.current.innerHTML = ''
    if (tailRef.current) tailRef.current.innerHTML = ''
  }, [])

  useEffect(() => {
    resetLocalState()
    activeMidRef.current = null
    scrollerRef.current = null
  }, [sessionId, resetLocalState])

  useEffect(() => {
    const scrollToBottomSoon = () => {
      if (!isAtBottom) return
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        if (!scrollerRef.current || !scrollerRef.current.isConnected) {
          scrollerRef.current = ref.current?.closest('.overflow-y-auto') as HTMLElement | null
        }
        const scroller = scrollerRef.current
        if (scroller) scroller.scrollTop = scroller.scrollHeight
      })
    }

    const flushMarkdown = (mid: number | null) => {
      const latestBuf = useStore.getState().streamingBySession[sessionId]
      if (!latestBuf || (mid != null && latestBuf.messageId !== mid) || activeMidRef.current !== mid) return
      lastMdRenderTimeRef.current = performance.now()
      renderIncrementalContent(latestBuf.content)
      scrollToBottomSoon()
    }

    const initialState = useStore.getState()
    const initialBuf = initialState.streamingBySession[sessionId]
    if (initialBuf) {
      const initMid = initialBuf.messageId != null ? initialBuf.messageId : null
      if (initMid != null) {
        activeMidRef.current = initMid
        const t = initialState.thinkingBlocksByMessage[initMid]
        if (t !== undefined) {
          lastThinkingTextRef.current = t
          setThinkingText(t)
          const sf = !initialBuf.content
          lastThinkingStreamingRef.current = sf
          setThinkingStreaming(sf)
        }
        const d = initialState.thinkingDurationsByMessage[initMid] ?? null
        if (d !== lastDurRef.current) { lastDurRef.current = d; setThinkingDuration(d) }
        const st = initialState.thinkingStartsByMessage[initMid] ?? null
        if (st !== lastStartRef.current) { lastStartRef.current = st; setThinkingStartedAt(st) }
        const tc = initialState.toolCallsByMessage[initMid] || EMPTY_ARRAY
        if (tc !== lastToolCallsRef.current) { lastToolCallsRef.current = tc; setToolCalls(tc) }
      }
      if (initialBuf.content) {
        lastLenRef.current = initialBuf.content.length
        lastMdRenderTimeRef.current = performance.now()
        renderIncrementalContent(initialBuf.content)
      }
    }

    const unsub = useStore.subscribe((s) => {
      const buf = s.streamingBySession[sessionId]
      if (!buf) return

      const mid = buf.messageId != null ? buf.messageId : null

      if (mid != null && activeMidRef.current !== null && activeMidRef.current !== mid) {
        resetLocalState()
      }
      if (mid != null) {
        activeMidRef.current = mid

        // Thinking stream with RAF throttling + equality checks to prevent React churn
        const thinking = s.thinkingBlocksByMessage[mid]
        const nextThinkingStreaming = !buf.content
        if (thinking !== undefined && (thinking !== lastThinkingTextRef.current || nextThinkingStreaming !== lastThinkingStreamingRef.current)) {
          if (!thinkingRafRef.current) {
            thinkingRafRef.current = requestAnimationFrame(() => {
              thinkingRafRef.current = 0
              const st = useStore.getState()
              const latestBuf = st.streamingBySession[sessionId]
              if (!latestBuf || latestBuf.messageId !== mid || activeMidRef.current !== mid) return
              const latestThinking = st.thinkingBlocksByMessage[mid] ?? ''
              const latestStreamFlag = !latestBuf.content
              if (latestThinking !== lastThinkingTextRef.current) {
                lastThinkingTextRef.current = latestThinking
                setThinkingText(latestThinking)
              }
              if (latestStreamFlag !== lastThinkingStreamingRef.current) {
                lastThinkingStreamingRef.current = latestStreamFlag
                setThinkingStreaming(latestStreamFlag)
              }
            })
          }
        }

        const dur = s.thinkingDurationsByMessage[mid] ?? null
        if (dur !== lastDurRef.current) {
          lastDurRef.current = dur
          setThinkingDuration(dur)
        }
        const start = s.thinkingStartsByMessage[mid] ?? null
        if (start !== lastStartRef.current) {
          lastStartRef.current = start
          setThinkingStartedAt(start)
        }

        const tc = s.toolCallsByMessage[mid] || EMPTY_ARRAY
        if (tc !== lastToolCallsRef.current) {
          lastToolCallsRef.current = tc
          setToolCalls(tc)
        }
      }

      // -- Main content: Incremental block DOM render + adaptive throttling --
      if (!committedRef.current || !tailRef.current) return
      const newLen = buf.content.length
      if (newLen === lastLenRef.current) return
      lastLenRef.current = newLen

      const approxTailLen = Math.max(0, newLen - committedCountRef.current * 120)
      const minInterval = approxTailLen > 4000 ? 140 : approxTailLen > 1500 ? 95 : 65
      const now = performance.now()
      const elapsed = now - lastMdRenderTimeRef.current
      if (elapsed >= minInterval) {
        if (mdTimerRef.current) {
          window.clearTimeout(mdTimerRef.current)
          mdTimerRef.current = 0
        }
        lastMdRenderTimeRef.current = now
        renderIncrementalContent(buf.content)
        scrollToBottomSoon()
      } else if (!mdTimerRef.current) {
        mdTimerRef.current = window.setTimeout(() => {
          mdTimerRef.current = 0
          flushMarkdown(mid)
        }, Math.max(16, minInterval - elapsed))
      }
    })
    return () => {
      unsub()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (thinkingRafRef.current) cancelAnimationFrame(thinkingRafRef.current)
      if (mdTimerRef.current) window.clearTimeout(mdTimerRef.current)
    }
  }, [sessionId, isAtBottom, resetLocalState, renderIncrementalContent])

  return (
    <div id={`msg-streaming-${sessionId}`} className="w-full flex flex-col message-enter py-3">
      <div className="w-full">
        {/* Assistant Content Stream — Quiet Precision typography without clunky [AI] box */}
        <div className="w-full text-[13.5px] leading-[1.7] tracking-[-0.005em] break-words relative">
          <AgentTimeline
            thinkingText={thinkingText || undefined}
            thinkingStreaming={thinkingStreaming}
            thinkingDuration={thinkingDuration}
            thinkingStartedAt={thinkingStartedAt}
            toolCalls={toolCalls.length > 0 ? toolCalls : undefined}
            streaming
          />
          <div ref={ref} className="mc">
            <div ref={committedRef} />
            <div ref={tailRef} className="typing-cursor" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Render the active conversation, streaming state, and agent activity. */
export default function ChatWindow() {
  const [isAtBottom, setIsAtBottom] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Batch selectors with shallow comparison: only re-renders when selected
  // values actually change, not on every store update.
  const {
    messages, currentSessionId, isCurrentStreaming, currentStreamingMessageId, chatMode,
    toolCallsByMessage, arenaResults, arenaResultsSessionId, arenaPending, arenaError,
    proposedHabits, activeHints, loadMessages,
    resolveHabit, dismissHint, arenaVote, arenaVoted, arenaVoteWinnerId, theme, backgroundImage,
  } = useStore(useShallow((s) => ({
    messages: s.messages,
    currentSessionId: s.currentSessionId,
    isCurrentStreaming: Boolean(s.currentSessionId && s.streamingBySession[s.currentSessionId]),
    currentStreamingMessageId: s.currentSessionId ? (s.streamingBySession[s.currentSessionId]?.messageId ?? null) : null,
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
    theme: s.theme,
    backgroundImage: s.backgroundImage,
  })))

  const hasBg = !!backgroundImage

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
    if (!isCurrentStreaming) return messages
    if (currentStreamingMessageId != null) {
      return messages.filter(m => m.id !== currentStreamingMessageId)
    }
    const last = messages[messages.length - 1]
    if (last && last.role === 'assistant' && (last.content == null || last.content === '')) {
      return messages.slice(0, -1)
    }
    return messages
  }, [messages, isCurrentStreaming, currentStreamingMessageId])

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

  // Search query lives in the store (messageSearchQuery) so the highlight
  // survives ChatWindow unmount/remount (view switches / session hopping).
  const messageSearchQuery = useStore((s) => s.messageSearchQuery)
  const setMessageSearchQuery = useStore((s) => s.setMessageSearchQuery)
  const distillProposal = useStore((s) => currentSessionId ? s.distillProposalBySession[currentSessionId] : null)
  const [isDistilling, setIsDistilling] = useState(false)
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
    if (!currentSessionId || !isCurrentStreaming) return ''
    const hasToolCalls = Object.values(toolCallsByMessage).some(tcs =>
      tcs.some(tc => tc.result === null && tc.error === null)
    )
    if (hasToolCalls) return t('status.using_tools')
    return t('status.thinking')
  }, [currentSessionId, isCurrentStreaming, toolCallsByMessage])

  // Session taint state (QVD-2026-57410 / untrusted external input defense)
  const isSessionTainted = useMemo(() => {
    if (!currentSessionId) return false
    return Object.values(toolCallsByMessage).some((calls) =>
      calls.some((tc) => (tc as any).isTainted === true)
    )
  }, [currentSessionId, toolCallsByMessage])

  // Reload messages when window regains focus (fix: text disappearing on alt-tab).
  // Skipped while a stream is active for this session — reloading mid-stream
  // would discard the in-progress assistant bubble.
  useEffect(() => {
    const onFocus = () => {
      const st = useStore.getState()
      if (currentSessionId && !st.streamingBySession[currentSessionId]) {
        loadMessages(currentSessionId, { silentIfUnchanged: true })
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

  const scrollToBottom = useCallback((smooth = false) => {
    if (scrollRef.current) {
      if (smooth) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      } else {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }
  }, [])

  // Search: debounce the query used for filtering so typing doesn't trigger
  // a filter + scrollIntoView on every keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState(messageSearchQuery)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearSearch = useCallback(() => {
    setMessageSearchQuery('')
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    setDebouncedQuery('')
    setActiveMsgId(null)
  }, [setMessageSearchQuery])

  // Always reload messages when switching sessions. The messages array belongs
  // to whichever session was active when it was last set; switching back needs
  // a fresh load so cross-session streaming completion doesn't leave stale data.
  useEffect(() => {
    if (currentSessionId) {
      loadMessages(currentSessionId)
    }
    clearSearch()
    setTimeout(() => scrollToBottom(false), 50)
  }, [currentSessionId, loadMessages, scrollToBottom, clearSearch])

  // Only auto-scroll when the user is already near the bottom (normal reading
  // position). If they scrolled up to read history, don't yank them back down.
  useEffect(() => {
    if (isAtBottom) scrollToBottom(false)
  }, [messages, isAtBottom, scrollToBottom])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setMessageSearchQuery(q)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => setDebouncedQuery(q), 200)
  }
  // Cleanup timer on unmount.
  useEffect(() => () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }, [])

  // Search: don't filter — keep the full conversation visible and highlight
  // matches (prev/next jumps to each). Uses debouncedQuery so filtering only
  // runs 200ms after the user stops typing.
  const matchIds = useMemo(() => {
    if (!debouncedQuery.trim()) return [] as number[]
    const q = debouncedQuery.toLowerCase()
    return messages.filter(m => m.content.toLowerCase().includes(q)).map(m => m.id)
  }, [messages, debouncedQuery])
  const [matchIdx, setMatchIdx] = useState(0)
  const [showTimeline, setShowTimeline] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const matchCount = matchIds.length
  // Clamp the active index when the match set shrinks (query changed).
  useEffect(() => { if (matchIdx > matchCount - 1) setMatchIdx(Math.max(0, matchCount - 1)) }, [matchCount, matchIdx])
  const jumpTo = (delta: number) => {
    if (matchIds.length === 0) return
    const next = (matchIdx + delta + matchIds.length) % matchIds.length
    setMatchIdx(next)
    setActiveMsgId(matchIds[next])
    scrollToMsg(matchIds[next])
  }
  // When the debounced query changes, jump to the first match so the counter
  // is live (only fires after the 200ms debounce).
  useEffect(() => { if (matchIds.length > 0) { setMatchIdx(0); setActiveMsgId(matchIds[0]); scrollToMsg(matchIds[0]) } /* eslint-disable-next-line */ }, [debouncedQuery])

  // Header & keyboard triggers for on-demand conversation search and timeline
  useEffect(() => {
    const onToggleSearch = () => {
      setSearchOpen((prev) => {
        const next = !prev
        if (next) setTimeout(() => searchInputRef.current?.focus(), 0)
        else clearSearch()
        return next
      })
    }
    const onToggleTimeline = () => setShowTimeline((prev) => !prev)
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        setTimeout(() => searchInputRef.current?.focus(), 0)
      }
    }
    window.addEventListener('aether:toggle-chat-search', onToggleSearch)
    window.addEventListener('aether:toggle-run-timeline', onToggleTimeline)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('aether:toggle-chat-search', onToggleSearch)
      window.removeEventListener('aether:toggle-run-timeline', onToggleTimeline)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [clearSearch])

  // Empty chat: render EmptyState safely centered via flex + my-auto.
  // When the window is short, my-auto prevents negative scroll / top clipping,
  // keeping the hero icon completely in view while allowing scroll if needed.
  const isEmptyChat = messages.length === 0 && !isCurrentStreaming && arenaResults.length === 0

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden bg-transparent">
      {/* On-demand Search HUD bar (collapsed by default to keep conversation header clean) */}
      {(searchOpen || Boolean(messageSearchQuery)) && (
        <div className="px-4 py-1.5 shrink-0 flex items-center gap-2 relative z-[2]" style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--content-bg, var(--bg-primary))' }}>
          <div className="flex-1 flex items-center gap-2 px-2.5 py-1 rounded-md" style={{ backgroundColor: 'var(--content-secondary, var(--bg-secondary))', border: '1px solid var(--border)' }}>
            <Search size={12} className="text-[var(--text-muted)] shrink-0" />
            <input
              ref={searchInputRef}
              value={messageSearchQuery}
              onChange={handleSearchChange}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  clearSearch()
                  setSearchOpen(false)
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  jumpTo(e.shiftKey ? -1 : 1)
                }
              }}
              placeholder={t('chat.search_placeholder')}
              autoComplete="off"
              className="w-full bg-transparent outline-none text-xs"
              style={{ color: 'var(--text-primary)' }}
            />
            <span className="text-[10px] tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
              {messageSearchQuery ? (matchCount > 0 ? `${matchIdx + 1}/${matchCount}` : `0/0`) : ''}
            </span>
            <button onClick={() => jumpTo(-1)} disabled={matchCount === 0} title={t('chat.search_prev')}
              aria-label={t('chat.search_prev')} className="p-0.5 rounded hover:bg-[var(--border)] disabled:opacity-30 cursor-pointer">
              <ChevronUp size={13} className="text-[var(--text-muted)]" />
            </button>
            <button onClick={() => jumpTo(1)} disabled={matchCount === 0} title={t('chat.search_next')}
              aria-label={t('chat.search_next')} className="p-0.5 rounded hover:bg-[var(--border)] disabled:opacity-30 cursor-pointer">
              <ChevronDown size={13} className="text-[var(--text-muted)]" />
            </button>
            <button
              onClick={() => { clearSearch(); setSearchOpen(false) }}
              className="p-0.5 rounded hover:bg-[var(--border)] cursor-pointer"
              aria-label={t('common.close', '关闭')}
            >
              <X size={12} className="text-[var(--text-muted)]" />
            </button>
          </div>
        </div>
      )}

      {/* Session Taint Banner (QVD-2026-57410 Defense) */}
      {isSessionTainted && (
        <div
          className="px-4 py-2 shrink-0 border-b flex items-center justify-between text-xs animate-blur-fade"
          style={{
            backgroundColor: 'rgba(239,68,68,0.06)',
            borderColor: 'rgba(239,68,68,0.25)',
            color: 'var(--error)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert size={14} className="shrink-0 text-red-500" />
            <span className="font-semibold truncate">
              {t('agent.session.taint_banner_title')}
            </span>
            <span className="hidden sm:inline opacity-80 text-[11px]">
              · {t('agent.session.taint_banner_desc')}
            </span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded border border-red-200 bg-white/60 dark:bg-black/30 font-mono shrink-0">
            QVD-2026-57410 Guarded
          </span>
        </div>
      )}

      {/* Streaming status bar */}
      {isCurrentStreaming && streamingStatus && (
        <div className="px-4 py-1 shrink-0 animate-blur-fade" style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="max-w-3xl mx-auto flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{streamingStatus}</span>
          </div>
        </div>
      )}

      <div ref={scrollRef} onScroll={handleScroll} className={isEmptyChat ? 'scroll-bounce flex-1 overflow-y-auto px-4 py-4 flex flex-col relative z-[1]' : 'scroll-bounce flex-1 overflow-y-auto px-4 py-6 relative z-[1]'}>
        <div className={isEmptyChat ? 'max-w-3xl mx-auto w-full my-auto' : 'max-w-3xl mx-auto w-full chat-gap'}>
          {isEmptyChat && (
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
                    <MessageBubble message={msg} searchHighlight={messageSearchQuery} active={msg.id === activeMsgId} />
                  </div>
                )
              })}
            </div>
          )}

          {/* Streaming bubble — render ONLY for the current session. Other
              sessions keep streaming in the background but their output is not
              shown here, preventing double-output when switching chats. */}
          {chatMode !== 'arena' && isCurrentStreaming && currentSessionId != null && (
            <StreamingBubble sessionId={currentSessionId} isAtBottom={isAtBottom} />
          )}

          {/* Arena results */}
          {arenaError && (
            <div className="border rounded-lg p-3 text-sm" style={{ borderColor: 'var(--error)', color: 'var(--error)', backgroundColor: 'var(--bg-secondary)' }}>⚠ {arenaError}</div>
          )}
          {activeHints.map((h) => (
            <div key={h.flag} className="rounded-lg p-3 border flex items-start gap-2" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)' }}>
              <Lightbulb size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
              <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>{h.text}</span>
              <button onClick={() => dismissHint(h.flag)} className="text-[10px] shrink-0 px-2 py-0.5 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>{t('hint.got_it')}</button>
            </div>
          ))}
          {proposedHabits.map((h) => (
            <div key={h.key} className="rounded-lg p-3 border-2" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)' }}>
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
            <ArenaResultsDeck results={arenaResults} voted={arenaVoted} winnerId={arenaVoteWinnerId} onVote={arenaVote} renderMarkdown={renderMarkdown} prompt={messages.filter(m => m.role === 'user').pop()?.content || ''} sessionId={currentSessionId} />
          )}
          {arenaPending > 0 && arenaResultsSessionId === currentSessionId && (
            <div className="text-[11px] px-1 py-1 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              <span>{t('chat.arena.running', String(arenaPending))}</span>
            </div>
          )}

          {distillProposal && (
            <div
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border text-xs my-2 font-mono"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles size={13} className="shrink-0 text-[var(--accent)]" />
                <span className="truncate">{t('chat.distill.detected', distillProposal.topic)}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={async () => {
                    setIsDistilling(true)
                    try {
                      const res = await window.electronAPI.memory.distillSkill({
                        sessionId: currentSessionId!,
                        clusterIds: distillProposal.clusterIds,
                      })
                      if (res.success) {
                        useStore.getState().triggerToast(t('chat.distill.draft_created', res.draft?.name || 'SKILL.md'), 'success')
                        useStore.getState().dismissDistillProposal(currentSessionId!)
                      } else {
                        useStore.getState().triggerToast(res.error || t('chat.distill.failed'), 'warning')
                      }
                    } catch (err: any) {
                      useStore.getState().triggerToast(err.message || t('chat.distill.failed'), 'warning')
                    } finally {
                      setIsDistilling(false)
                    }
                  }}
                  disabled={isDistilling}
                  className="px-2.5 py-1 rounded-[5px] border text-[11px] font-medium bg-[var(--content-bg)] hover:bg-[var(--border)]/40 transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  {isDistilling ? t('chat.distill.generating') : t('chat.distill.generate')}
                </button>
                <button
                  onClick={() => {
                    if (currentSessionId) useStore.getState().dismissDistillProposal(currentSessionId)
                  }}
                  className="px-2 py-1 rounded-[5px] text-[11px] hover:bg-[var(--border)]/40 transition-colors cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                >
                  {t('chat.distill.ignore')}
                </button>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Floating Scroll-to-Bottom capsule when reading earlier history */}
      {!isAtBottom && !isEmptyChat && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <button
            type="button"
            onClick={() => {
              setIsAtBottom(true)
              scrollToBottom(true)
            }}
            className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-medium shadow-md hover:border-[var(--accent)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors transition-transform cursor-pointer"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            aria-label={t('chat.scroll_to_bottom', '回到最新回复')}
          >
            {isCurrentStreaming && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />}
            <span>{isCurrentStreaming ? t('chat.streaming_bottom', '正在输出 · 回到最新') : t('chat.scroll_to_bottom', '回到最新回复')}</span>
            <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      )}

      <MessageNav messages={messages} activeId={activeMsgId} scrollTo={scrollToMsg} scrollRef={scrollRef} />

      {currentSessionId && (
        <AgentRunTimeline
          sessionId={currentSessionId}
          isOpen={showTimeline}
          onClose={() => setShowTimeline(false)}
        />
      )}
    </div>
  )
}
