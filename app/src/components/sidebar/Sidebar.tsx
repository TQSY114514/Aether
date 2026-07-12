import { useState, useMemo, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { useUI } from '@/components/ui/feedback'
import { MessageSquare, Plus, Server, User, Settings, ChevronLeft, Trash2, Search, Pin, Trophy, DollarSign, Brain } from 'lucide-react'
import type { ViewType, Session } from '@/types'
import { t } from '@/utils/i18n'

function getSessionGroups(sessions: Session[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const thisWeek = new Date(today); thisWeek.setDate(thisWeek.getDate() - 7)
  const groups: { label: string; sessions: Session[] }[] = [
    { label: t('sidebar.group.pinned'), sessions: [] },
    { label: t('sidebar.group.today'), sessions: [] },
    { label: t('sidebar.group.yesterday'), sessions: [] },
    { label: t('sidebar.group.week'), sessions: [] },
    { label: t('sidebar.group.older'), sessions: [] },
  ]
  for (const s of sessions) {
    const date = new Date(s.updated_at || s.created_at)
    if (s.pinned) { groups[0].sessions.push(s); continue }
    if (date >= today) { groups[1].sessions.push(s); continue }
    if (date >= yesterday) { groups[2].sessions.push(s); continue }
    if (date >= thisWeek) { groups[3].sessions.push(s); continue }
    groups[4].sessions.push(s)
  }
  return groups.filter(g => g.sessions.length > 0)
}

export default function Sidebar() {
  const sessions = useStore((s) => s.sessions)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const currentView = useStore((s) => s.currentView)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const selectSession = useStore((s) => s.selectSession)
  const createSession = useStore((s) => s.createSession)
  const deleteSession = useStore((s) => s.deleteSession)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const loadSessions = useStore((s) => s.loadSessions)
  const { confirm } = useUI()

  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredSessions = useMemo(() =>
    searchQuery ? sessions.filter(s => (s.title || '').toLowerCase().includes(searchQuery.toLowerCase())) : sessions,
    [sessions, searchQuery]
  )
  const groups = useMemo(() => getSessionGroups(filteredSessions), [filteredSessions])

  const handleDoubleClick = (session: Session) => {
    setRenamingId(session.id); setRenameValue(session.title || '')
  }
  const handleRenameSubmit = useCallback(async () => {
    if (renamingId && renameValue.trim()) {
      await window.electronAPI.session.rename(renamingId, renameValue.trim())
      loadSessions()
    }
    setRenamingId(null)
  }, [renamingId, renameValue, loadSessions])

  // A session keeps the default placeholder title ("新会话"/"新对话") until the
  // AI summary is generated. Until then, show a preview of the first message.
  const isPlaceholderTitle = (title: string | null) => {
    if (!title) return true
    return title === '新会话' || title === '新对话' || title === 'New Chat'
  }
  const previewOf = (text: string) => (text || '').replace(/\s+/g, ' ').trim().slice(0, 32)

  useEffect(() => { loadSessions() }, [loadSessions])

  return (
    <div className="w-[260px] h-full flex flex-col shrink-0" style={{ backgroundColor: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>
      <div className="h-12 flex items-center justify-between px-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>AetherAI</span>
        <button onClick={toggleSidebar} className="p-1.5 rounded-md hover:bg-[var(--border)] transition-colors">
          <ChevronLeft size={16} className="text-gray-400" />
        </button>
      </div>
      <div className="p-2">
        <button onClick={() => { createSession(); setCurrentView('chat') }} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border bg-white hover:bg-[var(--bg-secondary)] transition-colors" style={{ borderColor: 'var(--border)' }}>
          <Plus size={16} className="text-gray-500" />{t('chat.new')}
        </button>
      </div>
      <div className="px-2 pb-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border text-sm" style={{ borderColor: 'var(--border)' }}>
          <Search size={14} className="text-gray-400 shrink-0" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('sidebar.search')} className="w-full bg-transparent outline-none text-sm" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 scroll-bounce">
        {groups.length === 0 && (
          <div className="text-center py-8 text-xs" style={{ color: 'var(--text-muted)' }}>
            {searchQuery ? t('sidebar.no_match') : t('sidebar.no_sessions')}
          </div>
        )}
        {groups.map((group) => (
          <div key={group.label}>
            <div className="session-date">{group.label}</div>
            {group.sessions.map((session) => (
              <div key={session.id} onClick={() => { selectSession(session.id); setCurrentView('chat') }}
                onDoubleClick={() => handleDoubleClick(session)}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-all mb-px ${currentSessionId === session.id ? 'bg-white border shadow-soft relative' : 'hover:bg-white/50'}`}
                style={{ borderColor: 'var(--border)' }}>
                {session.pinned ? <Pin size={12} className="text-amber-500 shrink-0" fill="currentColor" />
                  : <MessageSquare size={14} className="text-gray-400 shrink-0" />}
                {renamingId === session.id ? (
                  <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setRenamingId(null) }}
                    onBlur={handleRenameSubmit} autoFocus
                    className="flex-1 text-[13px] px-1.5 py-0.5 rounded border outline-none bg-white"
                    style={{ borderColor: 'var(--accent)' }} onClick={(e) => e.stopPropagation()} />
                ) : (
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[13px] leading-tight" style={{ color: 'var(--text-primary)' }}>
                      {session.title || t('chat.new')}
                    </div>
                    {session.last_message && (
                      <div className="truncate text-[11px] leading-tight mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {previewOf(session.last_message)}
                      </div>
                    )}
                  </div>
                )}
                <button onClick={async (e) => { e.stopPropagation()
                    const ok = await confirm({ title: t('chat.delete_confirm_title'), description: t('chat.delete_confirm_desc'), confirmText: t('chat.delete'), danger: true })
                    if (ok) deleteSession(session.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--border)] transition-all">
                  <Trash2 size={12} className="text-gray-400" />
                </button>
              </div>
            ))}
          </div>
        ))}
        {!searchQuery && (
          <div className="text-[10px] text-center py-2" style={{ color: 'var(--text-muted)' }}>{t('sidebar.new_chat_tip')}</div>
        )}
      </div>
      <div className="p-2 space-y-0.5" style={{ borderTop: '1px solid var(--border)' }}>
        <NavItem icon={Server} label={t('sidebar.nav.models')} active={currentView === 'models'} onClick={() => setCurrentView('models')} />
        <NavItem icon={User} label={t('sidebar.nav.personas')} active={currentView === 'agents'} onClick={() => setCurrentView('agents')} />
        <NavItem icon={Trophy} label={t('sidebar.nav.arena')} active={currentView === 'scores'} onClick={() => setCurrentView('scores')} />
        <NavItem icon={DollarSign} label={t('sidebar.nav.tokens')} active={currentView === 'tokens'} onClick={() => setCurrentView('tokens')} />
        <NavItem icon={Brain} label={t('sidebar.nav.memory')} active={currentView === 'memory'} onClick={() => setCurrentView('memory')} />
        <NavItem icon={Settings} label={t('sidebar.nav.settings')} active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />
      </div>
    </div>
  )
}

function NavItem({ icon: Icon, label, active, onClick }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${active ? 'bg-white border shadow-soft' : 'hover:bg-white/50'}`} style={{ borderColor: 'var(--border)' }}>
      <Icon size={16} className="text-gray-500" />{label}
    </button>
  )
}