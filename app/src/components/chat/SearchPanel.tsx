import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, Loader2, MessageSquare, CornerDownLeft } from 'lucide-react'
import { t } from '@/utils/i18n'
import { cjkBigram } from '@/utils/cjkBigram'

interface SearchResult {
  id: number
  session_id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
  model_used?: string | null
  session_title?: string
  terms?: string[]
}

interface SearchPanelProps {
  open: boolean
  onClose: () => void
  /** Active session id — used to scope a "current session" search. */
  currentSessionId?: number | null
  /** Called when the user picks a result; the parent jumps to that message. */
  onJumpToMessage?: (messageId: number, sessionId: number) => void
}

// The `search:messages` IPC is not yet declared in env.d.ts / preload.js (the
// main flow wires it up separately), so reach it through a typed cast instead
// of touching the global electronAPI declaration.
type SearchMessagesFn = (query: string, sessionId?: number | null) => Promise<SearchResult[]>
interface ElectronSearchAPI { search?: { messages?: SearchMessagesFn } }
function getSearchFn(): SearchMessagesFn | undefined {
  const api = (window as unknown as { electronAPI?: ElectronSearchAPI }).electronAPI
  return api?.search?.messages
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Wrap every occurrence of any term in `text` with a <mark>. */
function highlight(text: string, terms: string[]): React.ReactNode {
  if (!text) return text
  const list = terms.filter(Boolean).map(escapeRegex)
  if (!list.length) return text
  const re = new RegExp(list.join('|'), 'gi')
  const nodes: React.ReactNode[] = []
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    nodes.push(
      <mark key={key++} className="rounded px-0.5" style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
        {m[0]}
      </mark>
    )
    last = m.index + m[0].length
    if (m[0].length === 0) re.lastIndex++ // guard against zero-width matches
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/** Produce a short preview centred on the first match. */
function makeSnippet(content: string, terms: string[], maxLen = 160): string {
  if (!content) return ''
  if (content.length <= maxLen) return content
  const list = terms.filter(Boolean).map(escapeRegex)
  if (list.length) {
    const re = new RegExp(list.join('|'), 'i')
    const m = re.exec(content)
    if (m) {
      const start = Math.max(0, m.index - 60)
      const end = Math.min(content.length, start + maxLen)
      return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '')
    }
  }
  return content.slice(0, maxLen) + '…'
}

const ROLE_LABEL: Record<string, string> = {
  user: 'You',
  assistant: 'AI',
  system: 'System',
}

export default function SearchPanel({ open, onClose, currentSessionId, onJumpToMessage }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'current' | 'all'>(currentSessionId ? 'current' : 'all')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState(0)
  const [shown, setShown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const listRef = useRef<HTMLDivElement>(null)

  const searchFn = useMemo(() => getSearchFn(), [])

  // Highlight terms: the user's raw query tokens + their CJK bigrams.
  const highlightTerms = useMemo(() => {
    const fromQuery = query.trim().split(/\s+/).filter(Boolean)
    const fromBigram = cjkBigram(query).split(/\s+/).filter(Boolean)
    return Array.from(new Set([...fromQuery, ...fromBigram]))
  }, [query])

  // Slide-in transition: flip to visible on the frame after mount.
  useEffect(() => {
    if (open) {
      setShown(false)
      const raf = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(raf)
    }
  }, [open])

  // Focus the input whenever the panel opens.
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 60)
      return () => clearTimeout(id)
    }
  }, [open])

  // Reset transient state on close.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setLoading(false)
      setError(null)
      setSelected(0)
    }
  }, [open])

  // Debounced search — fires 250ms after the user stops typing.
  useEffect(() => {
    if (!open) return
    clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }
    if (!searchFn) {
      setError('search_unavailable') // IPC not wired yet
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const sid = scope === 'current' ? currentSessionId ?? null : null
        const rows = await searchFn(trimmed, sid)
        setResults(rows || [])
        setError(null)
        setSelected(0)
      } catch (e) {
        setError((e as Error)?.message || 'search_error')
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(debounceRef.current)
  }, [query, scope, open, currentSessionId, searchFn])

  // Keep the selected index in range as results change.
  useEffect(() => {
    if (selected > results.length - 1) setSelected(Math.max(0, results.length - 1))
  }, [results.length, selected])

  // Scroll the active result into view during keyboard navigation.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selected}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const pick = (r: SearchResult) => {
    onJumpToMessage?.(r.id, r.session_id)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (results.length) setSelected((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (results.length) setSelected((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = results[selected]
      if (r) pick(r)
    }
  }

  if (!open) return null

  const hasQuery = query.trim().length > 0
  const ipcReady = !!searchFn

  return (
    <div
      className="absolute top-0 left-0 right-0 z-30"
      style={{
        transform: shown ? 'translateY(0)' : 'translateY(-10px)',
        opacity: shown ? 1 : 0,
        transition: 'transform 160ms ease-out, opacity 160ms ease-out',
      }}
    >
      <div
        className="mx-3 mt-2 rounded-xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--content-bg, var(--bg-primary))',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-card)',
          maxHeight: '60vh',
        }}
      >
        {/* Input row */}
        <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <Search size={14} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('chat.search_placeholder')}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
          {loading && <Loader2 size={14} className="animate-spin shrink-0" style={{ color: 'var(--text-muted)' }} />}
          {currentSessionId && (
            <button
              onClick={() => setScope((s) => (s === 'current' ? 'all' : 'current'))}
              className="text-[10px] px-1.5 py-0.5 rounded shrink-0 transition-colors"
              style={{
                border: '1px solid var(--border)',
                color: scope === 'current' ? '#fff' : 'var(--text-secondary)',
                backgroundColor: scope === 'current' ? 'var(--accent)' : 'transparent',
              }}
              title={scope === 'current' ? '搜索当前会话' : '搜索全部会话'}
            >
              {scope === 'current' ? '本会话' : '全部'}
            </button>
          )}
          <button onClick={onClose} className="p-0.5 rounded shrink-0 hover:bg-[var(--border)]" title="关闭">
            <X size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto flex-1 min-h-0">
          {!ipcReady ? (
            <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              搜索接口尚未就绪（IPC 待补全）
            </div>
          ) : !hasQuery ? (
            <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              输入关键词以搜索消息（支持中文分词）
            </div>
          ) : !loading && results.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              {error ? t('chat.search_no_match') : t('chat.search_no_match')}
            </div>
          ) : (
            <ul className="py-1">
              {results.map((r, i) => (
                <li key={`${r.session_id}-${r.id}`}>
                  <button
                    data-idx={i}
                    onClick={() => pick(r)}
                    onMouseEnter={() => setSelected(i)}
                    className="w-full text-left px-3 py-2 transition-colors"
                    style={{
                      backgroundColor: i === selected ? 'var(--content-secondary, var(--bg-secondary))' : 'transparent',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                        style={{
                          color: r.role === 'user' ? 'var(--accent)' : r.role === 'assistant' ? 'var(--success)' : 'var(--text-muted)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {ROLE_LABEL[r.role] || r.role}
                      </span>
                      {r.session_title != null && (
                        <span className="flex items-center gap-1 text-[10px] truncate min-w-0" style={{ color: 'var(--text-secondary)' }}>
                          <MessageSquare size={10} className="shrink-0" />
                          <span className="truncate">{r.session_title || `#${r.session_id}`}</span>
                        </span>
                      )}
                      <span className="ml-auto text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {r.model_used || ''}
                      </span>
                    </div>
                    <div className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                      {highlight(makeSnippet(r.content, highlightTerms), highlightTerms)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        <div
          className="flex items-center gap-3 px-3 py-1.5 shrink-0 text-[10px]"
          style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          <span className="flex items-center gap-1">
            <CornerDownLeft size={10} /> 跳转
          </span>
          <span>↑↓ 选择</span>
          <span>Esc 关闭</span>
          {results.length > 0 && <span className="ml-auto">{results.length} 条结果</span>}
        </div>
      </div>
    </div>
  )
}
