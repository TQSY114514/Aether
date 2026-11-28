import { useState, useEffect } from 'react'
import { Brain, Sparkles, RefreshCw } from 'lucide-react'
import { t } from '@/utils/i18n'
import MemoryPage from '@/pages/MemoryPage'

export default function MemoryEvolutionDomain() {
  const [autoMemory, setAutoMemory] = useState(true)
  const [strategyStats, setStrategyStats] = useState<{ total: number; entries: any[]; pendingTraces?: number } | null>(null)
  const [reflecting, setReflecting] = useState(false)
  const [section, setSection] = useState<'evolution' | 'store'>('evolution')

  const loadStrategy = async () => {
    try {
      const res = await (window.electronAPI as any)?.evolution?.strategy?.get?.()
      if (res) {
        setStrategyStats({
          total: res.total || res.count || (res.entries?.length ?? 0),
          entries: res.entries || [],
          pendingTraces: res.pendingTraces || 0,
        })
      }
    } catch {}
  }

  useEffect(() => {
    try {
      window.electronAPI?.settings?.get?.('auto_memory_enabled')
        .then((v) => setAutoMemory(v !== '0'))
        .catch(() => {})
    } catch {}
    loadStrategy()
  }, [])

  const handleToggleAutoMemory = async (next: boolean) => {
    setAutoMemory(next)
    try {
      await window.electronAPI?.settings?.set?.('auto_memory_enabled', next ? '1' : '0')
    } catch {}
  }

  const handleManualReflect = async () => {
    setReflecting(true)
    try {
      await (window.electronAPI as any)?.evolution?.strategy?.reflectNow?.()
      await loadStrategy()
    } catch {} finally {
      setReflecting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 border-b pb-2.5" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={() => setSection('evolution')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
          style={
            section === 'evolution'
              ? { borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }
              : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
          }
        >
          <Sparkles size={13} style={section === 'evolution' ? { color: 'var(--accent)' } : undefined} />
          <span>{t('settings.memory.evolution_tab', 'Auto-Memory & Strategy')}</span>
        </button>
        <button
          type="button"
          onClick={() => setSection('store')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
          style={
            section === 'store'
              ? { borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }
              : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
          }
        >
          <Brain size={13} style={section === 'store' ? { color: 'var(--accent)' } : undefined} />
          <span>{t('sidebar.nav.memory', 'Memory Store')}</span>
        </button>
      </div>

      {section === 'store' ? (
        <MemoryPage embedded />
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>
                  {t('settings.auto_memory', 'Auto-Memory Extraction (AutoMemory)')}
                </h2>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {t('settings.auto_memory_desc', 'Automatically extract technical preferences and project conventions into SQLite FTS5 and inject relevant hits into context.')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoMemory}
                onClick={() => handleToggleAutoMemory(!autoMemory)}
                className="relative w-10 h-5 rounded-full transition-colors motion-reduce:transition-none shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                style={{ backgroundColor: autoMemory ? 'var(--accent)' : 'var(--border)' }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all motion-reduce:transition-none shadow-sm"
                  style={{ left: autoMemory ? '20px' : '2px' }}
                />
              </button>
            </div>
          </div>

          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles size={15} style={{ color: 'var(--accent)' }} />
                <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {t('settings.self_evolution', 'Self-Evolving Strategy (STRATEGY.md)')}
                </h2>
              </div>
              <button
                type="button"
                onClick={handleManualReflect}
                disabled={reflecting}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border font-medium hover:bg-[var(--bg-secondary)] transition-colors motion-reduce:transition-none disabled:opacity-50 cursor-pointer active:scale-[0.98]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <RefreshCw size={12} className={reflecting ? 'animate-spin' : ''} />
                <span>{reflecting ? t('settings.strategy.reflecting', 'Reflecting...') : t('settings.strategy.reflect_now', 'Reflect Now')}</span>
              </button>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
              {t('settings.strategy.desc', 'Distills actionable engineering rules from execution traces during idle time and injects bounded strategies into the system prompt.')}
            </p>

            {strategyStats && (
              <div className="rounded border p-3 text-xs space-y-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}>
                <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  <span>
                    {t('settings.strategy.active_count', 'Active rules')}: <strong className="font-mono text-[var(--text-primary)]">{strategyStats.total}</strong> / 20
                  </span>
                  <span>
                    {t('settings.strategy.pending_traces', 'Pending traces')}: <strong className="font-mono text-[var(--text-primary)]">{strategyStats.pendingTraces ?? 0}</strong>
                  </span>
                </div>

                {strategyStats.entries && strategyStats.entries.length > 0 ? (
                  <div className="space-y-1.5 pt-1">
                    {strategyStats.entries.slice(0, 5).map((entry: any, i: number) => (
                      <div key={i} className="p-2 rounded border text-[11px] font-mono" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)', color: 'var(--text-secondary)' }}>
                        {typeof entry === 'string' ? entry : entry.rule || entry.text || JSON.stringify(entry)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] py-2 text-center" style={{ color: 'var(--text-muted)' }}>
                    {t('settings.strategy.empty', 'No strategy entries yet. High-signal rules will be synthesized automatically as you use the agent.')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
