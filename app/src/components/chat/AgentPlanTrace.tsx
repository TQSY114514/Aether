import { useState } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'
import { t } from '@/utils/i18n'

// ───────────────────────────────────────────────────────────────────────────
// Agent reasoning trace — a collapsible timeline of the agent's per-round
// thoughts during a tool-calling loop. Each entry is one Plan→Act→Observe
// round's assistant text. Rendered above the tool-call blocks in MessageBubble.
//
// Visual: each step gets a numbered node + the round's reasoning text. The
// header shows step count + a preview of the latest thought.
// ───────────────────────────────────────────────────────────────────────────

export default function AgentPlanTrace({ steps }: { steps: { step: number; depth: number; assistantText: string }[] }) {
  const [open, setOpen] = useState(false)
  if (!steps || steps.length === 0) return null
  const last = steps[steps.length - 1]
  return (
    <div className="rounded-lg border mb-2 overflow-hidden" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--border)] transition-colors">
        {open ? <ChevronDown size={12} style={{ color: 'var(--accent)' }} /> : <ChevronRight size={12} style={{ color: 'var(--accent)' }} />}
        <Brain size={12} style={{ color: 'var(--accent)' }} />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{t('agent.trace.title')}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>{steps.length} {t('agent.trace.steps')}</span>
        <span className="ml-auto truncate max-w-[45%] text-[10px]" style={{ color: 'var(--text-muted)' }}>{last.assistantText.slice(0, 60)}</span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 pt-1 space-y-2.5 max-h-60 overflow-y-auto">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-2.5">
              {/* Timeline node + connector */}
              <div className="flex flex-col items-center shrink-0">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium"
                  style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>{s.step}</div>
                {i < steps.length - 1 && <div className="w-px flex-1 mt-0.5" style={{ backgroundColor: 'var(--border)' }} />}
              </div>
              {/* Step body: badge + reasoning */}
              <div className="flex-1 min-w-0 pb-1">
                <span className="text-[9px] font-medium uppercase tracking-wide" style={{ color: 'var(--accent)' }}>{t('agent.trace.plan')}</span>
                <div className="text-[11px] leading-relaxed whitespace-pre-wrap mt-0.5" style={{ color: 'var(--text-secondary)' }}>{s.assistantText}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
