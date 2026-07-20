import { useEffect } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'

const SHORTCUTS = [
  { keys: ['Ctrl', 'N'], desc: t('empty.hint.new') },
  { keys: ['Ctrl', 'K'], desc: 'Command palette' },
  { keys: ['Ctrl', 'R'], desc: 'Regenerate last reply' },
  { keys: ['Esc'], desc: 'Stop generating / close dialogs' },
  { keys: ['Alt', '←'], desc: 'Back in session history' },
  { keys: ['Alt', '→'], desc: 'Forward in session history' },
  { keys: ['Enter'], desc: 'Send message' },
  { keys: ['Shift', 'Enter'], desc: 'New line in input' },
  { keys: ['/'], desc: t('empty.hint.slash') },
  { keys: ['Ctrl', 'E'], desc: 'Edit last message' },
]

function KeyBadge({ label }: { label: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 text-[10px] font-medium rounded border"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', boxShadow: '0 1px 0 var(--border)' }}>
      {label}
    </kbd>
  )
}

export default function ShortcutOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 animate-blur-fade" />
      <div className="relative w-full max-w-md rounded-2xl border shadow-2xl p-6 animate-blur-fade"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Keyboard Shortcuts</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--border)] transition-colors">
            <kbd className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>ESC</kbd>
          </button>
        </div>
        <div className="space-y-2.5">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-1.5">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{s.desc}</span>
              <div className="flex items-center gap-1">
                {s.keys.map(k => <KeyBadge key={k} label={k} />)}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] mt-4 text-center" style={{ color: 'var(--text-muted)' }}>Press <kbd className="px-1 rounded border" style={{ borderColor: 'var(--border)' }}>?</kbd> or <kbd className="px-1 rounded border" style={{ borderColor: 'var(--border)' }}>Shift+/</kbd> to toggle</p>
      </div>
    </div>
  )
}
