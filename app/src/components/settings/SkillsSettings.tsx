import { useState, useEffect } from 'react'
import { useUI } from '@/components/ui/feedback'
import { t } from '@/utils/i18n'
import { Sparkles, RefreshCw, BookOpen, Tag, Clock, Zap } from 'lucide-react'

// ───────────────────────────────────────────────────────────────────────────
// Skills settings — discover and manage Claude-Code-format SKILL.md skills.
//
// Shows each skill's name, description, file path, usage count, last-used
// timestamp, and any extra frontmatter metadata (tags, category, etc.).
// ───────────────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string | null): string {
  if (!iso) return t('settings.skills.never_used') || '从未使用'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} ${t('settings.skills.minutes_ago') || '分钟前'}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ${t('settings.skills.hours_ago') || '小时前'}`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} ${t('settings.skills.days_ago') || '天前'}`
  return `${Math.floor(days / 30)} ${t('settings.skills.months_ago') || '个月前'}`
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

export default function SkillsSettings() {
  const { toast } = useUI()
  const [skills, setSkills] = useState<{ name: string; description: string; filePath: string; metadata?: Record<string, string>; usage?: { count: number; lastUsedAt: string | null } }[]>([])
  const [busy, setBusy] = useState(false)

  const load = () => {
    try {
      window.electronAPI?.skills?.list?.().then(setSkills).catch(() => setSkills([]))
    } catch { setSkills([]) }
  }
  useEffect(() => { load() }, [])

  const rescan = async () => {
    setBusy(true)
    try {
      const res = await window.electronAPI?.skills?.rescan?.()
      if (res?.success) {
        load()
        toast(t('settings.skills.rescanned', String(res.count)), { type: 'success' })
      }
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  const totalUsed = skills.reduce((a, s) => a + (s.usage?.count || 0), 0)

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
          <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />{t('settings.skills.rescan')}
        </button>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{t('settings.skills.desc')}</p>

      {totalUsed > 0 && (
        <div className="flex items-center gap-3 mb-3 px-2.5 py-1.5 rounded-lg text-[11px]" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
          <Zap size={12} /> {t('settings.skills.total_used', String(totalUsed)) || `共使用 ${totalUsed} 次`}
        </div>
      )}

      {skills.length === 0 ? (
        <div className="text-center py-6 text-xs" style={{ color: 'var(--text-muted)' }}>
          <BookOpen size={20} className="mx-auto mb-2 opacity-40" />
          {t('settings.skills.empty')}
        </div>
      ) : (
        <div className="space-y-1.5">
          {skills.map((s) => (
            <div key={s.name} className="flex items-start gap-2 p-2.5 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <span className="text-base leading-none mt-0.5">✨</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{s.name}</div>
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
          ))}
        </div>
      )}
      <p className="text-[10px] mt-3" style={{ color: 'var(--text-muted)' }}>{t('settings.skills.hint')}</p>
    </div>
  )
}
