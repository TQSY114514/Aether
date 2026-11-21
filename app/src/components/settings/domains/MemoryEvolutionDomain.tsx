import { useState, useEffect } from 'react'
import { Brain, Sparkles, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { t } from '@/utils/i18n'
import MemoryPage from '@/pages/MemoryPage'

export default function MemoryEvolutionDomain() {
  const [autoMemory, setAutoMemory] = useState(true)
  const [strategyStats, setStrategyStats] = useState<{ total: number; entries: any[]; pendingTraces?: number } | null>(null)
  const [reflecting, setReflecting] = useState(false)
  const [memoryExpanded, setMemoryExpanded] = useState(true)

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
      {/* Auto-Memory Ingestion Switch */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>
              {t('settings.auto_memory', '会话自动记忆提炼 (AutoMemory)')}
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              在对话中自动提取技术偏好与项目架构约定存入本地 SQLite FTS5，并在命中时以胶囊形式注入上下文
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoMemory}
            onClick={() => handleToggleAutoMemory(!autoMemory)}
            className="relative w-10 h-5 rounded-full transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
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
            type="button"
            onClick={handleManualReflect}
            disabled={reflecting}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border font-medium hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50 cursor-pointer active:scale-[0.98]"
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

      {/* Embedded Project & Global Memory Inspector */}
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div
          className="flex items-center justify-between p-3.5 border-b cursor-pointer select-none"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
          onClick={() => setMemoryExpanded(!memoryExpanded)}
        >
          <div className="flex items-center gap-2.5">
            <Brain size={15} className="shrink-0" style={{ color: 'var(--accent)' }} />
            <h2 className="text-xs font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {t('sidebar.nav.memory', '记忆库检视与维护 (Memory Store)')}
            </h2>
          </div>
          <button
            type="button"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Toggle Memory Store"
          >
            {memoryExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
        {memoryExpanded && (
          <div className="p-4">
            <MemoryPage embedded />
          </div>
        )}
      </div>
    </div>
  )
}
