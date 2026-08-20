import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { Cpu, Zap, AlertTriangle, Loader2 } from 'lucide-react'

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

  const isLooping = sessionId ? loopingSessions.has(sessionId) : false

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

    setRuntime({
      iteration: totalCalls,
      maxIterations: 0, // unknown from renderer side
      tokensUsed: 0,
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
        {budgetNote && (
          <span className="ml-auto truncate max-w-[40%]" style={{ color: accent }}>
            {budgetNote}
          </span>
        )}
      </div>
    </div>
  )
}
