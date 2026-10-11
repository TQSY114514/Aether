import { useState, useEffect, useCallback } from 'react'
import { BookOpen, RefreshCw, Trash2, Plus, Sparkles, CheckCircle2, CircleSlash2 } from 'lucide-react'
import { t } from '@/utils/i18n'
import { useUI } from '@/components/ui/feedback'
import { useFeatureFlag, setFeatureFlag } from '@/utils/featureFlags'

export default function StrategyTab() {
  const { toast } = useUI()
  const selfEvolutionEnabled = useFeatureFlag('skills.selfEvolution', true)
  const [strategies, setStrategies] = useState<{ id: number; text: string }[]>([])
  const [cap, setCap] = useState({ chars: 0, maxChars: 2200, needsMerge: false })
  const [reflecting, setReflecting] = useState(false)
  const [newEntry, setNewEntry] = useState('')
  const [toggling, setToggling] = useState(false)

  const loadStrategies = useCallback(() => {
    return window.electronAPI.evolution.strategy.get().then(r => {
      setStrategies(Array.isArray(r?.entries) ? r.entries : [])
      setCap({ chars: r?.chars || 0, maxChars: r?.maxChars || 2200, needsMerge: !!r?.needsMerge })
    }).catch(() => {})
  }, [])

  useEffect(() => { loadStrategies() }, [loadStrategies])

  const reflectNow = async () => {
    setReflecting(true)
    try {
      const r = await window.electronAPI.evolution.strategy.reflectNow()
      if (r?.ok) toast(t('evolution.strategyLib.done') || '反思完成，策略库已更新', { type: 'success' })
      else if (r?.reason === 'no-provider') toast(t('evolution.strategyLib.noProvider') || '请先配置默认 Provider 与 Model', { type: 'info' })
      else if (r) toast(String(r?.error || r?.reason || '反思未产生新策略'), { type: 'info' })
    } catch (e: any) {
      toast(String(e?.message || e), { type: 'error' })
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
      else if (r?.reason === 'duplicate') toast(t('evolution.strategyLib.duplicate') || '该策略已存在', { type: 'info' })
      loadStrategies()
    }).catch(() => {})
  }

  const toggleAutoEvolution = async () => {
    setToggling(true)
    try {
      const next = !selfEvolutionEnabled
      const ok = await setFeatureFlag('skills.selfEvolution', next)
      if (ok) toast(next ? '自进化轨迹反思已开启' : '自进化轨迹反思已暂停', { type: 'info' })
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div
        className="rounded-lg border p-4"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0">
              {selfEvolutionEnabled ? (
                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
              ) : (
                <CircleSlash2 size={16} className="text-zinc-400" />
              )}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {selfEvolutionEnabled ? '会话轨迹自进化反思已就绪' : '自进化轨迹反思已暂停'}
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.2 rounded border ${
                    selfEvolutionEnabled
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {selfEvolutionEnabled ? '自动运行中' : '已暂停'}
                </span>
              </div>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {selfEvolutionEnabled
                  ? 'Agent 在会话中调用工具时会自动提炼高效经验与避坑策略，并同步至 STRATEGY.md 注入所有新会话。'
                  : '开启后，Agent 会根据真实执行成功与失败轨迹，提炼通用策略规则。'}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={toggling}
            onClick={toggleAutoEvolution}
            className="text-xs px-3 py-1.5 rounded-md border shrink-0 transition-colors hover:bg-[var(--bg-primary)] disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            {selfEvolutionEnabled ? '暂停自进化' : '启用自进化'}
          </button>
        </div>

        <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs" style={{ borderColor: 'var(--border)' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            策略容量：<strong className="font-mono text-[var(--text-primary)]">{strategies.length}</strong> 条（
            <span className="font-mono">{cap.chars}</span> / {cap.maxChars} 字符）
          </span>
          {cap.needsMerge && (
            <span className="text-amber-600 dark:text-amber-400 font-medium">容量接近上限，将自动合并</span>
          )}
        </div>
      </div>

      {/* Strategies list */}
      <div
        className="rounded-lg border p-4 space-y-3"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <BookOpen size={14} style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              当前有效策略库 (STRATEGY.md)
            </span>
          </div>
          <button
            type="button"
            disabled={reflecting}
            onClick={reflectNow}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors hover:bg-[var(--border)]/40 disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <RefreshCw size={11} className={reflecting ? 'animate-spin' : ''} />
            <span>{reflecting ? '正在反思轨迹…' : '立即执行反思'}</span>
          </button>
        </div>

        {strategies.length === 0 ? (
          <div
            className="text-xs py-6 text-center rounded-md border border-dashed"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            暂无自进化策略条目。你可以手动添加常用经验，或让 Agent 在日常对话中自动提炼。
          </div>
        ) : (
          <div className="space-y-1.5">
            {strategies.map((s) => (
              <div
                key={s.id}
                className="flex items-start gap-2 text-xs px-3 py-2 rounded-md border group"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <span className="font-mono shrink-0 tabular-nums text-[var(--accent)] font-semibold">S{s.id}</span>
                <span className="flex-1 leading-relaxed text-[var(--text-primary)]">{s.text}</span>
                <button
                  type="button"
                  onClick={() => window.electronAPI.evolution.strategy.remove(s.id).then(() => loadStrategies())}
                  aria-label={`Remove S${s.id}`}
                  className="shrink-0 opacity-30 group-hover:opacity-100 hover:text-red-500 transition-opacity p-0.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add manual strategy */}
        <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <input
            value={newEntry}
            onChange={(e) => setNewEntry(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addEntry() }}
            placeholder="手动输入一条需要 Agent 遵守的工作策略或习惯（回车添加）…"
            className="flex-1 text-xs px-3 py-1.5 rounded-md border bg-[var(--bg-primary)] text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            style={{ borderColor: 'var(--border)' }}
          />
          <button
            type="button"
            onClick={addEntry}
            disabled={!newEntry.trim()}
            className="text-xs px-3 py-1.5 rounded-md border flex items-center gap-1 transition-colors hover:bg-[var(--border)]/40 disabled:opacity-40"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <Plus size={12} />
            <span>添加</span>
          </button>
        </div>
      </div>
    </div>
  )
}
