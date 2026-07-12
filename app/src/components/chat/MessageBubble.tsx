import { useState } from 'react'
import { useStore } from '@/store'
import type { Message } from '@/types'
import { cn } from '@/lib/utils'
import { Copy, Check, RefreshCw } from 'lucide-react'
import { renderMarkdown } from '@/utils/markdown'
import { t } from '@/utils/i18n'
import ToolCallBlock from './ToolCallBlock'
import AgentPlanTrace from './AgentPlanTrace'

export default function MessageBubble({ message, searchHighlight }: { message: Message; searchHighlight?: string }) {
  const [copied, setCopied] = useState(false); const regenerate = useStore(s => s.regenerate)
  const bubbleWidth = useStore(s => s.bubbleWidth)
  const toolCalls = useStore(s => s.toolCallsByMessage[message.id])
  const planSteps = useStore(s => s.planStepsByMessage[message.id])
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

  // Code-block copy buttons live inside rendered markdown HTML; handle them via
  // event delegation on the bubble root so each button needs no React wiring.
  const onBubbleClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest('.code-copy') as HTMLElement | null
    if (!target) return
    const raw = target.getAttribute('data-code') || ''
    navigator.clipboard.writeText(raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
    const prev = target.textContent
    target.textContent = t('chat.copied')
    target.classList.add('copied')
    setTimeout(() => { target.textContent = prev; target.classList.remove('copied') }, 1200)
  }

  // Highlight search matches
  const renderContent = (text: string) => {
    if (!searchHighlight || !text.toLowerCase().includes(searchHighlight.toLowerCase())) {
      return isUser ? text : <div className="mc" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
    }
    const q = searchHighlight.toLowerCase()
    const idx = text.toLowerCase().indexOf(q)
    if (idx === -1) return text
    const before = text.slice(0, idx)
    const match = text.slice(idx, idx + q.length)
    const after = text.slice(idx + q.length)
    if (isUser) {
      return <>{before}<mark className="px-0.5 rounded" style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>{match}</mark>{after}</>
    }
    return <div className="mc" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
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
          {isUser ? renderContent(message.content) : <div className="mc" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />}
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
          {!isUser && !isStreaming && !isError && (
            <button className="p-1 rounded-md hover:bg-[var(--border)] transition-colors" title={t('chat.regenerate')} onClick={() => regenerate()}>
              <RefreshCw size={12} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
