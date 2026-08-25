import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'
import Tooltip from '@/components/Tooltip'
import InputReference from '@/components/chat/InputReference'
import { Send, Square, Paperclip, X, FileText, Brain, Cpu, Wand2, Check, Shield, RotateCcw } from 'lucide-react'
import AgentStatusBar from './AgentStatusBar'
import { useUI } from '@/components/ui/feedback'
import { t } from '@/utils/i18n'
import { TEXT_EXTS, MAX_ATTACHMENT_BYTES, PASTE_COLLAPSE_LINES, PASTE_COLLAPSE_CHARS } from '@/utils/constants'
import { estimateTextTokens } from '@/utils/tokenEstimate'
import { useShallow } from 'zustand/react/shallow'

type PendingAttachment = { name: string; mime: string; kind: 'text' | 'image'; dataUrl: string }
type Snippet = { id: number; content: string; preview: string }
type SlashCommand = { id: string; name: string; description: string; prompt?: string; action?: () => void }
type AgentMode = 'off' | 'plan' | 'ask' | 'auto_confirm' | 'auto' | 'yolo' | 'custom'

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
  { id: 'undo', name: '撤销提交', description: '按最近一次检查点恢复文件并生成撤销提交', action: async () => {
    try {
      const cwd = await window.electronAPI.agent.getWorkspace()
      if (!cwd) { window.alert('未配置工作区，无法撤销提交'); return }
      const confirmed = window.confirm('将按最近一次检查点（checkpoint）快照恢复被修改的文件，并生成一条撤销提交（不做 git reset --hard，不丢弃其他未提交修改）。若本仓库没有检查点记录则拒绝执行。确定继续吗？')
      if (!confirmed) return
      const res = await window.electronAPI.git.undo(cwd)
      if (res.success) {
        window.alert(`✅ 已按检查点恢复并生成撤销提交：${res.undoneCommit || '未知'}`)
      } else {
        window.alert(`❌ 撤销失败：${res.error || res.message || '未知错误'}`)
      }
    } catch { window.alert('❌ 撤销失败') }
  } },
]

export default function ChatInput() {
  // Slash commands loaded from IPC (scan CMD.md files). Falls back to defaults.
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>(DEFAULT_COMMANDS)
  // Cursor position in the textarea, tracked for the @/#/! reference popup.
  const [refCursor, setRefCursor] = useState(0)
  useEffect(() => {
    let cancelled = false
    window.electronAPI.commands?.list?.().then((cmds: SlashCommand[]) => {
      if (cancelled) return
      if (cmds && cmds.length > 0) {
        // Merge: keep the built-in action commands (clear/regenerate/compact/undo)
        // that are only defined as DEFAULT_COMMANDS, alongside the CMD.md commands
        // discovered via IPC. Without this, action-only commands would be dropped
        // as soon as any CMD.md file exists.
        const actionCmds = DEFAULT_COMMANDS.filter(c => c.action)
        const merged = [...actionCmds, ...cmds.filter(c => !actionCmds.some(a => a.id === c.id))]
        setSlashCommands(merged)
      } else {
        setSlashCommands(DEFAULT_COMMANDS)
      }
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
    thinkingEnabled, setThinkingEnabled,
    providers, allModels, saveSessionConfig, queuedMessages,
    modelSuggestion, agentMode, setAgentMode, sessionConfigs, scores,
    loopingSessions,
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
  })))

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

  // Listen for Ctrl+E → edit last user message
  useEffect(() => {
    const handler = (e: Event) => {
      const { content } = (e as CustomEvent).detail
      setInput(content)
      textareaRef.current?.focus()
    }
    window.addEventListener('aether:edit-last-user', handler)
    return () => window.removeEventListener('aether:edit-last-user', handler)
  }, [])

  // Load draft when switching sessions — each conversation has its own draft.
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
    // Refresh the model suggestion (badge on the model selector) for the
    // newly opened session without waiting for the next send.
    useStore.getState().refreshModelSuggestion()
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
      // Ctrl+E: edit last user message (readline-style)
      if (key === 'e') {
        e.preventDefault()
        useStore.getState().editLastUserMessage()
        return
      }
      // Ctrl+Z: undo last edit
      if (key === 'z') {
        e.preventDefault()
        useStore.getState().undoLastEdit()
        return
      }
    }
    // Ctrl+Shift+C: copy code block when cursor is inside one
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      const textarea = textareaRef.current
      if (!textarea) return
      const val = textarea.value
      const pos = textarea.selectionStart
      // Find the nearest code block boundaries around cursor
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
            <button onClick={() => { stopGeneration(); window.dispatchEvent(new CustomEvent('aether:generation-stopped')) }} className="shrink-0 p-2.5 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors" title={t('chat.stop')} aria-label={t('chat.stop')}>
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
          <div className="flex items-center gap-1.5 px-0.5 mt-1.5 flex-nowrap">
            <div className="flex items-center gap-1 shrink-0">
              {slashCommands.slice(0, 2).map((cmd) => (
                <button key={cmd.id} onClick={() => {
                  const prompt = cmd.prompt
                  if (prompt) setInput(prev => prev ? prev + '\n---\n' + prompt : prompt)
                  textareaRef.current?.focus()
                }} className="qaction">{cmd.name}</button>
              ))}
            </div>
            <AgentModeSelector mode={agentMode} onChange={setAgentMode} />
            <EffortControl thinkingEnabled={thinkingEnabled} onToggleThinking={setThinkingEnabled} level={effortLevel} onLevelChange={setEffortLevel} />
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
            {totalInputTokens > 0 && (
              <span className="text-[10px] tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                {t('chat.tokens_estimate', String(totalInputTokens))}
              </span>
            )}
            <span className="text-[10px] text-[var(--text-muted)] ml-auto shrink-0">{t('empty.hint.slash')}</span>
          </div>
        )}
        {isStreaming && <StreamingStatusBar sessionId={currentSessionId} />}
        {isLooping && <AgentStatusBar sessionId={currentSessionId} />}
      </div>
    </div>
  )
}

