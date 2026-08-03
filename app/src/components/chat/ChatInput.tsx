import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'
import Tooltip from '@/components/Tooltip'
import InputReference from '@/components/chat/InputReference'
import { Send, Square, Paperclip, X, FileText, Brain, Cpu, Wand2, Check, Shield } from 'lucide-react'
import { t } from '@/utils/i18n'
import { TEXT_EXTS, MAX_ATTACHMENT_BYTES, PASTE_COLLAPSE_LINES, PASTE_COLLAPSE_CHARS } from '@/utils/constants'
import { estimateTextTokens } from '@/utils/tokenEstimate'
import { shallow } from 'zustand/shallow'

type PendingAttachment = { name: string; mime: string; kind: 'text' | 'image'; dataUrl: string }
type Snippet = { id: number; content: string; preview: string }
type SlashCommand = { id: string; name: string; description: string; prompt?: string; action?: () => void }
type AgentMode = 'off' | 'plan' | 'ask' | 'auto_confirm' | 'auto' | 'yolo'

function classifyFile(file: File): 'text' | 'image' {
  if (file.type.startsWith('image/')) return 'image'
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (TEXT_EXTS.has(ext)) return 'text'
  return 'text'
}

// Default commands — used when no custom CMD.md files are discovered.
// Commands with `action` execute directly (no prompt insertion).
const DEFAULT_COMMANDS: SlashCommand[] = [
  { id: 'summarize', name: '总结对话', description: '详细总结以上对话的要点', prompt: '请详细总结以上对话的要点，用中文回复。' },
  { id: 'translate', name: '翻译', description: '将以上内容翻译成中文', prompt: '请将以上内容翻译成中文。' },
  { id: 'polish', name: '润色', description: '润色文字，使其更流畅专业', prompt: '请润色以上文字，使其更加流畅、专业、简洁。' },
  { id: 'explain', name: '解释', description: '用简单语言解释内容', prompt: '请用简单的语言解释以上内容，让初学者也能理解。' },
  { id: 'continue', name: '续写', description: '基于内容自然续写', prompt: '请基于以上内容自然地继续写作。' },
  { id: 'code', name: '生成代码', description: '根据需求生成实现代码', prompt: '请生成实现以上需求的代码。' },
  { id: 'clear', name: '清空对话', description: '清空当前对话历史', action: () => { const sid = useStore.getState().currentSessionId; if (sid) useStore.getState().loadMessages(sid) } },
  { id: 'regenerate', name: '重新生成', description: '撤销最后一条回复并重新生成', action: () => { useStore.getState().regenerate() } },
  { id: 'compact', name: '压缩上下文', description: '智能压缩对话历史节省 token', action: () => { const sid = useStore.getState().currentSessionId; if (sid) useStore.getState().loadMessages(sid) } },
]

