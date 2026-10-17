import { cn } from '@/lib/utils'
import type { SlashCommand } from '../slashCommands'

export interface SlashCommandMenuProps {
  commands: SlashCommand[]
  selectedIndex: number
  onSelectIndex: (index: number) => void
  onSelectCommand: (cmd: SlashCommand) => void
}

export default function SlashCommandMenu({
  commands,
  selectedIndex,
  onSelectIndex,
  onSelectCommand,
}: SlashCommandMenuProps) {
  if (commands.length === 0) return null

  return (
    <div className="slash-menu" role="listbox" aria-label="Slash commands">
      {commands.map((cmd, idx) => {
        const active = idx === selectedIndex
        return (
          <div
            key={cmd.id}
            role="option"
            aria-selected={active}
            className={cn('slash-item', active && 'active')}
            onMouseEnter={() => onSelectIndex(idx)}
            onClick={() => onSelectCommand(cmd)}
          >
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-mono text-[11px] font-semibold text-[var(--accent)] shrink-0">/{cmd.id}</span>
                <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{cmd.name}</span>
              </div>
            </div>
            {cmd.description && (
              <div className="text-[10px] truncate leading-tight" style={{ color: 'var(--text-muted)' }}>
                {cmd.description}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
