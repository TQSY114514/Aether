import { useState, useEffect, useCallback, useRef } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { HelpCircle, X, Check } from 'lucide-react'

// ───────────────────────────────────────────────────────────────────────────
// Inline AskUserQuestion Card (docked above ChatInput).
// Scoped to the active session so background sessions never steal focus
// globally; Sidebar bubbles waiting sessions into the "Needs Input" group.
// ───────────────────────────────────────────────────────────────────────────
export default function QuestionDialog() {
  const pending = useStore((s) => s.pendingQuestions)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const resolve = useStore((s) => s.resolveQuestion)

  const req = pending.find((q) => q.sessionId == null || q.sessionId === currentSessionId) || null

  const [selections, setSelections] = useState<Record<number, string>>({})
  const [custom, setCustom] = useState<Record<number, string>>({})
  const cardRef = useRef<HTMLDivElement>(null)

  // Reset local form state whenever active request changes
  useEffect(() => {
    setSelections({})
    setCustom({})
  }, [req?.reqId])

  const cancel = useCallback(() => {
    if (!req) return
    resolve(
      req.reqId,
      req.questions.map((q) => ({ question: q.question, answer: '(cancelled)' }))
    )
    setSelections({})
    setCustom({})
  }, [req, resolve])

  const submitWith = useCallback(
    (overrideSelections?: Record<number, string>) => {
      if (!req) return
      const activeSel = overrideSelections || selections
      const answers = req.questions.map((q, i) => {
        const sel = activeSel[i]
        if (sel === '__other__') {
          return { question: q.question, answer: (custom[i] || '').trim() || '(other)' }
        }
        return { question: q.question, answer: sel || q.options[0]?.label || '' }
      })
      resolve(req.reqId, answers)
      setSelections({})
      setCustom({})
    },
    [req, selections, custom, resolve]
  )

  const isSingleQuestion = req ? req.questions.length === 1 : false

  // Quick numeric key selection (1-9) highlights option; Enter submits (never auto-submits on click/key).
  useEffect(() => {
    if (!req) return
    const firstQ = req.questions[0]
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || target?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.isComposing || (e as any).nativeEvent?.isComposing) return

      if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
        return
      }
      if (e.key === 'Enter') {
        const ready = !req.questions.some(
          (_, i) => !selections[i] || (selections[i] === '__other__' && !(custom[i] || '').trim())
        )
        if (ready) {
          e.preventDefault()
          submitWith()
        }
        return
      }
      if (isSingleQuestion && firstQ) {
        const num = Number(e.key)
        if (Number.isInteger(num) && num >= 1 && num <= firstQ.options.length) {
          e.preventDefault()
          setSelections((s) => ({ ...s, 0: firstQ.options[num - 1].label }))
        } else if (num === firstQ.options.length + 1 && num <= 9) {
          e.preventDefault()
          setSelections((s) => ({ ...s, 0: '__other__' }))
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [req, isSingleQuestion, selections, custom, submitWith, cancel])

  if (!req) return null

  const firstQuestion = req.questions[0]
  const totalSingleOptions = isSingleQuestion && firstQuestion ? Math.min(9, firstQuestion.options.length + 1) : 0

  return (
    <div
      ref={cardRef}
      role="region"
      aria-label={t('agent.question.title')}
      className="mb-2 rounded-[10px] border p-3 shadow-sm inline-card-enter"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: 'var(--warning)' }}
          />
          <HelpCircle size={13.5} className="shrink-0" style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {t('agent.question.title')}
          </span>
          {isSingleQuestion && totalSingleOptions > 0 && (
            <span className="hidden sm:inline text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
              {t('agent.question.kbd_hint', totalSingleOptions)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={cancel}
          title={t('agent.question.cancel')}
          aria-label={t('agent.question.cancel')}
          className="p-1 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
        >
          <X size={13} />
        </button>
      </div>

      <div className="space-y-3.5 max-h-[260px] overflow-y-auto pr-0.5">
        {req.questions.map((q, qi) => (
          <div key={qi}>
            {q.header && (
              <div
                className="text-[10px] font-mono font-medium uppercase tracking-wide mb-1 px-1.5 py-0.5 rounded-[4px] inline-block"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
              >
                {q.header}
              </div>
            )}
            <p className="text-xs font-medium mb-1.5 leading-snug" style={{ color: 'var(--text-primary)' }}>
              {q.question}
            </p>
            <div className="space-y-1.5">
              {q.options.map((o, oi) => {
                const selected = selections[qi] === o.label
                return (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => setSelections((s) => ({ ...s, [qi]: o.label }))}
                    className="w-full text-left px-2.5 py-1.5 rounded-[6px] border flex items-start gap-2 hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
                    style={
                      selected
                        ? { borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)' }
                        : { borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }
                    }
                  >
                    <span
                      className="font-mono text-[10px] px-1.5 py-0.2 rounded-[4px] border shrink-0 mt-0.5 tabular-nums transition-colors"
                      style={
                        selected
                          ? { borderColor: 'var(--accent)', backgroundColor: 'var(--accent)', color: '#fff' }
                          : { borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)' }
                      }
                    >
                      {oi + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                        {o.label}
                      </div>
                      {o.description && (
                        <div className="text-[10.5px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
                          {o.description}
                        </div>
                      )}
                    </div>
                    {selected && <Check size={12} className="shrink-0 mt-1 text-[var(--accent)]" />}
                  </button>
                )
              })}

              <button
                type="button"
                onClick={() => setSelections((s) => ({ ...s, [qi]: '__other__' }))}
                className="w-full text-left px-2.5 py-1.5 rounded-[6px] border flex items-center gap-2 hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
                style={
                  selections[qi] === '__other__'
                    ? { borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)' }
                    : { borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }
                }
              >
                <span
                  className="font-mono text-[10px] px-1.5 py-0.2 rounded-[4px] border shrink-0 tabular-nums transition-colors"
                  style={
                    selections[qi] === '__other__'
                      ? { borderColor: 'var(--accent)', backgroundColor: 'var(--accent)', color: '#fff' }
                      : { borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)' }
                  }
                >
                  {q.options.length + 1}
                </span>
                <span className="text-xs" style={{ color: selections[qi] === '__other__' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {t('agent.question.other')}
                </span>
              </button>

              {selections[qi] === '__other__' && (
                <div className="flex items-center gap-1.5 pt-1">
                  <input
                    autoFocus
                    value={custom[qi] || ''}
                    onChange={(e) => setCustom((s) => ({ ...s, [qi]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.nativeEvent?.isComposing || e.key === 'Process') return
                      if (e.key === 'Enter') {
                        const ready = !req.questions.some(
                          (_, idx) => !selections[idx] || (selections[idx] === '__other__' && !(custom[idx] || '').trim())
                        )
                        if (ready) {
                          e.preventDefault()
                          submitWith()
                        }
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        cancel()
                      }
                    }}
                    placeholder={t('agent.question.type_answer')}
                    className="flex-1 px-2.5 py-1.5 text-xs rounded-[6px] border outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                    style={{
                      borderColor: 'var(--accent)',
                      backgroundColor: 'var(--content-bg)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 mt-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={cancel}
          className="px-3 py-1 text-xs rounded-[6px] border hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          {t('agent.question.cancel')}
        </button>
        <button
          type="button"
          onClick={() => submitWith()}
          disabled={req.questions.some((_, i) => !selections[i] || (selections[i] === '__other__' && !(custom[i] || '').trim()))}
          className="px-3 py-1 text-xs rounded-[6px] text-white font-medium hover:opacity-90 active:scale-[0.98] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-opacity cursor-pointer"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {t('agent.question.submit')}
        </button>
      </div>
    </div>
  )
}
