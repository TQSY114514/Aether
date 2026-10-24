import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { Brain, Network, Sparkles, RefreshCw, Layers, CheckCircle2, AlertCircle } from 'lucide-react'
import { t } from '@/utils/i18n'

export default function MemoryEvolutionDomain() {
  const setCurrentView = useStore((s) => s.setCurrentView)
  const [autoMemory, setAutoMemory] = useState(true)
  const [strategyStats, setStrategyStats] = useState<{ total: number; entries: any[]; pendingTraces?: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [reflecting, setReflecting] = useState(false)

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
      {/* Knowledge Graph & Long-Term Memory Hub */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Brain size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
            <div>
              <h2 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                {t('sidebar.nav.memory', '知识图谱与全局记忆大脑')}
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                查看跨会话记忆实体、项目架构决策节点及实体关系图谱
              </p>
            </div>
          </div>
          <button
            onClick={() => setCurrentView('memory')}
            className="px-3.5 py-1.5 text-xs rounded-md border font-medium hover:bg-[var(--bg-secondary)] transition-colors active:scale-[0.98]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            {t('common.view', '进入记忆面板')}
          </button>
        </div>
      </div>

      {/* Auto-Memory Ingestion Switch */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>
              {t('settings.auto_memory', '会话自动记忆提炼')}
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              在会话结束时自动提取用户技术偏好与项目核心设计准则存入 SQLite FTS5 记忆表
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoMemory}
            onClick={() => handleToggleAutoMemory(!autoMemory)}
            className="relative w-10 h-5 rounded-full transition-colors shrink-0 cursor-pointer"
            style={{ backgroundColor: autoMemory ? 'var(--accent)' : 'var(--border)' }}
          >
            <span
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm"
              style={{ left: autoMemory ? '20px' : '2px' }}
            />
          </button>
        </div>
      </div>

      {/* Hermes-Style Silent Evolution (STRATEGY.md) */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles size={15} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {t('settings.self_evolution', '自进化策略库 (STRATEGY.md)')}
            </h2>
          </div>
          <button
            onClick={handleManualReflect}
            disabled={reflecting}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border font-medium hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <RefreshCw size={12} className={reflecting ? 'animate-spin' : ''} />
            <span>{reflecting ? '反思中…' : '立即反思'}</span>
          </button>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          基于真实执行轨迹自动沉淀可执行准则，每 8 轮真实对话在空闲时段静默策展，有界注入系统提示词。
        </p>

        {strategyStats && (
          <div className="rounded border p-3 text-xs space-y-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}>
            <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <span>有效策略数: <strong className="font-mono text-[var(--text-primary)]">{strategyStats.total}</strong> / 20</span>
              <span>待处理轨迹: <strong className="font-mono text-[var(--text-primary)]">{strategyStats.pendingTraces ?? 0}</strong></span>
            </div>

            {strategyStats.entries && strategyStats.entries.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pt-1">
                {strategyStats.entries.slice(0, 5).map((entry: any, i: number) => (
                  <div key={i} className="p-2 rounded border text-[11px] font-mono" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)', color: 'var(--text-secondary)' }}>
                    {typeof entry === 'string' ? entry : entry.rule || entry.text || JSON.stringify(entry)}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] py-2 text-center" style={{ color: 'var(--text-muted)' }}>
                暂未提炼策略条目，持续使用智能体编程将自动生成高信噪比经验规则。
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
