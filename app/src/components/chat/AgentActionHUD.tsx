import { useEffect, useState, useMemo } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { Zap, Cpu, AlertTriangle, Loader2, Sparkles, Terminal, FileCode, Search, CheckCircle2 } from 'lucide-react'

type AgentActionHUDProps = {
  sessionId: number | null
}

function getToolIcon(name: string) {
  if (/file|patch|write|edit/i.test(name)) return <FileCode size={13} className="text-amber-400 shrink-0" />
  if (/search|fetch|find|grep/i.test(name)) return <Search size={13} className="text-blue-400 shrink-0" />
  if (/command|bash|terminal|run/i.test(name)) return <Terminal size={13} className="text-emerald-400 shrink-0" />
  return <Zap size={13} className="text-purple-400 shrink-0" />
}

function formatToolArgPreview(args: any): string {
  if (!args) return ''
  if (typeof args === 'string') return args.slice(0, 40)
  if (args.path) return String(args.path).split(/[\\/]/).slice(-2).join('/')
  if (args.query) return `"${String(args.query).slice(0, 30)}"`
  if (args.url) {
    try { return new URL(args.url).hostname } catch { return String(args.url).slice(0, 30) }
  }
  if (args.command) return String(args.command).slice(0, 35)
  return ''
}

export default function AgentActionHUD({ sessionId }: { sessionId: number | null }) {
  const loopingSessions = useStore((s) => s.loopingSessions)
  const streamingBySession = useStore((s) => s.streamingBySession)
  const toolCallsByMessage = useStore((s) => s.toolCallsByMessage)
  const statusLinesByMessage = useStore((s) => s.statusLinesByMessage)
  const planStepsByMessage = useStore((s) => s.planStepsByMessage)
  const turnUsage = useStore((s) => (sessionId ? s.turnUsageBySession[sessionId] : null))

  const isLooping = sessionId ? loopingSessions.has(sessionId) : false
  const isStreaming = sessionId ? !!streamingBySession[sessionId] : false

  // Find the active message's latest tool call
  const activeToolInfo = useMemo(() => {
    let latestTool: { name: string; args: any; isRunning: boolean; latencyMs?: number | null } | null = null
    let totalToolCount = 0

    for (const [, calls] of Object.entries(toolCallsByMessage)) {
      totalToolCount += calls.length
      if (calls.length > 0) {
        const last = calls[calls.length - 1]
        const isRunning = last.result == null && last.error == null
        latestTool = {
          name: last.name,
          args: last.args,
          isRunning,
          latencyMs: last.latencyMs,
        }
      }
    }
    return { latestTool, totalToolCount }
  }, [toolCallsByMessage])

  // Get the latest plan step
  const latestPlanStep = useMemo(() => {
    let lastStep: { step: number; depth: number; text: string; kind?: string } | null = null
    for (const [, steps] of Object.entries(planStepsByMessage)) {
      if (steps && steps.length > 0) {
        const s = steps[steps.length - 1]
        lastStep = { step: s.step, depth: s.depth, text: s.assistantText, kind: s.kind }
      }
    }
    return lastStep
  }, [planStepsByMessage])

  // Get the latest status line
  const latestStatus = useMemo(() => {
    let last = ''
    for (const [, lines] of Object.entries(statusLinesByMessage)) {
      if (lines && lines.length > 0) {
        last = lines[lines.length - 1]
      }
    }
    return last
  }, [statusLinesByMessage])

  if (!isLooping && !isStreaming) return null

  const { latestTool, totalToolCount } = activeToolInfo
  const isRunning = isLooping || isStreaming

  // Status color badge logic
  const isToolRunning = latestTool?.isRunning
  const argPreview = latestTool ? formatToolArgPreview(latestTool.args) : ''

  return (
    <div className="mb-2 rounded-xl border shadow-sm px-3 py-2 animate-blur-fade transition-all"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: isToolRunning ? 'var(--warning, #f59e0b)' : 'var(--accent)',
      }}>
      <div className="flex items-center justify-between gap-2 text-xs">
        {/* Left: Active Agent State Pill */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium text-[11px] shrink-0"
            style={{
              backgroundColor: isToolRunning ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              color: isToolRunning ? 'var(--warning, #f59e0b)' : 'var(--accent)',
            }}>
            {isToolRunning ? (
              <Loader2 size={12} className="animate-spin shrink-0" />
            ) : (
              <Cpu size={12} className="animate-pulse shrink-0" />
            )}
            <span>
              {isToolRunning ? '正在执行工具' : isLooping ? 'Agent 推理与编排' : '生成回复中'}
            </span>
          </div>

          {/* Current Tool / Step Detail */}
          {latestTool ? (
            <div className="flex items-center gap-1.5 truncate text-[11px]" style={{ color: 'var(--text-primary)' }}>
              {getToolIcon(latestTool.name)}
              <span className="font-mono font-medium">{latestTool.name}</span>
              {argPreview && (
                <span className="truncate max-w-[220px] font-mono text-[10px] opacity-75" style={{ color: 'var(--text-muted)' }}>
                  ({argPreview})
                </span>
              )}
            </div>
          ) : latestStatus ? (
            <span className="truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {latestStatus}
            </span>
          ) : latestPlanStep ? (
            <span className="truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {latestPlanStep.text.slice(0, 50)}
            </span>
          ) : null}
        </div>

        {/* Right: Step Counter, Latency & Intervention Hint */}
        <div className="flex items-center gap-2.5 shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {totalToolCount > 0 && (
            <span className="tabular-nums font-mono px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
              {t('agent.status.iterations', `第 ${totalToolCount} 步`)}
            </span>
          )}
          {latestTool?.latencyMs != null && latestTool.latencyMs > 0 && (
            <span className="tabular-nums font-mono">
              {latestTool.latencyMs}ms
            </span>
          )}
          {turnUsage && (turnUsage.inputTokens > 0 || turnUsage.outputTokens > 0) && (
            <span className="tabular-nums font-mono px-1.5 py-0.5 rounded text-[10px] border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
              {Math.round((turnUsage.inputTokens + turnUsage.outputTokens) / 100) / 10}k tokens
            </span>
          )}
          {turnUsage && turnUsage.costUsd > 0 && (
            <span className="tabular-nums font-mono">
              ${turnUsage.costUsd.toFixed(4)}
            </span>
          )}
          <span className="hidden sm:inline opacity-60">
            {isLooping ? '可直接打字实时干预' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}
