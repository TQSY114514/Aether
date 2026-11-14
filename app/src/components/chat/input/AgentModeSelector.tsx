import { useMemo } from 'react'
import { Compass, Zap } from 'lucide-react'
import Tooltip from '@/components/Tooltip'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import type { AgentMode } from '@/store/types'

export interface AgentModeSelectorProps {
  mode: AgentMode
  onChange: (v: AgentMode) => void
  disabled?: boolean
  compact?: boolean
}

type BinaryMode = 'plan' | 'act'

function toBinaryMode(m: AgentMode | string): BinaryMode {
  const norm = String(m || '').trim().toLowerCase()
  switch (norm) {
    case 'plan':
    case 'explore':
    case 'read_only':
    case 'readonly':
    case 'read-only':
    case 'review':
      return 'plan'
    default:
      return 'act'
  }
}

export default function AgentModeSelector({ mode, onChange, disabled = false, compact = false }: AgentModeSelectorProps) {
  const language = useStore((s) => s.language)
  const isZh = language.startsWith('zh')

  const modes: {
    value: BinaryMode
    label: string
    tooltip: string
    Icon: typeof Compass
  }[] = useMemo(() => [
    {
      value: 'plan',
      label: t('agent.mode.plan', 'Plan'),
      tooltip: t(
        'agent.mode.plan.desc',
        isZh
          ? 'Plan (只读规划) — 允许工作区读取、代码搜索、只读 Git 与子代理探路；拦截文件写入与变更 Shell，输出结构化计划'
          : 'Plan (Read-Only) — Allows workspace reads, search, read-only git and subagent exploration; blocks writes and mutating shell'
      ),
      Icon: Compass,
    },
    {
      value: 'act',
      label: t('agent.mode.act', 'Act'),
      tooltip: t(
        'agent.mode.act.desc',
        isZh
          ? 'Act (默认行动) — 工作区内读写编辑与常规构建测试自动执行，写前自动快照并展示内联 Diff 回滚；仅工作区外路径、敏感凭证及高危 Shell 需确认'
          : 'Act (Default) — Auto-executes workspace reads, edits (with pre-write snapshot + inline Diff revert), and test commands; prompts only on high-risk operations'
      ),
      Icon: Zap,
    },
  ], [isZh])

  const activeMode = toBinaryMode(mode)

  return (
    <div
      className="inline-flex items-center p-0.5 rounded-[6px] border shrink-0"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
      role="group"
      aria-label={t('agent.mode.group_label', isZh ? '智能体运行模式' : 'Agent Operating Mode')}
    >
      {modes.map((m) => {
        const isActive = m.value === activeMode
        const Icon = m.Icon
        return (
          <Tooltip key={m.value} text={m.tooltip}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(m.value)}
              aria-pressed={isActive}
              aria-label={m.tooltip}
              className={`inline-flex items-center gap-1 rounded-[4px] font-medium outline-none select-none transition-colors duration-150 motion-reduce:transition-none motion-reduce:transform-none active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-[11px]'
              } ${
                isActive
                  ? 'bg-[var(--bg-primary)] text-[var(--accent)] font-semibold border border-[var(--border)]'
                  : 'bg-transparent text-[var(--text-muted)] border border-transparent hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon size={11} className="shrink-0" aria-hidden="true" />
              <span>{m.label}</span>
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
