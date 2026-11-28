import { useState } from 'react'
import { useStore } from '@/store'
import { Server, Sparkles } from 'lucide-react'
import { t } from '@/utils/i18n'
import DefaultChatSettings from '@/components/settings/DefaultChatSettings'
import PersonaSettings from '@/components/settings/PersonaSettings'
import ModelPage from '@/pages/ModelPage'
import type { EffortLevel } from '@/store/types'

const EFFORT_OPTIONS: { value: EffortLevel; labelKey: string; descKey: string; fallbackDesc: string }[] = [
  { value: 'minimal', labelKey: 'effort.minimal', descKey: 'settings.effort_desc.minimal', fallbackDesc: '1k tokens · Fast reasoning' },
  { value: 'low', labelKey: 'effort.low', descKey: 'settings.effort_desc.low', fallbackDesc: '2k tokens · Focused function-level analysis' },
  { value: 'medium', labelKey: 'effort.medium', descKey: 'settings.effort_desc.medium', fallbackDesc: '8k tokens · Standard engineering reasoning (default)' },
  { value: 'high', labelKey: 'effort.high', descKey: 'settings.effort_desc.high', fallbackDesc: '16k tokens · Deep architecture design' },
  { value: 'max', labelKey: 'effort.max', descKey: 'settings.effort_desc.max', fallbackDesc: '32k tokens · Cross-file deep diagnosis' },
]

export default function ProvidersRoutingDomain() {
  const defaultEffort = useStore((s) => s.defaultEffort)
  const defaultThinkingEnabled = useStore((s) => s.defaultThinkingEnabled)
  const setDefaultEffort = useStore((s) => s.setDefaultEffort)
  const setDefaultThinkingEnabled = useStore((s) => s.setDefaultThinkingEnabled)
  const [section, setSection] = useState<'models' | 'defaults'>('models')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 border-b pb-2.5" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={() => setSection('models')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
          style={
            section === 'models'
              ? { borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }
              : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
          }
        >
          <Server size={13} style={section === 'models' ? { color: 'var(--accent)' } : undefined} />
          <span>{t('sidebar.nav.models', 'Providers & Models')}</span>
        </button>
        <button
          type="button"
          onClick={() => setSection('defaults')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
          style={
            section === 'defaults'
              ? { borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }
              : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
          }
        >
          <Sparkles size={13} style={section === 'defaults' ? { color: 'var(--accent)' } : undefined} />
          <span>{t('settings.providers.defaults_tab', 'Defaults, Personas & Reasoning')}</span>
        </button>
      </div>

      {section === 'models' ? (
        <ModelPage embedded />
      ) : (
        <div className="space-y-4">
          <DefaultChatSettings />
          <PersonaSettings />

          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles size={15} style={{ color: 'var(--accent)' }} />
                <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {t('settings.default_effort', 'Default Thinking Tier')}
                </h2>
              </div>
              <div className="flex items-center gap-2 select-none">
                <span className="text-xs font-medium" style={{ color: defaultThinkingEnabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {defaultThinkingEnabled ? t('effort.on', 'Thinking On') : t('effort.off', 'Thinking Off')}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={defaultThinkingEnabled}
                  onClick={() => setDefaultThinkingEnabled(!defaultThinkingEnabled)}
                  className="relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                  style={{ backgroundColor: defaultThinkingEnabled ? 'var(--accent)' : 'var(--border)' }}
                >
                  <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition duration-200 ease-in-out motion-reduce:transition-none mt-[2px] ml-[2px] ${defaultThinkingEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
              {t('settings.default_effort_desc', 'Set the default reasoning token budget for new sessions.')}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2" style={{ opacity: defaultThinkingEnabled ? 1 : 0.5 }}>
              {EFFORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  disabled={!defaultThinkingEnabled}
                  onClick={() => setDefaultEffort(opt.value)}
                  className={`text-left p-2.5 rounded-lg border text-xs transition-all motion-reduce:transition-none active:scale-[0.98] cursor-pointer ${
                    defaultEffort === opt.value
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-xs'
                      : 'hover:bg-[var(--bg-secondary)]'
                  }`}
                  style={{
                    borderColor: defaultEffort === opt.value ? 'var(--accent)' : 'var(--border)',
                    backgroundColor: defaultEffort === opt.value ? 'var(--content-bg)' : 'transparent',
                  }}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
                      {t(opt.labelKey as any, opt.value)}
                    </span>
                    {defaultEffort === opt.value && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
                        {t('common.current', 'Current')}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {t(opt.descKey as any, opt.fallbackDesc)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
