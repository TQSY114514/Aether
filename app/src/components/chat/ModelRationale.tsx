import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { ChevronDown, ChevronRight, Zap, DollarSign, Gauge } from 'lucide-react'

// Use the global ModelSuggestion type from env.d.ts
declare global {
  interface ModelSuggestion {
    suggestedModelId: number | null
    reason: string
    reasonParts?: ModelSuggestionReasonParts
    heuristicScores?: { modelId: number; modelName: string; family: string; heuristic: number; eloScore: number | null; blended: number }[]
    confidence: number
  }
}

function scoreBar(value: number, max: number, color: string) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-16 rounded-full" style={{ backgroundColor: 'var(--border)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[9px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{value}</span>
    </div>
  )
}

export default function ModelRationale({ suggestion, onClose }: {
  suggestion: ModelSuggestion | null
  onClose: () => void
}) {
  if (!suggestion?.reasonParts) return null
  const rp = suggestion.reasonParts
  if (rp.noMatch) return null

  return (
    <div className="rounded-lg border mt-1.5 overflow-hidden" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
      <div className="px-2.5 pb-2.5 space-y-1.5">
        {rp.eloScore != null && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Zap size={9} style={{ color: 'var(--warning)' }} />
              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>ELO</span>
            </div>
            {scoreBar(Number(rp.eloScore), 1400, 'var(--warning)')}
          </div>
        )}
        {rp.heuristic != null && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Gauge size={9} style={{ color: 'var(--accent)' }} />
              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{t('model.rationale.fit', 'Fit')}</span>
            </div>
            {scoreBar(rp.heuristic ?? 0, 100, 'var(--accent)')}
          </div>
        )}
        {rp.confidence != null && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <DollarSign size={9} style={{ color: 'var(--success)' }} />
              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{t('model.rationale.confidence', 'Confidence')}</span>
            </div>
            {scoreBar(rp.confidence, 100, 'var(--success)')}
          </div>
        )}
        {rp.taskLabel && (
          <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            {t('model.rationale.task', 'Task')}: {rp.taskLabel}
          </div>
        )}
        {rp.family && (
          <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            {t('model.rationale.family', 'Family')}: {rp.family}
          </div>
        )}
        {rp.closeRace && rp.runnerUpName && (
          <div className="text-[9px]" style={{ color: 'var(--warning)' }}>
            {t('model.rationale.close', 'Close race')}: +{rp.gap} vs {rp.runnerUpName}
          </div>
        )}
      </div>
    </div>
  )
}
