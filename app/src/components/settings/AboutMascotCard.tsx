import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import { useUI } from '@/components/ui/feedback'
import { setFeatureFlag, useFeatureFlag } from '@/utils/featureFlags'
import type { MascotState } from '@/utils/mascotState'
import { t } from '@/utils/i18n'
import portraitImg from '@/assets/mascot/portrait.webp'
import avatarReady from '@/assets/mascot/avatar-ready.webp'
import avatarWorking from '@/assets/mascot/avatar-working.webp'
import avatarSleeping from '@/assets/mascot/avatar-sleeping.webp'
import avatarAlert from '@/assets/mascot/avatar-alert.webp'

const PREVIEW_STATES: { state: MascotState; src: string; labelKey: string }[] = [
  { state: 'ready', src: avatarReady, labelKey: 'mascot.state.ready' },
  { state: 'working', src: avatarWorking, labelKey: 'mascot.state.working' },
  { state: 'sleeping', src: avatarSleeping, labelKey: 'mascot.state.sleeping' },
  { state: 'alert', src: avatarAlert, labelKey: 'mascot.state.alert' },
]

/** Settings About card showcasing Aether identity, version, and opt-in sidebar companion. */
export default function AboutMascotCard() {
  const { toast } = useUI()
  const mascotEnabled = useFeatureFlag('ux.mascotCompanion', false)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState('1.1.0')
  const [selectedState, setSelectedState] = useState<MascotState>('ready')

  useEffect(() => {
    let cancelled = false
    window.electronAPI?.updater?.status?.()
      .then((res) => {
        const rawVer = res?.currentVersion as unknown
        const normalized =
          typeof rawVer === 'string'
            ? rawVer
            : rawVer && typeof rawVer === 'object' && 'version' in rawVer && typeof (rawVer as { version?: unknown }).version === 'string'
              ? (rawVer as { version: string }).version
              : null
        if (!cancelled && normalized) {
          setVersion(normalized)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const handleToggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      const next = !mascotEnabled
      const ok = await setFeatureFlag('ux.mascotCompanion', next)
      if (ok) {
        toast(next ? t('mascot.toggle.enabled') : t('mascot.toggle.disabled'), { type: 'success' })
      } else {
        toast(t('mascot.toggle.failed'), { type: 'error' })
      }
    } catch {
      toast(t('mascot.toggle.failed'), { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Info size={15} style={{ color: 'var(--accent)' }} />
        <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {t('settings.about.title')}
        </h2>
      </div>

      {/* Identity Block */}
      <div className="flex items-start gap-4 mt-3">
        <div
          className="w-20 h-20 rounded-lg overflow-hidden border shrink-0"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <img
            src={portraitImg}
            alt="Aether"
            draggable={false}
            className="w-full h-full object-cover object-top"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Aether
            </span>
            <span
              className="text-[10.5px] font-mono px-1.5 py-0.5 rounded-[4px] border"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
              }}
            >
              v{version}
            </span>
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {t('settings.about.subtitle')}
          </p>
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-primary)' }}>
            {t('settings.about.tagline')}
          </p>
          <p className="text-[11px] font-mono mt-1.5" style={{ color: 'var(--text-muted)' }}>
            {t('settings.about.role')}
          </p>
        </div>
      </div>

      {/* Opt-in Sidebar Companion Switch */}
      <div
        className="flex items-center justify-between gap-3 mt-4 pt-3.5 border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="min-w-0">
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {t('mascot.toggle.title')}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {t('mascot.toggle.desc')}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={mascotEnabled}
          aria-label={t('mascot.toggle.title')}
          onClick={handleToggle}
          disabled={busy}
          className="relative w-10 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none"
          style={{ backgroundColor: mascotEnabled ? 'var(--accent)' : 'var(--border)' }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-xs motion-reduce:transition-none"
            style={{ left: mascotEnabled ? '22px' : '2px' }}
          />
        </button>
      </div>

      {/* 4-State Expression Preview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        {PREVIEW_STATES.map((item) => {
          const active = selectedState === item.state
          return (
            <button
              key={item.state}
              type="button"
              onClick={() => setSelectedState(item.state)}
              className="flex items-center gap-2 p-2 rounded-[6px] border text-left transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
              style={{
                borderColor: active ? 'var(--accent)' : 'var(--border)',
                backgroundColor: active ? 'var(--bg-secondary)' : 'var(--bg-primary)',
              }}
            >
              <div
                className="w-10 h-10 rounded-[6px] overflow-hidden border shrink-0"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <img
                  src={item.src}
                  alt={t(item.labelKey)}
                  draggable={false}
                  className={`w-full h-full object-cover object-top ${item.state === 'sleeping' ? 'opacity-80' : ''}`}
                />
              </div>
              <span
                className="text-[11px] font-medium truncate"
                style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
              >
                {t(item.labelKey)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
