import { useState, useMemo, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { useUI } from '@/components/ui/feedback'
import { MessageSquare, Plus, Server, User, Settings, ChevronLeft, Trash2, Search, Pin, Trophy, Brain, Download, FolderOpen, Loader2, ListTodo, History, ChevronDown, Wrench, CheckCircle2, XCircle, AlertTriangle, RotateCcw } from 'lucide-react'
import type { Session } from '@/types'
import { t } from '@/utils/i18n'
import TaskPanel, { tx } from '@/components/tasks/TaskPanel'

const PLACEHOLDER_TITLES = new Set(['新会话', '新对话', 'New Chat'])

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

function getSessionGroups(sessions: Session[]) {
  const now = Date.now()
  const todayStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime()
  const yesterdayStart = todayStart - 86400000
  const weekStart = todayStart - 7 * 86400000
  const pinned: Session[] = []
  const groups: { label: string; sessions: Session[]; count: number }[] = [
    { label: t('sidebar.group.today'), sessions: [], count: 0 },
    { label: t('sidebar.group.yesterday'), sessions: [], count: 0 },
    { label: t('sidebar.group.week'), sessions: [], count: 0 },
    { label: t('sidebar.group.older'), sessions: [], count: 0 },
  ]
  for (const s of sessions) {
    if (s.pinned) { pinned.push(s); continue }
    const raw = s.updated_at || s.created_at || ''
    const iso = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z'
    const date = new Date(iso).getTime()
    if (date >= todayStart) { groups[0].sessions.push(s); groups[0].count++; continue }
    if (date >= yesterdayStart) { groups[1].sessions.push(s); groups[1].count++; continue }
    if (date >= weekStart) { groups[2].sessions.push(s); groups[2].count++; continue }
    groups[3].sessions.push(s); groups[3].count++
  }
  // Pinned group first, then date groups (sorted by updated_at DESC within each).
  const result: { label: string; sessions: Session[]; count: number }[] = []
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
  const streamingBySession = useStore((s) => s.streamingBySession)
  const currentView = useStore((s) => s.currentView)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const selectSession = useStore((s) => s.selectSession)
  const createSession = useStore((s) => s.createSession)
  const deleteSession = useStore((s) => s.deleteSession)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const loadSessions = useStore((s) => s.loadSessions)
  const tasksOpen = useStore((s) => s.tasksOpen)
  const setTasksOpen = useStore((s) => s.setTasksOpen)
  const runningTasks = useStore((s) => s.tasks.filter((x) => x.status === 'running').length)
  const { confirm } = useUI()

  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; session: Session } | null>(null)
  const lowerQuery = searchQuery.toLowerCase()

  const filteredSessions = useMemo(() => {
    // Show sessions that have had at least one message.
    // Sessions with placeholder titles are kept visible if they have messages —
    // the auto-title generation happens asynchronously after the first response,
    // so hiding them would make the chat disappear mid-conversation.
    const withMessages = sessions.filter(s => s.last_message || (s.title && !PLACEHOLDER_TITLES.has(s.title)) || streamingBySession[s.id])
    if (!lowerQuery) return withMessages
    return withMessages.filter(s => (s.title || '').toLowerCase().includes(lowerQuery))
  }, [sessions, lowerQuery])
  const groups = useMemo(() => getSessionGroups(filteredSessions), [filteredSessions, language])

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
  const previewOf = (text: string) => (text || '').replace(/\s+/g, ' ').trim().slice(0, 32)


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
    <div className="w-[260px] h-full flex flex-col shrink-0" style={{ backgroundColor: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>
      <div className="h-12 flex items-center justify-between px-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Aether</span>
        </div>
        <button onClick={toggleSidebar} className="p-1.5 rounded-md hover:bg-[var(--border)] transition-colors">
          <ChevronLeft size={16} className="text-[var(--text-muted)]" />
        </button>
      </div>
      <div className="p-2 shrink-0">
        <button onClick={() => useStore.getState().newChat()} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border bg-[var(--content-bg)] hover:bg-[var(--bg-secondary)] transition-colors hover:shadow-sm" style={{ borderColor: 'var(--border)' }}>
          <Plus size={16} className="text-[var(--text-secondary)]" />{t('chat.new')}
        </button>
      </div>
      <div className="px-2 pb-2 shrink-0">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-[var(--content-bg)] text-sm transition-colors" style={{ borderColor: 'var(--border)' }}>
          <Search size={14} className="text-[var(--text-muted)] shrink-0" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('sidebar.search')} className="w-full bg-transparent outline-none text-sm" />
          {searchQuery && (
            <span className="text-[10px] shrink-0 px-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
              {filteredSessions.length}
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-1 scroll-bounce">
        {groups.length === 0 && (
          <div className="text-center py-8 text-xs" style={{ color: 'var(--text-muted)' }}>
            {searchQuery ? t('sidebar.no_match') : t('sidebar.no_sessions')}
          </div>
        )}
        {groups.map((group) => (
          <div key={group.label} className="mb-1">
            <div className="session-date flex items-center justify-between">
              <span>{group.label}</span>
              <span className="text-[10px] font-normal" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>{group.count}</span>
            </div>
            {group.sessions.map((session) => (
              <div key={session.id}
                onClick={() => { selectSession(session.id); setCurrentView('chat') }}
                onDoubleClick={() => handleDoubleClick(session)}
                onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, session }) }}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-all mb-px ${currentSessionId === session.id ? 'shadow-soft' : 'border border-transparent hover:bg-[var(--bg-secondary)]'}`}
                style={currentSessionId === session.id ? { background: 'var(--content-bg)', boxShadow: 'inset 2px 0 0 var(--accent), 0 1px 3px rgba(0,0,0,0.06)' } : {}}>
                {session.pinned ? <Pin size={12} className="text-amber-500 shrink-0" fill="currentColor" />
                  : <MessageSquare size={14} className="text-[var(--text-muted)] shrink-0" />}
                {streamingBySession[session.id] && (
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
                    <div className="flex items-center gap-1.5 leading-tight">
                      <span className="truncate text-[13px]" style={{ color: 'var(--text-primary)' }}>
                        {session.title || t('chat.new')}
                      </span>
                      <span className="text-[10px] shrink-0 ml-auto tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        {relativeTime(session.updated_at || session.created_at)}
                      </span>
                    </div>
                    {session.last_message && (
                      <div className="truncate text-[11px] leading-tight mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {previewOf(session.last_message)}
                      </div>
                    )}
                  </div>
                )}
                <button onClick={async (e) => {
                  e.stopPropagation()
                  const pinned = session.pinned ? 0 : 1
                  await window.electronAPI?.session?.pin?.(session.id, pinned)
                  loadSessions()
                }}
                  className={`opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--border)] transition-all shrink-0 ${session.pinned ? 'opacity-100 text-amber-500' : ''}`}
                  title={session.pinned ? 'Unpin' : 'Pin'}>
                  <Pin size={11} />
                </button>
                <button onClick={async (e) => {
                  e.stopPropagation()
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
        {ctxMenu && (
          <div className="fixed z-50 rounded-xl border shadow-lg py-1 min-w-[180px]"
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
        <AgentHistory />
      </div>
      <div className="p-2 space-y-0.5 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
        <NavItem icon={Server} label={t('sidebar.nav.models')} active={currentView === 'models'} onClick={() => setCurrentView('models')} />
        <NavItem icon={User} label={t('sidebar.nav.personas')} active={currentView === 'agents'} onClick={() => setCurrentView('agents')} />
        <NavItem icon={Trophy} label={t('sidebar.nav.arena')} active={currentView === 'scores'} onClick={() => setCurrentView('scores')} />
        <NavItem icon={Brain} label={t('sidebar.nav.memory')} active={currentView === 'memory'} onClick={() => setCurrentView('memory')} />
        {/* Background tasks (功能 A): a drawer toggle, not a view — the page
            switch lives in App.tsx and stays untouched. */}
        <NavItem icon={ListTodo} label={tx('sidebar.nav.tasks', '任务')} active={tasksOpen}
          onClick={() => setTasksOpen(!tasksOpen)} badge={runningTasks} />
        <NavItem icon={Settings} label={t('sidebar.nav.settings')} active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />
      </div>
      {/* Fixed-position drawer; renders null unless `tasksOpen`. Mounted here so
          it hydrates from task.list() as soon as the sidebar exists. */}
      <TaskPanel />
    </div>
  )
}

function NavItem({ icon: Icon, label, active, onClick, badge }: { icon: any; label: string; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-all duration-150 ${active ? 'shadow-soft' : 'border border-transparent hover:bg-[var(--bg-secondary)]'}`}
      style={active ? { background: 'var(--content-bg)', boxShadow: 'inset 2px 0 0 var(--accent), 0 1px 3px rgba(0,0,0,0.06)' } : {}}>
      <Icon size={16} className={active ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'} />{label}
      {badge ? (
        <span className="ms-auto flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full tabular-nums" style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
          <Loader2 size={8} className="animate-spin" />{badge}
        </span>
      ) : null}
    </button>
  )
}

// Agent 历史 (Feature E): a collapsible audit-log view for the currently
// selected session. Reads the agent_execution_log via usage:agent-history.
function AgentHistory() {
  const currentSessionId = useStore((s) => s.currentSessionId)
  const language = useStore((s) => s.language)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<AgentExecutionTurn[]>([])

  useEffect(() => {
    if (!open || !currentSessionId) return
    let cancelled = false
    setLoading(true)
    window.electronAPI.usage.agentHistory(currentSessionId, 50)
      .then((d) => { if (!cancelled) setRows(d || []) })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, currentSessionId, language])

  return (
    <div className="mt-1" style={{ borderTop: '1px solid var(--border)' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors hover:bg-[var(--bg-secondary)]" style={{ color: 'var(--text-secondary)' }}>
        <History size={13} className="shrink-0" />
        <span className="flex-1 text-left">{t('sidebar.agent_history')}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} />
      </button>
      {open && (
        <div className="px-1.5 pb-2 space-y-1.5">
          {loading && (
            <div className="flex items-center gap-1.5 px-1.5 py-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <Loader2 size={11} className="animate-spin" />…
            </div>
          )}
          {!loading && rows.length === 0 && (
            <div className="px-1.5 py-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>{t('sidebar.agent_history_empty')}</div>
          )}
          {!loading && rows.map((row) => <AgentTurnRow key={row.id} row={row} />)}
        </div>
      )}
    </div>
  )
}

const AGENT_STATUS_STYLE: Record<string, { color: string; bg: string; icon: any }> = {
  success: { color: '#16a34a', bg: 'rgba(22,163,74,0.12)', icon: CheckCircle2 },
  budget_exhausted: { color: '#d97706', bg: 'rgba(217,119,6,0.12)', icon: AlertTriangle },
  error: { color: '#dc2626', bg: 'rgba(220,38,38,0.12)', icon: XCircle },
  loop_detected: { color: '#7c3aed', bg: 'rgba(124,58,237,0.12)', icon: RotateCcw },
}

function AgentTurnRow({ row }: { row: AgentExecutionTurn }) {
  const { payload } = row
  const calls = payload.toolCalls || []
  const st = AGENT_STATUS_STYLE[payload.finalStatus || ''] || AGENT_STATUS_STYLE.success
  const Icon = st.icon
  return (
    <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ color: st.color, backgroundColor: st.bg }}>
          <Icon size={10} />{payload.finalStatus || 'success'}
        </span>
        {typeof payload.totalIterations === 'number' && payload.totalIterations > 0 && (
          <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{payload.totalIterations} it</span>
        )}
        <span className="text-[10px] ml-auto tabular-nums" style={{ color: 'var(--text-muted)' }}>{relativeTime(row.created_at)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {calls.length === 0 && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>—</span>}
        {calls.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }} title={c.error ? String(c.error) : undefined}>
            <Wrench size={9} className="shrink-0" />
            {c.name}
            {typeof c.latencyMs === 'number' && <span className="tabular-nums opacity-70">{c.latencyMs}ms</span>}
          </span>
        ))}
      </div>
    </div>
  )
}
