import { useState, useEffect } from 'react'
import { useUI } from '@/components/ui/feedback'
import { t } from '@/utils/i18n'
import { Sparkles, RefreshCw, BookOpen, Clock, Zap, Trophy, AlertTriangle, Wand2, ChevronRight } from 'lucide-react'

// ───────────────────────────────────────────────────────────────────────────
// Skills settings — discover, manage, and review Claude-Code-format skills.
//
// Shows each skill's name, description, usage count, success rate, last-used
// timestamp, and metadata. Supports auto-draft from successful usage patterns.
// ───────────────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string | null): string {
  if (!iso) return t('settings.skills.never_used', '从未使用')
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return `${Math.floor(days / 30)} 个月前`
}

function MetadataBadges({ metadata }: { metadata?: Record<string, string> }) {
  if (!metadata || Object.keys(metadata).length === 0) return null
  const skip = new Set(['name', 'description', 'disabled'])
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {Object.entries(metadata).filter(([k]) => !skip.has(k)).map(([k, v]) => (
        <span key={k} className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
          {k}: {v}
        </span>
      ))}
    </div>
  )
}

type SkillEntry = { name: string; description: string; filePath: string; metadata?: Record<string, string>; usage?: { count: number; lastUsedAt: string | null } }
type SkillStat = { name: string; totalUses: number; successes: number; successRate: number; lastResult: boolean }

