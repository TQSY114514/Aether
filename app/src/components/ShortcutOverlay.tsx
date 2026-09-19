import { useEffect } from 'react'
import { SHORTCUTS } from '@/shortcuts'
import { t } from '@/utils/i18n'

const GROUPS = ['global', 'chat', 'navigation'] as const

function KeyBadge({ label }: { label: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 text-[10px] font-medium rounded border"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', boxShadow: '0 1px 0 var(--border)' }}>
      {label}
    </kbd>
  )
}

export default function ShortcutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 modal-backdrop-fade" />
      <div className="relative w-full max-w-md rounded-lg border shadow-xl p-6 animate-spring-up"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('shortcuts.title')}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--border)] transition-colors">
            <kbd className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>ESC</kbd>
          </button>
        </div>
        <div className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g}>
              <h3 className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{t(`shortcuts.group.${g}`)}</h3>
              {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                <div key={s.id} className="flex items-center justify-between py-1.5">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{s.desc}</span>
                  <div className="flex items-center gap-1">
                    {s.combos.map((c) => <KeyBadge key={c} label={c.replace('ArrowLeft', '←').replace('ArrowRight', '→')} />)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="text-[10px] mt-4 text-center" style={{ color: 'var(--text-muted)' }}>Press <kbd className="px-1 rounded border" style={{ borderColor: 'var(--border)' }}>Ctrl+?</kbd> or <kbd className="px-1 rounded border" style={{ borderColor: 'var(--border)' }}>Ctrl+/</kbd> to toggle</p>
      </div>
    </div>
  )
}
