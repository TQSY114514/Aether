import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useStore } from '@/store'
import MessageBubble from './MessageBubble'
import EmptyState from './EmptyState'
import { renderMarkdown } from '@/utils/markdown'
import { t } from '@/utils/i18n'
import { useOverscrollSpring } from '@/utils/useOverscrollSpring'
import MessageNav from './MessageNav'
import { Search, X, Brain, Lightbulb, ChevronUp, ChevronDown } from 'lucide-react'

export default function ChatWindow() {
  const [isAtBottom, setIsAtBottom] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  useOverscrollSpring(scrollRef)
  const messages = useStore((s) => s.messages)
  const streamingContent = useStore((s) => {
    const cur = s.currentSessionId
    return cur ? (s.streamingBySession[cur]?.content ?? '') : ''
  })
  const currentSessionId = useStore((s) => s.currentSessionId)
  const loadMessages = useStore((s) => s.loadMessages)
  const arenaResults = useStore((s) => s.arenaResults)
  const arenaAggregate = useStore((s) => s.arenaAggregate)
  const arenaError = useStore((s) => s.arenaError)
  const proposedHabits = useStore((s) => s.proposedHabits)
  const resolveHabit = useStore((s) => s.resolveHabit)
  const activeHints = useStore((s) => s.activeHints)
  const dismissHint = useStore((s) => s.dismissHint)
  const arenaVote = useStore((s) => s.arenaVote)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeMsgId, setActiveMsgId] = useState<number | null>(null)
  const scrollToMsg = useCallback((id: number) => {
    document.getElementById('msg-' + id)?.scrollIntoView({ behavior: 'smooth' })
  }, [])

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

  useEffect(() => {
    if (currentSessionId) {
      loadMessages(currentSessionId)
      setSearchQuery('')
      setTimeout(scrollToBottom, 50)
    }
  }, [currentSessionId, loadMessages, scrollToBottom])

  useEffect(() => {
    if (isAtBottom) scrollToBottom()
  }, [messages, streamingContent, arenaResults, isAtBottom, scrollToBottom])

  // Search: don't filter — keep the full conversation visible and highlight
  // matches (prev/next jumps to each). matchIds = message ids that contain the
  // query; matchIdx is which one we've scrolled to.
  const matchIds = useMemo(() => {
    if (!searchQuery.trim()) return [] as number[]
    const q = searchQuery.toLowerCase()
    return messages.filter(m => m.content.toLowerCase().includes(q)).map(m => m.id)
  }, [messages, searchQuery])
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
  // When the user types, jump to the first match so the counter is live.
  useEffect(() => { if (matchIds.length > 0) { setMatchIdx(0); scrollToMsg(matchIds[0]) } /* eslint-disable-next-line */ }, [searchQuery])

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ position: "relative" }}>
      {/* Search bar */}
      <div className="px-4 py-1.5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg" style={{ backgroundColor: 'var(--content-secondary, var(--bg-secondary))', border: '1px solid var(--border)' }}>
          <Search size={12} className="text-gray-400 shrink-0" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
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

      <div ref={scrollRef} onScroll={handleScroll} className="scroll-bounce flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto chat-gap">
          {messages.length === 0 && !streamingContent && arenaResults.length === 0 && (
            <EmptyState />
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} searchHighlight={searchQuery} />
          ))}

          {streamingContent && (
            <MessageBubble message={{
              id: -1, session_id: currentSessionId || 0,
              role: 'assistant', content: streamingContent,
              model_used: null, provider_used: null,
              token_count: null, latency_ms: null,
              status: 'success', error_message: null,
              created_at: new Date().toISOString(),
            }} />
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
                        <button onClick={() => arenaVote({ model_id: r.model_id, model_name: r.model_name, content: r.content, provider_name: r.provider_name }, others.map(x => ({ model_id: x.model_id, model_name: x.model_name })))}
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