export default function SkillsSettings() {
  const { toast } = useUI()
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [stats, setStats] = useState<SkillStat[]>([])
  const [busy, setBusy] = useState(false)
  const [activeTab, setActiveTab] = useState<'discover' | 'performance'>('discover')

  const load = async () => {
    try {
      const list = await window.electronAPI?.skills?.list?.()
      const skillStats = await window.electronAPI?.skills?.stats?.()
      setSkills(list || [])
      setStats(skillStats || [])
    } catch { setSkills([]); setStats([]) }
  }
  useEffect(() => { load() }, [])

  const rescan = async () => {
    setBusy(true)
    try {
      const res = await window.electronAPI?.skills?.rescan?.()
      if (res?.success) { await load(); toast(t('settings.skills.rescanned', String(res.count)), { type: 'success' }) }
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  const autoDraft = async (name: string, description: string) => {
    setBusy(true)
    try {
      const res = await window.electronAPI?.skills?.autoDraft?.(name, description)
      if (res?.ok) { toast(t('settings.skills.drafted', name), { type: 'success' }); await load() }
      else { toast(res?.error || 'failed', { type: 'error' }) }
    } finally { setBusy(false) }
  }

  const totalUsed = skills.reduce((a, s) => a + (s.usage?.count || 0), 0)
  const statsMap = new Map(stats.map(s => [s.name, s]))

  const candidates = stats.filter(s => s.totalUses >= 3 && s.successRate >= 0.7 && !skills.find(sk => sk.name === s.name))
  const knownStats = stats.filter(s => skills.find(sk => sk.name === s.name))

  return (
    <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Sparkles size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.skills.title')}</h2>
        </div>
        <button onClick={rescan} disabled={busy}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50"
          style={{ borderColor: 'var(--border)' }}>
          <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />{t('settings.skills.rescan', '重新扫描')}
        </button>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{t('settings.skills.desc')}</p>

      {totalUsed > 0 && (
        <div className="flex items-center gap-3 mb-3 px-2.5 py-1.5 rounded-lg text-[11px]" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
          <Zap size={12} /> {t('settings.skills.total_used', `共使用 ${totalUsed} 次`)}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <button onClick={() => setActiveTab('discover')}
          className={`flex-1 text-xs py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 ${activeTab === 'discover' ? 'bg-white shadow-sm' : ''}`}
          style={{ color: activeTab === 'discover' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          <BookOpen size={12} />{t('settings.skills.tab_discover', '发现')}
        </button>
        <button onClick={() => setActiveTab('performance')}
          className={`flex-1 text-xs py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 ${activeTab === 'performance' ? 'bg-white shadow-sm' : ''}`}
          style={{ color: activeTab === 'performance' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          <Trophy size={12} />{t('settings.skills.tab_performance', '成功率')}
        </button>
      </div>

      {activeTab === 'discover' && (
        <>
          {skills.length === 0 ? (
            <div className="text-center py-6 text-xs" style={{ color: 'var(--text-muted)' }}>
              <BookOpen size={20} className="mx-auto mb-2 opacity-40" />
              {t('settings.skills.empty', '未找到任何技能')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {skills.map((s) => {
                const stat = statsMap.get(s.name)
                return (
                  <div key={s.name} className="flex items-start gap-2 p-2.5 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <span className="text-base leading-none mt-0.5">✨</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{s.name}</div>
                        {stat && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: stat.successRate >= 0.8 ? 'rgba(34,197,94,0.15)' : stat.successRate >= 0.5 ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)',
                              color: stat.successRate >= 0.8 ? 'var(--success)' : stat.successRate >= 0.5 ? 'var(--warning)' : 'var(--error)' }}>
                            {Math.round(stat.successRate * 100)}% 成功
                          </span>
                        )}
                        {s.usage && s.usage.count > 0 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}>
                            {s.usage.count}x
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{s.description}</div>
                      <MetadataBadges metadata={s.metadata} />
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{s.filePath}</div>
                        {s.usage && s.usage.count > 0 && (
                          <div className="flex items-center gap-0.5 text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                            <Clock size={9} /> {formatRelativeTime(s.usage.lastUsedAt)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {candidates.length > 0 && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <Wand2 size={13} style={{ color: 'var(--accent)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t('settings.skills.auto_draft_title', '建议自动生成')}</span>
              </div>
              <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                {t('settings.skills.auto_draft_desc', '以下技能已被多次成功使用但尚未创建 SKILL.md，可自动生成技能文件')}
              </p>
              <div className="space-y-1">
                {candidates.map((c) => (
                  <div key={c.name} className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <span className="text-xs font-mono flex-1" style={{ color: 'var(--text-secondary)' }}>
                      {c.name} <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>({c.totalUses}次 · {Math.round(c.successRate * 100)}%)</span>
                    </span>
                    <button onClick={() => autoDraft(c.name, `Auto-drafted from ${c.totalUses} successful uses`)}
                      disabled={busy}
                      className="text-[10px] px-2 py-0.5 rounded border hover:bg-[var(--bg-primary)] transition-colors flex items-center gap-1"
                      style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                      <Wand2 size={9} /> {t('settings.skills.auto_draft', '生成技能')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'performance' && (
        <>
          {stats.length === 0 ? (
            <div className="text-center py-6 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Trophy size={20} className="mx-auto mb-2 opacity-40" />
              {t('settings.skills.no_stats', '暂无使用数据')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {knownStats
                .sort((a, b) => b.totalUses - a.totalUses)
                .map((s) => {
                  const barW = Math.round(s.successRate * 100)
                  const barColor = s.successRate >= 0.8 ? 'var(--success)' : s.successRate >= 0.5 ? 'var(--warning)' : 'var(--error)'
                  return (
                    <div key={s.name} className="flex items-center gap-3 p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono font-medium truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {s.totalUses} 次使用 · {s.successes} 成功 · {s.lastResult ? '✅' : '❌'} 最近
                        </div>
                        <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${barW}%`, backgroundColor: barColor }} />
                        </div>
                      </div>
                      <span className="text-xs font-mono font-medium shrink-0" style={{ color: barColor }}>{Math.round(s.successRate * 100)}%</span>
                    </div>
                  )
                })}
            </div>
          )}
          {candidates.length > 0 && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <Wand2 size={13} style={{ color: 'var(--accent)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t('settings.skills.auto_draft_title', '建议自动生成')}</span>
              </div>
              {candidates.map((c) => (
                <div key={c.name} className="flex items-center gap-2 p-2 rounded-lg mb-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <span className="text-xs font-mono flex-1" style={{ color: 'var(--text-secondary)' }}>
                    {c.name} <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>({c.totalUses}次 · {Math.round(c.successRate * 100)}%)</span>
                  </span>
                  <button onClick={() => autoDraft(c.name, `Auto-drafted from ${c.totalUses} successful uses`)}
                    disabled={busy}
                    className="text-[10px] px-2 py-0.5 rounded border hover:bg-[var(--bg-primary)] transition-colors flex items-center gap-1"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                    <Wand2 size={9} /> {t('settings.skills.auto_draft', '生成技能')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <p className="text-[10px] mt-3" style={{ color: 'var(--text-muted)' }}>{t('settings.skills.hint')}</p>
    </div>
  )
}
