import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'
import { Send, Square, Paperclip, X, FileText, Brain, Cpu } from 'lucide-react'
import { t } from '@/utils/i18n'
import { TEXT_EXTS, MAX_ATTACHMENT_BYTES, PASTE_COLLAPSE_LINES, PASTE_COLLAPSE_CHARS } from '@/utils/constants'
import { estimateTextTokens } from '@/utils/tokenEstimate'

type PendingAttachment = { name: string; mime: string; kind: 'text' | 'image'; dataUrl: string }
type Snippet = { id: number; content: string; preview: string }

function classifyFile(file: File): 'text' | 'image' {
  if (file.type.startsWith('image/')) return 'image'
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (TEXT_EXTS.has(ext)) return 'text'
  return 'text'
}

const SLASH_COMMANDS = [
  { id: 'summarize', label: () => t('slash.summarize'), prompt: '请详细总结以上对话的要点，用中文回复。' },
  { id: 'translate', label: () => t('slash.translate'), prompt: '请将以上内容翻译成中文。' },
  { id: 'polish', label: () => t('slash.polish'), prompt: '请润色以上文字，使其更加流畅、专业、简洁。' },
  { id: 'explain', label: () => t('slash.explain'), prompt: '请用简单的语言解释以上内容，让初学者也能理解。' },
  { id: 'continue', label: () => t('slash.continue'), prompt: '请基于以上内容自然地继续写作。' },
  { id: 'code', label: () => t('slash.code'), prompt: '请生成实现以上需求的代码。' },
] as const

