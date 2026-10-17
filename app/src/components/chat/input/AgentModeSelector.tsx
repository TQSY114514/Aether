import { useMemo } from 'react'
import { Shield } from 'lucide-react'
import Tooltip from '@/components/Tooltip'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import type { AgentMode } from '../slashCommands'

export interface AgentModeSelectorProps {
  mode: AgentMode
  onChange: (v: AgentMode) => void
}

export default function AgentModeSelector({ mode, onChange }: AgentModeSelectorProps) {
  const language = useStore((s) => s.language)
  const AGENT_MODES: { value: AgentMode; label: string; color: string; tooltip: string }[] = useMemo(() => [
    { value: 'ask', label: t('agent.mode.ask'), color: 'var(--accent)', tooltip: t('agent.mode.ask.desc') },
    { value: 'auto', label: t('agent.mode.auto'), color: '#f97316', tooltip: t('agent.mode.auto.desc') },
    { value: 'yolo', label: t('agent.mode.yolo'), color: 'var(--error)', tooltip: t('agent.mode.yolo.desc') },
    { value: 'custom', label: t('agent.mode.custom', 'Custom'), color: '#8b5cf6', tooltip: t('agent.mode.custom.desc', 'Custom policy: configure per-tool permissions in settings') },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [language, t])

  const active = AGENT_MODES.find(m => m.value === mode) || AGENT_MODES[0]

  return (
    <div className="flex items-center gap-0.5">
      <Shield size={13} className="text-gray-400 shrink-0" />
      {AGENT_MODES.map(m => (
        <Tooltip key={m.value} text={m.tooltip}>
          <button
            onClick={() => onChange(m.value)}
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-md transition-all duration-150"
            style={m.value === active.value
              ? { backgroundColor: m.color + '20', color: m.color, boxShadow: `0 0 0 1px ${m.color}40` }
              : { color: 'var(--text-muted)', opacity: 0.6 }}
          >
            {m.label}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}
