import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useStore } from '@/store'
import MessageBubble from './MessageBubble'
import EmptyState from './EmptyState'
import { renderMarkdown } from '@/utils/markdown'
import { t } from '@/utils/i18n'
import { useOverscrollSpring } from '@/utils/useOverscrollSpring'
import MessageNav from './MessageNav'
import { Search, X } from 'lucide-react'

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
  const arenaError = useStore((s) => s.arenaError)
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

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages
    const q = searchQuery.toLowerCase()
    return messages.filter(m => m.content.toLowerCase().includes(q))
  }, [messages, searchQuery])

  const matchCount = searchQuery.trim()
    ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase())).length
    : 0

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
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{matchCount} {t('chat.search_count_unit')}</span>
              <button onClick={() => setSearchQuery('')} className="p-0.5 rounded hover:bg-[var(--border)]">
                <X size={12} className="text-gray-400" />
              </button>
            </>
          )}
        </div>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="scroll-bounce flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto chat-gap">
          {filteredMessages.length === 0 && !streamingContent && arenaResults.length === 0 && (
            searchQuery ? (
              <div className="text-center py-20">
                <p className="text-sm shimmer-text">{searchQuery ? t('chat.search_no_match') : t('chat.empty.start')}</p>
              </div>
            ) : (
              <EmptyState />
            )
          )}

          {filteredMessages.map((msg) => (
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
          {arenaResults.length > 0 && (
            <div className="space-y-3">
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