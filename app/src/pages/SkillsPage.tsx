import { useState, useEffect } from 'react'
import { useUI } from '@/components/ui/feedback'
import { t } from '@/utils/i18n'
import { Sparkles, RefreshCw, Search, BookOpen, Clock, Zap, Trophy, Wand2, ShieldCheck, ShieldAlert, Power, FolderPlus } from 'lucide-react'

type SkillEntry = { name: string; description: string; filePath: string; metadata?: Record<string, string>; usage?: { count: number; lastUsedAt: string | null } }
type SkillStat = { name: string; totalUses: number; successes: number; successRate: number; lastResult: boolean }

export default function SkillsPage() {
  const { toast } = useUI()
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [stats, setStats] = useState<SkillStat[]>([])
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [showDrafts, setShowDrafts] = useState(false)
  const [usageStates, setUsageStates] = useState<Record<string, string>>({})
  const [stateBusy, setStateBusy] = useState<string | null>(null)

  const load = async () => {
    try {
      const [list, skillStats, usage] = await Promise.all([
        window.electronAPI?.skills?.list?.().catch(() => []),
        window.electronAPI?.skills?.stats?.().catch(() => []),
        window.electronAPI?.skills?.getUsage?.().catch(() => []),
      ])
      setSkills(list || [])
      setStats(skillStats || [])
      const m: Record<string, string> = {}
      for (const u of (usage || [])) m[u.name] = u.state
      setUsageStates(m)
    } catch { setSkills([]); setStats([]); setUsageStates({}) }
  }

  useEffect(() => { load() }, [])

  const rescan = async () => {
    setBusy(true)
    try {
      const res = await window.electronAPI?.skills?.rescan?.()
      if (res?.success) { await load(); toast(t('settings.skills.rescanned', String(res.count)), { type: 'success' }) }
    } finally { setBusy(false) }
  }

  const importDir = async () => {
    setBusy(true)
    try {
      const res = await window.electronAPI?.skills?.importDir?.()
      if (res?.ok) { await load(); toast(t('settings.skills.imported', String(res.count ?? 0)), { type: 'success' }) }
      else if (res?.error) toast(res.error, { type: 'error' })
    } finally { setBusy(false) }
  }

  const autoDraft = async (name: string, description: string) => {
    setBusy(true)
    try {
      const res = await window.electronAPI?.skills?.autoDraft?.(name, description)
      if (res?.ok) { toast(t('settings.skills.drafted', name), { type: 'success' }); await load() }
    } finally { setBusy(false) }
  }

  const toggleState = async (name: string, current: string) => {
    const next = current === 'archived' ? 'active' : 'archived'
    setStateBusy(name)
    try {
      const res = await window.electronAPI?.skills?.updateState?.(name, next)
      if (res?.ok) {
        setUsageStates(prev => ({ ...prev, [name]: next }))
        toast(t('settings.skills.state_updated', name), { type: 'success' })
      }
    } finally { setStateBusy(null) }
  }

  const statsMap = new Map(stats.map(s => [s.name, s]))

  const filtered = query.trim()
    ? skills.filter(s => s.name.toLowerCase().includes(query.toLowerCase()) || s.description.toLowerCase().includes(query.toLowerCase()))
    : skills

  const candidates = stats.filter(s => s.totalUses >= 3 && s.successRate >= 0.7 && !skills.find(sk => sk.name === s.name))
  const totalUsed = skills.reduce((a, s) => a + (s.usage?.count || 0), 0)

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>✨ {t('settings.skills.title')}</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Claude-Code-format SKILL.md 技能 · 按需加载 · 渐进披露
            </p>
          </div>
          <button onClick={rescan} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border hover:bg-(--bg-secondary) transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--border)' }}>
            <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />
            {t('settings.skills.rescan', '重新扫描')}
          </button>
          <button onClick={importDir} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border hover:bg-(--bg-secondary) transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--border)' }}>
            <FolderPlus size={12} />
            {t('settings.skills.import', '导入目录')}
          </button>
        </div>

        {totalUsed > 0 && (
          <div className="flex items-center gap-3 mb-4 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
            <Zap size={13} /> {t('settings.skills.total_used', `共使用 ${totalUsed} 次`)}
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm mb-6" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <Search size={14} className="text-gray-400 shrink-0" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('settings.skills.search_placeholder', '搜索技能...')}
            className="w-full bg-transparent outline-none text-sm" />
          {query && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{filtered.length} 条</span>}
        </div>

        {/* Skills list */}
        {skills.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
            <BookOpen size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">{t('settings.skills.empty')}</p>
            <p className="text-xs mt-2">把 <code className="px-1.5 py-0.5 rounded text-[11px]" style={{ backgroundColor: 'var(--bg-secondary)' }}>&lt;skill&gt;/SKILL.md</code> 放进工作区的 <code className="px-1.5 py-0.5 rounded text-[11px]" style={{ backgroundColor: 'var(--bg-secondary)' }}>.claude/skills/</code> 即可</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => {
              const stat = statsMap.get(s.name)
              const successRate = stat?.successRate ?? null
              return (
                <div key={s.name} className="rounded-xl p-4" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">✨</span>
                        <span className="text-sm font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{s.name}</span>
                        {stat && stat.totalUses > 0 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: successRate && successRate >= 0.8 ? 'rgba(34,197,94,0.15)' : 'var(--bg-primary)', color: successRate && successRate >= 0.8 ? 'var(--success)' : 'var(--text-muted)' }}>
                            {successRate && successRate >= 0.8 && <ShieldCheck size={8} className="inline mr-0.5" />}
                            {stat.totalUses}x
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{s.description}</p>
                      {successRate != null && (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
                            <div className="h-full rounded-full" style={{ width: `${Math.round(successRate * 100)}%`, backgroundColor: successRate >= 0.8 ? 'var(--success)' : successRate >= 0.5 ? 'var(--warning)' : 'var(--error)' }} />
                          </div>
                          <span className="text-[10px] font-mono w-8 text-right" style={{ color: 'var(--text-muted)' }}>{Math.round(successRate * 100)}%</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{s.filePath}</span>
                        {s.usage && s.usage.count > 0 && (
                          <span className="text-[10px] flex items-center gap-0.5 shrink-0" style={{ color: 'var(--text-muted)' }}>
                            <Clock size={9} /> {s.usage.lastUsedAt ? new Date(s.usage.lastUsedAt).toLocaleDateString() : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => toggleState(s.name, usageStates[s.name] || 'active')} disabled={stateBusy === s.name}
                      title={usageStates[s.name] === 'archived' ? t('settings.skills.enable') : t('settings.skills.disable')}
                      className={`flex items-center gap-1 shrink-0 px-2 py-1 text-[10px] rounded-lg border transition-colors disabled:opacity-50 ${stateBusy === s.name ? 'opacity-50' : ''}`}
                      style={{
                        borderColor: usageStates[s.name] === 'archived' ? 'var(--border)' : 'var(--accent)',
                        color: usageStates[s.name] === 'archived' ? 'var(--text-muted)' : 'var(--accent)',
                      }}>
                      <Power size={10} />
                      {usageStates[s.name] === 'archived' ? t('settings.skills.enable') : t('settings.skills.disable')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Auto-draft suggestions */}
        {candidates.length > 0 && (
          <div className="mt-8 rounded-xl p-4" style={{ border: '1px solid var(--warning)', backgroundColor: 'rgba(234,179,8,0.03)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Wand2 size={14} style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.skills.auto_draft_title', '建议自动生成')}</span>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              {t('settings.skills.auto_draft_desc', '以下技能已被多次成功使用但尚未创建 SKILL.md')}
            </p>
            <div className="space-y-1.5">
              {candidates.map((c) => (
                <div key={c.name} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <div className="flex-1">
                    <span className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                    <span className="text-[10px] ml-2" style={{ color: 'var(--text-muted)' }}>
                      {c.totalUses} 次 · {Math.round(c.successRate * 100)}% 成功
                    </span>
                  </div>
                  <button onClick={() => autoDraft(c.name, `Auto-drafted from ${c.totalUses} successful uses`)}
                    disabled={busy}
                    className="text-[10px] px-2.5 py-1 rounded-lg border hover:bg-(--bg-primary) transition-colors flex items-center gap-1"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                    <Wand2 size={10} /> {t('settings.skills.auto_draft')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* How skills work */}
        <div className="mt-8 rounded-xl p-4" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={14} style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t('settings.skills.hint')}</span>
          </div>
          <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            扫描目录（优先级）：<code style={{ backgroundColor: 'var(--bg-primary)', padding: '1px 4px', borderRadius: '3px' }}>&lt;workspace&gt;/.claude/skills</code>、
            <code style={{ backgroundColor: 'var(--bg-primary)', padding: '1px 4px', borderRadius: '3px' }}>&lt;workspace&gt;/.aetherai/skills</code>、
            <code style={{ backgroundColor: 'var(--bg-primary)', padding: '1px 4px', borderRadius: '3px' }}>&lt;userData&gt;/skills</code>、内置。
            仅名称+描述进入提示词；匹配时由 use_skill 工具按需加载完整指令。
          </p>
        </div>
      </div>
    </div>
  )
}
