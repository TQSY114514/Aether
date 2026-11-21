import { useMemo } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { Award, Zap, Coins } from 'lucide-react'

const PRIORITY_OPTIONS = [
  { value: 'quality', Icon: Award },
  { value: 'speed', Icon: Zap },
  { value: 'cost', Icon: Coins },
]

/** Render controls for the default chat model and auto-routing behavior. */
export default function DefaultChatSettings() {
  const defaultModelId = useStore((s) => s.defaultModelId)
  const modelRoutingPriority = useStore((s) => s.modelRoutingPriority)
  const setModelRoutingPriority = useStore((s) => s.setModelRoutingPriority)
  const modelAutoRoute = useStore((s) => s.modelAutoRoute)
  const setModelAutoRoute = useStore((s) => s.setModelAutoRoute)
  const allModels = useStore((s) => s.allModels)
  const setDefaultModel = useStore((s) => s.setDefaultModel)

  const modelOptions = useMemo(() => {
    return allModels.map(m => ({
      id: m.id,
      label: `${m.provider_name || m.api_url || ''}  ·  ${m.display_name || m.model_name}`,
    }))
  }, [allModels])

  return (
    <div className="rounded-lg p-4 border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
      <h2 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.default_chat')}</h2>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{t('settings.default_chat.desc')}</p>
      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.default_model')}</p>
          <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>{t('settings.default_model_desc')}</p>
          <select value={defaultModelId ?? ''} onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : null
            setDefaultModel(v)
          }} className="px-2.5 py-1.5 text-xs rounded-md border outline-none cursor-pointer" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
            <option value="">{t('settings.default_model_none')}</option>
            {modelOptions.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.routing_priority')}</p>
          <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>{t('settings.routing_priority_desc')}</p>
          <div className="flex gap-2">
            {PRIORITY_OPTIONS.map(opt => {
              const active = modelRoutingPriority === opt.value
              return (
                <button key={opt.value} type="button" onClick={() => setModelRoutingPriority(opt.value as any)}
                  className={`flex-1 px-3 py-2 text-xs rounded-md border transition-colors flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${active ? 'text-white font-medium' : 'hover:bg-[var(--bg-secondary)]'}`}
                  style={active ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)' } : { borderColor: 'var(--border)', color: 'var(--text-secondary)', backgroundColor: 'var(--content-bg)' }}>
                  <opt.Icon size={13} className="shrink-0" />
                  <span>{t(`settings.routing_priority.${opt.value}`)}</span>
                </button>
              )
            })}
          </div>
        </div>
        <label className="flex items-center justify-between cursor-pointer pt-1">
          <div>
            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.auto_route')}</span>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{t('settings.auto_route_desc')}</p>
          </div>
          <input type="checkbox" checked={modelAutoRoute} onChange={(e) => setModelAutoRoute(e.target.checked)} className="w-4 h-4 accent-[var(--accent)] cursor-pointer" />
        </label>
      </div>
    </div>
  )
}
