import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { Bell, X } from 'lucide-react'

export default function CompletionToasts() {
  const toasts = useStore((s) => s.completionToasts)
  const dismiss = useStore((s) => s.dismissToast)
  const selectSession = useStore((s) => s.selectSession)
  const setCurrentView = useStore((s) => s.setCurrentView)

  if (toasts.length === 0) return null

  const handleClick = (toast: { id: number; sessionId: number; sessionTitle: string }) => {
    selectSession(toast.sessionId)
    setCurrentView('chat')
    dismiss(toast.id)
  }

  return (
    <div className="fixed bottom-4 left-[280px] z-[90] flex flex-col gap-1.5 animate-blur-fade">
      {toasts.map((toast) => (
        <div key={toast.id}
          onClick={() => handleClick(toast)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border shadow-lg text-xs cursor-pointer hover:opacity-80 transition-all max-w-[260px]"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}>
          <Bell size={12} className="shrink-0" style={{ color: 'var(--accent)' }} />
          <span className="flex-1 truncate">{toast.sessionTitle}</span>
          <button onClick={(e) => { e.stopPropagation(); dismiss(toast.id) }}
            className="p-0.5 rounded hover:bg-[var(--border)] transition-colors shrink-0">
            <X size={10} className="text-gray-400" />
          </button>
        </div>
      ))}
    </div>
  )
}
