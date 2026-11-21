import { useEffect, useState, useCallback, useRef } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { X, ArrowRightLeft, RefreshCw, Send } from 'lucide-react'

/** Editable Handoff modal: distill active session state, edit prompt, commit clean child session. */
export default function HandoffModal() {
  const open = useStore((s) => s.handoffOpen)
  const initialGoal = useStore((s) => s.handoffInitialGoal)
  const setHandoffOpen = useStore((s) => s.setHandoffOpen)
  const currentSessionId = useStore((s) => s.currentSessionId)

  const [goal, setGoal] = useState('')
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [sourceTag, setSourceTag] = useState<'llm' | 'fallback' | null>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const goalInputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const draftSeqRef = useRef(0)
  const activeSessionRef = useRef<number | null>(currentSessionId)
  const submittingRef = useRef(false)
  activeSessionRef.current = currentSessionId

  const generateDraft = useCallback(async (sid: number, focusGoal: string) => {
    const seq = ++draftSeqRef.current
    setLoading(true)
    setError('')
    try {
      const res = await window.electronAPI.chat.handoffDraft({ sessionId: sid, goal: focusGoal })
      if (draftSeqRef.current !== seq || activeSessionRef.current !== sid || !useStore.getState().handoffOpen) {
        return
      }
      if (!res.ok) {
        setError(res.error || t('chat.handoff_draft_failed'))
      } else {
        setTitle(res.title || '')
        setPrompt(res.draftPrompt || '')
        setSourceTag(res.source || null)
      }
    } catch (err: any) {
      if (draftSeqRef.current !== seq || activeSessionRef.current !== sid || !useStore.getState().handoffOpen) {
        return
      }
      setError(err?.message || t('chat.handoff_draft_failed'))
    } finally {
      if (draftSeqRef.current === seq) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!open || !currentSessionId) {
      draftSeqRef.current += 1
      return
    }
    const seedGoal = initialGoal || ''
    setGoal(seedGoal)
    setPrompt('')
    setTitle('')
    setSourceTag(null)
    void generateDraft(currentSessionId, seedGoal)
  }, [open, currentSessionId, initialGoal, generateDraft])

  const activeDialog = Boolean(open && currentSessionId)

  useEffect(() => {
    if (!activeDialog) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const raf = window.requestAnimationFrame(() => {
      if (goalInputRef.current && !goalInputRef.current.disabled) {
        goalInputRef.current.focus()
      } else {
        dialogRef.current?.focus()
      }
    })
    return () => {
      window.cancelAnimationFrame(raf)
      const prev = previousFocusRef.current
      previousFocusRef.current = null
      if (prev && prev.isConnected) {
        prev.focus()
      }
    }
  }, [activeDialog])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        e.preventDefault()
        setHandoffOpen(false)
        return
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const nodes = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
          )
        ).filter((el) => el.getClientRects().length > 0)
        if (nodes.length === 0) {
          e.preventDefault()
          dialogRef.current.focus()
          return
        }
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        const active = document.activeElement
        if (e.shiftKey) {
          if (active === first || !dialogRef.current.contains(active)) {
            e.preventDefault()
            last.focus()
          }
        } else if (active === last || !dialogRef.current.contains(active)) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, submitting, setHandoffOpen])

  if (!open || !currentSessionId) return null

  const handleCommit = async (autoSend: boolean) => {
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt || submitting || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setError('')
    let committedSessionId: number | null = null
    let shouldAutoSend = false
    try {
      let willAutoSend = autoSend
      if (autoSend) {
        const s = useStore.getState()
        let hasModel = Boolean(s.sessionConfigs?.[currentSessionId]?.modelId)
        if (!hasModel) {
          try {
            const enabledProviders = (await window.electronAPI.provider.list()).filter((p) => p.enabled)
            if (enabledProviders.length > 0) {
              const models = await window.electronAPI.model.list(enabledProviders[0].id)
              hasModel = Array.isArray(models) && models.length > 0
            }
          } catch {}
        }
        if (!hasModel) willAutoSend = false
      }
      const res = await window.electronAPI.chat.handoffCommit({
        sessionId: currentSessionId,
        prompt: cleanPrompt,
        title: title.trim() || null,
        insertInitialMessage: !willAutoSend,
      })
      if (!res.ok || !res.id) {
        setError(res.error || t('chat.handoff_commit_failed'))
        return
      }
      committedSessionId = res.id
      shouldAutoSend = willAutoSend
      const store = useStore.getState()
      await store.loadSessions()
      await store.selectSession(res.id)
      setHandoffOpen(false)
      if (!willAutoSend) {
        store.triggerToast(t('chat.handoff_success'), 'success')
      }
    } catch (err: any) {
      setError(err?.message || t('chat.handoff_commit_failed'))
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
    if (shouldAutoSend && committedSessionId != null) {
      void useStore.getState()
        .sendMessage(cleanPrompt, undefined, { targetSessionId: committedSessionId, throwOnError: true })
        .then(() => {
          useStore.getState().triggerToast(t('chat.handoff_success'), 'success')
        })
        .catch((err: unknown) => {
          const detail = err instanceof Error && err.message ? `: ${err.message}` : ''
          useStore.getState().triggerToast(`${t('chat.handoff_send_failed')}${detail}`, 'error')
        })
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-modal-title"
      onClick={() => { if (!submitting) setHandoffOpen(false) }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-2xl rounded-lg border shadow-lg flex flex-col max-h-[85vh] focus:outline-none"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <ArrowRightLeft size={16} style={{ color: 'var(--accent)' }} />
            <h2 id="handoff-modal-title" className="text-sm font-semibold truncate">
              {t('chat.handoff_title')}
            </h2>
            {sourceTag && (
              <span
                className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                {sourceTag}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={() => setHandoffOpen(false)}
            className="p-1 rounded hover:bg-[var(--content-bg)] active:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 cursor-pointer motion-reduce:transition-none transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            aria-label={t('chat.handoff_cancel')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {t('chat.handoff_subtitle')}
          </p>

          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <label htmlFor="handoff-goal-input" className="block text-[11px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                {t('chat.handoff_goal_label')}
              </label>
              <input
                ref={goalInputRef}
                id="handoff-goal-input"
                type="text"
                disabled={submitting}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={t('chat.handoff_goal_placeholder')}
                className="w-full px-2.5 py-1.5 text-xs rounded border hover:border-[var(--accent)] active:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-50 transition-colors motion-reduce:transition-none"
                style={{
                  backgroundColor: 'var(--content-bg)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <button
              type="button"
              disabled={loading || submitting}
              onClick={() => generateDraft(currentSessionId, goal)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border hover:bg-[var(--content-bg)] active:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 cursor-pointer motion-reduce:transition-none transition-colors shrink-0"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <RefreshCw size={12} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
              <span>{t('chat.handoff_regenerate')}</span>
            </button>
          </div>

          <div>
            <label htmlFor="handoff-title-input" className="block text-[11px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              {t('chat.handoff_session_title')}
            </label>
            <input
              id="handoff-title-input"
              type="text"
              disabled={loading || submitting}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded border hover:border-[var(--accent)] active:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-50 transition-colors motion-reduce:transition-none"
              style={{
                backgroundColor: 'var(--content-bg)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="handoff-prompt-input" className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                {t('chat.handoff_prompt_label')}
              </label>
              {loading && (
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {t('chat.handoff_generating')}
                </span>
              )}
            </div>
            <textarea
              ref={promptRef}
              id="handoff-prompt-input"
              rows={11}
              disabled={loading || submitting}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-mono rounded border resize-y hover:border-[var(--accent)] active:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-50 transition-colors motion-reduce:transition-none"
              style={{
                backgroundColor: 'var(--content-bg)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {error && (
            <div className="text-xs px-2.5 py-1.5 rounded border" style={{ borderColor: 'var(--error)', color: 'var(--error)' }}>
              {error}
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 px-4 py-3 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            disabled={submitting}
            onClick={() => setHandoffOpen(false)}
            className="px-3 py-1.5 text-xs rounded border hover:bg-[var(--content-bg)] active:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 cursor-pointer motion-reduce:transition-none transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {t('chat.handoff_cancel')}
          </button>
          <button
            type="button"
            disabled={loading || submitting || !prompt.trim()}
            onClick={() => handleCommit(false)}
            className="px-3 py-1.5 text-xs rounded border hover:bg-[var(--content-bg)] active:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 cursor-pointer motion-reduce:transition-none transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            {t('chat.handoff_submit')}
          </button>
          <button
            type="button"
            disabled={loading || submitting || !prompt.trim()}
            onClick={() => handleCommit(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border hover:opacity-90 active:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 cursor-pointer motion-reduce:transition-none transition-colors"
            style={{
              backgroundColor: 'var(--accent)',
              borderColor: 'var(--accent)',
              color: 'var(--accent-fg)',
            }}
          >
            <Send size={12} />
            <span>{t('chat.handoff_submit_and_send')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
