import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'
import InputReference from '@/components/chat/InputReference'
import { Send, Square, Paperclip, Zap, Leaf, HelpCircle, ListPlus } from 'lucide-react'
import AgentTaskDeck from './AgentTaskDeck'
import QueueDock from './QueueDock'
import { t } from '@/utils/i18n'
import { TEXT_EXTS, MAX_ATTACHMENT_BYTES, PASTE_COLLAPSE_LINES, PASTE_COLLAPSE_CHARS } from '@/utils/constants'
import { estimateTextTokens } from '@/utils/tokenEstimate'
import ContextMeterBadge from './ContextMeterBadge'
import { useShallow } from 'zustand/react/shallow'
import { useFeatureFlag } from '@/utils/featureFlags'

import { DEFAULT_COMMANDS, executeTypedSlashCommand, type SlashCommand, type AgentMode } from './slashCommands'
import ModelSelector from './input/ModelSelector'
import EffortControl from './input/EffortControl'
import AgentModeSelector from './input/AgentModeSelector'
import StreamingStatusBar from './input/StreamingStatusBar'
import SlashCommandMenu from './input/SlashCommandMenu'
import AttachmentBar, { type PendingAttachment, type Snippet, SENSITIVE_FILE_PATTERN } from './input/AttachmentBar'

function classifyFile(file: File): 'text' | 'image' {
  if (file.type.startsWith('image/')) return 'image'
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (TEXT_EXTS.has(ext)) return 'text'
  return 'text'
}

