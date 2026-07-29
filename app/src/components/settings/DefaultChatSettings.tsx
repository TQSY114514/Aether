import { useMemo, useState } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'

const PRIORITY_OPTIONS = [
  { value: 'quality', icon: '🎯', label: 'Quality' },
  { value: 'speed', icon: '⚡', label: 'Speed' },
  { value: 'cost', icon: '💰', label: 'Cost' },
]

export default function DefaultChatSettings() {
  const defaultModelId = useStore((s) => s.defaultModelId)
  const defaultPersonaId = useStore((s) => s.defaultPersonaId)
  const modelRoutingPriority = useStore((s) => s.modelRoutingPriority)
  const setModelRoutingPriority = useStore((s) => s.setModelRoutingPriority)
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
          }} className="px-2.5 py-1.5 text-xs rounded-lg border outline-none bg-white" style={{ borderColor: 'var(--border)' }}>
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
          }} className="px-2.5 py-1.5 text-xs rounded-lg border outline-none bg-white" style={{ borderColor: 'var(--border)' }}>
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
                className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${modelRoutingPriority === opt.value ? 'bg-black text-white' : 'bg-white hover:bg-gray-50'}`}
                style={modelRoutingPriority !== opt.value ? { borderColor: 'var(--border)', color: 'var(--text-secondary)' } : {}}>
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
