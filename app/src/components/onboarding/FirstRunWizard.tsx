import { useState } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { PROVIDER_PRESETS } from './providerPresets'
import { buildProviderPayload, isComplete, EMPTY_FORM, type Preset, type ProviderForm, type WizardStep } from './wizardLogic'
import { ArrowRight, Check, Shield, X } from 'lucide-react'

const MODES = [
  { key: 'off', color: 'var(--text-muted)' },
  { key: 'plan', color: '#3b82f6' },
  { key: 'ask', color: 'var(--accent)' },
  { key: 'auto', color: '#f97316' },
  { key: 'yolo', color: 'var(--error)' },
] as const

export default function FirstRunWizard({ onDone }: { onDone: () => void }) {
  const addProvider = useStore((s) => s.addProvider)
  const addModel = useStore((s) => s.addModel)

  const [step, setStep] = useState<WizardStep>('template')
  const [preset, setPreset] = useState<Preset | null>(null)
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const finish = async () => {
    try { await window.electronAPI.settings.set('onboarding_done', '1') } catch {}
    onDone()
  }

  const pickPreset = (p: Preset) => {
    setPreset(p)
    setForm({ name: p.name, api_url: p.api_url, api_key: '', api_format: p.api_format })
    setError('')
    setStep('provider')
  }

  const saveProvider = async () => {
    if (!preset || busy) return
    setBusy(true)
    setError('')
    try {
      const payload = buildProviderPayload(preset, form)
      await addProvider(payload)
      // The store reloads providers after create; find the fresh row by name.
      const created = [...useStore.getState().providers].reverse().find((p) => p.name === payload.name)
      if (created) {
        const names = (await window.electronAPI.provider.fetchModels(created.id)) || []
        const existing = new Set((useStore.getState().modelsByProvider[created.id] || []).map((m) => m.model_name))
        for (const name of names) {
          if (!existing.has(name)) {
            await addModel({
              provider_id: created.id,
              model_name: name,
              is_primary: 0,
              display_name: null,
              fallback_order: null,
              context_window: null,
              input_price_per_1k: null,
              output_price_per_1k: null,
            })
          }
        }
      }
      setStep('permission')
    } catch {
      setError(t('onboarding.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="w-full max-w-lg rounded-xl border p-6" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t('onboarding.title')}</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('onboarding.subtitle')}</p>
          </div>
          <button onClick={finish} aria-label={t('onboarding.skip')} title={t('onboarding.skip')}
            className="p-1 rounded hover:bg-(--bg-secondary) transition-colors">
            <X size={14} className="text-gray-400" />
          </button>
        </div>

        {step === 'template' && (
          <div>
            {/* Desktop polish #9: import existing configuration — if the user
                already saved API keys (auth.json via /apikey or the app), offer
                to skip straight past onboarding. */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg mb-3" style={{ backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid var(--border)' }}>
              <Check size={13} className="text-green-500 shrink-0" />
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                已有配置? 在终端输入 <code className="font-mono text-[10px]" style={{ color: 'var(--accent)' }}>aether tui</code> 后用 <code className="font-mono text-[10px]" style={{ color: 'var(--accent)' }}>/apikey &lt;provider&gt; &lt;key&gt;</code> 保存密钥, 或在「模型」页手动添加 provider — 完成后向导会自动消失。
              </p>
            </div>
            <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{t('onboarding.template')}</div>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDER_PRESETS.map((p) => (
                <button key={p.name} onClick={() => pickPreset(p)}
                  className="text-left px-3 py-2.5 rounded-lg border transition-colors hover:bg-(--bg-secondary)"
                  style={{ borderColor: 'var(--border)' }}>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</div>
                  <div className="text-[11px] font-mono truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{p.api_url}</div>
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <button onClick={finish}
                className="px-3 py-1.5 text-xs rounded-lg border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>{t('onboarding.skip')}</button>
            </div>
          </div>
        )}

        {step === 'provider' && preset && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('onboarding.name')}</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg outline-none bg-(--content-bg)"
                style={{ border: '1px solid var(--border)' }} />
            </label>
            <label className="block">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('onboarding.url')}</span>
              <input value={form.api_url} onChange={(e) => setForm({ ...form, api_url: e.target.value })}
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg outline-none font-mono bg-(--content-bg)"
                style={{ border: '1px solid var(--border)' }} />
            </label>
            {!preset.local && (
              <label className="block">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('onboarding.key')}</span>
                <input value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} type="password"
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg outline-none font-mono bg-(--content-bg)"
                  style={{ border: '1px solid var(--border)' }} />
              </label>
            )}
            {error && <p className="text-xs" style={{ color: 'var(--error)' }}>{error}</p>}
            <div className="flex justify-between pt-1">
              <button onClick={() => { setStep('template'); setError('') }}
                className="px-3 py-1.5 text-xs rounded-lg border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>{t('chat.cancel')}</button>
              <button onClick={saveProvider} disabled={busy || !isComplete(preset, form)}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg text-white disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: 'var(--accent)' }}>
                {busy ? <span>{t('onboarding.fetch')}</span> : <><span>{t('onboarding.next')}</span><ArrowRight size={12} /></>}
              </button>
            </div>
          </div>
        )}

        {step === 'permission' && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={14} style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('onboarding.permission')}</span>
            </div>
            <div className="space-y-1.5">
              {MODES.map((m) => {
                const isAsk = m.key === 'ask'
                return (
                  <div key={m.key} className={`px-3 py-2 rounded-lg border ${isAsk ? '' : 'opacity-70'}`}
                    style={{ borderColor: isAsk ? 'var(--accent)' : 'var(--border)', backgroundColor: isAsk ? 'rgba(99,102,241,0.06)' : 'var(--bg-secondary)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium" style={{ color: m.color }}>{t(`agent.mode.${m.key}`)}</span>
                      {isAsk && (
                        <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
                          <Check size={9} />{t('onboarding.ask_recommended')}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t(`agent.mode.${m.key}.desc`)}</div>
                  </div>
                )
              })}
            </div>
            <div className="mt-5 flex justify-end">
              <button onClick={finish}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg text-white transition-opacity"
                style={{ backgroundColor: 'var(--accent)' }}>{t('onboarding.complete')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
