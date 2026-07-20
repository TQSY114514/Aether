import { useState, memo } from 'react'
import { useStore } from '@/store'
import type { Message } from '@/types'
import { cn } from '@/lib/utils'
import { Copy, Check, RefreshCw, Pencil } from 'lucide-react'
import { renderMarkdown } from '@/utils/markdown'
import { t } from '@/utils/i18n'
import ToolCallBlock from './ToolCallBlock'
import AgentPlanTrace from './AgentPlanTrace'
import TodoList from './TodoList'

function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function MessageBubble({ message, searchHighlight }: { message: Message; searchHighlight?: string }) {
  const [copied, setCopied] = useState(false); const regenerate = useStore(s => s.regenerate)
  const editMessage = useStore(s => s.editMessage)
  const sending = useStore(s => s.sending)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const bubbleWidth = useStore(s => s.bubbleWidth)
  const toolCalls = useStore(s => s.toolCallsByMessage[message.id])
  const planSteps = useStore(s => s.planStepsByMessage[message.id])
  const todos = useStore(s => s.todosByMessage[message.id])
  const statusLines = useStore(s => s.statusLinesByMessage[message.id])
  const isUser = message.role === 'user'
  const isStreaming = message.id < 0
  const isError = message.status === 'error'
  const isFallback = message.status === 'fallback'
  const isAborted = message.status === 'aborted'

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const startEdit = () => { setDraft(message.content); setEditing(true) }
  const submitEdit = async () => {
    const c = draft.trim()
    if (!c || c === message.content) { setEditing(false); return }
    setEditing(false)
    await editMessage(message.id, c)
  }

  // Code-block copy + fold buttons live inside rendered markdown HTML; handle
  // them via event delegation on the bubble root so each needs no React wiring.
  const onBubbleClick = (e: React.MouseEvent) => {
    const fold = (e.target as HTMLElement).closest('.code-fold') as HTMLElement | null
    if (fold) {
      // Toggle collapsed state on the parent <pre>. Swap the chevron glyph and
      // show a "… N lines" placeholder when folded.
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
    navigator.clipboard.writeText(raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
    const prev = target.textContent
    target.textContent = t('chat.copied')
    target.classList.add('copied')
    setTimeout(() => { target.textContent = prev; target.classList.remove('copied') }, 1200)
  }

  // Render message content with optional search highlighting. Handles both
  // user text (plain with <mark>) and assistant markdown (rendered HTML with
  // injected <mark> tags after markdown conversion).
  const renderContent = (text: string) => {
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
      return <>{before}<mark className="px-0.5 rounded" style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>{match}</mark>{after}</>
    }
    const html = renderMarkdown(text)
    const highlighted = html.replace(new RegExp(`(${escapeRegex(searchHighlight)})`, 'gi'),
      '<mark class="search-hl" style="background:var(--accent);color:#fff;border-radius:2px;padding:0 1px">$1</mark>')
    return <div className="mc" dangerouslySetInnerHTML={{ __html: highlighted }} />
  }

  return (
    <div id={`msg-${message.id}`} className={`flex animate-blur-fade ${isUser ? 'justify-end' : 'justify-start'} message-enter group`}>
      <div className={`${isUser ? '' : 'w-full'} ${isError ? 'opacity-80' : ''}`}
        style={{ maxWidth: `${isUser ? Math.min(bubbleWidth, 85) : bubbleWidth}%` }}>
        {!isUser && (
          <div className="flex items-center gap-2 mb-1.5 px-1">
            <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center">
              <span className="text-white text-[10px] font-medium">AI</span>
            </div>
            <span className="text-xs font-medium text-gray-500">
              {isError ? t('chat.error_short') : isAborted ? t('chat.aborted') : 'Assistant'}
            </span>
            {isFallback && message.model_used && (
              <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                {t('chat.fallback_label', message.model_used)}
              </span>
            )}
            {message.arena_model && (
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--accent)', backgroundColor: 'var(--bg-secondary)' }}>
                🏟 {message.arena_model}
              </span>
            )}
          </div>
        )}
        <div onClick={onBubbleClick} className={`rounded-2xl px-4 py-3 text-sm leading-relaxed break-words relative ${
          isUser
            ? 'text-white rounded-br-md group-hover:shadow-md transition-shadow'
            : isError
            ? 'bg-red-50 border border-red-200 text-red-700 rounded-bl-md'
            : 'border rounded-bl-md group-hover:shadow-soft transition-shadow'
        }`} style={isUser
          ? { backgroundColor: 'var(--accent)' }
          : isError ? undefined
          : { backgroundColor: 'var(--content-bg)', borderColor: 'var(--border)' }}>
          {!isUser && todos && todos.length > 0 && (
            <TodoList todos={todos} />
          )}
          {!isUser && statusLines && statusLines.length > 0 && (
            <div className="mb-2 space-y-0.5">
              {statusLines.map((line, i) => (
                <div key={i} className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <span>{line}</span>
                </div>
              ))}
            </div>
          )}
          {!isUser && planSteps && planSteps.length > 0 && (
            <AgentPlanTrace steps={planSteps} />
          )}
          {!isUser && toolCalls && toolCalls.length > 0 && (
            <div className="mb-2">
              {toolCalls.map((tc, i) => <ToolCallBlock key={i} tool={tc} />)}
            </div>
          )}
          {isUser && message.attachment?.kind === 'image' && message.attachment.preview && (
            <img src={message.attachment.preview} alt={message.attachment.name} className="max-w-[200px] max-h-[200px] rounded-lg mb-2 object-cover" />
          )}
          {isUser && editing ? (
            <div className="space-y-2">
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit() } if (e.key === 'Escape') setEditing(false) }}
                rows={3} className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none resize-none bg-white" style={{ borderColor: 'var(--accent)' }} />
              <div className="flex gap-2">
                <button onClick={submitEdit} disabled={sending || !draft.trim()} className="px-3 py-1 text-xs rounded-lg text-white disabled:opacity-40" style={{ backgroundColor: 'var(--accent)' }}>{t('chat.edit.submit')}</button>
                <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>{t('chat.cancel')}</button>
              </div>
            </div>
          ) : renderContent(message.content)}
          {isStreaming && <span className="inline-block w-1.5 h-4 bg-black/30 ml-0.5 cursor-blink" />}
          {isError && message.error_message && (
            <details className="mt-2 text-xs text-red-400">
              <summary className="cursor-pointer">{t('chat.error.detail')}</summary>
              <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{message.error_message}</pre>
            </details>
          )}
        </div>
        <div className={cn('flex items-center gap-1 px-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity', isUser ? 'justify-end' : 'justify-start')}>
          {message.created_at && (
            <span className="text-[10px] mr-1" style={{ color: 'var(--text-muted)' }}>
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={handleCopy} className="p-1 rounded-md hover:bg-[var(--border)] transition-colors" title={t('chat.copy')}>
            {copied ? <Check size={12} style={{ color: 'var(--success)' }} /> : <Copy size={12} style={{ color: 'var(--text-muted)' }} />}
          </button>
          {isUser && !isStreaming && !editing && (
            <button onClick={startEdit} disabled={sending} className="p-1 rounded-md hover:bg-[var(--border)] transition-colors disabled:opacity-30" title={t('chat.edit')}>
              <Pencil size={12} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
          {!isUser && !isStreaming && !isError && (
            <button className="p-1 rounded-md hover:bg-[var(--border)] transition-colors" title={t('chat.regenerate')} onClick={() => regenerate()}>
              <RefreshCw size={12} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
          {!isUser && isError && !isStreaming && (
            <button className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] transition-colors" style={{ backgroundColor: 'var(--error)', color: '#fff' }} title={t('chat.retry')} onClick={() => regenerate()}>
              <RefreshCw size={11} />{t('chat.retry')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Memoize: a committed bubble re-renders only when its own data changes.
// The streaming bubble (id<0) re-renders every token — that's expected and
// handled by the markdown single-slot cache.
export default memo(MessageBubble, (prev, next) =>
  prev.message.content === next.message.content &&
  prev.message.status === next.message.status &&
  prev.searchHighlight === next.searchHighlight
)
