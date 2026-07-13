import { useState, useEffect } from 'react'
import { useUI } from '@/components/ui/feedback'
import { t } from '@/utils/i18n'
import { Sparkles, RefreshCw, BookOpen } from 'lucide-react'

// ───────────────────────────────────────────────────────────────────────────
// Skills settings — discover and manage Claude-Code-format SKILL.md skills.
//
// Skills are folders with a SKILL.md (YAML frontmatter: name, description).
// Scan roots (precedence, first wins): <workspace>/.claude/skills,
// <workspace>/.aetherai/skills, <userData>/skills, <app>/skills (built-in).
//
// To add a skill: drop a folder named <skill-name>/SKILL.md into any scan dir.
// The skill body loads on demand when the model calls use_skill — only
// name+description enter the system prompt (progressive disclosure).
// ───────────────────────────────────────────────────────────────────────────
export default function SkillsSettings() {
  const { toast } = useUI()
  const [skills, setSkills] = useState<{ name: string; description: string; filePath: string }[]>([])
  const [busy, setBusy] = useState(false)

  const load = () => {
    window.electronAPI.skills.list().then(setSkills).catch(() => setSkills([]))
  }
  useEffect(() => { load() }, [])

  const rescan = async () => {
    setBusy(true)
    try {
      const res = await window.electronAPI.skills.rescan()
      if (res?.success) {
        load()
        toast(t('settings.skills.rescanned', String(res.count)), { type: 'success' })
      }
    } finally { setBusy(false) }
  }

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
                <div className="text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{s.name}</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{s.description}</div>
                <div className="text-[10px] mt-1 font-mono truncate" style={{ color: 'var(--text-muted)' }}>{s.filePath}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] mt-3" style={{ color: 'var(--text-muted)' }}>{t('settings.skills.hint')}</p>
    </div>
  )
}
