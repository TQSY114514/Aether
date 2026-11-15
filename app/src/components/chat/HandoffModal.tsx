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

  const generateDraft = useCallback(async (sid: number, focusGoal: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await window.electronAPI.chat.handoffDraft({ sessionId: sid, goal: focusGoal })
      if (!res.ok) {
        setError(res.error || 'Failed to generate handoff draft')
      } else {
        setTitle(res.title || '')
        setPrompt(res.draftPrompt || '')
        setSourceTag(res.source || null)
      }
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || !currentSessionId) return
    const seedGoal = initialGoal || ''
    setGoal(seedGoal)
    setPrompt('')
    setTitle('')
    setSourceTag(null)
    void generateDraft(currentSessionId, seedGoal)
  }, [open, currentSessionId, initialGoal, generateDraft])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        e.preventDefault()
        setHandoffOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, submitting, setHandoffOpen])

  if (!open || !currentSessionId) return null

  const handleCommit = async (autoSend: boolean) => {
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const res = await window.electronAPI.chat.handoffCommit({
        sessionId: currentSessionId,
        prompt: cleanPrompt,
        title: title.trim() || null,
        insertInitialMessage: !autoSend,
      })
      if (!res.ok || !res.id) {
        setError(res.error || 'Failed to create handoff session')
        return
      }
      const store = useStore.getState()
      await store.loadSessions()
      await store.selectSession(res.id)
      setHandoffOpen(false)
      store.triggerToast(t('chat.handoff_success'), 'success')
      if (autoSend) {
        await store.sendMessage(cleanPrompt)
      }
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setSubmitting(false)
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
        className="w-full max-w-2xl rounded-lg border shadow-lg flex flex-col max-h-[85vh]"
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
            className="p-1 rounded hover:bg-[var(--content-bg)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 cursor-pointer motion-reduce:transition-none transition-colors"
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
              <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                {t('chat.handoff_goal_label')}
              </label>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={t('chat.handoff_goal_placeholder')}
                className="w-full px-2.5 py-1.5 text-xs rounded border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
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
            <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              {t('chat.handoff_session_title')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
              style={{
                backgroundColor: 'var(--content-bg)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
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
              rows={11}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-mono rounded border resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
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
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border active:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 cursor-pointer motion-reduce:transition-none transition-colors"
            style={{
              backgroundColor: 'var(--accent)',
              borderColor: 'var(--accent)',
              color: '#ffffff',
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
