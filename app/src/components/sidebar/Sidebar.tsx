import { useState, useMemo, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { useUI } from '@/components/ui/feedback'
import { MessageSquare, Plus, Settings, ChevronLeft, Trash2, Search, Pin, Download, Loader2, TerminalSquare, PanelLeft, FlaskConical, Folder } from 'lucide-react'
import type { Session } from '@/types'
import { t } from '@/utils/i18n'
import { stripChannelMarkers } from '@/utils/markdown'
import HoverMarquee from '@/components/ui/HoverMarquee'
import QuickControlDeck from './QuickControlDeck'


const PLACEHOLDER_TITLES = new Set(['新会话', '新对话', 'New Chat'])

function getDirTag(cwd: string | null | undefined): string {
  if (!cwd) return ''
  const clean = String(cwd).replace(/[\\/]+$/, '')
  if (!clean) return cwd
  const parts = clean.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || clean
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (isNaN(then)) return ''
  const diff = Date.now() - then
  const min = Math.floor(diff / 60000)
  if (min < 1) return t('time.just_now')
  if (min < 60) return t('time.minutes_ago', min)
  const hr = Math.floor(min / 60)
  if (hr < 24) return t('time.hours_ago', hr)
  const day = Math.floor(hr / 24)
  if (day === 1) return t('time.yesterday')
  if (day < 7) return t('time.days_ago', day)
  return new Date(then).toLocaleDateString([], { month: 'numeric', day: 'numeric' })
}

function getSessionGroups(sessions: Session[], needsInputIds: Set<number>) {
  const now = Date.now()
  const todayStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime()
  const yesterdayStart = todayStart - 86400000
  const weekStart = todayStart - 7 * 86400000
  const needsInput: Session[] = []
  const pinned: Session[] = []
  const groups: { label: string; sessions: Session[]; count: number; kind?: 'needs_input' }[] = [
    { label: t('sidebar.group.today'), sessions: [], count: 0 },
    { label: t('sidebar.group.yesterday'), sessions: [], count: 0 },
    { label: t('sidebar.group.week'), sessions: [], count: 0 },
    { label: t('sidebar.group.older'), sessions: [], count: 0 },
  ]
  for (const s of sessions) {
    if (needsInputIds.has(s.id)) { needsInput.push(s); continue }
    if (s.pinned) { pinned.push(s); continue }
    const raw = s.updated_at || s.created_at || ''
    const iso = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z'
    const date = new Date(iso).getTime()
    if (date >= todayStart) { groups[0].sessions.push(s); groups[0].count++; continue }
    if (date >= yesterdayStart) { groups[1].sessions.push(s); groups[1].count++; continue }
    if (date >= weekStart) { groups[2].sessions.push(s); groups[2].count++; continue }
    groups[3].sessions.push(s); groups[3].count++
  }
  // Needs Input first (highest attention priority), then Pinned, then date groups.
  const result: { label: string; sessions: Session[]; count: number; kind?: 'needs_input' }[] = []
  if (needsInput.length > 0) {
    needsInput.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    result.push({ label: t('sidebar.group.needs_input'), sessions: needsInput, count: needsInput.length, kind: 'needs_input' })
  }
  if (pinned.length > 0) {
    pinned.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    result.push({ label: t('sidebar.group.pinned'), sessions: pinned, count: pinned.length })
  }
  for (const g of groups) {
    if (g.sessions.length > 0) result.push(g)
  }
  return result
}

export default function Sidebar() {
  const sessions = useStore((s) => s.sessions)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const language = useStore((s) => s.language)
  const pendingQuestions = useStore((s) => s.pendingQuestions)
  const permissionRequests = useStore((s) => s.permissionRequests)
  const activeStreamingIds = useStore((s) => {
    const keys = Object.keys(s.streamingBySession)
    return keys.length > 0 ? keys.filter(id => Boolean(s.streamingBySession[Number(id)])).join(',') : ''
  })
  const currentView = useStore((s) => s.currentView)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const selectSession = useStore((s) => s.selectSession)
  const deleteSession = useStore((s) => s.deleteSession)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const loadSessions = useStore((s) => s.loadSessions)
  const { confirm } = useUI()

  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [cwdFilter, setCwdFilter] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; session: Session } | null>(null)
  const lowerQuery = searchQuery.toLowerCase()

  const needsInputIds = useMemo(() => {
    const ids = new Set<number>()
    for (const q of pendingQuestions) {
      if (typeof q.sessionId === 'number') ids.add(q.sessionId)
    }
    for (const r of permissionRequests) {
      if (typeof r.sessionId === 'number') ids.add(r.sessionId)
    }
    return ids
  }, [pendingQuestions, permissionRequests])

  const visibleSessions = useMemo(() => {
    // Show sessions that have had at least one message or active state.
    const streamingSet = new Set(activeStreamingIds ? activeStreamingIds.split(',') : [])
    return sessions.filter(
      (s) =>
        s.last_message ||
        (s.title && !PLACEHOLDER_TITLES.has(s.title)) ||
        streamingSet.has(String(s.id)) ||
        needsInputIds.has(s.id)
    )
  }, [sessions, activeStreamingIds, needsInputIds])

  const cwdOptions = useMemo(() => {
    const map = new Map<string, { cwd: string; label: string; count: number }>()
    for (const s of visibleSessions) {
      if (!s.cwd) continue
      const key = s.cwd.replace(/[\\/]+$/, '').toLowerCase()
      if (!key) continue
      const existing = map.get(key)
      if (existing) {
        existing.count += 1
      } else {
        map.set(key, { cwd: key, label: getDirTag(s.cwd), count: 1 })
      }
    }
    return Array.from(map.values())
  }, [visibleSessions])

  useEffect(() => {
    if (cwdFilter && !cwdOptions.some((o) => o.cwd === cwdFilter)) {
      setCwdFilter(null)
    }
  }, [cwdFilter, cwdOptions])

  const filteredSessions = useMemo(() => {
    return visibleSessions.filter((s) => {
      if (cwdFilter) {
        const key = (s.cwd || '').replace(/[\\/]+$/, '').toLowerCase()
        if (key !== cwdFilter) return false
      }
      if (lowerQuery && !(s.title || '').toLowerCase().includes(lowerQuery)) return false
      return true
    })
  }, [visibleSessions, cwdFilter, lowerQuery])

  const groups = useMemo(() => getSessionGroups(filteredSessions, needsInputIds), [filteredSessions, needsInputIds, language])

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

  const isPlaceholderTitle = (title: string | null) => {
    if (!title) return true
    return title === '新会话' || title === '新对话' || title === 'New Chat'
  }
  const previewOf = (text: string) => stripChannelMarkers(text || '').replace(/\s+/g, ' ').trim().slice(0, 32)

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => { window.removeEventListener('click', close); window.removeEventListener('contextmenu', close) }
  }, [ctxMenu])

  const exportSession = async (session: Session) => {
    const msgs = await window.electronAPI.message.list(session.id)
    const data = { session, messages: msgs }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `aetherai-session-${session.id}-${(session.title || 'chat').slice(0, 20)}.json`
    a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <aside
      className="h-full flex flex-col shrink-0 select-none overflow-hidden transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
      style={{
        width: sidebarOpen ? 250 : 44,
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
      }}
    >
      <div className="h-12 flex items-center justify-between px-3 shrink-0 app-drag border-b border-[var(--border)]">
        {sidebarOpen ? (
          <>
            <div className="flex items-center gap-2 pl-1">
              <span className="text-xs font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Aether</span>
            </div>
            <button
              onClick={toggleSidebar}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]/60 transition-colors app-no-drag"
              title={t('sidebar.nav.collapse') || 'Collapse sidebar'}
              aria-label="Collapse sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          </>
        ) : (
          <button
            onClick={toggleSidebar}
            className="mx-auto p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]/60 transition-colors app-no-drag"
            title={t('sidebar.nav.expand') || 'Open sidebar'}
            aria-label="Open sidebar"
          >
            <PanelLeft size={16} />
          </button>
        )}
      </div>

      {!sidebarOpen ? (
        <div className="flex-1 flex flex-col items-center py-2 gap-1 app-no-drag w-[44px] tab-fade-in">
          <button
            onClick={() => useStore.getState().newChat()}
            className="p-2 rounded-md hover:bg-[var(--border)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors active:scale-[0.95]"
            title={t('chat.new')}
          >
            <Plus size={16} />
          </button>
          <div className="w-5 my-1.5 border-t border-[var(--border)]" />
          <div className="mt-auto flex flex-col items-center gap-1 w-full pb-2">
            {([
              { id: 'chat' as const, icon: MessageSquare, title: t('sidebar.nav.workspace', '工作区') },
              { id: 'arena' as const, icon: FlaskConical, title: t('sidebar.nav.arena', '竞技场') },
              { id: 'settings' as const, icon: Settings, title: t('sidebar.nav.settings', '设置') },
            ]).map(({ id, icon: ItemIcon, title }) => {
              const active = currentView === id || (id === 'chat' && currentView === 'workspace')
              return (
                <button
                  key={id}
                  onClick={() => setCurrentView(id)}
                  className={`relative p-2 rounded-md transition-all duration-200 hover:scale-110 active:scale-95 motion-reduce:transform-none motion-reduce:transition-none cursor-pointer ${active ? 'text-[var(--accent)] bg-[var(--content-bg)] shadow-xs' : 'text-[var(--text-secondary)] hover:bg-[var(--border)]/60 hover:text-[var(--text-primary)]'}`}
                  title={title}
                  aria-label={title}
                >
                  {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[var(--accent)]" />}
                  <ItemIcon size={16} />
                </button>
              )
            })}
          </div>
        </div>
      ) : (
    <div className="flex-1 flex flex-col min-h-0 w-[250px] tab-fade-in">
      <div className="px-2 pb-1.5 pt-2 shrink-0 flex items-center gap-1.5">
        <button
          onClick={() => useStore.getState().newChat()}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium rounded-[6px] border bg-[var(--content-bg)] hover:bg-[var(--bg-secondary)] transition-all hover:shadow-2xs active:scale-[0.99]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <Plus size={14} className="text-[var(--accent)]" />
          <span>{t('chat.new')}</span>
        </button>
      </div>
      <div className="px-2 pb-2 shrink-0 space-y-1.5">
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-[6px] border bg-[var(--content-bg)] text-xs transition-colors input-ring" style={{ borderColor: 'var(--border)' }}>
          <Search size={13} className="text-[var(--text-muted)] shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('sidebar.search')}
            className="w-full bg-transparent outline-none text-xs text-[var(--text-primary)]"
          />
          {searchQuery && (
            <span className="text-[10px] shrink-0 px-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
              {filteredSessions.length}
            </span>
          )}
        </div>
        {cwdOptions.length >= 2 && (
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
            <button
              type="button"
              onClick={() => setCwdFilter(null)}
              className="shrink-0 h-5 px-2 rounded-[5px] border text-[10.5px] font-mono transition-colors hover:bg-[var(--content-bg)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
              style={
                cwdFilter === null
                  ? { borderColor: 'var(--accent)', backgroundColor: 'var(--content-bg)', color: 'var(--text-primary)' }
                  : { borderColor: 'var(--border)', backgroundColor: 'transparent', color: 'var(--text-muted)' }
              }
            >
              {t('sidebar.filter.all')}
            </button>
            {cwdOptions.map((opt) => {
              const active = cwdFilter === opt.cwd
              return (
                <button
                  key={opt.cwd}
                  type="button"
                  onClick={() => setCwdFilter(active ? null : opt.cwd)}
                  title={opt.cwd}
                  className="shrink-0 h-5 px-1.5 rounded-[5px] border text-[10.5px] font-mono flex items-center gap-1 transition-colors hover:bg-[var(--content-bg)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer max-w-[110px]"
                  style={
                    active
                      ? { borderColor: 'var(--accent)', backgroundColor: 'var(--content-bg)', color: 'var(--text-primary)' }
                      : { borderColor: 'var(--border)', backgroundColor: 'transparent', color: 'var(--text-muted)' }
                  }
                >
                  <Folder size={9.5} className="shrink-0" style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }} />
                  <span className="truncate">{opt.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-1 scroll-bounce">
        {groups.length === 0 && (
          <div className="text-center py-8 text-xs" style={{ color: 'var(--text-muted)' }}>
            {searchQuery || cwdFilter ? t('sidebar.no_match') : t('sidebar.no_sessions')}
          </div>
        )}
        {groups.map((group) => (
          <div key={group.label} className="mb-1">
            <div className="session-date flex items-center justify-between">
              <span className="flex items-center gap-1.5" style={group.kind === 'needs_input' ? { color: 'var(--warning)' } : undefined}>
                {group.kind === 'needs_input' && (
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse motion-reduce:animate-none" style={{ backgroundColor: 'var(--warning)' }} />
                )}
                {group.label}
              </span>
              <span className="text-[10px] font-normal" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>{group.count}</span>
            </div>
            {group.sessions.map((session) => {
              const isNeedsInput = needsInputIds.has(session.id)
              const isStreaming = Boolean(activeStreamingIds && activeStreamingIds.split(',').includes(String(session.id)))
              const dirTag = getDirTag(session.cwd)
              return (
              <div key={session.id}
                onClick={() => { selectSession(session.id); setCurrentView('chat') }}
                onDoubleClick={() => handleDoubleClick(session)}
                onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, session }) }}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm mb-px session-item-interactive ${currentSessionId === session.id ? 'shadow-soft' : 'border border-transparent hover:bg-[var(--bg-secondary)]'}`}
                style={currentSessionId === session.id ? { background: 'var(--content-bg)', boxShadow: 'inset 2px 0 0 var(--accent), 0 1px 3px rgba(0,0,0,0.06)' } : {}}>
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
                {renamingId === session.id ? (
                  <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setRenamingId(null) }}
                    onBlur={handleRenameSubmit} autoFocus
                    className="flex-1 text-[13px] px-1.5 py-0.5 rounded border outline-none bg-[var(--content-bg)]"
                    style={{ borderColor: 'var(--accent)' }} onClick={(e) => e.stopPropagation()} />
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
                          {relativeTime(session.updated_at || session.created_at)}
                        </span>
                      )}
                    </div>
                    {(session.last_message || dirTag) && (
                      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                        {dirTag && (
                          <span
                            title={session.cwd || dirTag}
                            className="inline-flex items-center gap-0.5 text-[9.5px] font-mono px-1 rounded-[4px] border shrink-0 max-w-[78px]"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', backgroundColor: 'var(--bg-primary)' }}
                          >
                            <Folder size={8.5} className="shrink-0 opacity-75" />
                            <span className="truncate">{dirTag}</span>
                          </span>
                        )}
                        {session.last_message && (
                          <HoverMarquee
                            text={previewOf(session.last_message)}
                            className="flex-1 min-w-0 text-[11px] leading-tight"
                            style={{ color: 'var(--text-muted)' }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 -mr-1">
                  <button onClick={async (e) => {
                    e.stopPropagation()
                    const pinned = session.pinned ? 0 : 1
                    await window.electronAPI?.session?.pin?.(session.id, pinned)
                    loadSessions()
                  }}
                    className={`p-1 rounded hover:bg-[var(--border)] shrink-0 icon-btn-silky ${session.pinned ? 'text-amber-500' : 'text-[var(--text-muted)]'}`}
                    title={session.pinned ? 'Unpin' : 'Pin'}>
                    <Pin size={11} />
                  </button>
                  <button onClick={async (e) => {
                    e.stopPropagation()
                    const ok = await confirm({ title: t('chat.delete_confirm_title'), description: t('chat.delete_confirm_desc'), confirmText: t('chat.delete'), danger: true })
                    if (ok) deleteSession(session.id)
                  }}
                    className="p-1 rounded hover:bg-[var(--border)] shrink-0 icon-btn-silky">
                    <Trash2 size={12} className="text-gray-400" />
                  </button>
                </div>
              </div>
              )
            })}
          </div>
        ))}
        {ctxMenu && (
          <div className="fixed z-50 rounded-lg border shadow-lg py-1 min-w-[180px] animate-spring-up"
            style={{ left: Math.min(ctxMenu.x, window.innerWidth - 200), top: Math.min(ctxMenu.y, window.innerHeight - 200), backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setCtxMenu(null); handleDoubleClick(ctxMenu.session) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-secondary)] transition-colors flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              Rename
            </button>
            <button onClick={() => { setCtxMenu(null); window.electronAPI?.session?.pin?.(ctxMenu.session.id, ctxMenu.session.pinned ? 0 : 1); loadSessions() }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-secondary)] transition-colors flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Pin size={11} /> {ctxMenu.session.pinned ? 'Unpin' : 'Pin'}
            </button>
            <div className="my-0.5" style={{ borderTop: '1px solid var(--border)' }} />
            <button onClick={() => { setCtxMenu(null); exportSession(ctxMenu.session) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-secondary)] transition-colors flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Download size={11} /> Export conversation
            </button>
            <button onClick={async () => {
              setCtxMenu(null)
              const cmd = `aether tui --session ${ctxMenu.session.id}`
              try {
                await window.electronAPI?.system?.clipboardWrite?.(cmd)
                await window.electronAPI?.system?.notify?.({ title: t('session.tui_copied', '已复制终端命令'), body: cmd })
              } catch {}
            }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-secondary)] transition-colors flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <TerminalSquare size={11} /> {t('session.continue_in_tui', '在终端继续 (复制命令)')}
            </button>
            <div className="my-0.5" style={{ borderTop: '1px solid var(--border)' }} />
            <button onClick={async () => {
              setCtxMenu(null)
              const ok = await confirm({ title: t('chat.delete_confirm_title'), description: t('chat.delete_confirm_desc'), confirmText: t('chat.delete'), danger: true })
              if (ok) deleteSession(ctxMenu.session.id)
            }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-50 transition-colors flex items-center gap-2" style={{ color: 'var(--error)' }}>
              <Trash2 size={11} /> {t('chat.delete')}
            </button>
          </div>
        )}
      </div>
      <QuickControlDeck />
      <div className="p-1.5 space-y-0.5 shrink-0 border-t border-[var(--border)]">
        <NavItem icon={MessageSquare} label={t('sidebar.nav.workspace', '工作区')} active={currentView === 'chat' || currentView === 'workspace'} onClick={() => setCurrentView('chat')} />
        <NavItem icon={FlaskConical} label={t('sidebar.nav.arena', '竞技场')} active={currentView === 'arena'} onClick={() => setCurrentView('arena')} />
        <NavItem icon={Settings} label={t('sidebar.nav.settings', '设置')} active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />
      </div>
        </div>
      )}
    </aside>
  )
}

function NavItem({ icon: Icon, label, active, onClick, badge }: { icon: any; label: string; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <button onClick={onClick} className={`group relative w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200 motion-reduce:transform-none motion-reduce:transition-none press-scale cursor-pointer ${active ? 'bg-[var(--content-bg)] text-[var(--text-primary)] shadow-xs font-semibold' : 'text-[var(--text-secondary)] hover:bg-[var(--border)]/40 hover:text-[var(--text-primary)] hover:translate-x-0.5'}`}>
      <span className={`absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[var(--accent)] transition-all duration-200 motion-reduce:transform-none motion-reduce:transition-none ${active ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-50'}`} />
      <Icon size={15} className={`transition-all duration-200 motion-reduce:transform-none motion-reduce:transition-none group-hover:scale-110 ${active ? 'text-[var(--accent)] scale-105' : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'}`} />
      <span className="truncate">{label}</span>
      {badge ? (
        <span className="ms-auto flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded-full tabular-nums bg-[var(--accent)] text-white">
          <Loader2 size={8} className="animate-spin" />{badge}
        </span>
      ) : null}
    </button>
  )
}
