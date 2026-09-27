import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, AlertCircle, AlertTriangle, Info, Bell, X, Sparkles } from 'lucide-react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'

// ───────────────────────────────────────────────────────────────────────────
// Lightweight toast + confirm-dialog system (zero-dependency, shadcn-flavored).
//
// Exposes a singleton via `useUI()`:
//   toast(message, { type?: 'success'|'error'|'warning'|'info', duration?: 2500 })
//   confirm({ title, description, confirmText, danger }): Promise<boolean>
//
// Unifies the entire app's feedback:
//   - All toasts and task completion notices render in one single <Toaster />
//   - All confirms render in the accessible, keyboard-trapped <ConfirmHost />
// ───────────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export type ConfirmOptions = {
  title?: string
  description?: string
  message?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

type ConfirmState = (ConfirmOptions & { resolve: (v: boolean) => void }) | null

export type UIApi = {
  toast: (message: string, opts?: { type?: ToastType; duration?: number }) => void
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}

const UICtx = createContext<UIApi | null>(null)

let globalUI: UIApi | null = null

export function useUI(): UIApi {
  const ctx = useContext(UICtx)
  if (!ctx) {
    if (globalUI) return globalUI
    return {
      toast: (m, opts) => { useStore.getState().triggerToast(m, opts?.type || 'info') },
      confirm: (o) => Promise.resolve(window.confirm(o.title || o.description || o.message || '')),
    }
  }
  return ctx
}

export function showToast(message: string, opts?: { type?: ToastType; duration?: number }) {
  if (globalUI) {
    globalUI.toast(message, opts)
  } else {
    useStore.getState().triggerToast(message, opts?.type || 'info')
  }
}

export function showConfirm(opts: ConfirmOptions): Promise<boolean> {
  if (globalUI) {
    return globalUI.confirm(opts)
  }
  return Promise.resolve(window.confirm(opts.title || opts.description || opts.message || ''))
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState>(null)

  const toast = useCallback((message: string, opts?: { type?: ToastType; duration?: number }) => {
    useStore.getState().triggerToast(message, opts?.type || 'info')
  }, [])

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...opts, resolve })
    })
  }, [])

  const closeConfirm = (val: boolean) => {
    if (confirmState) {
      confirmState.resolve(val)
      setConfirmState(null)
    }
  }

  useEffect(() => {
    globalUI = { toast, confirm }
    return () => { globalUI = null }
  }, [toast, confirm])

  return (
    <UICtx.Provider value={{ toast, confirm }}>
      {children}
      <Toaster />
      <ConfirmHost state={confirmState} onConfirm={() => closeConfirm(true)} onCancel={() => closeConfirm(false)} />
    </UICtx.Provider>
  )
}

const ICONS = { success: Check, error: AlertCircle, warning: AlertTriangle, info: Info }
const ACCENTS = {
  success: 'var(--success)',
  error: 'var(--error)',
  warning: 'var(--warning)',
  info: 'var(--accent)',
}

function Toaster() {
  const toasts = useStore((s) => s.toasts)
  const completionToasts = useStore((s) => s.completionToasts)
  const dismiss = useStore((s) => s.dismissToast)
  const selectSession = useStore((s) => s.selectSession)
  const setCurrentView = useStore((s) => s.setCurrentView)

  if (toasts.length === 0 && completionToasts.length === 0) return null

  const handleSessionClick = (tItem: { id: number; sessionId: number; sessionTitle: string }) => {
    selectSession(tItem.sessionId)
    setCurrentView('chat')
    dismiss(tItem.id)
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 animate-blur-fade pointer-events-none">
      {/* Background session completion notices */}
      {completionToasts.map((ct) => (
        <div
          key={ct.id}
          onClick={() => handleSessionClick(ct)}
          className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border shadow-lg text-xs cursor-pointer hover:opacity-90 transition-all max-w-sm"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
        >
          <Bell size={14} className="shrink-0" style={{ color: 'var(--accent)' }} />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{t('chat.task_complete', '任务已完成')}</div>
            <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{ct.sessionTitle || '会话'}</div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              dismiss(ct.id)
            }}
            className="p-1 rounded hover:bg-[var(--border)] transition-colors shrink-0"
            aria-label={t('common.dismiss', '关闭')}
          >
            <X size={12} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      ))}

      {/* Standard status toasts */}
      {toasts.map((tItem) => {
        const type = tItem.type || 'info'
        const Icon = ICONS[type] || Info
        const isSpecial = tItem.message.includes('Self-improvement') || tItem.message.includes('Skill')

        return (
          <div
            key={tItem.id}
            className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border shadow-lg text-xs max-w-sm transition-all"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            {isSpecial ? (
              <Sparkles size={14} style={{ color: 'var(--accent)' }} className="shrink-0" />
            ) : (
              <Icon size={14} style={{ color: ACCENTS[type] }} className="shrink-0" />
            )}
            <span className="flex-1 font-medium leading-relaxed break-words">{tItem.message}</span>
            <button
              onClick={() => dismiss(tItem.id)}
              className="p-1 rounded hover:bg-[var(--border)] transition-colors shrink-0"
              aria-label={t('common.dismiss', '关闭')}
            >
              <X size={12} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// Accessible Confirm Modal with focus trap and Esc/Enter handling
function ConfirmHost({ state, onConfirm, onCancel }: { state: ConfirmState; onConfirm: () => void; onCancel: () => void }) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const cancelBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!state) return

    // Auto-focus preferred button (cancel button if danger, confirm otherwise)
    if (state.danger) {
      cancelBtnRef.current?.focus()
    } else {
      confirmBtnRef.current?.focus()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (document.activeElement === cancelBtnRef.current) {
          onCancel()
        } else {
          onConfirm()
        }
      } else if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === cancelBtnRef.current) {
            e.preventDefault()
            confirmBtnRef.current?.focus()
          }
        } else {
          if (document.activeElement === confirmBtnRef.current) {
            e.preventDefault()
            cancelBtnRef.current?.focus()
          }
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, onConfirm, onCancel])

  if (!state) return null
  const danger = state.danger
  const desc = state.description || state.message

  return (
    <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 modal-backdrop-fade" onClick={onCancel} />
      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative w-full max-w-sm rounded-lg border shadow-2xl p-5 animate-spring-up"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
      >
        <h3 id="confirm-dialog-title" className="text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
          {state.title || t('common.confirm', '确认')}
        </h3>
        {desc && (
          <p className="text-xs leading-relaxed mb-4 whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
            {desc}
          </p>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button
            ref={cancelBtnRef}
            onClick={onCancel}
            className="px-3.5 py-1.5 text-xs rounded-md border hover:bg-[var(--bg-secondary)] transition-all press-scale"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {state.cancelText || t('common.cancel', '取消')}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            className="px-3.5 py-1.5 text-xs rounded-md text-white transition-all press-scale hover:opacity-90 shadow-sm font-medium"
            style={{ backgroundColor: danger ? 'var(--error)' : 'var(--accent)' }}
          >
            {state.confirmText || t('common.confirm', '确定')}
          </button>
        </div>
      </div>
    </div>
  )
}
