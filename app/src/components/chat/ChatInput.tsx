import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'
import InputReference from '@/components/chat/InputReference'
import { Send, Square, Paperclip, Zap, Leaf, MessageSquareDashed, ListPlus, Folder, FolderOpen, ExternalLink } from 'lucide-react'
import AgentTaskDeck from './AgentTaskDeck'
import QueueDock from './QueueDock'
import QuestionDialog from './QuestionDialog'
import { t } from '@/utils/i18n'
import { showConfirm } from '@/components/ui/feedback'
import { TEXT_EXTS, MAX_ATTACHMENT_BYTES, PASTE_COLLAPSE_LINES, PASTE_COLLAPSE_CHARS } from '@/utils/constants'
import { estimateTextTokens } from '@/utils/tokenEstimate'
import SessionUsageRollbackBadge from './input/SessionUsageRollbackBadge'
import { useShallow } from 'zustand/react/shallow'
import { useFeatureFlag } from '@/utils/featureFlags'

import { DEFAULT_COMMANDS, executeTypedSlashCommand, type SlashCommand, type AgentMode } from './slashCommands'
import { composePromptWithSnippets } from '@/utils/exportMarkdown'
import type { QueuedMessageItem } from '@/store/types'
import ModelSelector from './input/ModelSelector'
import PersonaSelector from './input/PersonaSelector'
import EffortControl from './input/EffortControl'
import AgentModeSelector from './input/AgentModeSelector'
import StreamingStatusBar from './input/StreamingStatusBar'
import SlashCommandMenu from './input/SlashCommandMenu'
import GhostTextMirror from './input/GhostTextMirror'
import { useComposerGhost } from './input/useComposerGhost'
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
  const nextPromptEnabled = useFeatureFlag('composer.nextPromptPrediction', false)
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
    isStreaming, currentSessionId, createSession,
    chatMode, arenaModelIds, runArena, effortLevel, setEffortLevel,
    thinkingEnabled, setThinkingEnabled,
    providers, allModels, saveSessionConfig, queuedMessages,
    modelSuggestion, agentMode, setAgentMode, sessionConfigs, scores,
    loopingSessions, btwOpen, toggleBtw, sessions, setSessionCwd,
    personas, workspaceSoul, defaultPersonaId, messages,
  } = useStore(useShallow((s) => ({
    sendMessage: s.sendMessage, enqueueMessage: s.enqueueMessage,
    removeQueued: s.removeQueued, stopGeneration: s.stopGeneration,
    isStreaming: Boolean(s.currentSessionId && s.streamingBySession[s.currentSessionId]),
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
    btwOpen: s.btwOpen,
    toggleBtw: s.toggleBtw,
    sessions: s.sessions,
    setSessionCwd: s.setSessionCwd,
    personas: s.personas,
    workspaceSoul: s.workspaceSoul,
    defaultPersonaId: s.defaultPersonaId,
    messages: s.messages,
  })))

  // ELO score map for model selector display
  const scoreByModel = useMemo(() => {
    const map: Record<number, number> = {}
    for (const sc of scores) { map[sc.model_id] = Math.round(sc.score) }
    return map
  }, [scores])

  const isArenaRunning = chatMode === 'arena' && isStreaming
  const isLooping = isStreaming && loopingSessions.has(currentSessionId ?? -1)
  const currentSession = useMemo(() => sessions.find((s) => s.id === currentSessionId), [sessions, currentSessionId])
  const activeCwd = currentSession?.cwd || (currentSessionId ? sessionConfigs[currentSessionId]?.workspace : null) || ''

  const handlePickCwd = useCallback(async () => {
    try {
      const picked = await window.electronAPI?.system?.pickDirectory?.()
      if (picked && currentSessionId) {
        await setSessionCwd(picked)
      }
    } catch {}
  }, [currentSessionId, setSessionCwd])

  const handleOpenCwd = useCallback(() => {
    if (activeCwd) {
      window.electronAPI?.system?.openPath?.(activeCwd)
    }
  }, [activeCwd])

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

  const currentPersonaId = currentSessionId
    ? (sessionConfigs[currentSessionId]?.personaId ?? null)
    : defaultPersonaId

  const isBinaryReasoning = useMemo(() => {
    if (!activeModelId) return false
    const m = allModels.find(x => x.id === activeModelId)
    const name = (m?.model_name || '').toLowerCase()
    return /deepseek[_-](r\d|reasoner)/i.test(name) || /deephermes/i.test(name)
  }, [activeModelId, allModels])

  const sessionIdRef = useRef(currentSessionId)
  useEffect(() => { sessionIdRef.current = currentSessionId }, [currentSessionId])
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingDraftRef = useRef<{ key: string; value: string } | null>(null)

  const flushPendingDraft = useCallback(() => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
    const pendingDraft = pendingDraftRef.current
    if (!pendingDraft) return
    pendingDraftRef.current = null
    try {
      if (pendingDraft.value.trim()) localStorage.setItem(pendingDraft.key, pendingDraft.value)
      else localStorage.removeItem(pendingDraft.key)
    } catch {}
  }, [])

  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    const sid = sessionIdRef.current
    const key = `draft:${sid ?? 'new'}`
    pendingDraftRef.current = { key, value: input }
    draftTimerRef.current = setTimeout(() => {
      flushPendingDraft()
    }, 250)
    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current)
        draftTimerRef.current = null
      }
    }
  }, [input, flushPendingDraft])

  useEffect(() => () => flushPendingDraft(), [flushPendingDraft])

  useEffect(() => {
    const onEditLast = (e: Event) => {
      const { content } = (e as CustomEvent).detail
      setInput(content)
      textareaRef.current?.focus()
    }
    const onQuoteMessage = (e: Event) => {
      const { content: quoted } = (e as CustomEvent<{ content?: string }>).detail || {}
      if (!quoted) return
      const quoteBlock = quoted
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join('\n')
      setInput((prev) => {
        const trimmedPrev = prev.trimStart()
        return trimmedPrev ? `${quoteBlock}\n\n${trimmedPrev}` : `${quoteBlock}\n\n`
      })
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (el) {
          el.focus()
          const len = el.value.length
          el.setSelectionRange(len, len)
        }
      })
    }
    window.addEventListener('aether:edit-last-user', onEditLast)
    window.addEventListener('aether:quote-message', onQuoteMessage)
    return () => {
      window.removeEventListener('aether:edit-last-user', onEditLast)
      window.removeEventListener('aether:quote-message', onQuoteMessage)
    }
  }, [])

  useEffect(() => {
    if (prevSessionRef.current === currentSessionId) return
    flushPendingDraft()
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

  const {
    slashIndex, setSlashIndex, slashResults,
    argIndex, setArgIndex, slashArgCandidates,
    isComposing, setIsComposing,
    ghostDismissed,
    setActiveRefSuggestion, textareaScrollTop, setTextareaScrollTop,
    ghostSuffix, applyComposerText, syncCaret,
    handleSlashSelect, handleSelectSlashArg,
    handleCompletionKeyDown,
  } = useComposerGhost({
    input,
    setInput,
    setRefCursor,
    showSlash,
    setShowSlash,
    slashQuery,
    setSlashQuery,
    slashCommands,
    messages,
    textareaRef,
    currentSessionId,
    activeModelId,
    isStreaming,
    isArenaRunning,
    nextPromptEnabled,
  })

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
        if (content || pending.length > 0 || snippets.length > 0) {
          enqueueMessage(content, currentSessionId ?? undefined, { attachments: pending, snippets })
          setInput('')
          setPending([])
          setSnippets([])
        }
        return
      }
      if (isStreaming) {
        if (pending.length > 0 || snippets.length > 0) {
          enqueueMessage(content, currentSessionId ?? undefined, { attachments: pending, snippets })
          setInput('')
          setPending([])
          setSnippets([])
        } else if (content) {
          useStore.getState().injectMessage(content)
          setInput('')
        }
        return
      }
    }
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
    pendingDraftRef.current = null
    setInput('')
    try { localStorage.removeItem(`draft:${currentSessionId ?? 'new'}`) } catch {}

    let sessionId = currentSessionId
    if (!sessionId) {
      sessionId = await createSession()
      if (!sessionId) return
    }

    const atts = pending
    setPending([])
    const finalContent = composePromptWithSnippets(content, snippets, (n) => t('paste.snippet_n', n))
    setSnippets([])

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
    const items = Array.from(e.clipboardData.items || [])
    const files = Array.from(e.clipboardData.files || [])
    const imageFiles: File[] = []
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile()
        if (f) imageFiles.push(f)
      }
    }
    if (imageFiles.length === 0) {
      for (const file of files) {
        if (file.type.startsWith('image/')) imageFiles.push(file)
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault()
      setFileError(null)
      for (const file of imageFiles) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setFileError(t('chat.file_too_large', file.name || 'image'))
          continue
        }
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          setPending(prev => [
            ...prev,
            {
              name: file.name || 'pasted-image.png',
              mime: file.type || 'image/png',
              kind: 'image',
              dataUrl,
            },
          ])
        }
        reader.onerror = () => setFileError(t('chat.file_read_failed', file.name || 'image'))
        reader.readAsDataURL(file)
      }
      return
    }

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
    const pos = e.target.selectionStart ?? val.length
    applyComposerText(val, pos)
  }

  const handleReferenceSelect = ({ prefix, replacement }: { prefix: string; query: string; replacement: string }) => {
    const before = input.slice(0, refCursor)
    const match = before.match(/([@#!])[^\s]*$/)
    if (!match) return
    const start = before.length - match[0].length
    const inserted = prefix + replacement
    const next = input.slice(0, start) + inserted + input.slice(refCursor)
    applyComposerText(next, start + inserted.length)
  }

  useEffect(() => {
    const onOpenFile = (e: Event) => {
      const p = (e as CustomEvent<string>).detail
      if (!p) return
      const before = input.slice(0, refCursor)
      const sp = before && !before.endsWith(' ') ? ' ' : ''
      const next = before + sp + '@' + p + ' ' + input.slice(refCursor)
      applyComposerText(next, (before + sp + '@' + p + ' ').length)
    }
    window.addEventListener('aether:open-file', onOpenFile)
    return () => window.removeEventListener('aether:open-file', onOpenFile)
  }, [input, refCursor, applyComposerText])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent?.isComposing || e.keyCode === 229 || isComposing) return
    const el = textareaRef.current
    if (handleCompletionKeyDown(e)) return
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
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
      if (key === 'enter') { e.preventDefault(); handleSubmit(); return }
      if (key === 'a' || key === 'k' || key === 'z') return
      if (key === 'e') {
        e.preventDefault()
        useStore.getState().editLastUserMessage()
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
    const rafId = requestAnimationFrame(() => {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    })
    return () => cancelAnimationFrame(rafId)
  }, [input])

  const handleEditQueuedInComposer = async (item: QueuedMessageItem) => {
    if ((input.trim() && input.trim() !== item.content) || pending.length > 0 || snippets.length > 0) {
      const ok = await showConfirm({
        title: t('queue.overwrite_draft_title', '替换当前草稿？'),
        description: t('queue.overwrite_draft_confirm', '当前输入框已有草稿，是否替换为队列消息？'),
        confirmText: t('common.confirm', '确定'),
      })
      if (!ok) return false
    }
    setInput(item.content)
    setPending(item.attachments ? [...item.attachments] : [])
    setSnippets(item.snippets ? [...item.snippets] : [])
    setTimeout(() => textareaRef.current?.focus(), 50)
    return true
  }

  return (
    <div
      className="px-4 pb-3.5 pt-1.5 bg-transparent"
      ref={dropZoneRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="max-w-3xl mx-auto">
        {dragOver && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 pointer-events-none">
            <div className="rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-6 text-center">
              <Paperclip size={32} className="text-[var(--accent)] mx-auto mb-2" />
              <p className="text-sm font-medium text-[var(--text-primary)]">{t('chat.drag_drop_hint')}</p>
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
        <QuestionDialog />

        {/* Unified Floating Composer Card */}
        <div
          data-cwd={activeCwd || undefined}
          title={activeCwd ? undefined : undefined}
          className={cn(
            'relative flex flex-col rounded-[10px] border px-3.5 pt-2.5 pb-2 transition-colors input-ring',
            dragOver && 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
          )}
          style={{
            backgroundColor: 'var(--content-bg)',
            borderColor: dragOver ? 'var(--accent)' : 'var(--border)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {( (showSlash && slashResults.length > 0) || (slashArgCandidates.length > 0 && !ghostDismissed) ) && (
            <SlashCommandMenu
              commands={showSlash ? slashResults : []}
              selectedIndex={slashIndex}
              onSelectIndex={setSlashIndex}
              onSelectCommand={handleSlashSelect}
              argCandidates={!showSlash && !ghostDismissed ? slashArgCandidates : []}
              selectedArgIndex={argIndex}
              onSelectArgIndex={setArgIndex}
              onSelectArg={handleSelectSlashArg}
            />
          )}

          <InputReference
            value={input}
            cursorPos={refCursor}
            visible
            onSelect={handleReferenceSelect}
            onActiveSuggestionChange={setActiveRefSuggestion}
          />
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

          <div className="relative w-full">
            <GhostTextMirror
              value={input}
              ghostSuffix={ghostSuffix}
              scrollTop={textareaScrollTop}
            />
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onSelect={(e) => syncCaret(e.target as HTMLTextAreaElement)}
              onClick={(e) => syncCaret(e.target as HTMLTextAreaElement)}
              onKeyUp={(e) => syncCaret(e.target as HTMLTextAreaElement)}
              onScroll={(e) => setTextareaScrollTop((e.target as HTMLTextAreaElement).scrollTop)}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={(e) => {
                setIsComposing(false)
                syncCaret(e.target as HTMLTextAreaElement)
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={ghostSuffix ? '' : currentPlaceholder}
              rows={1}
              className="relative z-[1] w-full bg-transparent resize-none outline-none text-[13.5px] leading-[1.6] tracking-[-0.005em] py-0.5 max-h-[200px]"
              style={{ color: 'var(--text-primary)' }}
              disabled={isArenaRunning}
            />
          </div>

          {/* Integrated Bottom Toolbar inside Composer */}
          <div className="flex items-center justify-between gap-1.5 pt-2 mt-1.5 border-t flex-nowrap min-w-0" style={{ borderColor: 'color-mix(in srgb, var(--border) 65%, transparent)' }}>
            <div className="flex items-center gap-1.5 flex-nowrap min-w-0 shrink">
              {/* 1. File Attachment Trigger (far-left, harness convention) */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming}
                title={t('chat.upload')}
                aria-label={t('chat.upload')}
                className="shrink-0 h-6.5 w-6.5 flex items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] active:scale-[0.96] transition-colors disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
              >
                <Paperclip size={13.5} />
              </button>

              <div className="h-3.5 w-px shrink-0" style={{ backgroundColor: 'var(--border)' }} />

              {/* 2. Mode: Plan / Act */}
              <AgentModeSelector mode={agentMode} onChange={setAgentMode} compact />
              {/* 3. Main Model Selector */}
              <ModelSelector
                providers={providers}
                allModels={allModels}
                activeModelId={activeModelId}
                modelSuggestion={modelSuggestion}
                scoreByModel={scoreByModel}
                onSelect={(mid, pid) => {
                  if (currentSessionId) {
                    saveSessionConfig(currentSessionId, { providerId: pid, modelId: mid })
                  } else {
                    useStore.getState().setDefaultModel(mid)
                  }
                }}
              />
              {/* 4. Persona & SOUL Selector */}
              <PersonaSelector
                currentPersonaId={currentPersonaId}
                personas={personas}
                workspaceSoul={workspaceSoul}
                disabled={isArenaRunning}
                onSelect={(pid) => {
                  if (currentSessionId) {
                    saveSessionConfig(currentSessionId, { personaId: pid })
                  } else {
                    useStore.getState().setDefaultPersona(pid)
                  }
                }}
              />
              {/* 5. Thinking Effort Control */}
              <EffortControl
                thinkingEnabled={thinkingEnabled}
                onToggleThinking={setThinkingEnabled}
                level={effortLevel}
                onLevelChange={setEffortLevel}
                isBinary={isBinaryReasoning}
                compact
              />
            </div>

            <div className="flex items-center gap-1.5 min-w-0 shrink ml-auto flex-nowrap">
              {isStreaming ? (
                <StreamingStatusBar sessionId={currentSessionId} />
              ) : (
                <SessionUsageRollbackBadge sessionId={currentSessionId} />
              )}

              <div className="h-3.5 w-px shrink-0" style={{ backgroundColor: 'var(--border)' }} />

              {/* Side Question (BTW) trigger */}
              <button
                type="button"
                onClick={toggleBtw}
                aria-pressed={btwOpen}
                title={t('btw.btn_tooltip', '旁支提问 (Alt+B)')}
                aria-label={t('btw.btn_tooltip', '旁支提问 (Alt+B)')}
                className={cn(
                  'shrink-0 h-6.5 w-6.5 flex items-center justify-center rounded-[6px] border transition-colors active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer',
                  btwOpen
                    ? 'border-[var(--accent)] bg-[var(--bg-secondary)] text-[var(--accent)]'
                    : 'border-transparent bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                )}
              >
                <MessageSquareDashed size={13.5} />
              </button>

              {isArenaRunning || (isStreaming && !input.trim() && pending.length === 0 && snippets.length === 0) ? (
                <button
                  onClick={() => { stopGeneration(); window.dispatchEvent(new CustomEvent('aether:generation-stopped')) }}
                  className="shrink-0 h-6.5 w-6.5 flex items-center justify-center rounded-[6px] bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors active:scale-[0.96] cursor-pointer"
                  title={t('chat.stop')}
                  aria-label={t('chat.stop')}
                >
                  <Square size={11} fill="currentColor" />
                </button>
              ) : isStreaming && (input.trim() || pending.length > 0 || snippets.length > 0) ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = input.trim()
                      if (trimmed || pending.length > 0 || snippets.length > 0) {
                        enqueueMessage(trimmed, currentSessionId ?? undefined, { attachments: pending, snippets })
                        setInput('')
                        setPending([])
                        setSnippets([])
                      }
                    }}
                    className="h-6.5 px-2 rounded-[6px] bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors active:scale-[0.97] text-[11px] flex items-center gap-1 font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
                    title={t('queue.add_tooltip', '加入排队队列')}
                    aria-label={t('queue.add_tooltip', '加入排队队列')}
                  >
                    <ListPlus size={12} />
                    <span className="hidden sm:inline">{t('queue.add_button', '排队')}</span>
                  </button>
                  {input.trim() && (
                    <button
                      type="button"
                      onClick={() => handleSubmit()}
                      className="h-6.5 px-2 rounded-[6px] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity active:scale-[0.97] text-[11px] flex items-center gap-1 font-medium cursor-pointer"
                      title={t('inject.send_hint', '立即插队到当前回合')}
                      aria-label={t('inject.send_hint', '立即插队到当前回合')}
                    >
                      <Zap size={12} />
                      <span className="hidden sm:inline">{t('queue.inject_button', '插队')}</span>
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => handleSubmit()}
                  disabled={(!input.trim() && pending.length === 0 && snippets.length === 0) || (chatMode === 'arena' && arenaModelIds.length < 2)}
                  className="shrink-0 h-6.5 w-6.5 flex items-center justify-center rounded-[6px] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity active:scale-[0.96] disabled:opacity-25 cursor-pointer"
                  title={t('chat.send')}
                  aria-label={t('chat.send')}
                >
                  <Send size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