export default function ChatInput() {
  const [input, setInput] = useState('')
  const [showSlash, setShowSlash] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [pending, setPending] = useState<PendingAttachment[]>([])
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const sendMessage = useStore((s) => s.sendMessage)
  const enqueueMessage = useStore((s) => s.enqueueMessage)
  const queuedMessages = useStore((s) => s.queuedMessages)
  const removeQueued = useStore((s) => s.removeQueued)
  const stopGeneration = useStore((s) => s.stopGeneration)
  const sending = useStore((s) => s.sending)
  const streamingBySession = useStore((s) => s.streamingBySession)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const createSession = useStore((s) => s.createSession)
  const chatMode = useStore((s) => s.chatMode)
  const arenaModelIds = useStore((s) => s.arenaModelIds)
  const runArena = useStore((s) => s.runArena)
  const effortLevel = useStore((s) => s.effortLevel)
  const setEffortLevel = useStore((s) => s.setEffortLevel)
  const providers = useStore((s) => s.providers)
  const allModels = useStore((s) => s.allModels)
  const saveSessionConfig = useStore((s) => s.saveSessionConfig)

  // Is the current session actively streaming?
  const isStreaming = currentSessionId ? !!streamingBySession[currentSessionId] : false

  // Active model for the current session.
  const cfg = currentSessionId ? useStore.getState().sessionConfigs[currentSessionId] : null
  const activeModelId = cfg?.modelId ?? null

  // Token estimation for the current input.
  const inputTokens = useMemo(() => estimateTextTokens(input), [input])
  const snippetText = useMemo(() => snippets.map(s => s.content).join('\n'), [snippets])
  const snippetTokens = useMemo(() => estimateTextTokens(snippetText), [snippetText])
  const totalInputTokens = inputTokens + snippetTokens

  // Slash-command lookup: memoize to avoid calling t() on every keystroke.
  const slashResults = useMemo(() => {
    if (!showSlash) return []
    const q = slashQuery.toLowerCase()
    if (!q) return SLASH_COMMANDS
    return SLASH_COMMANDS.filter(cmd => cmd.id.includes(q))
  }, [showSlash, slashQuery])

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) setDragOver(true)
  }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only clear if leaving the outermost container
    if (e.currentTarget === e.target) setDragOver(false)
  }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files || [])
    setFileError(null)
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) { setFileError(t('chat.file_too_large', file.name)); continue }
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setPending(prev => [...prev, { name: file.name, mime: file.type || (classifyFile(file) === 'image' ? 'image/png' : 'text/plain'), kind: classifyFile(file), dataUrl }])
      }
      reader.onerror = () => setFileError(t('chat.file_read_failed', file.name))
      reader.readAsDataURL(file)
    }
  }, [])

  const handleSubmit = async () => {
    const content = input.trim()
    if (!content && pending.length === 0 && snippets.length === 0) return
    // If a turn is streaming, queue the message instead of dropping or
    // interrupting — it auto-sends after the current turn finishes.
    if (sending) {
      if (content) { enqueueMessage(content); setInput('') }
      return
    }
    setInput('')

    let sessionId = currentSessionId
    if (!sessionId) {
      await createSession()
      sessionId = useStore.getState().currentSessionId
    }

    const atts = pending
    setPending([])
    // Fold collapsed long-paste snippets into the prompt as fenced blocks.
    const snippetBlocks = snippets.map((s, i) => `\n📎 粘贴片段 ${i + 1}:\n\`\`\`\n${s.content}\n\`\`\``).join('\n')
    setSnippets([])
    const finalContent = snippetBlocks ? (content ? content + '\n' + snippetBlocks : snippetBlocks) : content

    if (chatMode === 'arena') {
      await runArena(finalContent)
    } else if (sessionId) {
      sendMessage(finalContent, atts.length > 0 ? atts : undefined)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setFileError(null)
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) { setFileError(t('chat.file_too_large', file.name)); continue }
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setPending(prev => [...prev, { name: file.name, mime: file.type || (classifyFile(file) === 'image' ? 'image/png' : 'text/plain'), kind: classifyFile(file), dataUrl }])
      }
      reader.onerror = () => setFileError(t('chat.file_read_failed', file.name))
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  // Collapse long pastes into a chip instead of flooding the textarea. Short
  // pastes go straight into the input as normal text. (ChatGPT-style.)
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text')
    if (!text) return
    const lines = text.split('\n').length
    if (lines < PASTE_COLLAPSE_LINES && text.length < PASTE_COLLAPSE_CHARS) return // short → normal insert
    e.preventDefault()
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 40)
    setSnippets(prev => [...prev, { id: Date.now() + Math.random(), content: text, preview: preview + (text.length > 40 ? '…' : '') }])
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)
    const lastLine = val.split('\n').pop() || ''
    if (lastLine === '/') { setShowSlash(true); setSlashQuery('') }
    else if (lastLine.startsWith('/')) { setShowSlash(true); setSlashQuery(lastLine.slice(1)) }
    else setShowSlash(false)
  }

  const handleSlashSelect = (cmd: typeof SLASH_COMMANDS[number]) => {
    const lines = input.split('\n')
    lines[lines.length - 1] = cmd.prompt
    setInput(lines.join('\n'))
    setShowSlash(false)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') setShowSlash(false)
  }

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [input, sending, showSlash, pending.length, snippets.length])

  return (
    <div className="border-t border-[var(--border)] bg-white px-4 py-2.5"
      ref={dropZoneRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}>
      <div className="max-w-3xl mx-auto">
        {dragOver && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 animate-blur-fade pointer-events-none">
            <div className="rounded-2xl border-2 border-dashed border-white/50 bg-white/10 backdrop-blur-md px-8 py-6 text-center">
              <Paperclip size={32} className="text-white/80 mx-auto mb-2" />
              <p className="text-white text-sm font-medium">{t('chat.drag_drop_hint')}</p>
            </div>
          </div>
        )}
        {queuedMessages.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>{t('chat.queue', String(queuedMessages.length))}</span>
            {queuedMessages.map((q) => (
              <span key={q.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                <span className="truncate max-w-[200px]">{q.content}</span>
                <button onClick={() => removeQueued(q.id)} className="hover:bg-[var(--border)] rounded p-0.5"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pending.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                {a.kind === 'image' && <img src={a.dataUrl} alt="" className="w-4 h-4 rounded object-cover" />}
                📎 {a.name}
                <button onClick={() => setPending(prev => prev.filter((_, j) => j !== i))} className="hover:bg-[var(--border)] rounded p-0.5"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
        {fileError && <p className="text-xs mb-2" style={{ color: 'var(--error)' }}>⚠ {fileError}</p>}
        {snippets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {snippets.map((s, i) => (
              <span key={s.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                <FileText size={11} className="text-gray-400" />
                {t('paste.snippet_n', i + 1)} · {s.preview}
                <button onClick={() => setSnippets(prev => prev.filter(x => x.id !== s.id))} className="hover:bg-[var(--border)] rounded p-0.5"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
        <div className={cn('relative flex items-end gap-2 rounded-2xl border px-4 py-2 transition-all', 'input-ring', dragOver && 'border-[var(--accent)] ring-2 ring-[var(--accent)]/20')}
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: dragOver ? 'var(--accent)' : 'var(--border)' }}>
          {showSlash && slashResults.length > 0 && (
            <div className="slash-menu">
              {slashResults.map((cmd) => (
                <div key={cmd.id} className="slash-item" onClick={() => handleSlashSelect(cmd)}>
                  <div className="text-sm font-medium">{cmd.label()}</div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">{cmd.prompt}</div>
                </div>
              ))}
            </div>
          )}
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
          <button onClick={() => fileInputRef.current?.click()} disabled={sending} title={t('chat.upload')} className="shrink-0 p-1.5 rounded-lg hover:bg-[var(--border)] transition-colors disabled:opacity-30">
            <Paperclip size={16} className="text-gray-400" />
          </button>
          <textarea ref={textareaRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown} onPaste={handlePaste}
            placeholder={chatMode === 'arena' ? t('chat.arena.placeholder') : t('chat.placeholder')}
            rows={1} className="flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed py-1 max-h-[200px]"
            disabled={sending} />
          {sending ? (
            <button onClick={stopGeneration} className="shrink-0 p-2.5 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors" title={t('chat.stop')}>
              <Square size={14} />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={(!input.trim() && pending.length === 0 && snippets.length === 0) || (chatMode === 'arena' && arenaModelIds.length < 2)}
              className={cn('shrink-0 p-2.5 rounded-xl bg-black text-white hover:opacity-80 transition-opacity', 'disabled:opacity-30')} title={t('chat.send')}>
              <Send size={14} />
            </button>
          )}
        </div>

        {!sending && (
          <div className="flex items-center gap-2 px-0.5 mt-1.5 flex-wrap">
            <EffortControl level={effortLevel} onChange={setEffortLevel} />
            <ModelSelector providers={providers} allModels={allModels}
              activeModelId={activeModelId}
              onSelect={(mid, pid) => currentSessionId && saveSessionConfig(currentSessionId, { providerId: pid, modelId: mid })} />
            <div className="flex items-center gap-1.5">
              {SLASH_COMMANDS.slice(0, 3).map((cmd) => (
                <button key={cmd.id} onClick={() => {
                  const prompt = cmd.prompt
                  setInput(prev => prev ? prev + '\n---\n' + prompt : prompt)
                  textareaRef.current?.focus()
                }} className="qaction">{cmd.label()}</button>
              ))}
            </div>
            {/* Token counter — shows ~tokens for input + snippets */}
            {totalInputTokens > 0 && (
              <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {t('chat.tokens_estimate', String(totalInputTokens))}
              </span>
            )}
            <span className="text-[10px] text-[var(--text-muted)] ml-auto">{t('empty.hint.slash')}</span>
          </div>
        )}
        {/* Streaming status indicator — shown only while a turn is generating */}
        {isStreaming && <StreamingStatusBar sessionId={currentSessionId} />}
      </div>
    </div>
  )
}

// Thinking-effort control: a slider (Claude-Code-style) with 4 detents
// (off/low/medium/high). Maps to real reasoning params (reasoning_effort for
// OpenAI o-series, thinking.budget_tokens for Claude) injected in chat.handler.
const EFFORT_LEVELS = [
  { value: 'off' as const, labelKey: 'effort.off' },
  { value: 'low' as const, labelKey: 'effort.low' },
  { value: 'medium' as const, labelKey: 'effort.medium' },
  { value: 'high' as const, labelKey: 'effort.high' },
]
function EffortControl({ level, onChange }: { level: 'off' | 'low' | 'medium' | 'high'; onChange: (v: 'off' | 'low' | 'medium' | 'high') => void }) {
  let idx = EFFORT_LEVELS.findIndex(l => l.value === level)
  if (idx < 0) idx = 0 // guard against corrupt/unknown stored values
  // Track fill: 0/33/66/100% for off/low/medium/high.
  const fill = idx <= 0 ? 0 : (idx / (EFFORT_LEVELS.length - 1)) * 100
  return (
    <div className="flex items-center gap-1.5" title={t('effort.tooltip')}>
      <Brain size={13} className="text-gray-400 shrink-0" />
      <input type="range" min={0} max={3} step={1} value={idx}
        onChange={(e) => onChange(EFFORT_LEVELS[parseInt(e.target.value, 10)].value)}
        className="effort-slider w-20" style={{ ['--fill' as string]: `${fill}%` }} />
      <span className="text-[10px] w-6 tabular-nums" style={{ color: 'var(--text-muted)' }}>{t(EFFORT_LEVELS[idx].labelKey)}</span>
    </div>
  )
}

// ── Streaming status bar ──────────────────────────────────────────────────
// Shows a subtle status line ("Thinking…", "Using tools…") while the assistant
// is generating. Listens to the store's statusLinesByMessage for the current
// session's active message.
function StreamingStatusBar({ sessionId }: { sessionId: number | null }) {
  const statusLines = useStore((s) => s.statusLinesByMessage)
  const [status, setStatus] = useState('')
  const latestRef = useRef('')

  useEffect(() => {
    if (!sessionId) return
    // Find the most recent status line for any message in this session.
    let latest = ''
    for (const [, lines] of Object.entries(statusLines)) {
      if (lines.length > 0 && lines[lines.length - 1].length > latest.length) {
        latest = lines[lines.length - 1]
      }
    }
    latestRef.current = latest
    setStatus(latest)
  }, [statusLines, sessionId])

  if (!status) return null
  return (
    <div className="px-0.5 mt-1.5 animate-blur-fade">
      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
        <span>{status}</span>
      </div>
    </div>
  )
}

// Inline model selector — lives under the input bar next to the thinking slider
// (Claude-Code-style). A compact <select> grouped by provider.
function ModelSelector({ providers, allModels, activeModelId, onSelect }: {
  providers: { id: number; name: string }[]
  allModels: { id: number; provider_id: number; model_name: string; display_name?: string | null }[]
  activeModelId: number | null
  onSelect: (modelId: number, providerId: number) => void
}) {
  // Build provider→models groups, memoized — only recomputes when
  // providers or allModels change.
  const groups = useMemo(() => providers.map(p => {
    const ms = allModels.filter(m => m.provider_id === p.id)
    return ms.length ? { providerId: p.id, providerName: p.name, models: ms } : null
  }).filter(Boolean) as { providerId: number; providerName: string; models: typeof allModels }[], [providers, allModels])

  if (groups.length === 0) return null
  return (
    <div className="flex items-center gap-1.5" title={t('chat.model_switch')}>
      <Cpu size={13} className="text-gray-400 shrink-0" />
      <select value={String(activeModelId ?? '')}
        onChange={(e) => {
          const mid = Number(e.target.value)
          const model = allModels.find(m => m.id === mid)
          if (model) onSelect(mid, model.provider_id)
        }}
        className="text-[11px] rounded-lg border px-2 py-1 outline-none max-w-[180px] bg-white"
        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
        <option value="" disabled>{t('chat.select_model')}</option>
        {groups.map(g => (
          <optgroup key={g.providerId} label={g.providerName}>
            {g.models.map(m => (
              <option key={m.id} value={m.id}>{m.display_name || m.model_name}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
