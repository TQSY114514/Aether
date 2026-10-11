import { useState, useEffect } from 'react'
import { Plug, Copy } from 'lucide-react'
import { useUI } from '@/components/ui/feedback'
import { t } from '@/utils/i18n'

// "Local Gateway" card — connection info for VS Code / external tools
export default function GatewayCard() {
  const { toast } = useUI()
  const [info, setInfo] = useState<{ enabled: boolean; port: number; token: string | null; running: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const refresh = async () => {
    try { setInfo(await window.electronAPI?.gateway?.info?.()) } catch { setInfo(null) }
  }
  useEffect(() => { refresh() }, [])

  const toggle = async () => {
    if (!info) return
    setBusy(true)
    try {
      await window.electronAPI?.gateway?.setEnabled?.(!info.enabled)
      await refresh()
    } catch {
      toast(t('settings.gateway.toggle_failed'), { type: 'error' })
    }
    setBusy(false)
  }

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(t('settings.gateway.copied', label), { type: 'success' })
    } catch {
      toast(t('settings.gateway.copy_failed'), { type: 'error' })
    }
  }

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug size={16} className="shrink-0" style={{ color: 'var(--accent)' }} />
          <div>
            <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.gateway.title')}</h2>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {t('settings.gateway.subtitle')} · {info?.enabled ? (info?.running ? t('settings.gateway.running') : t('settings.gateway.enabled')) : t('settings.gateway.disabled')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-2.5 py-1 text-xs rounded-md border hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {expanded ? t('settings.gateway.collapse') : t('settings.gateway.configure')}
          </button>
          <button
            onClick={toggle}
            disabled={busy || !info}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all active:scale-[0.98] cursor-pointer ${
              info?.enabled ? 'text-white' : 'border'
            }`}
            style={info?.enabled ? { backgroundColor: 'var(--accent)' } : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {info?.enabled ? t('settings.gateway.enabled') : t('settings.gateway.status_stopped')} · {busy ? '…' : t('settings.gateway.toggle')}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-2.5" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {t('settings.gateway.description')}
          </p>
          {info ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span style={{ color: 'var(--text-muted)' }}>{t('settings.gateway.address')}</span>
                <button
                  onClick={() => copy(`http://127.0.0.1:${info.port}`, t('settings.gateway.address'))}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border hover:bg-[var(--bg-secondary)] transition-colors font-mono active:scale-[0.98] cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  http://127.0.0.1:{info.port} <Copy size={11} />
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span style={{ color: 'var(--text-muted)' }}>{t('settings.gateway.token')}</span>
                <button
                  onClick={() => info.token && copy(info.token, t('settings.gateway.token'))}
                  disabled={!info.token}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border hover:bg-[var(--bg-secondary)] transition-colors font-mono disabled:opacity-40 active:scale-[0.98] cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  {info.token ? `${info.token.slice(0, 12)}…` : '—'} <Copy size={11} />
                </button>
              </div>
              <div className="text-[11px] font-medium pt-1" style={{ color: info.running ? 'var(--success)' : '#dc2626' }}>
                {info.running ? t('settings.gateway.running_local_only') : t('settings.gateway.not_running')}
              </div>
            </div>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('settings.gateway.loading')}</p>
          )}
        </div>
      )}
    </div>
  )
}
