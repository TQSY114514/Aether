import { useStore } from '@/store'
import { Bell, X, CheckCircle2, AlertTriangle, AlertCircle, Info, Sparkles } from 'lucide-react'

export default function CompletionToasts() {
  const completionToasts = useStore((s) => s.completionToasts)
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  const selectSession = useStore((s) => s.selectSession)
  const setCurrentView = useStore((s) => s.setCurrentView)

  if (completionToasts.length === 0 && toasts.length === 0) return null

  const handleSessionClick = (toast: { id: number; sessionId: number; sessionTitle: string }) => {
    selectSession(toast.sessionId)
    setCurrentView('chat')
    dismiss(toast.id)
  }

  const renderToastIcon = (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => {
    if (msg.includes('Self-improvement') || msg.includes('Skill')) {
      return <Sparkles size={13} className="shrink-0" style={{ color: 'var(--accent)' }} />
    }
    switch (type) {
      case 'success':
        return <CheckCircle2 size={13} className="shrink-0" style={{ color: 'var(--success)' }} />
      case 'warning':
        return <AlertTriangle size={13} className="shrink-0" style={{ color: 'var(--warning)' }} />
      case 'error':
        return <AlertCircle size={13} className="shrink-0" style={{ color: 'var(--error)' }} />
      default:
        return <Info size={13} className="shrink-0" style={{ color: 'var(--accent)' }} />
    }
  }

  return (
    <div className="fixed bottom-4 left-[280px] z-[90] flex flex-col gap-1.5 animate-blur-fade pointer-events-none">
      {completionToasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => handleSessionClick(toast)}
          className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-[8px] border shadow-lg text-xs cursor-pointer hover:opacity-85 transition-all max-w-[280px]"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
        >
          <Bell size={12} className="shrink-0" style={{ color: 'var(--accent)' }} />
          <span className="flex-1 truncate">{toast.sessionTitle}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              dismiss(toast.id)
            }}
            className="p-0.5 rounded hover:bg-[var(--border)] transition-colors shrink-0"
            aria-label="Dismiss notification"
          >
            <X size={10} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      ))}

      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-[8px] border shadow-md text-xs transition-all max-w-[360px]"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          {renderToastIcon(toast.message, toast.type)}
          <span className="flex-1 text-xs leading-tight font-medium break-words">{toast.message}</span>
          <button
            onClick={() => dismiss(toast.id)}
            className="p-0.5 rounded hover:bg-[var(--border)] transition-colors shrink-0"
            aria-label="Dismiss toast"
          >
            <X size={10} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      ))}
    </div>
  )
}
