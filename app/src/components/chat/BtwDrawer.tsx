// ─────────────────────────────────────────────────────────────────────────────
// app/src/components/chat/BtwDrawer.tsx
//
// Side Questions (BTW / 旁支提问抽屉)
// Zero-side-effect, in-memory read-only querying of the active session context
// without interrupting the agent loop, calling tools, or writing to the DB.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { renderMarkdown } from '@/utils/markdown'
import {
  HelpCircle,
  X,
  Send,
  Square,
  Copy,
  Check,
  Trash2,
  CornerDownLeft,
} from 'lucide-react'

interface BtwTurn {
  id: string
  question: string
  answer: string
  streaming: boolean
  error?: string
  createdAt: number
}

export default function BtwDrawer() {
  const open = useStore((s) => s.btwOpen)
  const setOpen = useStore((s) => s.setBtwOpen)
  const currentSessionId = useStore((s) => s.currentSessionId)

  const [input, setInput] = useState('')
  const [turnsBySession, setTurnsBySession] = useState<Record<number, BtwTurn[]>>({})
  const [streamingBySession, setStreamingBySession] = useState<Record<number, boolean>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const turns = (currentSessionId && turnsBySession[currentSessionId]) || []
  const isStreaming = Boolean(currentSessionId && streamingBySession[currentSessionId])

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const activeTurnIdRef = useRef<string | null>(null)

  // Auto-scroll to bottom of conversation
  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [])

  // Listen to streaming deltas from IPC
  useEffect(() => {
    const unsub = window.electronAPI.chat.onSideChunk((payload) => {
      if (!payload || !payload.sessionId) return
      const targetSid = payload.sessionId

      setTurnsBySession((prev) => {
        const sessionTurns = prev[targetSid] || []
        const activeId = activeTurnIdRef.current
        const updated = sessionTurns.map((turn) => {
          if (turn.id !== activeId && !turn.streaming) return turn
          if (payload.done) {
            return {
              ...turn,
              answer: payload.fullContent ?? (turn.answer + (payload.delta || '')),
              streaming: false,
              error: payload.error,
            }
          }
          return {
            ...turn,
            answer: turn.answer + (payload.delta || ''),
            streaming: true,
          }
        })
        return { ...prev, [targetSid]: updated }
      })

      if (payload.done) {
        setStreamingBySession((prev) => ({ ...prev, [targetSid]: false }))
        if (targetSid === currentSessionId) {
          activeTurnIdRef.current = null
        }
      }
      if (targetSid === currentSessionId) {
        scrollToBottom()
      }
    })

    return () => {
      unsub()
    }
  }, [currentSessionId, scrollToBottom])

  // Focus textarea when opened
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => textareaRef.current?.focus(), 80)
      return () => clearTimeout(timer)
    }
  }, [open])

  // Escape key closes drawer
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, setOpen])

  const handleSend = async () => {
    const q = input.trim()
    if (!q || isStreaming || !currentSessionId) return
    const targetSid = currentSessionId

    const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const newTurn: BtwTurn = {
      id: turnId,
      question: q,
      answer: '',
      streaming: true,
      createdAt: Date.now(),
    }

    setTurnsBySession((prev) => ({
      ...prev,
      [targetSid]: [...(prev[targetSid] || []), newTurn],
    }))
    setInput('')
    setStreamingBySession((prev) => ({ ...prev, [targetSid]: true }))
    activeTurnIdRef.current = turnId
    scrollToBottom()

    try {
      const res = await window.electronAPI.chat.askSide({
        sessionId: targetSid,
        question: q,
      })
      if (!res.ok) {
        setTurnsBySession((prev) => ({
          ...prev,
          [targetSid]: (prev[targetSid] || []).map((t) =>
            t.id === turnId ? { ...t, streaming: false, error: res.error || 'Failed' } : t
          ),
        }))
        setStreamingBySession((prev) => ({ ...prev, [targetSid]: false }))
        if (activeTurnIdRef.current === turnId) {
          activeTurnIdRef.current = null
        }
      }
    } catch (err: any) {
      setTurnsBySession((prev) => ({
        ...prev,
        [targetSid]: (prev[targetSid] || []).map((t) =>
          t.id === turnId ? { ...t, streaming: false, error: err.message || String(err) } : t
        ),
      }))
      setStreamingBySession((prev) => ({ ...prev, [targetSid]: false }))
      if (activeTurnIdRef.current === turnId) {
        activeTurnIdRef.current = null
      }
    }
  }

  const handleStop = async () => {
    if (!currentSessionId) return
    const targetSid = currentSessionId
    try {
      await window.electronAPI.chat.stopSide(targetSid)
    } catch {}
    setStreamingBySession((prev) => ({ ...prev, [targetSid]: false }))
    setTurnsBySession((prev) => ({
      ...prev,
      [targetSid]: (prev[targetSid] || []).map((t) =>
        t.streaming ? { ...t, streaming: false } : t
      ),
    }))
    activeTurnIdRef.current = null
  }

  const handleCopy = (id: string, text: string) => {
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1800)
    })
  }

  const handleClear = () => {
    if (!currentSessionId) return
    if (isStreaming) handleStop()
    setTurnsBySession((prev) => ({ ...prev, [currentSessionId]: [] }))
  }

  if (!open) return null

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-label={t('btw.title', '旁支提问 (BTW)')}
      className="fixed top-0 bottom-0 end-0 w-[440px] max-w-full z-[110] flex flex-col animate-blur-fade shadow-[var(--shadow-modal,var(--shadow-lg))]"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderInlineStart: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="h-12 flex items-center justify-between px-3.5 shrink-0 wco-pr app-drag"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <HelpCircle size={16} style={{ color: 'var(--accent)' }} className="shrink-0" />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tracking-tight truncate text-[var(--text-primary)]">
                {t('btw.title', '旁支提问 (BTW)')}
              </span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider text-[var(--text-muted)] border"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
              >
                {t('btw.badge_in_memory', 'In-Memory')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 app-no-drag">
          {turns.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1.5 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              title={t('btw.clear', '清空提问')}
              aria-label={t('btw.clear', '清空提问')}
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            title={t('common.close', '关闭')}
            aria-label={t('common.close', '关闭')}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Subtitle notice */}
      <div
        className="px-3.5 py-1.5 text-[11px] text-[var(--text-muted)] border-b flex items-center justify-between shrink-0"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <span>{t('btw.subtitle', '只读上下文 · 零副作用 · 不写入会话历史')}</span>
      </div>

      {/* Q&A turns container */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {turns.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[var(--text-muted)]">
            <div
              className="w-10 h-10 rounded-md flex items-center justify-center mb-3 border"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              <HelpCircle size={20} style={{ color: 'var(--accent)' }} />
            </div>
            <p className="text-xs leading-relaxed max-w-[280px]">
              {t(
                'btw.empty',
                '暂无旁支提问。可在此针对当前会话内容进行提问，不会打断 Agent 运行，亦不污染历史记录。'
              )}
            </p>
          </div>
        ) : (
          turns.map((turn) => (
            <div key={turn.id} className="space-y-2 page-fade-in">
              {/* Question */}
              <div className="flex justify-end">
                <div
                  className="rounded-lg px-3 py-2 text-xs max-w-[88%] leading-relaxed border"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {turn.question}
                </div>
              </div>

              {/* Answer */}
              <div
                className="rounded-lg p-3 text-xs leading-relaxed border relative group"
                style={{
                  backgroundColor: 'var(--content-bg)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              >
                {turn.answer ? (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none break-words leading-normal"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(turn.answer) }}
                  />
                ) : turn.streaming ? (
                  <span className="text-[var(--text-muted)] italic text-[11px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-ping inline-block" />
                    {t('btw.sending', '正在思考...')}
                  </span>
                ) : turn.error ? (
                  <span className="text-[var(--error)] text-xs">{turn.error}</span>
                ) : null}

                {/* Footer action bar */}
                {turn.answer && !turn.streaming && (
                  <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)]">
                    <span>
                      {new Date(turn.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(turn.id, turn.answer)}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors"
                      title={t('btw.copy', '复制回答')}
                    >
                      {copiedId === turn.id ? (
                        <>
                          <Check size={11} style={{ color: 'var(--success)' }} />
                          <span style={{ color: 'var(--success)' }}>{t('btw.copied', '已复制')}</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>{t('btw.copy', '复制')}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input Composer */}
      <div
        className="p-3 shrink-0 border-t"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}
      >
        <div
          className="relative flex items-end gap-2 rounded-lg border px-3 py-2 input-ring"
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={t('btw.placeholder', '问一个关于当前上下文的旁支问题 (回车发送)...')}
            rows={2}
            className="flex-1 bg-transparent resize-none outline-none text-xs leading-relaxed max-h-[140px]"
            disabled={!currentSessionId}
          />

          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="shrink-0 p-1.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--border)] transition-all press-scale focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
              title={t('chat.stop', '停止')}
              aria-label={t('chat.stop', '停止')}
            >
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || !currentSessionId}
              className="shrink-0 p-1.5 rounded-md bg-[var(--accent)] text-white hover:opacity-90 transition-all press-scale disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
              title={t('chat.send', '发送')}
              aria-label={t('chat.send', '发送')}
            >
              <CornerDownLeft size={13} />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
