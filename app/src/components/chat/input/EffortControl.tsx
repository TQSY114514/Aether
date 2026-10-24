import { useState, useEffect, useRef } from 'react'
import { Brain, ChevronDown } from 'lucide-react'
import { t } from '@/utils/i18n'
import type { EffortLevel } from '@/store/types'

export const EFFORT_LEVELS: { value: EffortLevel; labelKey: string; tokens: string }[] = [
  { value: 'minimal', labelKey: 'effort.minimal', tokens: '1k' },
  { value: 'low', labelKey: 'effort.low', tokens: '2k' },
  { value: 'medium', labelKey: 'effort.medium', tokens: '8k' },
  { value: 'high', labelKey: 'effort.high', tokens: '16k' },
  { value: 'max', labelKey: 'effort.max', tokens: '32k' },
]

export interface EffortControlProps {
  thinkingEnabled: boolean
  onToggleThinking: (v: boolean) => void
  level: EffortLevel
  onLevelChange: (v: EffortLevel) => void
  isBinary?: boolean
  compact?: boolean
}

export default function EffortControl({
  thinkingEnabled,
  onToggleThinking,
  level,
  onLevelChange,
  isBinary = false,
  compact = false,
}: EffortControlProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownOpen])

  const currentLevel = level === 'off' ? 'medium' : level
  const idx = Math.max(0, EFFORT_LEVELS.findIndex((l) => l.value === currentLevel))
  const fill = (idx / (EFFORT_LEVELS.length - 1)) * 100

  if (compact) {
    if (isBinary) {
      return (
        <button
          type="button"
          onClick={() => onToggleThinking(!thinkingEnabled)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-[6px] border text-[11px] font-medium transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          style={{ borderColor: 'var(--border)' }}
          title={t('effort.tooltip')}
          aria-label={t('effort.tooltip')}
        >
          <Brain
            size={11}
            className="shrink-0"
            style={{ color: thinkingEnabled ? 'var(--accent)' : 'var(--text-muted)' }}
          />
          <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {thinkingEnabled ? t('thinking.on', 'On') : t('thinking.off', 'Off')}
          </span>
        </button>
      )
    }

    const curTokens = thinkingEnabled ? EFFORT_LEVELS[idx]?.tokens || '8k' : t('thinking.off', 'Off')
    return (
      <div ref={dropdownRef} className="relative inline-block">
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-[6px] border text-[11px] font-medium transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          style={{ borderColor: 'var(--border)' }}
          title={t('effort.tooltip')}
          aria-label={t('effort.tooltip')}
        >
          <Brain
            size={11}
            className="shrink-0"
            style={{ color: thinkingEnabled ? 'var(--accent)' : 'var(--text-muted)' }}
          />
          <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {curTokens}
          </span>
          <ChevronDown size={10} className="text-[var(--text-muted)] shrink-0 opacity-70" />
        </button>

        {dropdownOpen && (
          <div
            className="absolute bottom-full left-0 mb-1 w-48 rounded-lg border shadow-lg p-2 z-50 animate-spring-up space-y-2 text-xs"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between border-b pb-1" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[10px] font-semibold text-[var(--text-muted)]">
                {t('quickdeck.thinking_depth', '思考深度 (Thinking)')}
              </span>
              <button
                type="button"
                onClick={() => onToggleThinking(!thinkingEnabled)}
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  backgroundColor: thinkingEnabled ? 'var(--accent)' : 'var(--border)',
                  color: thinkingEnabled ? '#fff' : 'var(--text-muted)',
                }}
              >
                {thinkingEnabled ? t('thinking.on', '开启') : t('thinking.off', '关闭')}
              </button>
            </div>

            <div className="space-y-1" style={{ opacity: thinkingEnabled ? 1 : 0.5 }}>
              {EFFORT_LEVELS.map((lvl) => {
                const isCur = currentLevel === lvl.value
                return (
                  <button
                    key={lvl.value}
                    type="button"
                    disabled={!thinkingEnabled}
                    onClick={() => {
                      onLevelChange(lvl.value)
                      setDropdownOpen(false)
                    }}
                    className="w-full flex items-center justify-between p-1 rounded-md text-[11px] hover:bg-[var(--bg-secondary)]"
                    style={isCur ? { backgroundColor: 'var(--content-bg)' } : {}}
                  >
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {t(lvl.labelKey)}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">{lvl.tokens}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

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
