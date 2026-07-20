import { useStore } from '@/store'
import { t } from '@/utils/i18n'

// ───────────────────────────────────────────────────────────────────────────
// Advanced generation + title settings (for power users).
// max_tokens / temperature / top_p: 0 means "use provider default" (omitted).
// system prefix: prepended to every system prompt.
// auto title: toggle model-generated summary titles for new sessions.
// title language: which language the generated title uses.
// ───────────────────────────────────────────────────────────────────────────
export default function AdvancedSettings() {
  const maxTokens = useStore((s) => s.maxTokens)
  const temperature = useStore((s) => s.temperature)
  const topP = useStore((s) => s.topP)
  const systemPrefix = useStore((s) => s.systemPrefix)
  const autoTitle = useStore((s) => s.autoTitle)
  const titleLanguage = useStore((s) => s.titleLanguage)
  const setMaxTokens = useStore((s) => s.setMaxTokens)
  const setTemperature = useStore((s) => s.setTemperature)
  const setTopP = useStore((s) => s.setTopP)
  const setSystemPrefix = useStore((s) => s.setSystemPrefix)
  const setAutoTitle = useStore((s) => s.setAutoTitle)
  const setTitleLanguage = useStore((s) => s.setTitleLanguage)

  return (
    <>
      {/* Generation params */}
      <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.generation')}</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{t('settings.generation.desc')}</p>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{t('settings.max_tokens')}</p>
              <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{maxTokens || 'auto'}</span>
            </div>
            <input type="range" min={0} max={8192} step={256} value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
              className="w-full accent-black" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{t('settings.temperature')}</p>
              <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{temperature.toFixed(2)}</span>
            </div>
            <input type="range" min={0} max={2} step={0.05} value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-black" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{t('settings.top_p')}</p>
              <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{topP.toFixed(2)}</span>
            </div>
            <input type="range" min={0} max={1} step={0.05} value={topP}
              onChange={(e) => setTopP(parseFloat(e.target.value))}
              className="w-full accent-black" />
          </div>
          <div>
            <p className="text-sm mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.system_prefix')}</p>
            <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>{t('settings.system_prefix_desc')}</p>
            <textarea value={systemPrefix} onChange={(e) => setSystemPrefix(e.target.value)}
              rows={3} placeholder="You are a meticulous senior engineer..."
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border outline-none resize-none font-mono bg-white"
              style={{ borderColor: 'var(--border)' }} />
          </div>
        </div>
      </div>

      {/* Title generation */}
      <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>{t('settings.titles')}</h2>
        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{t('settings.auto_title')}</span>
            <input type="checkbox" checked={autoTitle} onChange={(e) => setAutoTitle(e.target.checked)} className="w-4 h-4 accent-black" />
          </label>
          <div>
            <p className="text-sm mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.title_language')}</p>
            <select value={titleLanguage} onChange={(e) => setTitleLanguage(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border outline-none bg-white" style={{ borderColor: 'var(--border)' }}>
              <option value="auto">{t('settings.title_language.auto')}</option>
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </div>
        </div>
      </div>
    </>
  )
}
