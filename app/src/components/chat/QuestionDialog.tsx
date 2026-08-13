import { useState } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { HelpCircle, X } from 'lucide-react'

type Question = { question: string; header?: string; options: { label: string; description?: string }[] }

// ───────────────────────────────────────────────────────────────────────────
// AskUserQuestion dialog. The agent calls the ask_user tool when it needs to
// clarify scope; this renders a tappable options dialog (an "Other" option is
// auto-added so the user can type a custom answer). The chosen answers go back
// to the tool loop as the tool result.
// ───────────────────────────────────────────────────────────────────────────
export default function QuestionDialog() {
  const pending = useStore((s) => s.pendingQuestions)
  const resolve = useStore((s) => s.resolveQuestion)
  const req = pending[0]
  // Track the selected option per question + custom text for "Other".
  const [custom, setCustom] = useState<Record<number, string>>({})
  if (!req) return null

  const submit = () => {
    const answers = req.questions.map((q, i) => {
      const sel = selections[i]
      if (sel === '__other__') return { question: q.question, answer: custom[i] || '(other)' }
      return { question: q.question, answer: sel || q.options[0]?.label || '' }
    })
    resolve(req.reqId, answers)
    setCustom({})
  }
  // selections lives in a ref-like state reset per request.
  const [selections, setSelections] = useState<Record<number, string>>({})

  return (
    <div className="fixed inset-0 z-[102] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-blur-fade" />
      <div className="relative w-full max-w-md rounded-2xl border shadow-xl p-5 animate-blur-fade"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(37,99,235,0.1)' }}>
            <HelpCircle size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('agent.question.title')}</h3>
        </div>
        <div className="space-y-4 mb-4">
          {req.questions.map((q, qi) => (
            <div key={qi}>
              {q.header && <div className="text-[10px] font-medium uppercase tracking-wide mb-1 px-1.5 py-0.5 rounded inline-block" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>{q.header}</div>}
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{q.question}</p>
              <div className="space-y-1.5">
                {q.options.map((o) => (
                  <button key={o.label} onClick={() => setSelections(s => ({ ...s, [qi]: o.label }))}
                    className="w-full text-left px-3 py-2 rounded-lg border transition-colors"
                    style={selections[qi] === o.label
                      ? { borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)' }
                      : { borderColor: 'var(--border)' }}>
                    <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{o.label}</div>
                    {o.description && <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{o.description}</div>}
                  </button>
                ))}
                {/* "Other" — let the user type a custom answer */}
                <button onClick={() => setSelections(s => ({ ...s, [qi]: '__other__' }))}
                  className="w-full text-left px-3 py-2 rounded-lg border transition-colors"
                  style={selections[qi] === '__other__'
                    ? { borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)' }
                    : { borderColor: 'var(--border)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('agent.question.other')}</div>
                </button>
                {selections[qi] === '__other__' && (
                  <input autoFocus value={custom[qi] || ''} onChange={(e) => setCustom(s => ({ ...s, [qi]: e.target.value }))}
                    placeholder={t('agent.question.type_answer')}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border outline-none" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => { resolve(req.reqId, req.questions.map(q => ({ question: q.question, answer: '(cancelled)' }))); setCustom({}) }}
            className="px-3.5 py-1.5 text-xs rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <span className="flex items-center gap-1"><X size={11} />{t('agent.question.cancel')}</span>
          </button>
          <button onClick={submit} disabled={req.questions.some((_, i) => !selections[i])}
            className="px-3.5 py-1.5 text-xs rounded-lg text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent)' }}>{t('agent.question.submit')}</button>
        </div>
      </div>
    </div>
  )
}