/** Render the chat composer, quick commands, and model controls. */
export default function ChatInput() {
  // Slash commands loaded from IPC (scan CMD.md files). Falls back to defaults.
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>(DEFAULT_COMMANDS)
  // Cursor position in the textarea, tracked for the @/#/! reference popup.
  const [refCursor, setRefCursor] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.electronAPI.commands?.list?.().catch(() => []),
      window.electronAPI.recipe?.list?.().catch(() => []),
    ]).then(([cmds, recipes]: [any, any]) => {
      if (cancelled) return
      const actionCmds = DEFAULT_COMMANDS.filter(c => c.action)
      const baseCmds = (cmds && cmds.length > 0) ? cmds : DEFAULT_COMMANDS.filter(c => !c.action)
      const recipeCmds: SlashCommand[] = (recipes || []).map((r: any) => ({
        id: `recipe:${r.id}`,
        name: `[${t('recipe.title', '配方')}] ${r.title}`,
        description: r.description,
        prompt: r.prompt,
      }))
      const merged = [
        ...actionCmds,
        ...baseCmds.filter((c: any) => !actionCmds.some(a => a.id === c.id)),
        ...recipeCmds,
      ]
      setSlashCommands(merged)
    }).catch(() => {
      setSlashCommands(DEFAULT_COMMANDS)
    })
    return () => { cancelled = true }
  }, [])

  // Load arena scores on mount so model selector shows ratings.
  useEffect(() => {
    const { scores, loadScores } = useStore.getState()
    if (scores.length === 0) loadScores()
  }, [])


  // Per-session draft: each conversation has its own input draft persisted to localStorage.
  const [input, setInput] = useState(() => {
    try {
      const sid = useStore.getState().currentSessionId
      return sid ? (localStorage.getItem(`draft:${sid}`) || '') : ''
    } catch { return '' }
  })
  const prevSessionRef = useRef<number | null>(null)
  const [showSlash, setShowSlash] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const poorMode = useFeatureFlag('agent.poorMode')
  const [slashIndex, setSlashIndex] = useState(0)
  const [pending, setPending] = useState<PendingAttachment[]>([])
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [stoppedHint, setStoppedHint] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // Batch store selectors with shallow comparison to reduce re-render triggers.
  const {
    sendMessage, enqueueMessage, removeQueued, stopGeneration,
    streamingBySession, currentSessionId, createSession,
    chatMode, arenaModelIds, runArena, effortLevel, setEffortLevel,
    thinkingEnabled, setThinkingEnabled,
    providers, allModels, saveSessionConfig, queuedMessages,
    modelSuggestion, agentMode, setAgentMode, sessionConfigs, scores,
    loopingSessions, toggleBtw,
  } = useStore(useShallow((s) => ({
    sendMessage: s.sendMessage, enqueueMessage: s.enqueueMessage,
    removeQueued: s.removeQueued, stopGeneration: s.stopGeneration,
    streamingBySession: s.streamingBySession,
    currentSessionId: s.currentSessionId, createSession: s.createSession,
    chatMode: s.chatMode, arenaModelIds: s.arenaModelIds,
    runArena: s.runArena, effortLevel: s.effortLevel,
    setEffortLevel: s.setEffortLevel, thinkingEnabled: s.thinkingEnabled,
    setThinkingEnabled: s.setThinkingEnabled, providers: s.providers,
    allModels: s.allModels, saveSessionConfig: s.saveSessionConfig,
    queuedMessages: s.queuedMessages,
    modelSuggestion: s.modelSuggestion, agentMode: s.agentMode, setAgentMode: s.setAgentMode,
    sessionConfigs: s.sessionConfigs, scores: s.scores,
    loopingSessions: s.loopingSessions,
    toggleBtw: s.toggleBtw,
  })))

  // ELO score map for model selector display
  const scoreByModel = useMemo(() => {
    const map: Record<number, number> = {}
    for (const sc of scores) { map[sc.model_id] = Math.round(sc.score) }
    return map
  }, [scores])

  const isStreaming = currentSessionId ? !!streamingBySession[currentSessionId] : false
  const isArenaRunning = chatMode === 'arena' && isStreaming
  const isLooping = isStreaming && loopingSessions.has(currentSessionId ?? -1)

  // Rotating placeholder hints when idle
  const [hintIndex, setHintIndex] = useState(0)
  useEffect(() => {
    if (chatMode === 'arena' || isStreaming || isLooping || input.trim()) return
    const timer = setInterval(() => {
      setHintIndex((prev) => (prev + 1) % 3)
    }, 6000)
    return () => clearInterval(timer)
  }, [chatMode, isStreaming, isLooping, input])

  // Listen for stop generation event to show stopped hint even after unmount of StreamingStatusBar
  useEffect(() => {
    const handler = () => setStoppedHint(true)
    window.addEventListener('aether:generation-stopped', handler)
    return () => window.removeEventListener('aether:generation-stopped', handler)
  }, [])

  useEffect(() => {
    if (isStreaming) setStoppedHint(false)
  }, [isStreaming])

  const currentPlaceholder = useMemo(() => {
    if (chatMode === 'arena') return t('chat.arena.placeholder')
    if (isLooping) return t('inject.placeholder')
    if (isStreaming) return t('inject.steer_placeholder')
    if (hintIndex === 1) return t('empty.hint.slash', '输入 / 唤起快捷指令与预设任务…')
    if (hintIndex === 2) return t('empty.hint.at', '输入 @ 关联项目文件、代码符号或知识库…')
    return t('chat.placeholder')
  }, [chatMode, isStreaming, isLooping, hintIndex])

  const activeModelId = useMemo(() => {
    if (currentSessionId) {
      const cfgModelId = sessionConfigs[currentSessionId]?.modelId
      if (cfgModelId) return cfgModelId
    }
    const primary = allModels.find(m => m.is_primary)
    if (primary) return primary.id
    if (allModels.length > 0) return allModels[0].id
    return null
  }, [currentSessionId, sessionConfigs, allModels])

  const isBinaryReasoning = useMemo(() => {
    if (!activeModelId) return false
    const m = allModels.find(x => x.id === activeModelId)
    const name = (m?.model_name || '').toLowerCase()
    return /deepseek[_-](r\d|reasoner)/i.test(name) || /deephermes/i.test(name)
  }, [activeModelId, allModels])

  const sessionIdRef = useRef(currentSessionId)
  useEffect(() => { sessionIdRef.current = currentSessionId }, [currentSessionId])

  useEffect(() => {
    try {
      const sid = sessionIdRef.current
      const key = `draft:${sid ?? 'new'}`
      if (input.trim()) localStorage.setItem(key, input)
      else localStorage.removeItem(key)
    } catch {}
  }, [input])

  useEffect(() => {
    const handler = (e: Event) => {
      const { content } = (e as CustomEvent).detail
      setInput(content)
      textareaRef.current?.focus()
    }
    window.addEventListener('aether:edit-last-user', handler)
    return () => window.removeEventListener('aether:edit-last-user', handler)
  }, [])

  useEffect(() => {
    if (prevSessionRef.current === currentSessionId) return
    prevSessionRef.current = currentSessionId
    try {
      const draft = localStorage.getItem(`draft:${currentSessionId ?? 'new'}`) || ''
      if (draft) {
        setInput(draft)
        useStore.getState().triggerToast(t('chat.draft_restored', '已恢复上次未发送的内容'), 'info')
      } else {
        setInput('')
      }
    } catch { setInput('') }
    useStore.getState().refreshModelSuggestion()
  }, [currentSessionId])

  const inputTokens = useMemo(() => estimateTextTokens(input), [input])
  const snippetText = useMemo(() => snippets.map(s => s.content).join('\n'), [snippets])
  const snippetTokens = useMemo(() => estimateTextTokens(snippetText), [snippetText])
  const totalInputTokens = inputTokens + snippetTokens

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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
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

  const handleSubmit = async (overrides?: { agentMode?: AgentMode }) => {
    const content = input.trim()
    if (!content && pending.length === 0 && snippets.length === 0) return

    if (content.startsWith('/')) {
      const handled = await executeTypedSlashCommand(content, setInput)
      if (handled) return
    }

    setStoppedHint(false)

    if (!overrides || overrides.agentMode !== 'plan') {
      if (isArenaRunning) {
        if (content) { enqueueMessage(content, currentSessionId ?? undefined); setInput('') }
        return
      }
      if (isStreaming) {
        if (content) {
          useStore.getState().injectMessage(content)
          setInput('')
        }
        return
      }
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
    const snippetBlocks = snippets.map((s, i) => `\n📎 ${t('paste.snippet_n', i + 1)}:\n\`\`\`\n${s.content}\n\`\`\``).join('\n')
    setSnippets([])
    const finalContent = snippetBlocks ? (content ? content + '\n' + snippetBlocks : snippetBlocks) : content

    if (chatMode === 'arena') {
      runArena(finalContent)
    } else if (sessionId) {
      sendMessage(finalContent, atts.length > 0 ? atts : undefined, overrides && overrides.agentMode ? { agentMode: overrides.agentMode as AgentMode } : undefined)
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

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text')
    if (!text) return
    const lines = text.split('\n').length
    if (lines < PASTE_COLLAPSE_LINES && text.length < PASTE_COLLAPSE_CHARS) return
    e.preventDefault()
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 40)
    setSnippets(prev => [...prev, { id: Date.now() + Math.random(), content: text, preview: preview + (text.length > 40 ? '…' : '') }])
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    const cursor = e.target.selectionStart ?? val.length
    setInput(val)
    setRefCursor(cursor)
    const lastLine = val.split('\n').pop() || ''
    if (lastLine === '/') { setShowSlash(true); setSlashQuery('') }
    else if (lastLine.startsWith('/')) { setShowSlash(true); setSlashQuery(lastLine.slice(1)) }
    else setShowSlash(false)
  }

  const handleSlashSelect = (cmd: SlashCommand) => {
    if (cmd.requiresArg || (!cmd.action && !cmd.prompt)) {
      const lines = input.split('\n')
      lines[lines.length - 1] = `/${cmd.id} `
      setInput(lines.join('\n'))
      setShowSlash(false)
      textareaRef.current?.focus()
      return
    }
    if (cmd.action) {
      setShowSlash(false)
      cmd.action()
      return
    }
    const lines = input.split('\n')
    lines[lines.length - 1] = cmd.prompt || `/${cmd.id}`
    setInput(lines.join('\n'))
    setShowSlash(false)
    textareaRef.current?.focus()
  }

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

  useEffect(() => {
    const onOpenFile = (e: Event) => {
      const p = (e as CustomEvent<string>).detail
      if (!p) return
      const before = input.slice(0, refCursor)
      const sp = before && !before.endsWith(' ') ? ' ' : ''
      const next = before + sp + '@' + p + ' ' + input.slice(refCursor)
      const pos = (before + sp + '@' + p + ' ').length
      setInput(next)
      setRefCursor(pos)
      requestAnimationFrame(() => {
        const ta = textareaRef.current
        if (ta) {
          ta.focus()
          ta.setSelectionRange(pos, pos)
        }
      })
    }
    window.addEventListener('aether:open-file', onOpenFile)
    return () => window.removeEventListener('aether:open-file', onOpenFile)
  }, [input, refCursor])

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
      if (e.key === 'Tab') {
        e.preventDefault()
        const selected = slashResults[slashIndex] || slashResults[0]
        if (selected) {
          const lines = input.split('\n')
          lines[lines.length - 1] = `/${selected.id} `
          setInput(lines.join('\n'))
          setShowSlash(false)
          textareaRef.current?.focus()
        }
        return
      }
      if (e.key === 'Enter') {
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
      if (key === 'e') {
        e.preventDefault()
        useStore.getState().editLastUserMessage()
        return
      }
      if (key === 'z') {
        e.preventDefault()
        useStore.getState().undoLastEdit()
        return
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      const textarea = textareaRef.current
      if (!textarea) return
      const val = textarea.value
      const pos = textarea.selectionStart
      const before = val.slice(0, pos)
      const after = val.slice(pos)
      const codeBlockMatch = before.match(/```[\s\S]*?$/)
      if (codeBlockMatch) {
        const start = before.lastIndexOf('```')
        const endMatch = after.match(/\n```/)
        const end = endMatch ? pos + endMatch.index! + 4 : val.length
        const codeContent = val.slice(start, end)
        try { navigator.clipboard?.writeText(codeContent) } catch {}
      }
      return
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

  const handleEditQueuedInComposer = (text: string) => {
    if (input.trim() && input.trim() !== text) {
      if (!window.confirm(t('queue.overwrite_draft_confirm', '当前输入框已有草稿，是否替换为队列消息？'))) {
        return false
      }
    }
    setInput(text)
    setTimeout(() => textareaRef.current?.focus(), 50)
    return true
  }

  return (
    <div
      className="border-t border-[var(--border)] bg-[var(--content-bg)]/85 backdrop-blur-md px-4 py-2.5"
      ref={dropZoneRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="max-w-3xl mx-auto">
        {dragOver && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-blur-fade pointer-events-none">
            <div className="rounded-lg border-2 border-dashed border-white/50 bg-white/10 backdrop-blur-md px-8 py-6 text-center">
              <Paperclip size={32} className="text-white/80 mx-auto mb-2" />
              <p className="text-white text-sm font-medium">{t('chat.drag_drop_hint')}</p>
            </div>
          </div>
        )}

        <QueueDock onEditInComposer={handleEditQueuedInComposer} />

        <AttachmentBar
          pending={pending}
          onRemovePending={(idx) => setPending(prev => prev.filter((_, j) => j !== idx))}
          onRemoveSensitive={() => setPending(prev => prev.filter(a => !SENSITIVE_FILE_PATTERN.test(a.name)))}
          snippets={snippets}
          onRemoveSnippet={(idx) => setSnippets(prev => prev.filter((_, j) => j !== idx))}
          fileError={fileError}
        />

        <AgentTaskDeck sessionId={currentSessionId} />

        <div
          className={cn('relative flex items-end gap-2 rounded-lg border px-3.5 py-2 transition-all input-ring', dragOver && 'border-[var(--accent)] ring-1 ring-[var(--accent)]')}
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: dragOver ? 'var(--accent)' : 'var(--border)' }}
        >
          {showSlash && (
            <SlashCommandMenu
              commands={slashResults}
              selectedIndex={slashIndex}
              onSelectIndex={setSlashIndex}
              onSelectCommand={handleSlashSelect}
            />
          )}

          <InputReference value={input} cursorPos={refCursor} visible onSelect={handleReferenceSelect} />
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            title={t('chat.upload')}
            aria-label={t('chat.upload')}
            className="shrink-0 p-1.5 rounded-md hover:bg-[var(--border)] icon-btn-silky disabled:opacity-30 focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          >
            <Paperclip size={15} className="text-[var(--text-muted)]" />
          </button>

          <button
            type="button"
            onClick={toggleBtw}
            title={t('btw.btn_tooltip', '旁支提问 (Alt+B)')}
            aria-label={t('btw.btn_tooltip', '旁支提问 (Alt+B)')}
            className="shrink-0 p-1.5 rounded-md hover:bg-[var(--border)] icon-btn-silky text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          >
            <HelpCircle size={15} />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onSelect={(e) => setRefCursor((e.target as HTMLTextAreaElement).selectionStart)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={currentPlaceholder}
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-xs leading-relaxed py-1 max-h-[200px]"
            disabled={isArenaRunning}
          />

          {isArenaRunning || (isStreaming && !input.trim()) ? (
            <button
              onClick={() => { stopGeneration(); window.dispatchEvent(new CustomEvent('aether:generation-stopped')) }}
              className="shrink-0 p-2 rounded-md bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--border)] transition-all press-scale"
              title={t('chat.stop')}
              aria-label={t('chat.stop')}
            >
              <Square size={13} fill="currentColor" />
            </button>
          ) : isStreaming && input.trim() ? (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (input.trim()) {
                    enqueueMessage(input.trim(), currentSessionId ?? undefined)
                    setInput('')
                  }
                }}
                className="p-1.5 px-2 rounded-md bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--border)] transition-all press-scale text-xs flex items-center gap-1 font-medium focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                title={t('queue.add_tooltip', '加入排队队列')}
                aria-label={t('queue.add_tooltip', '加入排队队列')}
              >
                <ListPlus size={13} />
                <span className="hidden sm:inline">{t('queue.add_button', '排队')}</span>
              </button>
              <button
                type="button"
                onClick={() => handleSubmit()}
                className="p-1.5 px-2 rounded-md bg-[var(--accent)] text-white hover:opacity-90 transition-all press-scale shadow-sm text-xs flex items-center gap-1 font-medium"
                title={t('inject.send_hint', '立即插队到当前回合')}
                aria-label={t('inject.send_hint', '立即插队到当前回合')}
              >
                <Zap size={13} />
                <span className="hidden sm:inline">{t('queue.inject_button', '插队')}</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleSubmit()}
              disabled={(!input.trim() && pending.length === 0 && snippets.length === 0) || (chatMode === 'arena' && arenaModelIds.length < 2)}
              className={cn('shrink-0 p-2 rounded-md bg-[var(--accent)] text-white hover:opacity-90 transition-all press-scale hover-lift', 'disabled:opacity-30')}
              title={t('chat.send')}
              aria-label={t('chat.send')}
            >
              <Send size={13} />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-1.5 px-0.5 mt-2 flex-nowrap min-w-0">
          <div className="flex items-center gap-1.5 flex-nowrap min-w-0 shrink">
            <AgentModeSelector mode={agentMode} onChange={setAgentMode} compact />
            <EffortControl
              thinkingEnabled={thinkingEnabled}
              onToggleThinking={setThinkingEnabled}
              level={effortLevel}
              onLevelChange={setEffortLevel}
              isBinary={isBinaryReasoning}
              compact
            />
            <ModelSelector
              providers={providers}
              allModels={allModels}
              activeModelId={activeModelId}
              modelSuggestion={modelSuggestion}
              scoreByModel={scoreByModel}
              currentPrompt={input}
              onSelect={(mid, pid) => {
                if (currentSessionId) {
                  saveSessionConfig(currentSessionId, { providerId: pid, modelId: mid })
                } else {
                  useStore.getState().setDefaultModel(mid)
                }
              }}
            />
          </div>

          <div className="flex items-center gap-1.5 min-w-0 shrink ml-auto flex-nowrap">
            {isStreaming ? (
              <StreamingStatusBar sessionId={currentSessionId} />
            ) : (
              <>
                {stoppedHint && (
                  <span
                    className="flex items-center gap-1.5 h-6.5 px-2 rounded-[6px] border text-[10px] font-mono shrink-0 select-none shadow-2xs font-medium border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                    title={t('chat.generation_stopped_hint')}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="hidden sm:inline">{t('chat.generation_stopped_hint')}</span>
                  </span>
                )}
                {poorMode && (
                  <span
                    className="flex items-center gap-1.5 h-6.5 px-2 rounded-[6px] border text-[10px] font-mono cursor-help shrink-0 select-none shadow-2xs font-medium border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                    title={t('slash.poor_enabled', '穷鬼省流模式：最大循环限制为 8 轮，激进压缩 Token')}
                  >
                    <Leaf size={11} className="text-emerald-500 shrink-0" />
                    <span className="hidden sm:inline">{t('slash.poor', '省流')}</span>
                  </span>
                )}
                <ContextMeterBadge />
                {totalInputTokens > 0 && (
                  <span className="text-[10px] tabular-nums shrink-0 font-mono hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
                    {t('chat.tokens_estimate', String(totalInputTokens))}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
