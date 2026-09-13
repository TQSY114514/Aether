import { useState, useEffect, useCallback } from 'react'
import { useUI } from '@/components/ui/feedback'
import { GitBranch, History, Loader2, Sparkles, AlertTriangle, BookOpen, Plus, Trash2, CheckCircle2, CircleSlash2 } from 'lucide-react'
import { t } from '@/utils/i18n'
import { useFeatureFlag, setFeatureFlag } from '@/utils/featureFlags'

// ──────────────────────────── Evolution ─────────────────────────────────────
// Fully autonomous self-evolution page (GEP & Hermes loop).
// The agent reflects on session traces in the background, autonomously distilling
// strategies into STRATEGY.md. This page displays real-time auto-evolution status,
// distilled strategy entries, and historical evolution events.
// ────────────────────────────────────────────────────────────────────────────

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
  const [loading, setLoading] = useState(true)
  const selfEvolutionEnabled = useFeatureFlag('skills.selfEvolution', false)
  const [toggling, setToggling] = useState(false)

  // 策略库（自进化反思产物 STRATEGY.md）
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

  const toggleAutoEvolution = async () => {
    setToggling(true)
    try {
      const next = !selfEvolutionEnabled
      const ok = await setFeatureFlag('skills.selfEvolution', next)
      if (ok) {
        toast(next ? t('evolution.status.active') : t('evolution.status.paused'), { type: 'success' })
      }
    } catch (e: any) {
      toast(e?.message || 'Toggle failed', { type: 'error' })
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto page-fade-in" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header with Switch */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <GitBranch size={18} style={{ color: 'var(--accent)' }} />
              <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{t('sidebar.nav.evolution')}</h1>
            </div>
            <p className="text-sm mt-1 max-w-xl" style={{ color: 'var(--text-secondary)' }}>{t('evolution.desc')}</p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={selfEvolutionEnabled}
            disabled={toggling}
            onClick={toggleAutoEvolution}
            className="flex items-center gap-3 px-3.5 py-2 rounded-lg border transition-all cursor-pointer hover:bg-[var(--bg-secondary)] active:scale-[0.99] self-start sm:self-auto"
            style={{
              borderColor: selfEvolutionEnabled ? 'var(--accent)' : 'var(--border)',
              backgroundColor: 'var(--content-bg)',
            }}
          >
            <div className="text-left">
              <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('evolution.auto_toggle')}
              </div>
              <div className="text-[11px]" style={{ color: selfEvolutionEnabled ? 'var(--success)' : 'var(--text-muted)' }}>
                {selfEvolutionEnabled ? t('evolution.status.active') : t('evolution.status.paused')}
              </div>
            </div>
            <div className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ease-in-out ${selfEvolutionEnabled ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
              <span className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-[3px] ml-[3px] ${selfEvolutionEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
          </button>
        </div>

        {/* Autonomous Loop Status & Architecture Card */}
        <div
          className="rounded-lg border p-4 mb-5"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="mt-1 shrink-0">
                {selfEvolutionEnabled ? (
                  <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <CircleSlash2 size={16} className="text-zinc-400" />
                )}
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {selfEvolutionEnabled ? '后台全自主循环 (Hermes Loop & GEP Engine)' : '自进化机制已挂起'}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                      selfEvolutionEnabled
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    {selfEvolutionEnabled ? '全自动运行 · 无需人工干预' : '已暂停'}
                  </span>
                </div>
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {selfEvolutionEnabled
                    ? '系统实时监测会话中的工具调用。每累计 20 次工具轨迹或策略库容量接近警戒线时，模型会在后台自动评估执行质量、生成反思报告，并将高质量经验提炼至全局策略库（STRATEGY.md）。无需手动选择策略或点击运行。'
                    : '开启上方开关后，Agent 将自动在后台执行工具轨迹反思与经验提炼，持续进化执行策略。'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="text-xs">
              <span className="text-[11px] block" style={{ color: 'var(--text-muted)' }}>触发机制</span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>每 20 次工具轨迹 / 容量溢出</span>
            </div>
            <div className="text-xs">
              <span className="text-[11px] block" style={{ color: 'var(--text-muted)' }}>策略条目容量</span>
              <span className="font-medium tabular-nums" style={{ color: cap.needsMerge ? '#d97706' : 'var(--text-primary)' }}>
                {strategies.length} 条 · {cap.chars} / {cap.maxChars} 字符
              </span>
            </div>
            <div className="text-xs col-span-2 sm:col-span-1">
              <span className="text-[11px] block" style={{ color: 'var(--text-muted)' }}>历史进化事件</span>
              <span className="font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {events.length} {t('evolution.events')}
              </span>
            </div>
          </div>
        </div>

        {/* Strategy library — reflection-distilled entries (bounded STRATEGY.md) */}
        <div className="rounded-lg border p-4 mb-5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
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
            <div className="text-xs py-3 text-center rounded-md border border-dashed mb-3" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              {t('evolution.strategyLib.empty')}
            </div>
          ) : (
            <div className="space-y-1.5 mb-3">
              {strategies.map(s => (
                <div key={s.id} className="flex items-start gap-2 text-xs px-2.5 py-2 rounded-md border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
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
              className="flex-1 min-w-[200px] text-xs px-3 py-2 rounded-md border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            />
            <button
              onClick={addEntry}
              disabled={!newEntry.trim()}
              className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-md border transition-opacity disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              <Plus size={12} />{t('evolution.strategyLib.add')}
            </button>
            <button
              onClick={reflectNow}
              disabled={reflecting}
              className="inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-md font-medium transition-opacity disabled:opacity-50"
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
          <div className="rounded-lg border p-8 text-center" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
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
                <div key={idx} className="rounded-lg border p-3.5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{ev.capsule_id}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md shrink-0 font-medium" style={{ backgroundColor: 'var(--border)', color: 'var(--text-secondary)' }}>
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