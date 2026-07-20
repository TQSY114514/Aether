import { useState, useEffect, useMemo, useRef } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { Search, MessageSquare, Cpu, Server, Sparkles, Settings as SettingsIcon, Brain, Shield, Zap } from 'lucide-react'

// ───────────────────────────────────────────────────────────────────────────
// Global command palette (Ctrl+K). Fuzzy-search across sessions, models,
// pages, skills, and agent modes. Enter runs the selected command; arrow keys
// navigate. Claude-Code-style fast switcher.
// ───────────────────────────────────────────────────────────────────────────

type Cmd = {
  id: string
  label: string
  hint?: string
  icon: typeof Search
  group: string
  run: () => void
}

// Simple subsequence fuzzy match with a preference for contiguous/prefix matches.
// Returns a score (higher = better) or -1 if no match. q is lowercased.
function fuzzy(label: string, q: string): number {
  if (!q) return 1
  const l = label.toLowerCase()
  if (l.includes(q)) return 100 - l.indexOf(q) // contiguous match, prefer early
  let qi = 0, score = 0, last = -1
  for (let i = 0; i < l.length && qi < q.length; i++) {
    if (l[i] === q[qi]) {
      score += (i - last === 1) ? 5 : 1 // reward contiguous
      last = i
      qi++
    }
  }
  return qi === q.length ? score : -1
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const sessions = useStore((s) => s.sessions)
  const selectSession = useStore((s) => s.selectSession)
  const allModels = useStore((s) => s.allModels)
  const sessionConfigs = useStore((s) => s.sessionConfigs)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const saveSessionConfig = useStore((s) => s.saveSessionConfig)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const setAgentMode = useStore((s) => s.setAgentMode)
  const toggleSidebar = useStore((s) => s.toggleSidebar)

  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 0) } }, [open])

  const commands = useMemo<Cmd[]>(() => {
    const cmds: Cmd[] = []
    // Pages
    const pages: [string, ReturnType<typeof t> extends string ? string : string, typeof Search][] = [
      ['chat', t('sidebar.nav.chat') || 'Chat', MessageSquare],
      ['models', t('sidebar.nav.models'), Server],
      ['agents', t('sidebar.nav.personas'), MessageSquare],
      ['scores', t('sidebar.nav.arena'), MessageSquare],
      ['settings', t('sidebar.nav.settings'), SettingsIcon],
    ]
    pages.forEach(([view, label, icon]) => {
      cmds.push({ id: `page-${view}`, label, group: t('cmd.group.navigate'), icon, run: () => { setCurrentView(view as any); onClose() } })
    })
    // Agent modes
    const modes: [string, string, typeof Brain][] = [
      ['off', t('agent.mode.off'), Brain],
      ['plan', t('agent.mode.plan'), Shield],
      ['ask', t('agent.mode.ask'), Shield],
      ['auto', t('agent.mode.auto'), Zap],
      ['yolo', t('agent.mode.yolo'), Zap],
    ]
    modes.forEach(([mode, label, icon]) => {
      cmds.push({ id: `mode-${mode}`, label: `${t('cmd.set_mode')} ${label}`, group: t('cmd.group.agent'), icon, run: () => { setAgentMode(mode as any); onClose() } })
    })
    // Sessions
    sessions.slice(0, 30).forEach((s) => {
      cmds.push({ id: `sess-${s.id}`, label: s.title || t('chat.new'), hint: t('cmd.switch_session'), group: t('cmd.group.sessions'), icon: MessageSquare, run: () => { selectSession(s.id); setCurrentView('chat'); onClose() } })
    })
    // Models (apply to current session)
    allModels.slice(0, 40).forEach((m) => {
      cmds.push({ id: `model-${m.id}`, label: m.display_name || m.model_name, hint: t('cmd.use_model'), group: t('cmd.group.models'), icon: Cpu, run: () => {
        if (currentSessionId) saveSessionConfig(currentSessionId, { providerId: m.provider_id, modelId: m.id })
        onClose()
      } })
    })
    return cmds
  }, [sessions, allModels, setCurrentView, setAgentMode, selectSession, saveSessionConfig, currentSessionId, onClose])

  const filtered = useMemo(() => {
    if (!q.trim()) return commands
    const scored = commands.map(c => ({ c, s: Math.max(fuzzy(c.label, q), fuzzy(c.group, q)) }))
    return scored.filter(x => x.s >= 0).sort((a, b) => b.s - a.s).map(x => x.c)
  }, [q, commands])

  useEffect(() => { setSel(0) }, [q])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(i => Math.min(i + 1, filtered.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(i => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter') { e.preventDefault(); filtered[sel]?.run() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, sel, onClose])

  if (!open) return null

  // Group filtered results for display.
  const groups: { name: string; cmds: Cmd[] }[] = []
  filtered.forEach(c => {
    let g = groups.find(x => x.name === c.group)
    if (!g) { g = { name: c.group, cmds: [] }; groups.push(g) }
    g.cmds.push(c)
  })
  let flatIdx = 0

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center pt-[12vh] p-4">
      <div className="absolute inset-0 bg-black/40 animate-blur-fade" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border shadow-xl overflow-hidden animate-blur-fade"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <Search size={16} className="text-gray-400 shrink-0" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('cmd.placeholder')}
            className="flex-1 bg-transparent outline-none text-sm" style={{ color: 'var(--text-primary)' }} />
          <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>ESC</span>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>{t('cmd.empty')}</div>
          )}
          {groups.map(g => (
            <div key={g.name}>
              <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{g.name}</div>
              {g.cmds.map(c => {
                const idx = flatIdx++
                const active = idx === sel
                const Icon = c.icon
                return (
                  <button key={c.id} onMouseEnter={() => setSel(idx)} onClick={() => c.run()}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                    style={active ? { backgroundColor: 'var(--bg-secondary)' } : {}}>
                    <Icon size={14} className="shrink-0" style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }} />
                    <span className="flex-1 text-xs truncate" style={{ color: 'var(--text-primary)' }}>{c.label}</span>
                    {c.hint && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{c.hint}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
