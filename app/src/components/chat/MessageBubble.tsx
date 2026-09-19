import { useState, memo, useMemo, useCallback } from 'react'
import { useStore } from '@/store'
import type { Message } from '@/types'
import { cn } from '@/lib/utils'
import { Copy, Check, RefreshCw, Pencil, Play } from 'lucide-react'
import { renderMarkdown, sanitizeHtml } from '@/utils/markdown'
import { t } from '@/utils/i18n'
import ToolCallBlock from './ToolCallBlock'
import AgentPlanTrace from './AgentPlanTrace'
import TaskCard from './TaskCard'
import ThinkingBlock from './ThinkingBlock'
import AgentTimeline from './AgentTimeline'

function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function MessageBubble({ message, searchHighlight, active }: { message: Message; searchHighlight?: string; active?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const sending = useStore(s => s.sending)
  const bubbleWidth = useStore(s => s.bubbleWidth)
  const toolCalls = useStore(s => s.toolCallsByMessage[message.id])
  const planSteps = useStore(s => s.planStepsByMessage[message.id])
  const todos = useStore(s => s.todosByMessage[message.id])
  const thinkingBlocks = useStore(s => s.thinkingBlocksByMessage[message.id])
  const statusLines = useStore(s => s.statusLinesByMessage[message.id])

  const regenerate = useStore(s => s.regenerate)
  const editMessage = useStore(s => s.editMessage)
  const continueMessage = useStore(s => s.continueMessage)

  const isUser = message.role === 'user'
  // An assistant turn with a live todo checklist renders as a task card.
  const hasTask = !!todos && todos.length > 0
  // A message is "streaming" when it's the last message (assistant, empty content)
  // and the session has an active stream buffer.
  const streamingBySession = useStore(s => s.streamingBySession)
  const isStreaming = !isUser && message.content === '' && streamingBySession[message.session_id]
  const isError = message.status === 'error'
  const isFallback = message.status === 'fallback'
  const isAborted = message.status === 'aborted'

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

  return (
    <div id={`msg-${message.id}`} className={`w-full flex flex-col message-enter group py-2.5 ${active ? 'msg-anchor-flash' : ''}`}>
      {isUser ? (
        <div className="flex flex-col items-end w-full">
          <div
            className="max-w-[85%] rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed break-words relative transition-all"
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
                  className="w-full px-2.5 py-1.5 text-xs rounded-md border outline-none resize-none bg-[var(--content-bg)]"
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
                    disabled={sending || !draft.trim()}
                    className="px-2.5 py-1 text-xs rounded-md text-white disabled:opacity-40 transition-opacity"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    {t('chat.edit.submit')}
                  </button>
                </div>
              </div>
            ) : (
              renderContent(message.content)
            )}
          </div>
          <div className="flex items-center gap-1 px-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {message.created_at && (
              <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={handleCopy}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]/50 icon-btn-silky"
              title={t('chat.copy')}
              aria-label={t('chat.copy')}
            >
              {copied ? <Check size={12} className="animate-scale-pop" style={{ color: 'var(--success)' }} /> : <Copy size={12} />}
            </button>
            {!isStreaming && !editing && (
              <button
                onClick={startEdit}
                disabled={sending}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]/50 icon-btn-silky disabled:opacity-30"
                title={t('chat.edit')}
                aria-label={t('chat.edit')}
              >
                <Pencil size={12} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="w-full">
          {/* Assistant Header */}
          <div className="flex items-center gap-2 mb-1.5 px-0.5">
            <div
              className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 border"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              <span className="text-[10px] font-mono font-medium" style={{ color: 'var(--text-secondary)' }}>AI</span>
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {isError ? t('chat.error_short') : isAborted ? t('chat.aborted') : 'Assistant'}
            </span>
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
            {message.created_at && (
              <span className="text-[10px] ml-auto tabular-nums opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-muted)' }}>
                {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          <div
            onClick={onBubbleClick}
            className={`w-full text-xs leading-relaxed break-words relative transition-all ${
              isError ? 'p-3 rounded-lg bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400' : ''
            }`}
          >
            {(thinkingBlocks || (toolCalls && toolCalls.length > 0) || (planSteps && planSteps.length > 0)) && (
              <AgentTimeline
                thinkingText={thinkingBlocks || undefined}
                toolCalls={toolCalls && toolCalls.length > 0 ? toolCalls : undefined}
                planSteps={planSteps || undefined}
              />
            )}
            {message.attachment && message.attachment.kind === 'image' && (
              <div className="mb-2 rounded-md overflow-hidden border max-w-sm" style={{ borderColor: 'var(--border)' }}>
                <img
                  src={message.attachment.preview || message.attachment.mime}
                  alt={message.attachment.name}
                  className="max-w-full max-h-[300px] object-contain bg-black/5"
                />
              </div>
            )}
            {renderContent(message.content)}
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

          <div className="flex items-center gap-1 px-0.5 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <button
              onClick={handleCopy}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]/50 icon-btn-silky"
              title={t('chat.copy')}
              aria-label={t('chat.copy')}
            >
              {copied ? <Check size={12} className="animate-scale-pop" style={{ color: 'var(--success)' }} /> : <Copy size={12} />}
            </button>
            {!isStreaming && !isError && (
              <button
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]/50 icon-btn-silky"
                title={t('chat.regenerate')}
                aria-label={t('chat.regenerate')}
                onClick={() => regenerate()}
              >
                <RefreshCw size={12} />
              </button>
            )}
            {isAborted && !isStreaming && (
              <button
                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] transition-all press-scale hover:opacity-90"
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
            {isError && !isStreaming && (
              <button
                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] transition-all press-scale hover:opacity-90 shadow-sm"
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
      )}
    </div>
  )
}

export default memo(MessageBubble)