// Thinking-effort control: toggle switch + 3-detent slider (Claude-Code-style
// Tab + /effort pattern). Toggle controls whether extended thinking is on;
// slider picks depth (low/medium/high). Slider is disabled when thinking is off.
const EFFORT_LEVELS = [
  { value: 'low' as const, labelKey: 'effort.low' },
  { value: 'medium' as const, labelKey: 'effort.medium' },
  { value: 'high' as const, labelKey: 'effort.high' },
]
function EffortControl({ thinkingEnabled, onToggleThinking, level, onLevelChange }: {
  thinkingEnabled: boolean; onToggleThinking: (v: boolean) => void
  level: 'low' | 'medium' | 'high'; onLevelChange: (v: 'low' | 'medium' | 'high') => void
}) {
  const idx = EFFORT_LEVELS.findIndex(l => l.value === level)
  const fill = (idx / (EFFORT_LEVELS.length - 1)) * 100
  return (
    <div className="flex items-center gap-1.5" title={t('effort.tooltip')}>
      <button
        onClick={() => onToggleThinking(!thinkingEnabled)}
        className={`thinking-toggle ${thinkingEnabled ? 'is-on' : 'is-off'}`}
      >
        <Brain size={13} />
      </button>
      <input type="range" min={0} max={2} step={1} value={idx}
        onChange={(e) => onLevelChange(EFFORT_LEVELS[parseInt(e.target.value, 10)].value)}
        className="effort-slider w-20" disabled={!thinkingEnabled}
        style={{ ['--fill' as string]: `${fill}%` }} />
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
    { value: 'custom', label: t('agent.mode.custom', 'Custom'), color: '#8b5cf6', tooltip: t('agent.mode.custom.desc', 'Custom policy: configure per-tool permissions in settings') },
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

// Budget-warning presentation is owned by usageSlice.recordUsage (status line
// for AgentStatusBar + one 'warning' toast). The former <BudgetWarningToast />
// component here double-fired the same notification and was removed.

function StreamingStatusBar({ sessionId }: { sessionId: number | null }) {
  const statusLines = useStore((s) => s.statusLinesByMessage)
  const turnUsage = useStore((s) => (sessionId ? s.turnUsageBySession[sessionId] : null))
  const cumUsage = useStore((s) => (sessionId ? s.usageBySession[sessionId] : null))
  const [status, setStatus] = useState('')
  const [stopped, setStopped] = useState(false)

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

  // Listen for stop generation event
  useEffect(() => {
    const handler = () => setStopped(true)
    window.addEventListener('aether:generation-stopped', handler)
    return () => window.removeEventListener('aether:generation-stopped', handler)
  }, [])

  // Reset stopped state when streaming resumes
  useEffect(() => {
    if (status) setStopped(false)
  }, [status])

  if (!status && !stopped) return null
  const turnCost = turnUsage?.costUsd || 0
  const cumCost = cumUsage?.costUsd || 0
  const showCost = turnCost > 0 || cumCost > 0
  return (
    <div className="px-0.5 mt-1.5 animate-blur-fade">
      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {stopped ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>生成已停止 · 按 Continue 继续</span>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            <span>{status}</span>
          </>
        )}
        {showCost && (
          <span className="tabular-nums shrink-0 ml-auto">
            {t('usage.cost_line', `$${turnCost.toFixed(4)}`, `$${cumCost.toFixed(3)}`)}
          </span>
        )}
      </div>
    </div>
  )
}

// Build a multi-line, i18n-localized tooltip from the structured reasonParts
// returned by model:suggest. Falls back to the raw `reason` string when the
// parts are missing (older main process) or when there was no match at all.
function formatSuggestionReason(modelSuggestion: ModelSuggestion | null): string {
  if (!modelSuggestion) return t('chat.model_switch')
  const rp = modelSuggestion.reasonParts
  if (!rp || rp.noMatch) return t('model.suggest.no_match')

  const lines: string[] = []
  const taskKey = rp.task ? `model.suggest.task.${rp.task}` : null
  lines.push(t('model.suggest.task', taskKey ? t(taskKey) : rp.taskLabel || ''))

  lines.push(t('model.suggest.heuristic', rp.heuristic ?? 0, rp.family || ''))

  if (rp.eloScore != null) {
    const elo = Number(rp.eloScore).toFixed(1)
    lines.push(rp.eloReliable
      ? t('model.suggest.elo', elo, rp.eloWins ?? 0, rp.eloTotal ?? 0)
      : t('model.suggest.elo_insufficient', elo))
  }

  if (rp.useTools) {
    lines.push(rp.reasonPickUsed ? t('model.suggest.reason_pick') : t('model.suggest.tools'))
  }

  if (rp.closeRace && rp.gap != null && rp.runnerUpName) {
    lines.push(t('model.suggest.close_race', rp.gap, rp.runnerUpName))
  }

  if (rp.secondary && rp.secondary.length) {
    const labels = rp.secondary
      .map(s => t(`model.suggest.task.${s.type}`))
      .filter(l => !l.startsWith('model.suggest.task.'))
    if (labels.length) lines.push(t('model.suggest.secondary', labels.join(', ')))
  }

  if (rp.confidence != null) lines.push(t('model.suggest.confidence', rp.confidence))

  return lines.join('\n')
}

function ModelSelector({ providers, allModels, activeModelId, onSelect, modelSuggestion, scoreByModel }: {
  providers: { id: number; name: string }[]
  allModels: { id: number; provider_id: number; model_name: string; display_name?: string | null }[]
  activeModelId: number | null
  onSelect: (modelId: number, providerId: number) => void
  modelSuggestion: ModelSuggestion | null
  scoreByModel: Record<number, number>
}) {
  const groups = useMemo(() => providers.map(p => {
    const ms = allModels.filter(m => m.provider_id === p.id)
    return ms.length ? { providerId: p.id, providerName: p.name, models: ms } : null
  }).filter(Boolean) as { providerId: number; providerName: string; models: typeof allModels }[], [providers, allModels])

  if (groups.length === 0) return null

  const isAutoSuggested = modelSuggestion && modelSuggestion.suggestedModelId === activeModelId && activeModelId != null
  const suggestedModel = modelSuggestion && modelSuggestion.suggestedModelId ? allModels.find(m => m.id === modelSuggestion!.suggestedModelId) : null
  const reasonTitle = formatSuggestionReason(modelSuggestion)

  // The suggestion badge floats on the select's top-right corner so it never
  // takes document-flow space, squeezes the select, or covers its text.
  return (
    <div className="flex items-center gap-1.5">
      <Cpu size={13} className="text-gray-400 shrink-0" />
      <div className="relative shrink-0" title={reasonTitle}>
        <select value={String(activeModelId ?? '')}
          onChange={(e) => {
            const mid = Number(e.target.value)
            const model = allModels.find(m => m.id === mid)
            if (model) onSelect(mid, model.provider_id)
          }}
          className="text-[11px] rounded-lg border px-2 py-1 outline-none max-w-[160px] bg-[var(--content-bg)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
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
          <button
            onClick={() => onSelect(suggestedModel.id, suggestedModel.provider_id)}
            className="absolute -right-1.5 -top-1.5 w-4 h-4 rounded-full flex items-center justify-center hover:scale-110 transition-transform z-10"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
            title={reasonTitle} aria-label={reasonTitle}>
            <Wand2 size={9} />
          </button>
        )}
        {isAutoSuggested && (
          <span className="absolute -right-1.5 -top-1.5 w-4 h-4 rounded-full flex items-center justify-center pointer-events-none"
            style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: 'var(--accent)' }}
            title={reasonTitle}>
            <Check size={9} />
          </span>
        )}
      </div>
    </div>
  )
}