export default function ChatInput() {
  // Slash commands loaded from IPC (scan CMD.md files). Falls back to defaults.
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>(DEFAULT_COMMANDS)
  // Cursor position in the textarea, tracked for the @/#/! reference popup.
  const [refCursor, setRefCursor] = useState(0)
  useEffect(() => {
    let cancelled = false
    window.electronAPI.commands?.list?.().then((cmds: SlashCommand[]) => {
      if (!cancelled && cmds && cmds.length > 0) setSlashCommands(cmds)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  // Load arena scores on mount so model selector shows ratings.
  useEffect(() => {
    const { scores, loadScores } = useStore.getState()
    if (scores.length === 0) loadScores()
  }, [])
  // Per-session draft: each conversation has its own input draft persisted to
  // localStorage. Switching sessions loads that session's draft; the input no
  // longer leaks across chats. useState initializer reads once on mount.
  const [input, setInput] = useState(() => {
    try {
      const sid = useStore.getState().currentSessionId
      return sid ? (localStorage.getItem(`draft:${sid}`) || '') : ''
    } catch { return '' }
  })
  const prevSessionRef = useRef<number | null>(null)
  const [showSlash, setShowSlash] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const [pending, setPending] = useState<PendingAttachment[]>([])
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // Batch store selectors with shallow comparison to reduce re-render triggers.
  const {
    sendMessage, enqueueMessage, removeQueued, stopGeneration,
    streamingBySession, currentSessionId, createSession,
    chatMode, arenaModelIds, runArena, effortLevel, setEffortLevel,
    providers, allModels, saveSessionConfig, queuedMessages,
    modelSuggestion, agentMode, setAgentMode, sessionConfigs, scores,
    loopingSessions,
  } = useStore((s) => ({
    sendMessage: s.sendMessage, enqueueMessage: s.enqueueMessage,
    removeQueued: s.removeQueued, stopGeneration: s.stopGeneration,
    streamingBySession: s.streamingBySession,
    currentSessionId: s.currentSessionId, createSession: s.createSession,
    chatMode: s.chatMode, arenaModelIds: s.arenaModelIds,
    runArena: s.runArena, effortLevel: s.effortLevel,
    setEffortLevel: s.setEffortLevel, providers: s.providers,
    allModels: s.allModels, saveSessionConfig: s.saveSessionConfig,
    queuedMessages: s.queuedMessages,
    modelSuggestion: s.modelSuggestion, agentMode: s.agentMode, setAgentMode: s.setAgentMode,
    sessionConfigs: s.sessionConfigs, scores: s.scores,
    loopingSessions: s.loopingSessions,
  }), shallow)

  // ELO score map for model selector display
  const scoreByModel = useMemo(() => {
    const map: Record<number, number> = {}
    for (const sc of scores) { map[sc.model_id] = Math.round(sc.score) }
    return map
  }, [scores])

  // Per-session streaming check — NOT a global flag, so one session's stream
  // never blocks another session's input. Arena is also per-session: runArena
  // writes a streaming buffer entry for the session that started the run, so
  // another session's arena stays usable while this one is generating.
  const isStreaming = currentSessionId ? !!streamingBySession[currentSessionId] : false
  const isArenaRunning = chatMode === 'arena' && isStreaming
  // Feature B: true when the current session has an active tool loop (can accept injections).
  const isLooping = isStreaming && loopingSessions.has(currentSessionId ?? -1)

  // Active model for the current session. When switching chats, useMemo re-derives
  // from sessionConfigs. For the blank chat page (no session yet), falls back to
  // the global default model so the selector always shows a pre-selected model name.
  const activeModelId = useMemo(() => {
    if (currentSessionId) {
      const cfgModelId = sessionConfigs[currentSessionId]?.modelId
      if (cfgModelId) return cfgModelId
    }
    // Fall back: find the primary model across all enabled providers.
    const primary = allModels.find(m => m.is_primary)
    if (primary) return primary.id
    if (allModels.length > 0) return allModels[0].id
    return null
  }, [currentSessionId, sessionConfigs, allModels])

  // Keep a ref of the current session id so the save effect below can read the
  // latest id WITHOUT depending on it. This is the key fix: if the save effect
  // depended on currentSessionId, then at the instant of a session switch it
  // would run with the OLD input value but the NEW session id — overwriting
  // the new session's draft with the previous session's text. By depending
  // only on `input`, the save fires on keystrokes (correct) but not on switch.
  const sessionIdRef = useRef(currentSessionId)
  useEffect(() => { sessionIdRef.current = currentSessionId }, [currentSessionId])

  // Save draft to localStorage on every keystroke. Per-session key via ref.
  useEffect(() => {
    try {
      const sid = sessionIdRef.current
      const key = `draft:${sid ?? 'new'}`
      if (input.trim()) localStorage.setItem(key, input)
      else localStorage.removeItem(key)
    } catch {}
  }, [input])

  // Load draft when switching sessions — each conversation has its own draft.
  useEffect(() => {
    if (prevSessionRef.current === currentSessionId) return
    prevSessionRef.current = currentSessionId
    try {
      setInput(localStorage.getItem(`draft:${currentSessionId ?? 'new'}`) || '')
    } catch { setInput('') }
  }, [currentSessionId])

  // Token estimation for the current input.
  const inputTokens = useMemo(() => estimateTextTokens(input), [input])
  const snippetText = useMemo(() => snippets.map(s => s.content).join('\n'), [snippets])
  const snippetTokens = useMemo(() => estimateTextTokens(snippetText), [snippetText])
  const totalInputTokens = inputTokens + snippetTokens

  // Slash-command lookup: memoize to avoid re-filtering on every keystroke.
  const slashResults = useMemo(() => {
    if (!showSlash) return []
    const q = slashQuery.trim().toLowerCase()
    if (!q) return slashCommands
    return slashCommands
      .map((cmd) => {
        const haystack = `${cmd.id} ${cmd.name} ${cmd.description}`.toLowerCase()
        const score = cmd.id.toLowerCase().startsWith(q) ? 0 : cmd.name.toLowerCase().startsWith(q) ? 1 : haystack.includes(q) ? 2 : 3
        return { cmd, score }
      })
      .filter((item) => item.score < 3)
      .sort((a, b) => a.score - b.score || a.cmd.id.localeCompare(b.cmd.id))
      .map((item) => item.cmd)
  }, [showSlash, slashQuery, slashCommands])

  useEffect(() => {
    setSlashIndex(0)
  }, [slashQuery, showSlash])

  useEffect(() => {
    if (slashIndex >= slashResults.length) setSlashIndex(Math.max(0, slashResults.length - 1))
  }, [slashIndex, slashResults.length])

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
    if (isArenaRunning) {
      if (content) { enqueueMessage(content); setInput('') }
      return
    }
    if (isStreaming) {
      const looping = useStore.getState().loopingSessions.has(currentSessionId ?? -1)
      if (looping && content) {
        useStore.getState().injectMessage(content)
        setInput('')
      } else if (content) {
        enqueueMessage(content)
        setInput('')
      }
      return
    }
    setInput('')
    try { localStorage.removeItem(`draft:${currentSessionId ?? 'new'}`) } catch {}

    let sessionId = currentSessionId
    if (!sessionId) {
      sessionId = await createSession()
      if (!sessionId) return
    }

    const atts = pending
    setPending([])
    const snippetBlocks = snippets.map((s, i) => `\n📎 粘贴片段 ${i + 1}:\n\`\`\`\n${s.content}\n\`\`\``).join('\n')
    setSnippets([])
    const finalContent = snippetBlocks ? (content ? content + '\n' + snippetBlocks : snippetBlocks) : content

    if (chatMode === 'arena') {
      runArena(finalContent)
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
    setRefCursor(e.target.selectionStart ?? val.length)
    const lastLine = val.split('\n').pop() || ''
    if (lastLine === '/') { setShowSlash(true); setSlashQuery('') }
    else if (lastLine.startsWith('/')) { setShowSlash(true); setSlashQuery(lastLine.slice(1)) }
    else setShowSlash(false)
  }

  const handleSlashSelect = (cmd: SlashCommand) => {
    // Action commands execute directly without inserting a prompt.
    if (cmd.action) {
      setShowSlash(false)
      cmd.action()
      return
    }
    const lines = input.split('\n')
    lines[lines.length - 1] = cmd.prompt!
    setInput(lines.join('\n'))
    setShowSlash(false)
    textareaRef.current?.focus()
  }

  // Insert an @skill / #tool / !command reference at the cursor, replacing the
  // partially-typed token (Phase 3.4 input-box references).
  const handleReferenceSelect = ({ prefix, replacement }: { prefix: string; query: string; replacement: string }) => {
    const before = input.slice(0, refCursor)
    const match = before.match(/([@#!])[\w\u4e00-\u9fff_-]*$/)
    if (!match) return
    const start = before.length - match[0].length
    const inserted = prefix + replacement
    const next = input.slice(0, start) + inserted + input.slice(refCursor)
    setInput(next)
    const pos = start + inserted.length
    setRefCursor(pos)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      el?.focus()
      el?.setSelectionRange(pos, pos)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const el = textareaRef.current
    if (showSlash && slashResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex((i) => (i + 1) % slashResults.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex((i) => (i - 1 + slashResults.length) % slashResults.length)
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        handleSlashSelect(slashResults[slashIndex] || slashResults[0])
        return
      }
    }
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase()
      if (key === 'u' && el) {
        e.preventDefault()
        const v = el.value
        const pos = el.selectionStart
        const lineStart = v.lastIndexOf('\n', pos - 1) + 1
        el.value = v.slice(0, lineStart) + v.slice(pos)
        el.selectionStart = el.selectionEnd = lineStart
        setInput(el.value)
        return
      }
      if (key === 'k' && el) {
        e.preventDefault()
        const v = el.value
        const pos = el.selectionStart
        const lineEnd = v.indexOf('\n', pos)
        const cutEnd = lineEnd === -1 ? v.length : lineEnd
        const cut = v.slice(pos, cutEnd)
        try { navigator.clipboard?.writeText(cut) } catch {}
        const next = v.slice(0, pos) + v.slice(cutEnd)
        el.value = next
        el.selectionStart = el.selectionEnd = pos
        setInput(next)
        return
      }
      if (key === 'enter') { e.preventDefault(); handleSubmit(); return }
      if (key === 'a') return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') setShowSlash(false)
  }

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [input, isStreaming, showSlash, pending.length, snippets.length])

  return (
    <div className="border-t border-[var(--border)] bg-[var(--content-bg)] px-4 py-2.5"
      ref={dropZoneRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}>
      <div className="max-w-3xl mx-auto">
        {dragOver && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-blur-fade pointer-events-none">
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
              <span key={i} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                {a.kind === 'image' && a.dataUrl
                  ? <img src={a.dataUrl} alt="" className="w-6 h-6 rounded object-cover border" style={{ borderColor: 'var(--border)' }} />
                  : <FileText size={12} className="text-gray-400 shrink-0" />}
                <span className="truncate max-w-[160px]">{a.name}</span>
                <button onClick={() => setPending(prev => prev.filter((_, j) => j !== i))} className="hover:bg-[var(--border)] rounded p-0.5"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
        {fileError && <p className="text-xs mb-2" role="alert" style={{ color: 'var(--error)' }}>⚠ {fileError}</p>}
        {snippets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {snippets.map((s, i) => (
              <span key={s.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                <FileText size={11} className="text-gray-400" />
                {t('paste.snippet_n', i + 1)} · {s.preview}
                <button onClick={() => setSnippets(prev => prev.filter((_, j) => j !== i))} className="hover:bg-[var(--border)] rounded p-0.5"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
        <div className={cn('relative flex items-end gap-2 rounded-2xl border px-4 py-2 transition-all', 'input-ring', dragOver && 'border-[var(--accent)] ring-2 ring-[var(--accent)]/20')}
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: dragOver ? 'var(--accent)' : 'var(--border)' }}>
          {showSlash && slashResults.length > 0 && (
            <div className="slash-menu" role="listbox" aria-label="Slash commands">
              {slashResults.map((cmd, idx) => {
                const active = idx === slashIndex
                return (
                  <div key={cmd.id} role="option" aria-selected={active}
                    className={cn('slash-item', active && 'bg-[var(--bg-secondary)]')}
                    onMouseEnter={() => setSlashIndex(idx)} onClick={() => handleSlashSelect(cmd)}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">{cmd.name}</div>
                      <kbd className="text-[10px] rounded border px-1.5 py-0.5 font-mono" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>/{cmd.id}</kbd>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate">{cmd.description}</div>
                  </div>
                )
              })}
            </div>
          )}
          <InputReference value={input} cursorPos={refCursor} visible onSelect={handleReferenceSelect} />
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
          <button onClick={() => fileInputRef.current?.click()} disabled={isStreaming} title={t('chat.upload')} aria-label={t('chat.upload')} className="shrink-0 p-1.5 rounded-lg hover:bg-[var(--border)] transition-colors disabled:opacity-30">
            <Paperclip size={16} className="text-gray-400" />
          </button>
          <textarea ref={textareaRef} value={input} onChange={handleInputChange} onSelect={(e) => setRefCursor((e.target as HTMLTextAreaElement).selectionStart)} onKeyDown={handleKeyDown} onPaste={handlePaste}
            placeholder={chatMode === 'arena' ? t('chat.arena.placeholder') : isLooping ? t('inject.placeholder') : t('chat.placeholder')}
            rows={1} className="flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed py-1 max-h-[200px]"
            disabled={isArenaRunning || (isStreaming && !isLooping)} />
          {isArenaRunning || isStreaming ? (
            <button onClick={stopGeneration} className="shrink-0 p-2.5 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors" title={t('chat.stop')} aria-label={t('chat.stop')}>
              <Square size={14} />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={(!input.trim() && pending.length === 0 && snippets.length === 0) || (chatMode === 'arena' && arenaModelIds.length < 2)}
              className={cn('shrink-0 p-2.5 rounded-xl bg-[var(--accent)] text-white hover:opacity-90 transition-opacity', 'disabled:opacity-30')} title={t('chat.send')} aria-label={t('chat.send')}>
              <Send size={14} />
            </button>
          )}
        </div>

        {!isStreaming && !isArenaRunning && (
          <div className="flex items-center gap-2 px-0.5 mt-1.5 flex-wrap">
            <AgentModeSelector mode={agentMode} onChange={setAgentMode} />
            <EffortControl level={effortLevel} onChange={setEffortLevel} />
            <ModelSelector providers={providers} allModels={allModels}
              activeModelId={activeModelId}
              modelSuggestion={modelSuggestion}
              scoreByModel={scoreByModel}
              onSelect={(mid, pid) => {
                if (currentSessionId) {
                  saveSessionConfig(currentSessionId, { providerId: pid, modelId: mid })
                } else {
                  // Blank page: set default for new sessions
                  useStore.getState().setDefaultModel(mid)
                }
              }} />
            <div className="flex items-center gap-1.5">
              {slashCommands.slice(0, 3).map((cmd) => (
                <button key={cmd.id} onClick={() => {
                  const prompt = cmd.prompt
                  if (prompt) setInput(prev => prev ? prev + '\n---\n' + prompt : prompt)
                  textareaRef.current?.focus()
                }} className="qaction">{cmd.name}</button>
              ))}
            </div>
            {totalInputTokens > 0 && (
              <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {t('chat.tokens_estimate', String(totalInputTokens))}
              </span>
            )}
            <span className="text-[10px] text-[var(--text-muted)] ml-auto">{t('empty.hint.slash')}</span>
          </div>
        )}
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
  if (idx < 0) idx = 0
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

// Agent mode selector (Claude Code / Cline-style): a compact toggle group in
// the input bar showing the current permission level. Each mode has a distinct
// color so the user always knows how much freedom the agent has.
function AgentModeSelector({ mode, onChange }: { mode: AgentMode; onChange: (v: AgentMode) => void }) {
  // Subscribe to language so t() re-evaluates when the user switches language.
  const language = useStore((s) => s.language)
  const AGENT_MODES: { value: AgentMode; label: string; color: string; tooltip: string }[] = useMemo(() => [
    { value: 'off', label: t('agent.mode.off'), color: 'var(--text-muted)', tooltip: t('agent.mode.off.desc') },
    { value: 'plan', label: t('agent.mode.plan'), color: '#3b82f6', tooltip: t('agent.mode.plan.desc') },
    { value: 'ask', label: t('agent.mode.ask'), color: 'var(--accent)', tooltip: t('agent.mode.ask.desc') },
    { value: 'auto_confirm', label: t('agent.mode.auto_confirm'), color: '#f59e0b', tooltip: t('agent.mode.auto_confirm.desc') },
    { value: 'auto', label: t('agent.mode.auto'), color: '#f97316', tooltip: t('agent.mode.auto.desc') },
    { value: 'yolo', label: t('agent.mode.yolo'), color: 'var(--error)', tooltip: t('agent.mode.yolo.desc') },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [language, t])
  const active = AGENT_MODES.find(m => m.value === mode) || AGENT_MODES[2]
  return (
    <div className="flex items-center gap-0.5">
      <Shield size={13} className="text-gray-400 shrink-0" />
      {AGENT_MODES.map(m => (
        <Tooltip key={m.value} text={m.tooltip}>
          <button onClick={() => onChange(m.value)}
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-md transition-all duration-150"
            style={m.value === active.value
              ? { backgroundColor: m.color + '20', color: m.color, boxShadow: `0 0 0 1px ${m.color}40` }
              : { color: 'var(--text-muted)', opacity: 0.6 }}>
            {m.label}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}

function StreamingStatusBar({ sessionId }: { sessionId: number | null }) {
  const statusLines = useStore((s) => s.statusLinesByMessage)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!sessionId) return
    let latest = ''
    for (const [, lines] of Object.entries(statusLines)) {
      if (lines.length > 0 && lines[lines.length - 1].length > latest.length) {
        latest = lines[lines.length - 1]
      }
    }
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

function ModelSelector({ providers, allModels, activeModelId, onSelect, modelSuggestion, scoreByModel }: {
  providers: { id: number; name: string }[]
  allModels: { id: number; provider_id: number; model_name: string; display_name?: string | null }[]
  activeModelId: number | null
  onSelect: (modelId: number, providerId: number) => void
  modelSuggestion: { suggestedModelId: number | null; reason: string; confidence: number } | null
  scoreByModel: Record<number, number>
}) {
  const groups = useMemo(() => providers.map(p => {
    const ms = allModels.filter(m => m.provider_id === p.id)
    return ms.length ? { providerId: p.id, providerName: p.name, models: ms } : null
  }).filter(Boolean) as { providerId: number; providerName: string; models: typeof allModels }[], [providers, allModels])

  if (groups.length === 0) return null

  const activeModel = allModels.find(m => m.id === activeModelId)
  const isAutoSuggested = modelSuggestion && modelSuggestion.suggestedModelId === activeModelId && activeModelId != null
  const suggestedModel = modelSuggestion && modelSuggestion.suggestedModelId ? allModels.find(m => m.id === modelSuggestion!.suggestedModelId) : null

  return (
    <div className="flex items-center gap-1.5" title={t('chat.model_switch')}>
      <Cpu size={13} className="text-gray-400 shrink-0" />
      <select value={String(activeModelId ?? '')}
        onChange={(e) => {
          const mid = Number(e.target.value)
          const model = allModels.find(m => m.id === mid)
          if (model) onSelect(mid, model.provider_id)
        }}
        className="text-[11px] rounded-lg border px-2 py-1 outline-none max-w-[180px] bg-[var(--content-bg)]"
        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        title={modelSuggestion ? modelSuggestion.reason : t('chat.model_switch')}>
        <option value="" disabled>{t('chat.select_model')}</option>
        {groups.map(g => (
          <optgroup key={g.providerId} label={g.providerName}>
            {g.models.map(m => (
              <option key={m.id} value={m.id}>{m.display_name || m.model_name}{scoreByModel[m.id] ? ` (${scoreByModel[m.id]})` : ''}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {!isAutoSuggested && suggestedModel && (
        <button onClick={() => {
          if (suggestedModel) onSelect(suggestedModel.id, suggestedModel.provider_id)
        }}
          className="shrink-0 rounded-full hover:opacity-80 transition-opacity"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          title={modelSuggestion!.reason} aria-label={modelSuggestion!.reason}>
          <Wand2 size={10} className="px-1 py-0.5" />
        </button>
      )}
      {isAutoSuggested && (
        <span className="shrink-0 rounded-full"
          style={{ backgroundColor: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}
          title={modelSuggestion!.reason}>
          <Check size={10} className="px-0.5 py-0.5" />
        </span>
      )}
    </div>
  )
}
