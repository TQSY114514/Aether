import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { t } from '@/utils/i18n'
import type { SlashCommand } from '../slashCommands'

export interface SlashCommandMenuProps {
  commands: SlashCommand[]
  selectedIndex: number
  onSelectIndex: (index: number) => void
  onSelectCommand: (cmd: SlashCommand) => void
}

const CATEGORY_NAMES: Record<string, () => string> = {
  agent: () => t('slash.cat_agent', '智能体与控制'),
  dev: () => t('slash.cat_dev', '开发与验证'),
  session: () => t('slash.cat_session', '会话与工作流'),
}

export default function SlashCommandMenu({
  commands,
  selectedIndex,
  onSelectIndex,
  onSelectCommand,
}: SlashCommandMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const activeEl = menuRef.current?.querySelector('[aria-selected="true"]')
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (commands.length === 0) return null

  let lastCategory = ''

  return (
    <div
      ref={menuRef}
      className="slash-menu w-[440px] max-w-[calc(100vw-32px)] max-h-80 overflow-y-auto rounded-lg border shadow-xl z-50 text-xs select-none"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border)',
      }}
      role="listbox"
      aria-label="Slash commands"
    >
      <div className="p-1 space-y-0.5">
        {commands.map((cmd, idx) => {
          const active = idx === selectedIndex
          const showCatHeader = cmd.category && cmd.category !== lastCategory
          if (cmd.category) {
            lastCategory = cmd.category
          }

          return (
            <div key={cmd.id}>
              {showCatHeader && (
                <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)] opacity-75 border-t first:border-t-0 mt-1 first:mt-0" style={{ borderColor: 'var(--border)' }}>
                  {CATEGORY_NAMES[cmd.category]?.() || cmd.category}
                </div>
              )}
              <div
                role="option"
                aria-selected={active}
                className={cn(
                  'flex flex-col gap-1 px-3 py-2 rounded-md cursor-pointer transition-colors',
                  active ? 'bg-[var(--bg-secondary)]' : 'hover:bg-[var(--bg-secondary)]/50'
                )}
                onMouseEnter={() => onSelectIndex(idx)}
                onClick={() => onSelectCommand(cmd)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="font-mono text-[12px] font-semibold text-[var(--accent)] shrink-0">
                      /{cmd.id}
                    </span>
                    {cmd.paramHint && (
                      <span className="font-mono text-[10px] text-[var(--text-muted)] opacity-75 truncate">
                        {cmd.paramHint}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-[var(--text-primary)] shrink-0 ml-2">
                    {cmd.name}
                  </span>
                </div>
                {cmd.description && (
                  <div className="text-[11px] text-[var(--text-muted)] leading-snug line-clamp-2">
                    {cmd.description}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div
        className="px-2 py-1 border-t flex items-center justify-between text-[9px] text-[var(--text-muted)] font-mono"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <span>Tab {t('slash.hint_autocomplete', '补全')}</span>
        <span>↵ {t('slash.hint_execute', '执行')}</span>
        <span>↑↓ {t('slash.hint_select', '选择')}</span>
      </div>
    </div>
  )
}
