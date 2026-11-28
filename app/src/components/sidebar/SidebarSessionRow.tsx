import { memo } from 'react'
import { MessageSquare, Trash2, Pin, Loader2, Folder } from 'lucide-react'
import type { Session } from '@/types'
import { t } from '@/utils/i18n'
import HoverMarquee from '@/components/ui/HoverMarquee'

interface SidebarSessionRowProps {
  session: Session
  isActive: boolean
  isNeedsInput: boolean
  isStreaming: boolean
  isRenaming: boolean
  renameValue: string
  dirTag: string
  timeLabel: string
  previewText: string
  onSelect: () => void
  onStartRename: () => void
  onRenameChange: (val: string) => void
  onRenameSubmit: () => void
  onRenameCancel: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onTogglePin: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
}

function SidebarSessionRow({
  session,
  isActive,
  isNeedsInput,
  isStreaming,
  isRenaming,
  renameValue,
  dirTag,
  timeLabel,
  previewText,
  onSelect,
  onStartRename,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onContextMenu,
  onTogglePin,
  onDelete,
}: SidebarSessionRowProps) {
  return (
    <div
      onClick={onSelect}
      onDoubleClick={onStartRename}
      onContextMenu={onContextMenu}
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm mb-px session-item-interactive ${
        isActive ? 'shadow-soft' : 'border border-transparent hover:bg-[var(--bg-secondary)]'
      }`}
      style={isActive ? { background: 'var(--content-bg)', boxShadow: 'inset 2px 0 0 var(--accent), 0 1px 3px rgba(0,0,0,0.06)' } : {}}
    >
      {isNeedsInput ? (
        <span
          className="w-2 h-2 rounded-full shrink-0 animate-pulse motion-reduce:animate-none"
          style={{ backgroundColor: 'var(--warning)' }}
          title={t('sidebar.badge.needs_input')}
        />
      ) : session.pinned ? (
        <Pin size={12} className="text-amber-500 shrink-0" fill="currentColor" />
      ) : (
        <MessageSquare size={14} className="text-[var(--text-muted)] shrink-0" />
      )}
      {!isNeedsInput && isStreaming && (
        <Loader2 size={11} className="shrink-0 animate-spin" style={{ color: 'var(--accent)' }} />
      )}
      {isRenaming ? (
        <input
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameSubmit()
            if (e.key === 'Escape') onRenameCancel()
          }}
          onBlur={onRenameSubmit}
          autoFocus
          className="flex-1 text-[13px] px-1.5 py-0.5 rounded border outline-none bg-[var(--content-bg)]"
          style={{ borderColor: 'var(--accent)' }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5 leading-tight">
            <HoverMarquee
              text={session.title || t('chat.new')}
              className="flex-1 min-w-0 text-[13px]"
              style={{ color: 'var(--text-primary)' }}
            />
            {isNeedsInput ? (
              <span
                className="text-[9.5px] font-mono px-1 py-0.2 rounded-[4px] border shrink-0 group-hover:hidden"
                style={{ borderColor: 'var(--warning)', color: 'var(--warning)', backgroundColor: 'var(--bg-primary)' }}
              >
                {t('sidebar.badge.needs_input')}
              </span>
            ) : (
              <span className="text-[10px] shrink-0 tabular-nums group-hover:hidden" style={{ color: 'var(--text-muted)' }}>
                {timeLabel}
              </span>
            )}
          </div>
          {(session.last_message || dirTag) && (
            <div className="flex items-center gap-1.5 mt-1 min-w-0">
              {dirTag && (
                <span
                  title={session.cwd || dirTag}
                  className="inline-flex items-center gap-0.5 text-[9.5px] font-mono px-1 py-0.2 rounded-[4px] border shrink-0 max-w-[82px]"
                  style={{
                    borderColor: 'var(--border)',
                    color: isActive ? 'var(--text-secondary)' : 'var(--text-muted)',
                    backgroundColor: 'var(--bg-primary)',
                  }}
                >
                  <Folder size={8.5} className="shrink-0 opacity-75" />
                  <span className="truncate">{dirTag}</span>
                </span>
              )}
              {session.last_message && (
                <HoverMarquee
                  text={previewText}
                  className="flex-1 min-w-0 text-[11px] leading-tight"
                  style={{ color: 'var(--text-muted)' }}
                />
              )}
            </div>
          )}
        </div>
      )}
      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 -mr-1">
        <button
          onClick={onTogglePin}
          className={`p-1 rounded hover:bg-[var(--border)] shrink-0 icon-btn-silky ${session.pinned ? 'text-amber-500' : 'text-[var(--text-muted)]'}`}
          title={session.pinned ? t('sidebar.unpin', 'Unpin') : t('sidebar.pin', 'Pin')}
        >
          <Pin size={11} />
        </button>
        <button
          onClick={onDelete}
          className="p-1 rounded hover:bg-[var(--border)] shrink-0 icon-btn-silky"
          title={t('chat.delete')}
          aria-label={t('chat.delete')}
        >
          <Trash2 size={12} className="text-gray-400" />
        </button>
      </div>
    </div>
  )
}

export default memo(SidebarSessionRow)
