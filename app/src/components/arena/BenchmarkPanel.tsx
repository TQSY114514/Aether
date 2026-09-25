import { useState, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { useUI } from '@/components/ui/feedback'
import { t } from '@/utils/i18n'
import { useFeatureFlag } from '@/utils/featureFlags'
import { Play, Plus, Trash2, FlaskConical, X, Check, Timer, DollarSign } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// BenchmarkPanel — Arena 2.0 personal benchmark (review P0-3)
//
// 用户自建任务集(纯文本 prompt 列表), 选择模型一键重跑; 结果按模型聚合:
// 胜率(非错误响应占比) / 平均延迟 / 总成本 —— "你的工作负载的模型排行榜"。
// 挂在 ScoresPage(ELO 排行榜下方)。
// ─────────────────────────────────────────────────────────────────────────────

interface BenchResult { wins: number; runs: number; total_ms: number; total_cost: number }
interface BenchModel { model_name: string; provider_name: string }
interface Benchmark {
  id: number; name: string; tasks: string[]; model_ids: number[];
  last_run: string | null; results: Record<number, BenchResult> | null; created_at: string
}

export default function BenchmarkPanel() {
  const { toast } = useUI()
  const allModels = useStore((s) => s.allModels)
  const objectiveArenaEnabled = useFeatureFlag('arena.objectiveArena')
  const [benches, setBenches] = useState<Benchmark[]>([])
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [tasksText, setTasksText] = useState('')
  const [modelIds, setModelIds] = useState<number[]>([])
  const [runningId, setRunningId] = useState<number | null>(null)
  const [lastModels, setLastModels] = useState<Record<number, BenchModel>>({})

  // Objective Sandbox Arena state
  const [objOpen, setObjOpen] = useState(false)
  const [objPrompt, setObjPrompt] = useState('')
  const [objVerifyCmd, setObjVerifyCmd] = useState('npm test')
  const [objModelIds, setObjModelIds] = useState<number[]>([])
  const [objRunId, setObjRunId] = useState<string | null>(null)
  const [objResult, setObjResult] = useState<Awaited<ReturnType<typeof window.electronAPI.arena.objectiveRun>> | null>(null)

  const refresh = useCallback(async () => {
    try { setBenches(await window.electronAPI?.arena?.benchmarkList?.() || []) } catch {}
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const runObjective = async () => {
    if (!objPrompt.trim() || !objVerifyCmd.trim() || objModelIds.length === 0) {
      toast(t('arena.objective.missing_fields'), { type: 'error' })
      return
    }
    const runId = `obj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setObjRunId(runId)
    setObjResult(null)
    try {
      const res = await window.electronAPI.arena.objectiveRun({
        runId,
        prompt: objPrompt.trim(),
        verifyCommand: objVerifyCmd.trim(),
        modelIds: objModelIds,
      })
      if (res?.error) throw new Error(res.error)
      if (res?.aborted) return
      setObjResult(res)
      toast(res.winnerName ? t('arena.objective.done_winner', res.winnerName) : t('arena.objective.done'), { type: 'success' })
    } catch (e: any) {
      toast(t('arena.objective.failed', e?.message || ''), { type: 'error' })
    } finally {
      setObjRunId((prev) => (prev === runId ? null : prev))
    }
  }

  const stopObjective = async () => {
    if (!objRunId) return
    try {
      await window.electronAPI.arena.objectiveStop({ runId: objRunId })
      toast(t('arena.objective.aborted'), { type: 'info' })
    } catch {}
  }

  const save = async () => {
    const tasks = tasksText.split('\n').map(s => s.trim()).filter(Boolean)
    if (!name.trim() || !tasks.length || !modelIds.length) {
      toast(t('arena.bench.missing_fields'), { type: 'error' })
      return
    }
    try {
      const r = await window.electronAPI?.arena?.benchmarkSave?.({ id: null, name, tasks, modelIds })
      if (r?.error) throw new Error(r.error)
      setEditing(false); setName(''); setTasksText(''); setModelIds([])
      await refresh()
      toast(t('arena.bench.saved'), { type: 'success' })
    } catch (e: any) { toast(t('arena.bench.save_failed', e?.message || ''), { type: 'error' }) }
  }

  const del = async (id: number) => {
    try { await window.electronAPI?.arena?.benchmarkDelete?.(id); await refresh() } catch {}
  }

  const run = async (b: Benchmark) => {
    setRunningId(b.id)
    setLastModels({})
    try {
      const r = await window.electronAPI?.arena?.benchmarkRun?.({ id: b.id, modelIds: b.model_ids })
      if (r?.error) throw new Error(r.error)
      if (r) { setLastModels(r.models || {}); await refresh() }
      toast(t('arena.bench.done'), { type: 'success' })
    } catch (e: any) { toast(t('arena.bench.run_failed', e?.message || ''), { type: 'error' }) }
    finally { setRunningId(null) }
  }

  const fmtMs = (ms: number) => ms >= 60000 ? `${(ms / 60000).toFixed(1)}m` : `${Math.round(ms)}s`
  const fmtCost = (c: number) => c > 0 ? `$${c.toFixed(4)}` : '—'

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FlaskConical size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('arena.bench.title')}</h2>
        </div>
        <div className="flex items-center gap-2">
          {objectiveArenaEnabled && (
            <button onClick={() => setObjOpen((v) => !v)}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              <Play size={11} />{t('arena.objective.button')}
            </button>
          )}
          {!editing && (
            <button onClick={() => setEditing(true)}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              <Plus size={12} />{t('arena.bench.new_suite')}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        {t('arena.bench.subtitle')}
      </p>

      {objectiveArenaEnabled && objOpen && (
        <div className="p-4 rounded-lg mb-4 space-y-3" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t('arena.objective.title')}</span>
            <button onClick={() => setObjOpen(false)} className="p-1 rounded hover:bg-[var(--border)]"><X size={12} /></button>
          </div>
          <textarea value={objPrompt} onChange={(e) => setObjPrompt(e.target.value)} rows={3}
            placeholder={t('arena.objective.prompt_placeholder')}
            className="w-full px-3 py-2 text-xs rounded-lg border outline-none bg-[var(--bg-primary)] font-mono"
            style={{ borderColor: 'var(--border)' }} />
          <input value={objVerifyCmd} onChange={(e) => setObjVerifyCmd(e.target.value)}
            placeholder={t('arena.objective.verify_placeholder')}
            className="w-full px-3 py-2 text-xs rounded-lg border outline-none bg-[var(--bg-primary)] font-mono"
            style={{ borderColor: 'var(--border)' }} />
          <div>
            <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('arena.objective.select_models', objModelIds.length)}</p>
            <div className="flex flex-wrap gap-1.5">
              {allModels.filter(m => m.provider_name).map((m) => (
                <button key={m.id} onClick={() => setObjModelIds((p) => p.includes(m.id) ? p.filter(x => x !== m.id) : [...p, m.id])}
                  className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${objModelIds.includes(m.id) ? 'text-white' : ''}`}
                  style={objModelIds.includes(m.id) ? { backgroundColor: 'var(--accent)', borderColor: 'transparent' } : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  {m.model_name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {objRunId ? (
              <button onClick={stopObjective}
                className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg border text-rose-500"
                style={{ borderColor: 'var(--border)' }}>
                <X size={12} />{t('arena.objective.stop')}
              </button>
            ) : (
              <button onClick={runObjective}
                className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg text-white"
                style={{ backgroundColor: 'var(--accent)' }}>
                <Play size={12} />{t('arena.objective.run')}
              </button>
            )}
          </div>
          {objResult && Array.isArray(objResult.models) && (
            <div className="space-y-1 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              {(objResult as any).baselineAlreadyPassed && (
                <div className="text-[11px] px-2 py-1.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/30">
                  {t('arena.objective.baseline_passed_warn')}
                </div>
              )}
              {objResult.models.map((m) => (
                <div key={m.modelId} className="flex items-center gap-2 text-[11px] px-2 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--bg-primary)' }}>
                  <span className="font-medium truncate flex-1" style={{ color: 'var(--text-primary)' }}>{m.modelName}</span>
                  <span className={m.passed ? 'text-emerald-600' : 'text-rose-500'}>{m.passed ? 'PASS' : 'FAIL'}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{m.latencyMs}ms</span>
                  <span style={{ color: 'var(--text-muted)' }}>{fmtCost(m.cost)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="p-4 rounded-lg mb-4 space-y-3" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('arena.bench.name_placeholder')}
            className="w-full px-3 py-2 text-xs rounded-lg border outline-none bg-[var(--bg-primary)]"
            style={{ borderColor: 'var(--border)' }} />
          <textarea value={tasksText} onChange={(e) => setTasksText(e.target.value)} rows={5}
            placeholder={t('arena.bench.tasks_placeholder')}
            className="w-full px-3 py-2 text-xs rounded-lg border outline-none bg-[var(--bg-primary)] font-mono"
            style={{ borderColor: 'var(--border)' }} />
          <div>
            <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('arena.bench.select_models', modelIds.length)}</p>
            <div className="flex flex-wrap gap-1.5">
              {allModels.filter(m => m.provider_name).map((m) => (
                <button key={m.id} onClick={() => setModelIds((p) => p.includes(m.id) ? p.filter(x => x !== m.id) : [...p, m.id])}
                  className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${modelIds.includes(m.id) ? 'text-white' : ''}`}
                  style={modelIds.includes(m.id) ? { backgroundColor: 'var(--accent)', borderColor: 'transparent' } : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  {m.model_name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)}
              className="text-[11px] px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>{t('common.cancel')}</button>
            <button onClick={save}
              className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg text-white" style={{ backgroundColor: 'var(--accent)' }}>
              <Check size={12} />{t('common.save')}
            </button>
          </div>
        </div>
      )}

      {benches.length === 0 && !editing && (
        <div className="p-4 rounded-lg text-center" style={{ border: '1px dashed var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('arena.bench.empty')}</p>
        </div>
      )}

      <div className="space-y-3">
        {benches.map((b) => {
          const res = b.results
          const rows = res ? Object.entries(res)
            .map(([id, r]) => ({ id: Number(id), r, m: lastModels[Number(id)] }))
            .sort((a, b) => (b.r.wins / Math.max(1, b.r.runs)) - (a.r.wins / Math.max(1, a.r.runs))) : []
          return (
            <div key={b.id} className="p-3.5 rounded-lg" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{b.name}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {b.last_run
                      ? t('arena.bench.summary_run', b.tasks.length, b.model_ids.length, new Date(b.last_run).toLocaleString())
                      : t('arena.bench.summary_never', b.tasks.length, b.model_ids.length)}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => run(b)} disabled={runningId != null}
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg text-white disabled:opacity-50 transition-opacity"
                    style={{ backgroundColor: 'var(--accent)' }}>
                    <Play size={11} />{runningId === b.id ? t('arena.bench.running') : t('arena.bench.rerun')}
                  </button>
                  <button onClick={() => del(b.id)}
                    className="p-1.5 rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }} title={t('common.delete')}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {rows.length > 0 && (
                <div className="space-y-1">
                  {rows.map(({ id, r, m }) => {
                    const pct = r.runs ? Math.round((r.wins / r.runs) * 100) : 0
                    const avgMs = r.runs ? r.total_ms / r.runs : 0
                    return (
                      <div key={id} className="flex items-center gap-2 text-[11px] px-2 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                        <span className="font-medium truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                          {m?.model_name || `#${id}`}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{m?.provider_name}</span>
                        <span className="flex items-center gap-0.5 w-14" style={{ color: pct >= 80 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                          <Check size={10} />{pct}%
                        </span>
                        <span className="flex items-center gap-0.5 w-14" style={{ color: 'var(--text-muted)' }}>
                          <Timer size={10} />{fmtMs(avgMs)}
                        </span>
                        <span className="flex items-center gap-0.5 w-16" style={{ color: 'var(--text-muted)' }}>
                          <DollarSign size={10} />{fmtCost(r.total_cost)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
