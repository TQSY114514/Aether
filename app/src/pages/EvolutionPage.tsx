import { useState, useEffect, useCallback } from 'react'
import { useUI } from '@/components/ui/feedback'
import { GitBranch, History, Loader2, Play, Sparkles, AlertTriangle, BookOpen, Plus, Trash2 } from 'lucide-react'
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
  // 策略库（自进化反思产物）
  const [strategies, setStrategies] = useState<{ id: number; text: string }[]>([])
  const [cap, setCap] = useState({ chars: 0, maxChars: 2200, needsMerge: false })
  const [reflecting, setReflecting] = useState(false)
  const [newEntry, setNewEntry] = useState('')

  const loadStrategies = useCallback(() => {
    return window.electronAPI.evolution.strategy.get().then(r => {
      setStrategies(Array.isArray(r?.entries) ? r.entries : [])
      setCap({ chars: r?.chars || 0, maxChars: r?.maxChars || 2200, needsMerge: !!r?.needsMerge })
    }).catch(() => {})
  }, [])

  const reflectNow = async () => {
    setReflecting(true)
    try {
      const r = await window.electronAPI.evolution.strategy.reflectNow()
      if (r?.ok) toast(t('evolution.strategyLib.done'), { type: 'success' })
      else if (r?.reason === 'no-provider') toast(t('evolution.strategyLib.noProvider'), { type: 'info' })
      else if (r) toast(String(r?.error || r?.reason || ''), { type: 'error' })
    } catch (e) {
      toast(String((e as Error)?.message || e), { type: 'error' })
    } finally {
      setReflecting(false)
      loadStrategies()
    }
  }

  const addEntry = () => {
    const text = newEntry.trim()
    if (!text) return
    window.electronAPI.evolution.strategy.add(text).then(r => {
      if (r?.ok) setNewEntry('')
      else if (r?.reason === 'duplicate') toast(t('evolution.strategyLib.duplicate'), { type: 'info' })
      loadStrategies()
    }).catch(() => {})
  }

  const load = useCallback(() => {
    return window.electronAPI.evolution.history().then(list => {
      setEvents(Array.isArray(list) ? list : [])
    }).catch(() => setEvents([]))
  }, [])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])
  useEffect(() => { loadStrategies() }, [loadStrategies])

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

        {/* Strategy library — reflection-distilled entries (bounded STRATEGY.md) */}
        <div className="rounded-xl border p-4 mb-6" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5">
              <BookOpen size={14} style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('evolution.strategyLib.title')}</span>
            </div>
            <span className="text-xs tabular-nums" style={{ color: cap.needsMerge ? '#d97706' : 'var(--text-muted)' }}>
              {strategies.length} · {cap.chars}/{cap.maxChars}
            </span>
          </div>
          {cap.needsMerge && (
            <div className="text-xs mb-2" style={{ color: '#d97706' }}>{t('evolution.strategyLib.overCapacity')}</div>
          )}
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{t('evolution.strategyLib.desc')}</p>
          {strategies.length === 0 ? (
            <div className="text-xs py-3 text-center rounded-lg border border-dashed mb-3" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              {t('evolution.strategyLib.empty')}
            </div>
          ) : (
            <div className="space-y-1.5 mb-3">
              {strategies.map(s => (
                <div key={s.id} className="flex items-start gap-2 text-xs px-2.5 py-2 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                  <span className="shrink-0 tabular-nums pt-px" style={{ color: 'var(--accent)' }}>S{s.id}</span>
                  <span className="flex-1 leading-relaxed" style={{ color: 'var(--text-primary)' }}>{s.text}</span>
                  <button
                    onClick={() => window.electronAPI.evolution.strategy.remove(s.id).then(() => loadStrategies())}
                    aria-label={`S${s.id}`}
                    className="shrink-0 opacity-40 hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--text-secondary)' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newEntry}
              onChange={e => setNewEntry(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addEntry() }}
              placeholder={t('evolution.strategyLib.placeholder')}
              className="flex-1 min-w-[200px] text-xs px-3 py-2 rounded-lg border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            />
            <button
              onClick={addEntry}
              disabled={!newEntry.trim()}
              className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg border transition-opacity disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              <Plus size={12} />{t('evolution.strategyLib.add')}
            </button>
            <button
              onClick={reflectNow}
              disabled={reflecting}
              className="inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-lg font-medium transition-opacity disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
              {reflecting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {reflecting ? t('evolution.strategyLib.reflecting') : t('evolution.strategyLib.reflect')}
            </button>
          </div>
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