import { useState, useEffect, useMemo } from 'react'
import { useUI } from '@/components/ui/feedback'
import { t } from '@/utils/i18n'
import { Pin, PinOff, RotateCcw, Search, Boxes } from 'lucide-react'

// ───────────────────────────────────────────────────────────────────────────
// SkillManager — skill lifecycle management panel.
//
// Lists every recorded skill_usage row with its state (active/stale/archived),
// use count, and last-used time. Supports:
//   - search filter by name
//   - pin/unpin (pinned skills skip automatic archival by the Curator)
//   - restore archived skills back to active
//
// The IPC surface (window.electronAPI.skills.getUsage / updateState / pin) is
// being unified separately; we access it via optional chaining + a loose cast
// so this component compiles whether or not env.d.ts has been updated yet.
// ───────────────────────────────────────────────────────────────────────────

type SkillState = 'active' | 'stale' | 'archived'

type SkillUsage = {
  name: string
  use_count: number
  last_used_at: string | null
  state: SkillState
  pinned: number | boolean
  created_by?: string
  patch_count?: number
  last_viewed_at?: string | null
  archived_at?: string | null
}

// Loose handle to the skills IPC surface. The getUsage/updateState/pin methods
// are added to the contract separately; casting here keeps the renderer type-
// clean without modifying env.d.ts from this change.
type SkillsApi = {
  getUsage?: () => Promise<SkillUsage[]>
  updateState?: (name: string, state: SkillState) => Promise<unknown>
  pin?: (name: string, pinned: boolean) => Promise<unknown>
}

function getSkillsApi(): SkillsApi {
  return (window.electronAPI as unknown as { skills?: SkillsApi })?.skills ?? {}
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return t('skills.never_used', '从未使用')
  const diff = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diff)) return '—'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('skills.just_now', '刚刚')
  if (mins < 60) return t('skills.minutes_ago', '{0} 分钟前', mins)
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('skills.hours_ago', '{0} 小时前', hours)
  const days = Math.floor(hours / 24)
  if (days < 30) return t('skills.days_ago', '{0} 天前', days)
  return t('skills.months_ago', '{0} 个月前', Math.floor(days / 30))
}

const STATE_STYLES: Record<SkillState, { bg: string; color: string; label: string }> = {
  active:   { bg: 'rgba(34,197,94,0.15)',    color: 'var(--success)',    label: 'active' },
  stale:    { bg: 'rgba(234,179,8,0.15)',    color: 'var(--warning)',    label: 'stale' },
  archived: { bg: 'rgba(156,163,175,0.15)',  color: 'var(--text-muted)', label: 'archived' },
}

export default function SkillManager() {
  const { toast } = useUI()
  const [skills, setSkills] = useState<SkillUsage[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = async () => {
    try {
      const list = await getSkillsApi().getUsage?.()
      setSkills(Array.isArray(list) ? list : [])
    } catch {
      setSkills([])
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return skills
    return skills.filter(s => String(s.name || '').toLowerCase().includes(q))
  }, [skills, query])

  const counts = useMemo(() => {
    const c = { active: 0, stale: 0, archived: 0 }
    for (const s of skills) {
      const st = (s.state || 'active') as SkillState
      if (c[st] !== undefined) c[st]++
    }
    return c
  }, [skills])

  const handlePin = async (name: string, pinned: boolean) => {
    setBusy(name)
    try {
      await getSkillsApi().pin?.(name, pinned)
      setSkills(prev => prev.map(s => s.name === name ? { ...s, pinned: pinned ? 1 : 0 } : s))
      toast(t('skills.pin_updated', pinned ? '已固定' : '已取消固定'), { type: 'success' })
    } catch {
      toast(t('skills.pin_failed', '操作失败'), { type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const handleRestore = async (name: string) => {
    setBusy(name)
    try {
      await getSkillsApi().updateState?.(name, 'active')
      setSkills(prev => prev.map(s => s.name === name ? { ...s, state: 'active', archived_at: null } : s))
      toast(t('skills.restored', '已恢复为 active'), { type: 'success' })
    } catch {
      toast(t('skills.restore_failed', '恢复失败'), { type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Boxes size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {t('skills.manage', 'Skill 管理')}
          </h2>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: STATE_STYLES.active.bg, color: STATE_STYLES.active.color }}>
            {counts.active} active
          </span>
          <span className="px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: STATE_STYLES.stale.bg, color: STATE_STYLES.stale.color }}>
            {counts.stale} stale
          </span>
          <span className="px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: STATE_STYLES.archived.bg, color: STATE_STYLES.archived.color }}>
            {counts.archived} archived
          </span>
        </div>
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
        {t('skills.manage_desc', '查看与维护已记录的 Skill 使用情况：固定常用、恢复归档。')}
      </p>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('skills.search_placeholder', '搜索 skill 名称…')}
          className="w-full pl-7 pr-2.5 py-1.5 text-xs rounded-lg border outline-none bg-(--content-bg)"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="text-left font-medium py-1.5 px-2" style={{ color: 'var(--text-muted)' }}>
                {t('skills.col_name', '名称')}
              </th>
              <th className="text-right font-medium py-1.5 px-2" style={{ color: 'var(--text-muted)' }}>
                {t('skills.col_uses', '使用次数')}
              </th>
              <th className="text-left font-medium py-1.5 px-2" style={{ color: 'var(--text-muted)' }}>
                {t('skills.col_state', '状态')}
              </th>
              <th className="text-left font-medium py-1.5 px-2" style={{ color: 'var(--text-muted)' }}>
                {t('skills.col_last_used', '最后使用')}
              </th>
              <th className="text-right font-medium py-1.5 px-2" style={{ color: 'var(--text-muted)' }}>
                {t('skills.col_actions', '操作')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
                  {skills.length === 0
                    ? t('skills.empty', '暂无 Skill 使用记录')
                    : t('skills.no_match', '无匹配结果')}
                </td>
              </tr>
            )}
            {filtered.map((s) => {
              const st = (s.state || 'active') as SkillState
              const style = STATE_STYLES[st] || STATE_STYLES.active
              const isPinned = !!s.pinned
              return (
                <tr key={s.name} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1.5">
                      {isPinned && <Pin size={11} style={{ color: 'var(--accent)' }} />}
                      <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                        {s.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {s.use_count || 0}
                  </td>
                  <td className="py-2 px-2">
                    <span
                      className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                      style={{ backgroundColor: style.bg, color: style.color }}
                    >
                      {style.label}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {formatRelativeTime(s.last_used_at)}
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handlePin(s.name, !isPinned)}
                        disabled={busy === s.name}
                        title={isPinned ? t('skills.unpin', '取消固定') : t('skills.pin', '固定')}
                        className="p-1 rounded hover:bg-(--bg-secondary) disabled:opacity-40 transition-colors"
                        style={{ color: isPinned ? 'var(--accent)' : 'var(--text-muted)' }}
                      >
                        {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                      </button>
                      <button
                        onClick={() => handleRestore(s.name)}
                        disabled={busy === s.name || st !== 'archived'}
                        title={t('skills.restore', '恢复为 active')}
                        className="p-1 rounded hover:bg-(--bg-secondary) disabled:opacity-30 transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <RotateCcw size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] mt-3" style={{ color: 'var(--text-muted)' }}>
        {t('skills.hint', 'Curator 每 7 天自动归档 90 天未使用的 Skill；固定的 Skill 不会被自动归档。')}
      </p>
    </div>
  )
}
