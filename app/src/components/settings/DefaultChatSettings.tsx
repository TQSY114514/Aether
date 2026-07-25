import { useMemo } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'

export default function DefaultChatSettings() {
  const defaultModelId = useStore((s) => s.defaultModelId)
  const defaultPersonaId = useStore((s) => s.defaultPersonaId)
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
            <option value="">{t('settings.default_model_none', 'Auto (first enabled provider)')}</option>
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
      </div>
    </div>
  )
}
