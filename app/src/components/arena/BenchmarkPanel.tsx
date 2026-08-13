import { useState, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { useUI } from '@/components/ui/feedback'
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
  const [benches, setBenches] = useState<Benchmark[]>([])
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [tasksText, setTasksText] = useState('')
  const [modelIds, setModelIds] = useState<number[]>([])
  const [runningId, setRunningId] = useState<number | null>(null)
  const [lastModels, setLastModels] = useState<Record<number, BenchModel>>({})

  const refresh = useCallback(async () => {
    try { setBenches(await window.electronAPI?.arena?.benchmarkList?.() || []) } catch {}
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const save = async () => {
    const tasks = tasksText.split('\n').map(s => s.trim()).filter(Boolean)
    if (!name.trim() || !tasks.length || !modelIds.length) {
      toast('需要名称 + 至少 1 个任务 + 至少 1 个模型', { type: 'error' })
      return
    }
    try {
      const r = await window.electronAPI?.arena?.benchmarkSave?.({ id: null, name, tasks, modelIds })
      if (r?.error) throw new Error(r.error)
      setEditing(false); setName(''); setTasksText(''); setModelIds([])
      await refresh()
      toast('基准套件已保存', { type: 'success' })
    } catch (e: any) { toast(`保存失败: ${e?.message || ''}`, { type: 'error' }) }
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
      toast('基准测试完成', { type: 'success' })
    } catch (e: any) { toast(`运行失败: ${e?.message || ''}`, { type: 'error' }) }
    finally { setRunningId(null) }
  }

  const fmtMs = (ms: number) => ms >= 60000 ? `${(ms / 60000).toFixed(1)}m` : `${Math.round(ms)}s`
  const fmtCost = (c: number) => c > 0 ? `$${c.toFixed(4)}` : '—'

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FlaskConical size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>个人基准测试(Benchmark)</h2>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border hover:bg-(--bg-secondary) transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <Plus size={12} />新建套件
          </button>
        )}
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        保存你的常用任务, 一键对多个模型重跑 —— 得到"你的工作负载"的模型排行(胜率/延迟/成本)。
      </p>

      {editing && (
        <div className="p-4 rounded-xl mb-4 space-y-3" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="套件名称(如: 我的编码任务)"
            className="w-full px-3 py-2 text-xs rounded-lg border outline-none bg-(--bg-primary)"
            style={{ borderColor: 'var(--border)' }} />
          <textarea value={tasksText} onChange={(e) => setTasksText(e.target.value)} rows={5}
            placeholder={'每行一个任务, 例如:\n修复这个 React 组件的 TypeScript 报错\n写一个二分查找并解释\n总结这段代码的架构'}
            className="w-full px-3 py-2 text-xs rounded-lg border outline-none bg-(--bg-primary) font-mono"
            style={{ borderColor: 'var(--border)' }} />
          <div>
            <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>选择参与评测的模型({modelIds.length} 个)</p>
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
              className="text-[11px] px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>取消</button>
            <button onClick={save}
              className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg text-white" style={{ backgroundColor: 'var(--accent)' }}>
              <Check size={12} />保存
            </button>
          </div>
        </div>
      )}

      {benches.length === 0 && !editing && (
        <div className="p-4 rounded-xl text-center" style={{ border: '1px dashed var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>还没有基准套件 — 点右上角"新建套件"开始</p>
        </div>
      )}

      <div className="space-y-3">
        {benches.map((b) => {
          const res = b.results
          const rows = res ? Object.entries(res)
            .map(([id, r]) => ({ id: Number(id), r, m: lastModels[Number(id)] }))
            .sort((a, b) => (b.r.wins / Math.max(1, b.r.runs)) - (a.r.wins / Math.max(1, a.r.runs))) : []
          return (
            <div key={b.id} className="p-3.5 rounded-xl" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{b.name}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {b.tasks.length} 个任务 · {b.model_ids.length} 个模型{b.last_run ? ` · 上次运行 ${new Date(b.last_run).toLocaleString()}` : ' · 尚未运行'}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => run(b)} disabled={runningId != null}
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg text-white disabled:opacity-50 transition-opacity"
                    style={{ backgroundColor: 'var(--accent)' }}>
                    <Play size={11} />{runningId === b.id ? '运行中…' : '重跑'}
                  </button>
                  <button onClick={() => del(b.id)}
                    className="p-1.5 rounded-lg border hover:bg-(--bg-secondary) transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }} title="删除">
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
