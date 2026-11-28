import { useState, useMemo, useEffect, useCallback, useRef, type RefObject } from 'react'
import type { Message } from '@/types'
import type { SlashCommand } from '../slashCommands'
import {
  computeGhostCompletion,
  extractRecentUserPrompts,
  canRequestIdlePrediction,
  resolveEffectiveGhostSuffix,
  type ActiveReferenceSuggestion,
  type SlashArgCandidate,
} from '@/utils/ghostCompletion'

interface UseComposerGhostParams {
  input: string
  setInput: (val: string) => void
  setRefCursor: (pos: number) => void
  showSlash: boolean
  setShowSlash: (v: boolean) => void
  slashQuery: string
  setSlashQuery: (q: string) => void
  slashCommands: SlashCommand[]
  messages: Message[]
  textareaRef: RefObject<HTMLTextAreaElement | null>
  currentSessionId: number | null
  activeModelId: number | null
  isStreaming: boolean
  isArenaRunning: boolean
  nextPromptEnabled: boolean
}

export function useComposerGhost({
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
}: UseComposerGhostParams) {
  const [slashIndex, setSlashIndex] = useState(0)
  const [argIndex, setArgIndex] = useState(0)
  const [activeRefSuggestion, setActiveRefSuggestion] = useState<ActiveReferenceSuggestion | null>(null)
  const [isComposing, setIsComposing] = useState(false)
  const [ghostDismissed, setGhostDismissed] = useState(false)
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 })
  const [textareaScrollTop, setTextareaScrollTop] = useState(0)
  const [idlePrediction, setIdlePrediction] = useState('')
  const predSeqRef = useRef(0)
  const lastPredictedAnchorRef = useRef<string | null>(null)
  const liveStateRef = useRef({ input, currentSessionId, isStreaming, isArenaRunning, nextPromptEnabled })
  liveStateRef.current = { input, currentSessionId, isStreaming, isArenaRunning, nextPromptEnabled }

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

  useEffect(() => { setSlashIndex(0) }, [slashQuery, showSlash])
  useEffect(() => {
    if (slashIndex >= slashResults.length) setSlashIndex(Math.max(0, slashResults.length - 1))
  }, [slashIndex, slashResults.length])

  const recentUserPrompts = useMemo(() => extractRecentUserPrompts(messages), [messages])

  const ghost = useMemo(
    () =>
      computeGhostCompletion({
        input,
        cursorPos: selection.start,
        selectionEnd: selection.end,
        isComposing,
        dismissed: ghostDismissed,
        slashCommands,
        slashResults,
        slashSelectedIndex: showSlash ? slashIndex : argIndex,
        activeReference: activeRefSuggestion,
        recentUserPrompts,
      }),
    [input, selection, isComposing, ghostDismissed, slashCommands, slashResults, showSlash, slashIndex, argIndex, activeRefSuggestion, recentUserPrompts]
  )

  const slashArgCandidates = ghost.slashArgCandidates
  useEffect(() => { setArgIndex(0) }, [ghost.activeSlashCommandId])
  useEffect(() => {
    if (argIndex >= slashArgCandidates.length) setArgIndex(Math.max(0, slashArgCandidates.length - 1))
  }, [argIndex, slashArgCandidates.length])

  // Stage 2 idle next-prompt prediction (feature-flagged, guarded by req seq + live session/input)
  useEffect(() => {
    if (input !== '' || isStreaming || isArenaRunning || !nextPromptEnabled) {
      predSeqRef.current += 1
      setIdlePrediction('')
      return
    }
    const gate = canRequestIdlePrediction({
      enabled: nextPromptEnabled,
      input,
      isStreaming,
      isArenaRunning,
      sessionId: currentSessionId,
      modelId: activeModelId,
      messages,
    })
    if (!gate.ok || !gate.anchorKey || lastPredictedAnchorRef.current === gate.anchorKey) {
      return
    }
    const seq = ++predSeqRef.current
    const reqSid = currentSessionId!
    const anchorKey = gate.anchorKey
    const timer = setTimeout(async () => {
      try {
        const res = await window.electronAPI?.chat?.predictNextPrompt?.(reqSid, activeModelId)
        const live = liveStateRef.current
        if (
          predSeqRef.current !== seq ||
          live.currentSessionId !== reqSid ||
          live.input !== '' ||
          live.isStreaming ||
          live.isArenaRunning ||
          !live.nextPromptEnabled
        ) {
          return
        }
        lastPredictedAnchorRef.current = anchorKey
        setIdlePrediction((res?.suggestion || '').trim())
      } catch {
        // Silent fallback on prediction failure
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [nextPromptEnabled, input, isStreaming, isArenaRunning, currentSessionId, activeModelId, messages])

  const cursorAtEnd = selection.start === input.length && selection.end === input.length
  const effectiveGhostSuffix = resolveEffectiveGhostSuffix({
    input,
    deterministicGhost: ghost.ghostSuffix,
    idlePrediction,
    isComposing,
    dismissed: ghostDismissed,
    cursorAtEnd,
  })

  const applyComposerText = useCallback((next: string, cursorAt?: number) => {
    const pos = cursorAt ?? next.length
    setInput(next)
    setRefCursor(pos)
    setSelection({ start: pos, end: pos })
    setGhostDismissed(false)
    const lastLine = next.slice(0, pos).split('\n').pop() || ''
    const cmdMatch = /^\/([^\s]*)$/.exec(lastLine)
    if (cmdMatch) { setShowSlash(true); setSlashQuery(cmdMatch[1]) }
    else { setShowSlash(false); setSlashQuery('') }
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (ta) { ta.focus(); ta.setSelectionRange(pos, pos) }
    })
  }, [setInput, setRefCursor, setShowSlash, setSlashQuery, textareaRef])

  const syncCaret = useCallback((ta: HTMLTextAreaElement) => {
    const start = ta.selectionStart ?? ta.value.length
    const end = ta.selectionEnd ?? start
    setRefCursor(start)
    setSelection((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [setRefCursor])

  const handleSlashSelect = useCallback((cmd: SlashCommand) => {
    if (cmd.requiresArg || cmd.argOptions?.length || (!cmd.action && !cmd.prompt)) {
      const lines = input.split('\n')
      lines[lines.length - 1] = `/${cmd.id} `
      applyComposerText(lines.join('\n'))
      return
    }
    if (cmd.action) {
      setShowSlash(false)
      cmd.action()
      return
    }
    const lines = input.split('\n')
    lines[lines.length - 1] = cmd.prompt || `/${cmd.id}`
    applyComposerText(lines.join('\n'))
  }, [input, applyComposerText, setShowSlash])

  const handleSelectSlashArg = useCallback((cand: SlashArgCandidate) => {
    const lines = input.split('\n')
    lines[lines.length - 1] = `${cand.prefix}${cand.value}${cand.commandId === 'role' ? ' ' : ''}`
    applyComposerText(lines.join('\n'))
  }, [input, applyComposerText])

  const acceptGhost = useCallback(() => {
    if (!effectiveGhostSuffix) return
    if (ghost.source === 'slash-cmd') {
      const selected = slashResults[slashIndex] || slashResults[0]
      if (selected) {
        const needsSpace = Boolean(selected.requiresArg || selected.argOptions?.length)
        const lines = input.split('\n')
        lines[lines.length - 1] = needsSpace ? `/${selected.id} ` : `/${selected.id}`
        applyComposerText(lines.join('\n'))
        return
      }
    }
    const extraSpace = ghost.source === 'slash-arg' && ghost.activeSlashCommandId === 'role' ? ' ' : ''
    setIdlePrediction('')
    applyComposerText(input + effectiveGhostSuffix + extraSpace)
  }, [effectiveGhostSuffix, ghost, slashResults, slashIndex, input, applyComposerText])

  const handleCompletionKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
    const el = textareaRef.current
    if (showSlash && slashResults.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex((i) => (i + 1) % slashResults.length); return true }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex((i) => (i - 1 + slashResults.length) % slashResults.length); return true }
      if (e.key === 'Tab') {
        e.preventDefault()
        const selected = slashResults[slashIndex] || slashResults[0]
        if (selected) {
          const lines = input.split('\n')
          lines[lines.length - 1] = `/${selected.id} `
          applyComposerText(lines.join('\n'))
        }
        return true
      }
      if (e.key === 'Enter') { e.preventDefault(); handleSlashSelect(slashResults[slashIndex] || slashResults[0]); return true }
      if (e.key === 'Escape') { e.preventDefault(); setShowSlash(false); setGhostDismissed(true); return true }
    }
    if (slashArgCandidates.length > 0 && !ghostDismissed) {
      const selectedArg = slashArgCandidates[argIndex] || slashArgCandidates[0]
      if (e.key === 'ArrowDown') { e.preventDefault(); setArgIndex((i) => (i + 1) % slashArgCandidates.length); return true }
      if (e.key === 'ArrowUp') { e.preventDefault(); setArgIndex((i) => (i - 1 + slashArgCandidates.length) % slashArgCandidates.length); return true }
      if (e.key === 'Tab' && selectedArg) { e.preventDefault(); handleSelectSlashArg(selectedArg); return true }
      if (e.key === 'Enter' && selectedArg) {
        const lastLine = input.split('\n').pop() || ''
        const typedArg = lastLine.slice(selectedArg.prefix.length).trim().toLowerCase()
        if (typedArg !== selectedArg.value.toLowerCase()) { e.preventDefault(); handleSelectSlashArg(selectedArg); return true }
      }
      if (e.key === 'Escape') { setGhostDismissed(true); return true }
    }
    if (effectiveGhostSuffix) {
      if (e.key === 'Tab') { e.preventDefault(); acceptGhost(); return true }
      if (e.key === 'ArrowRight' && el && el.selectionStart === input.length && el.selectionEnd === input.length) { e.preventDefault(); acceptGhost(); return true }
      if (e.key === 'Escape') { setIdlePrediction(''); setGhostDismissed(true); return true }
    }
    return false
  }, [textareaRef, showSlash, slashResults, slashIndex, input, applyComposerText, handleSlashSelect, setShowSlash, slashArgCandidates, ghostDismissed, argIndex, handleSelectSlashArg, effectiveGhostSuffix, acceptGhost])

  return {
    slashIndex, setSlashIndex, slashResults,
    argIndex, setArgIndex, slashArgCandidates,
    isComposing, setIsComposing,
    ghostDismissed, setGhostDismissed,
    setActiveRefSuggestion, textareaScrollTop, setTextareaScrollTop,
    ghostSuffix: effectiveGhostSuffix,
    applyComposerText, syncCaret,
    handleSlashSelect, handleSelectSlashArg,
    handleCompletionKeyDown,
  }
}
