import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Check, AlertCircle, Info, X } from 'lucide-react'

// ───────────────────────────────────────────────────────────────────────────
// Lightweight toast + confirm-dialog system (zero-dependency, shadcn-flavored).
//
// Exposes a singleton via `useUI()`:
//   toast(message, { type?: 'success'|'error'|'info', duration?: 2500 })
//   confirm({ title, description, confirmText, danger }): Promise<boolean>
//
// Renders <Toaster/> + <ConfirmHost/> once at the app root (App.tsx). The
// dialog replaces native confirm(); toasts replace native alert().
// ───────────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info'
type Toast = { id: number; message: string; type: ToastType }

type ConfirmOptions = {
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}
type ConfirmState = (ConfirmOptions & { resolve: (v: boolean) => void }) | null

type UIApi = {
  toast: (message: string, opts?: { type?: ToastType; duration?: number }) => void
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}

const UICtx = createContext<UIApi | null>(null)

export function useUI(): UIApi {
  const ctx = useContext(UICtx)
  if (!ctx) {
    // Fallback for callers outside the provider — degrade to native so nothing breaks.
    return {
      toast: (m) => { try { alert(m) } catch {} },
      confirm: (o) => Promise.resolve(window.confirm(o.title || '')),
    }
  }
  return ctx
}

let toastSeq = 1

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmState, setConfirmState] = useState<ConfirmState>(null)

  const toast = useCallback((message: string, opts?: { type?: ToastType; duration?: number }) => {
    const id = toastSeq++
    const type = opts?.type || 'info'
    const duration = opts?.duration ?? 2500
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration)
  }, [])

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...opts, resolve })
    })
  }, [])

  const closeConfirm = (val: boolean) => {
    if (confirmState) { confirmState.resolve(val); setConfirmState(null) }
  }

  return (
    <UICtx.Provider value={{ toast, confirm }}>
      {children}
      <Toaster toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
      <ConfirmHost state={confirmState} onConfirm={() => closeConfirm(true)} onCancel={() => closeConfirm(false)} />
    </UICtx.Provider>
  )
}

const ICONS = { success: Check, error: AlertCircle, info: Info }
const ACCENTS = { success: 'var(--success)', error: 'var(--error)', info: 'var(--accent)' }

function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 animate-blur-fade">
      {toasts.map((t) => {
        const Icon = ICONS[t.type]
        return (
          <div key={t.id} className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border shadow-lg text-sm max-w-sm"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
            <Icon size={15} style={{ color: ACCENTS[t.type] }} className="shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button onClick={() => onDismiss(t.id)} className="p-0.5 rounded hover:bg-[var(--border)] transition-colors">
              <X size={13} className="text-gray-400" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// Escape closes the dialog; Esc/Enter wired via key listener while open.
function ConfirmHost({ state, onConfirm, onCancel }: { state: ConfirmState; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      else if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, onConfirm, onCancel])

  if (!state) return null
  const danger = state.danger
  return (
    <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 animate-blur-fade" onClick={onCancel} />
      {/* Dialog */}
      <div className="relative w-full max-w-sm rounded-2xl border shadow-xl p-5 animate-blur-fade"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{state.title || '确认'}</h3>
        {state.description && <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>{state.description}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-3.5 py-1.5 text-xs rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>{state.cancelText || '取消'}</button>
          <button onClick={onConfirm}
            className="px-3.5 py-1.5 text-xs rounded-lg text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: danger ? 'var(--error)' : 'var(--accent)' }}>{state.confirmText || '确定'}</button>
        </div>
      </div>
    </div>
  )
}
