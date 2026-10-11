import { Brain } from 'lucide-react'
import { t } from '@/utils/i18n'

export const EFFORT_LEVELS = [
  { value: 'low' as const, labelKey: 'effort.low' },
  { value: 'medium' as const, labelKey: 'effort.medium' },
  { value: 'high' as const, labelKey: 'effort.high' },
]

export interface EffortControlProps {
  thinkingEnabled: boolean
  onToggleThinking: (v: boolean) => void
  level: 'low' | 'medium' | 'high'
  onLevelChange: (v: 'low' | 'medium' | 'high') => void
  isBinary?: boolean
}

export default function EffortControl({
  thinkingEnabled,
  onToggleThinking,
  level,
  onLevelChange,
  isBinary = false,
}: EffortControlProps) {
  const idx = Math.max(0, EFFORT_LEVELS.findIndex(l => l.value === level))
  const fill = (idx / (EFFORT_LEVELS.length - 1)) * 100
  return (
    <div className="flex items-center gap-1.5" title={t('effort.tooltip')}>
      <button
        type="button"
        onClick={() => onToggleThinking(!thinkingEnabled)}
        className={`thinking-toggle ${thinkingEnabled ? 'is-on' : 'is-off'}`}
        aria-label={t('effort.tooltip')}
      >
        <Brain size={13} />
      </button>
      {!isBinary && (
        <>
          <input
            type="range"
            min={0}
            max={2}
            step={1}
            value={idx}
            onChange={(e) => onLevelChange(EFFORT_LEVELS[parseInt(e.target.value, 10)].value)}
            className="effort-slider w-14 sm:w-16"
            disabled={!thinkingEnabled}
            style={{ ['--fill' as string]: `${fill}%` }}
          />
          <span className="text-[10px] w-6 tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {t(EFFORT_LEVELS[idx].labelKey)}
          </span>
        </>
      )}
    </div>
  )
}
