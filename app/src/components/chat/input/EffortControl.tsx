import { Brain } from 'lucide-react'
import { t } from '@/utils/i18n'
import type { EffortLevel } from '@/store/types'

export const EFFORT_LEVELS: { value: EffortLevel; labelKey: string }[] = [
  { value: 'minimal', labelKey: 'effort.minimal' },
  { value: 'low', labelKey: 'effort.low' },
  { value: 'medium', labelKey: 'effort.medium' },
  { value: 'high', labelKey: 'effort.high' },
  { value: 'max', labelKey: 'effort.max' },
]

export interface EffortControlProps {
  thinkingEnabled: boolean
  onToggleThinking: (v: boolean) => void
  level: EffortLevel
  onLevelChange: (v: EffortLevel) => void
  isBinary?: boolean
}

export default function EffortControl({
  thinkingEnabled,
  onToggleThinking,
  level,
  onLevelChange,
  isBinary = false,
}: EffortControlProps) {
  const currentLevel = level === 'off' ? 'medium' : level
  const idx = Math.max(0, EFFORT_LEVELS.findIndex(l => l.value === currentLevel))
  const fill = (idx / (EFFORT_LEVELS.length - 1)) * 100
  return (
    <div className="flex items-center gap-1.5" title={t('effort.tooltip')}>
      <button
        type="button"
        onClick={() => onToggleThinking(!thinkingEnabled)}
        className={`thinking-toggle ${thinkingEnabled ? 'is-on' : 'is-off'}`}
        aria-label={t('effort.tooltip')}
        aria-pressed={thinkingEnabled}
      >
        <Brain size={13} />
      </button>
      {!isBinary && (
        <>
          <input
            type="range"
            min={0}
            max={4}
            step={1}
            value={idx}
            onChange={(e) => onLevelChange(EFFORT_LEVELS[parseInt(e.target.value, 10)].value)}
            className="effort-slider w-16 sm:w-20"
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
