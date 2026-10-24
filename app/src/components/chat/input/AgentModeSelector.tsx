import { useMemo } from 'react'
import { Shield } from 'lucide-react'
import Tooltip from '@/components/Tooltip'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import type { AgentMode } from '@/store/types'

export interface AgentModeSelectorProps {
  mode: AgentMode
  onChange: (v: AgentMode) => void
  disabled?: boolean
}

type CanonicalMode = 'explore' | 'workspace' | 'auto_review' | 'unrestricted'

function toCanonicalMode(m: AgentMode | string): CanonicalMode {
  const norm = String(m || '').trim().toLowerCase()
  switch (norm) {
    case 'explore':
    case 'plan':
    case 'read_only':
      return 'explore'
    case 'auto_review':
    case 'auto':
    case 'auto_confirm':
    case 'tdd':
      return 'auto_review'
    case 'unrestricted':
    case 'yolo':
      return 'unrestricted'
    case 'workspace':
    case 'ask':
    case 'manual':
    default:
      return 'workspace'
  }
}

export default function AgentModeSelector({ mode, onChange, disabled = false }: AgentModeSelectorProps) {
  const language = useStore((s) => s.language)
  const isZh = language.startsWith('zh')

  const AGENT_MODES: {
    value: CanonicalMode
    label: string
    tooltip: string
  }[] = useMemo(() => [
    {
      value: 'explore',
      label: t('agent.mode.explore', isZh ? '仅查看' : 'Explore'),
      tooltip: t('agent.mode.explore.desc', isZh ? '仅查看 — 只读探索与检查，禁止文件修改与破坏性命令' : 'Explore — Read-only exploration and inspection; strictly blocks file edits'),
    },
    {
      value: 'workspace',
      label: t('agent.mode.workspace', isZh ? '工作区' : 'Workspace'),
      tooltip: t('agent.mode.workspace.desc', isZh ? '工作区内修改 — 受控修改工作区，外部命令显式确认（默认）' : 'Workspace — Controlled workspace mutations; explicit confirmation for external commands (default)'),
    },
    {
      value: 'auto_review',
      label: t('agent.mode.auto_review', isZh ? '自动审查' : 'Auto Review'),
      tooltip: t('agent.mode.auto_review.desc', isZh ? '自动审查 — 监督式 TDD 闭环，自动执行测试并触发自我修复' : 'Auto Review — Supervised TDD loop; runs tests and triggers self-healing on failure'),
    },
    {
      value: 'unrestricted',
      label: t('agent.mode.unrestricted', isZh ? '完全权限' : 'Unrestricted'),
      tooltip: t('agent.mode.unrestricted.desc', isZh ? '完全权限 — 沙箱内自主运行，零弹窗确认，后台安全守卫' : 'Unrestricted — Autonomous execution in sandbox with zero popups and safety guards'),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [language, isZh, t])

  const activeCanonical = toCanonicalMode(mode)

  return (
    <div
      className="flex items-center gap-0.5"
      role="group"
      aria-label={t('agent.mode.group_label', isZh ? '智能体运行模式' : 'Agent Operating Mode')}
    >
      <Shield size={12} className="text-[var(--text-muted)] shrink-0 mr-0.5" aria-hidden="true" />
      {AGENT_MODES.map((m) => {
        const isActive = m.value === activeCanonical
        return (
          <Tooltip key={m.value} text={m.tooltip}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(m.value)}
              aria-pressed={isActive}
              aria-label={m.tooltip}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-[6px] border outline-none select-none transition-colors duration-150 motion-reduce:transition-none motion-reduce:transform-none active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                isActive
                  ? 'bg-[var(--bg-secondary)] text-[var(--accent)] border-[var(--border)] font-semibold shadow-xs'
                  : 'bg-transparent text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--border)]/40'
              }`}
            >
              {m.label}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
