import { useState, useEffect, useCallback } from 'react'
import { useUI } from '@/components/ui/feedback'
import { GitBranch, History, Loader2, Play, Sparkles, AlertTriangle } from 'lucide-react'
import { t } from '@/utils/i18n'

// ──────────────────────────── Evolution ─────────────────────────────────────
// View the evolution history (GEP capsules) and manually trigger an evolution
// cycle. Reads via `evolution.history` (evolution_events rows) and drives the
// engine through `evolution.runCycle`, passing a real audit trail that the
// main process falls back on when omitted.
// ────────────────────────────────────────────────────────────────────────────

// Must match STRATEGY_DESCRIPTIONS in app/electron/evolution/gep.js.
// Deliberately NOT the engine's keys mis-picked at planning time
// (speed/thorough/creative do not exist) — these are the real ones.
const STRATEGIES = ['balanced', 'innovate', 'harden', 'repair-only'] as const
type Strategy = typeof STRATEGIES[number]

function fmtTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleString()
}

function parseGenes(ev: EvolutionEvent): string[] {
  try {
    const arr = JSON.parse(ev.genes || '[]')
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function parseSignals(ev: EvolutionEvent): string[] {
  try {
    const arr = JSON.parse(ev.signals || '[]')
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function parseBlast(ev: EvolutionEvent) {
  try {
    const b = JSON.parse(ev.blast_radius || '{}')
    return { files: Number(b?.files) || 0, lines: Number(b?.lines) || 0 }
  } catch { return { files: 0, lines: 0 } }
}

export default function EvolutionPage() {
  const { toast } = useUI()
  const [events, setEvents] = useState<EvolutionEvent[]>([])
  const [strategy, setStrategy] = useState<Strategy>('balanced')
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    return window.electronAPI.evolution.history().then(list => {
      setEvents(Array.isArray(list) ? list : [])
    }).catch(() => setEvents([]))
  }, [])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  const runCycle = async (strat: Strategy) => {
    setRunning(true)
    try {
      const res = await window.electronAPI.evolution.runCycle({ strategy: strat })
      if (res?.ok && res?.result) {
        const r = res.result as { capsule?: { name?: string; id?: string }; signals?: { signal: string }[] } | null
        const n = r?.signals?.length ?? 0
        toast(n > 0
          ? t('evolution.ran_with', r?.capsule?.name || String(n))
          : t('evolution.ran_empty'), { type: 'success' })
      } else {
        toast(res?.error || t('evolution.ran_empty'), { type: 'info' })
      }
      await load()
    } catch (e) {
      toast(String((e as Error)?.message || e), { type: 'error' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>🧬 {t('sidebar.nav.evolution')}</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t('evolution.desc')}</p>
          </div>
          <div className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {events.length} {t('evolution.events')}
          </div>
        </div>

        {/* Run evolution cycle — strategy picker + trigger */}
        <div className="rounded-xl border p-4 mb-6" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles size={14} style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('evolution.run_title')}</span>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {STRATEGIES.map(s => (
              <button key={s}
                onClick={() => setStrategy(s)}
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                style={{
                  borderColor: strategy === s ? 'var(--accent)' : 'var(--border)',
                  backgroundColor: strategy === s ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                  color: strategy === s ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}>
                {t(`evolution.strategy.${s}`)}
              </button>
            ))}
          </div>
          <button
            onClick={() => runCycle(strategy)}
            disabled={running}
            className="inline-flex items-center gap-2 text-xs px-3.5 py-2 rounded-lg font-medium transition-opacity disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {running ? t('evolution.running') : t('evolution.run')}
          </button>
        </div>

        {/* History list */}
        {loading ? (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>{t('evolution.loading')}</div>
        ) : events.length === 0 ? (
          <div className="rounded-xl border p-8 text-center" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
            <History size={20} className="mx-auto mb-2 text-gray-400" />
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('evolution.empty')}</div>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((ev, idx) => {
              const genes = parseGenes(ev)
              const signals = parseSignals(ev)
              const blast = parseBlast(ev)
              const strat = ev.strategy || 'balanced'
              return (
                <div key={idx} className="rounded-xl border p-3.5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{ev.capsule_id}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                      {t(`evolution.strategy.${strat}`)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {genes.map(g => (
                      <span key={g} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(37,99,235,0.12)', color: '#3b82f6' }}>{g}</span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {signals.map(s => (
                      <span key={s} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(217,119,6,0.12)', color: '#d97706' }}>
                        <AlertTriangle size={9} />{s}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    <span>{fmtTime(ev.created_at)}</span>
                    {(blast.files + blast.lines) > 0 && (
                      <span className="tabular-nums">{t('evolution.blast')}: {blast.files}f/{blast.lines}l</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}