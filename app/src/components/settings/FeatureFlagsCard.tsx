import { useState, useMemo } from 'react'
import { ShieldCheck, Sparkles, RotateCcw, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'
import { t } from '@/utils/i18n'
import { useUI } from '@/components/ui/feedback'
import { useFlagsList, setFeatureFlag, refreshFeatureFlags } from '@/utils/featureFlags'

export default function FeatureFlagsCard() {
  const flags = useFlagsList()
  const { toast } = useUI()
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const nonDebugFlags = useMemo(() => flags.filter((f) => f.category !== 'debug'), [flags])
  const enabledNonDebugCount = useMemo(
    () => nonDebugFlags.filter((f) => f.enabled).length,
    [nonDebugFlags]
  )
  const isSafeModeActive = nonDebugFlags.length > 0 && nonDebugFlags.every((f) => (f.key === 'ux.firstRunWizard' ? true : !f.enabled))
  const isFullModeActive = nonDebugFlags.length > 0 && enabledNonDebugCount === nonDebugFlags.length

  const applySafePreset = async () => {
    if (busy) return
    setBusy(true)
    try {
      await window.electronAPI?.flags?.safeMode?.()
      await refreshFeatureFlags()
      toast(t('settings.flags.safe_applied', '已切换至安全模式（已关闭实验性特性）'), { type: 'info' })
    } catch {
      toast(t('settings.flags.update_failed', '特性开关更新失败'), { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const applyFullPreset = async () => {
    if (busy) return
    setBusy(true)
    try {
      for (const f of nonDebugFlags) {
        if (!f.enabled) {
          await setFeatureFlag(f.key, true)
        }
      }
      await refreshFeatureFlags()
      toast(t('settings.flags.full_applied', '已开启完整模式（所有非调试特性已启用）'), { type: 'success' })
    } catch {
      toast(t('settings.flags.update_failed', '特性开关更新失败'), { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const resetToSafeDefaults = async () => {
    if (busy) return
    setBusy(true)
    try {
      for (const f of flags) {
        if (f.enabled !== f.default) {
          await setFeatureFlag(f.key, f.default)
        }
      }
      await refreshFeatureFlags()
      toast(t('settings.flags.defaults_restored', '已恢复为默认安全特性配置'), { type: 'info' })
    } catch {
      toast(t('settings.flags.update_failed', '特性开关更新失败'), { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <SlidersHorizontal size={14} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {t('settings.flags', '特性开关 (Feature Flags)')}
            </h2>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('settings.flags.desc', '切换保守安全模式或完整功能模式，或逐项控制实验性能力。')}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            disabled={busy}
            onClick={applySafePreset}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border font-medium transition-colors motion-reduce:transition-none hover:bg-[var(--bg-secondary)] active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
            style={
              isSafeModeActive
                ? { borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }
                : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
            }
          >
            <ShieldCheck size={12} style={isSafeModeActive ? { color: 'var(--accent)' } : undefined} />
            <span>{t('settings.flags.safe_mode', '安全模式')}</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={applyFullPreset}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border font-medium transition-colors motion-reduce:transition-none hover:bg-[var(--bg-secondary)] active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
            style={
              isFullModeActive
                ? { borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }
                : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
            }
          >
            <Sparkles size={12} style={isFullModeActive ? { color: 'var(--accent)' } : undefined} />
            <span>{t('settings.flags.full_mode', '完整模式')}</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={resetToSafeDefaults}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors motion-reduce:transition-none hover:bg-[var(--bg-secondary)] active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            <RotateCcw size={11} />
            <span>{t('settings.flags.reset_defaults', '重置为安全默认')}</span>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <span className="text-[11px] font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {enabledNonDebugCount} / {nonDebugFlags.length} {t('settings.flags.enabled_count', '项特性已启用')}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md hover:bg-[var(--bg-secondary)] transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span>{expanded ? t('settings.flags.collapse', '收起明细') : t('settings.flags.expand', '展开逐项开关')}</span>
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {expanded && (
        <div className="space-y-1.5 pt-1 max-h-72 overflow-y-auto pr-1">
          {flags.map((flag) => (
            <div
              key={flag.key}
              className="flex items-center justify-between gap-3 px-2.5 py-2 rounded-md border"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                    {flag.key}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.2 rounded border font-mono"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  >
                    {flag.category}
                  </span>
                </div>
                <p className="text-[11px] mt-0.5 truncate" title={flag.description} style={{ color: 'var(--text-muted)' }}>
                  {flag.description}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={flag.enabled}
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await setFeatureFlag(flag.key, !flag.enabled)
                  } finally {
                    setBusy(false)
                  }
                }}
                className="relative w-9 h-4.5 rounded-full transition-colors motion-reduce:transition-none shrink-0 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                style={{ backgroundColor: flag.enabled ? 'var(--accent)' : 'var(--border)' }}
              >
                <span
                  className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all motion-reduce:transition-none shadow-xs"
                  style={{ left: flag.enabled ? '20px' : '2px' }}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
