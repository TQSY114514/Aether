import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { Brain, Wand2, GitBranch, ListChecks, Repeat, ArrowUpRight } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// 「Agent 学习状态」概览 —— 把 agent 闭环各层的沉淀量汇总到一屏，
// 量化「越用越懂你」：记忆 / 自动技能 / 进化胶囊 / 习惯 / 回放轨迹。
// 数据来自聚合 IPC learning:overview（只读、单次调用）。
// ─────────────────────────────────────────────────────────────────────────────

interface Overview {
  memory: { total: number; assistant: number; user: number; external: number }
  autoSkills: number
  evolution: number
  habits: { total: number; recent: { key: string; imperative: string; occurrences: number }[] }
  replay: { total: number; top: { signature: string; tools: string; count: number }[] }
}

export default function LearningStatusPage() {
  const setCurrentView = useStore((s) => s.setCurrentView)
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electronAPI.learning.overview()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const totalLearned =
    (data?.memory.assistant ?? 0) +
    (data?.autoSkills ?? 0) +
    (data?.evolution ?? 0) +
    (data?.habits.total ?? 0) +
    (data?.replay.total ?? 0)

  const cards = [
    {
      key: 'memory', label: '记忆', icon: Brain, view: 'memory' as const,
      value: data?.memory.assistant ?? 0,
      sub: `AI 自动提取 ${data?.memory.assistant ?? 0} · 手动 ${data?.memory.user ?? 0} · 总计 ${data?.memory.total ?? 0}`,
    },
    {
      key: 'skills', label: '自动技能', icon: Wand2, view: 'skills' as const,
      value: data?.autoSkills ?? 0,
      sub: '从重复工具序列自动 draft 的 SKILL.md',
    },
    {
      key: 'evolution', label: '进化胶囊', icon: GitBranch, view: 'evolution' as const,
      value: data?.evolution ?? 0,
      sub: 'GEP 自进化引擎产出的策略胶囊',
    },
    {
      key: 'habits', label: '习惯', icon: ListChecks, view: 'memory' as const,
      value: data?.habits.total ?? 0,
      sub: '学到的你的长期偏好 / 固定要求',
    },
    {
      key: 'replay', label: '回放轨迹', icon: Repeat, view: 'memory' as const,
      value: data?.replay.total ?? 0,
      sub: '成功任务轨迹池，相似任务自动复用',
    },
  ]

  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-baseline justify-between mb-1">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Agent 学习状态</h1>
          {!loading && (
            <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
              累计沉淀 {totalLearned} 项
            </span>
          )}
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          这里汇总 agent 从你的使用中沉淀下来的东西——记忆、自动技能、进化策略、习惯与成功轨迹。
        </p>

        {loading ? (
          <div className="text-center py-16 text-sm" style={{ color: 'var(--text-muted)' }}>加载中…</div>
        ) : totalLearned === 0 ? (
          <div className="rounded-xl border p-10 text-center" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
            <Brain size={28} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>agent 还没沉淀下什么</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              试着发几个多步骤的复杂任务，或重复几次相同的工作流——agent 会开始自动提取记忆、draft 技能、回放成功轨迹。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {cards.map((c) => (
              <button
                key={c.key}
                onClick={() => setCurrentView(c.view)}
                className="group text-left rounded-xl border p-4 transition-colors hover:bg-[var(--bg-secondary)]"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <c.icon size={16} className="text-[var(--text-secondary)]" />
                  <ArrowUpRight size={13} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{c.value}</div>
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{c.label}</div>
                <div className="text-[10px] leading-snug" style={{ color: 'var(--text-muted)' }}>{c.sub}</div>
              </button>
            ))}
          </div>
        )}

        {/* habits 最近条目 */}
        {data && data.habits.total > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>最近学到的习惯</h2>
            <div className="space-y-1.5">
              {data.habits.recent.map((h) => (
                <div key={h.key} className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                  <span className="text-xs" style={{ color: 'var(--text-primary)' }}>{h.imperative}</span>
                  <span className="text-[10px] tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>×{h.occurrences}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* replay 高频轨迹 */}
        {data && data.replay.total > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>最常复用的成功轨迹</h2>
            <div className="space-y-1.5">
              {data.replay.top.map((p) => (
                <div key={p.signature} className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                  <span className="text-xs truncate mr-3" style={{ color: 'var(--text-primary)' }}>{p.signature}</span>
                  <span className="text-[10px] tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>×{p.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}