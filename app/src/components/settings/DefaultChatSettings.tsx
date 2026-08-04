import { useMemo, useState } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'

const PRIORITY_OPTIONS = [
  { value: 'quality', icon: '🎯' },
  { value: 'speed', icon: '⚡' },
  { value: 'cost', icon: '💰' },
]

export default function DefaultChatSettings() {
  const defaultModelId = useStore((s) => s.defaultModelId)
  const defaultPersonaId = useStore((s) => s.defaultPersonaId)
  const modelRoutingPriority = useStore((s) => s.modelRoutingPriority)
  const setModelRoutingPriority = useStore((s) => s.setModelRoutingPriority)
  const modelAutoRoute = useStore((s) => s.modelAutoRoute)
  const setModelAutoRoute = useStore((s) => s.setModelAutoRoute)
  const allModels = useStore((s) => s.allModels)
  const personas = useStore((s) => s.personas)
  const setDefaultModel = useStore((s) => s.setDefaultModel)
  const setDefaultPersona = useStore((s) => s.setDefaultPersona)

  const modelOptions = useMemo(() => {
    return allModels.map(m => ({
      id: m.id,
      label: `${m.provider_name || m.api_url || ''}  ·  ${m.display_name || m.model_name}`,
    }))
  }, [allModels])

  // Sort by provider name for readability
  const sortedOptions = useMemo(() => {
    return [...modelOptions].sort((a, b) => a.label.localeCompare(b.label))
  }, [modelOptions])

  return (
    <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
      <h2 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.default_chat')}</h2>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{t('settings.default_chat.desc')}</p>
      <div className="space-y-4">
        <div>
          <p className="text-sm mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.default_model')}</p>
          <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>{t('settings.default_model_desc')}</p>
          <select value={defaultModelId ?? ''} onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : null
            setDefaultModel(v)
          }} className="px-2.5 py-1.5 text-xs rounded-lg border outline-none" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)', color: 'var(--text-primary)' }}>
            <option value="">{t('settings.default_model_none')}</option>
            {modelOptions.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <p className="text-sm mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.default_persona')}</p>
          <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>{t('settings.default_persona_desc')}</p>
          <select value={defaultPersonaId ?? ''} onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : null
            setDefaultPersona(v)
          }} className="px-2.5 py-1.5 text-xs rounded-lg border outline-none" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)', color: 'var(--text-primary)' }}>
            <option value="">{t('chat.no_persona')}</option>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>{t('settings.routing_priority')}</p>
          <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>{t('settings.routing_priority_desc')}</p>
          <div className="flex gap-2">
            {PRIORITY_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setModelRoutingPriority(opt.value as any)}
                className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${modelRoutingPriority === opt.value ? 'bg-black text-white' : 'hover:bg-[var(--bg-secondary)]'}`}
                style={modelRoutingPriority !== opt.value ? { borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--content-bg)' } : {}}>
                {opt.icon} {t(`settings.routing_priority.${opt.value}`)}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{t('settings.auto_route')}</span>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{t('settings.auto_route_desc')}</p>
          </div>
          <input type="checkbox" checked={modelAutoRoute} onChange={(e) => setModelAutoRoute(e.target.checked)} className="w-4 h-4 accent-black" />
        </label>
      </div>
    </div>
  )
}
