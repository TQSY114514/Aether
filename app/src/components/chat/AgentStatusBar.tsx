import { useEffect, useState, useMemo } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { Cpu, Zap, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react'

type AgentRuntime = {
  iteration: number
  maxIterations: number
  tokensUsed: number
  currentTool: string | null
  status: 'idle' | 'running' | 'tool_running' | 'budget_warning' | 'error'
  budgetNote: string | null
}

export default function AgentStatusBar({ sessionId }: { sessionId: number | null }) {
  const [runtime, setRuntime] = useState<AgentRuntime>({
    iteration: 0,
    maxIterations: 0,
    tokensUsed: 0,
    currentTool: null,
    status: 'idle',
    budgetNote: null,
  })

  const toolCallsByMessage = useStore((s) => s.toolCallsByMessage)
  const statusLinesByMessage = useStore((s) => s.statusLinesByMessage)
  const loopingSessions = useStore((s) => s.loopingSessions)
  const providers = useStore((s) => s.providers)

  const isLooping = sessionId ? loopingSessions.has(sessionId) : false

  const outboundHosts = useMemo(() => {
    const set = new Set<string>()
    for (const p of providers) {
      if (!p.enabled) continue
      try {
        const u = new URL(p.api_url)
        if (u.hostname) set.add(u.hostname)
      } catch {}
    }
    return Array.from(set)
  }, [providers])

  useEffect(() => {
    if (!sessionId || !isLooping) {
      setRuntime({ iteration: 0, maxIterations: 0, tokensUsed: 0, currentTool: null, status: 'idle', budgetNote: null })
      return
    }

    // Count tool calls across all messages
    let totalCalls = 0
    let lastTool: string | null = null
    for (const [, calls] of Object.entries(toolCallsByMessage)) {
      totalCalls += calls.length
      if (calls.length > 0) {
        const last = calls[calls.length - 1]
        if (last.name) lastTool = last.name
      }
    }

    // Check status lines for budget warnings
    let budgetNote: string | null = null
    let status: AgentRuntime['status'] = 'running'
    for (const [, lines] of Object.entries(statusLinesByMessage)) {
      for (const line of lines) {
        if (line.includes('预算') || line.includes('budget')) {
          budgetNote = line
          status = 'budget_warning'
        }
        if (line.includes('ERROR') || line.includes('error')) {
          status = 'error'
        }
      }
    }

    if (lastTool) status = 'tool_running'
    const turnUsage = useStore.getState().turnUsageBySession[sessionId]
    const tokensUsed = turnUsage ? (turnUsage.inputTokens + turnUsage.outputTokens) : 0

    setRuntime({
      iteration: totalCalls,
      maxIterations: 0, // unknown from renderer side
      tokensUsed,
      currentTool: lastTool,
      status,
      budgetNote,
    })
  }, [sessionId, isLooping, toolCallsByMessage, statusLinesByMessage])

  if (!isLooping && runtime.status === 'idle') return null

  const { iteration, currentTool, status, budgetNote } = runtime

  const accent = status === 'error' ? 'var(--error)' : status === 'budget_warning' ? 'var(--warning)' : 'var(--accent)'

  return (
    <div className="px-0.5 mb-1.5 animate-blur-fade">
      <div className="flex items-center gap-1.5 text-[11px] rounded-lg px-2.5 py-1.5"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        {status === 'tool_running' ? (
          <Loader2 size={11} className="animate-spin" style={{ color: accent }} />
        ) : status === 'budget_warning' ? (
          <AlertTriangle size={11} style={{ color: accent }} />
        ) : (
          <Cpu size={11} style={{ color: accent }} />
        )}
        <span style={{ color: 'var(--text-secondary)' }}>
          {t('agent.status.running', 'Agent 运行中')}
        </span>
        {iteration > 0 && (
          <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>
            · {t('agent.status.iterations', `${iteration} 步`)}
          </span>
        )}
        {currentTool && (
          <span className="truncate max-w-[120px]" style={{ color: 'var(--text-muted)' }}>
            · {currentTool}
          </span>
        )}
        {runtime.tokensUsed > 0 && (
          <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>
            · {runtime.tokensUsed} tokens
          </span>
        )}
        {budgetNote && (
          <span className="truncate max-w-[30%]" style={{ color: accent }}>
            {budgetNote}
          </span>
        )}
        {/* Outbound Privacy Indicator */}
        <div
          className="ml-auto flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border cursor-help shrink-0 opacity-75 hover:opacity-100 transition-opacity"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--text-muted)',
          }}
          title={`🔒 本地隐私保护 / 零遥测\n出站端点白名单：${outboundHosts.length > 0 ? outboundHosts.join(', ') : '无启用端点'}\n所有对话与长期记忆仅保存在本地 SQLite。`}
        >
          <ShieldCheck size={11} className="shrink-0 text-[var(--success)]" />
          <span className="font-mono text-[10px]">local-only</span>
        </div>
      </div>
    </div>
  )
}
