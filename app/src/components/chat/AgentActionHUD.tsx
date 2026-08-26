import React, { useState, useMemo } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import {
  Zap,
  Cpu,
  AlertTriangle,
  Loader2,
  Brain,
  Terminal,
  FileCode,
  Search,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Wand2,
} from 'lucide-react'

function getToolIcon(name: string) {
  if (/file|patch|write|edit/i.test(name)) return <FileCode size={13} className="text-amber-400 shrink-0" />
  if (/search|fetch|find|grep/i.test(name)) return <Search size={13} className="text-blue-400 shrink-0" />
  if (/command|bash|terminal|run/i.test(name)) return <Terminal size={13} className="text-emerald-400 shrink-0" />
  return <Zap size={13} className="text-purple-400 shrink-0" />
}

function formatToolArgPreview(args: any): string {
  if (!args) return ''
  if (typeof args === 'string') return args.slice(0, 45)
  if (args.path) return String(args.path).split(/[\\/]/).slice(-2).join('/')
  if (args.query) return `"${String(args.query).slice(0, 30)}"`
  if (args.url) {
    try {
      return new URL(args.url).hostname
    } catch {
      return String(args.url).slice(0, 30)
    }
  }
  if (args.command) return String(args.command).slice(0, 40)
  return ''
}

export default function AgentActionHUD({ sessionId }: { sessionId: number | null }) {
  const loopingSessions = useStore((s) => s.loopingSessions)
  const streamingBySession = useStore((s) => s.streamingBySession)
  const toolCallsByMessage = useStore((s) => s.toolCallsByMessage)
  const statusLinesByMessage = useStore((s) => s.statusLinesByMessage)
  const planStepsByMessage = useStore((s) => s.planStepsByMessage)
  const thinkingBlocksByMessage = useStore((s) => s.thinkingBlocksByMessage)
  const turnUsage = useStore((s) => (sessionId ? s.turnUsageBySession[sessionId] : null))

  const [isExpanded, setIsExpanded] = useState(false)

  const isLooping = sessionId ? loopingSessions.has(sessionId) : false
  const isStreaming = sessionId ? !!streamingBySession[sessionId] : false

  // Get active message info
  const activeMessageId = sessionId ? streamingBySession[sessionId]?.messageId : null

  // Real-time streaming thinking text
  const activeThinkingText = useMemo(() => {
    if (activeMessageId && thinkingBlocksByMessage[activeMessageId]) {
      return thinkingBlocksByMessage[activeMessageId]
    }
    // Fallback: latest thinking block across all messages
    const entries = Object.entries(thinkingBlocksByMessage)
    if (entries.length > 0) {
      return entries[entries.length - 1][1]
    }
    return ''
  }, [activeMessageId, thinkingBlocksByMessage])

  // Collect all tool calls in chronological order
  const allToolCalls = useMemo(() => {
    const list: any[] = []
    for (const [, calls] of Object.entries(toolCallsByMessage)) {
      if (Array.isArray(calls)) {
        list.push(...calls)
      }
    }
    return list
  }, [toolCallsByMessage])

  const latestTool = useMemo(() => {
    if (allToolCalls.length === 0) return null
    const last = allToolCalls[allToolCalls.length - 1]
    const isRunning = last.result == null && last.error == null
    return {
      name: last.name,
      args: last.args,
      isRunning,
      latencyMs: last.latencyMs,
      error: last.error,
    }
  }, [allToolCalls])

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

  const isToolRunning = latestTool?.isRunning
  const hasThinking = !!activeThinkingText && activeThinkingText.trim().length > 0
  const totalSteps = allToolCalls.length

  const argPreview = latestTool ? formatToolArgPreview(latestTool.args) : ''

  return (
    <div
      className="mb-2 rounded-xl border shadow-sm transition-all duration-200"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: isToolRunning
          ? 'var(--warning, #f59e0b)'
          : hasThinking
          ? 'rgba(168, 85, 247, 0.4)'
          : 'var(--accent)',
      }}
    >
      {/* ── 1. Top HUD Capsule (Always Visible while running) ── */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
        {/* Left: Status Pill + Current Live Action */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium text-[11px] shrink-0"
            style={{
              backgroundColor: isToolRunning
                ? 'rgba(245, 158, 11, 0.15)'
                : hasThinking
                ? 'rgba(168, 85, 247, 0.15)'
                : 'rgba(59, 130, 246, 0.15)',
              color: isToolRunning
                ? 'var(--warning, #f59e0b)'
                : hasThinking
                ? '#a855f7'
                : 'var(--accent)',
            }}
          >
            {isToolRunning ? (
              <Loader2 size={12} className="animate-spin shrink-0" />
            ) : hasThinking ? (
              <Brain size={12} className="animate-pulse shrink-0" />
            ) : (
              <Cpu size={12} className="animate-pulse shrink-0" />
            )}
            <span>
              {isToolRunning
                ? '正在执行工具'
                : hasThinking
                ? '深度思考与推理'
                : isLooping
                ? 'Agent 编排执行中'
                : '生成回复中'}
            </span>
          </div>

          {/* Current Live Detail */}
          {isToolRunning && latestTool ? (
            <div className="flex items-center gap-1.5 truncate text-[11px]" style={{ color: 'var(--text-primary)' }}>
              {getToolIcon(latestTool.name)}
              <span className="font-mono font-medium">{latestTool.name}</span>
              {argPreview && (
                <span className="truncate max-w-[200px] font-mono text-[10px] opacity-75" style={{ color: 'var(--text-muted)' }}>
                  ({argPreview})
                </span>
              )}
            </div>
          ) : hasThinking ? (
            <div className="flex items-center gap-1.5 truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              <span className="truncate font-mono opacity-90">
                {activeThinkingText.slice(-60).replace(/\n/g, ' ')}
              </span>
              <span className="animate-pulse opacity-70">▋</span>
            </div>
          ) : latestTool ? (
            <div className="flex items-center gap-1.5 truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
              <span className="font-mono">{latestTool.name}</span>
              {argPreview && (
                <span className="truncate max-w-[180px] font-mono text-[10px] opacity-60">
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

        {/* Right: Step Counter, Latency, Tokens & Expand Toggle */}
        <div className="flex items-center gap-2 shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {totalSteps > 0 && (
            <span
              className="tabular-nums font-mono px-1.5 py-0.5 rounded border"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
            >
              {t('agent.status.iterations', `第 ${totalSteps} 步`)}
            </span>
          )}
          {latestTool?.latencyMs != null && latestTool.latencyMs > 0 && (
            <span className="tabular-nums font-mono hidden sm:inline">
              {latestTool.latencyMs}ms
            </span>
          )}
          {turnUsage && (turnUsage.inputTokens > 0 || turnUsage.outputTokens > 0) && (
            <span
              className="tabular-nums font-mono px-1.5 py-0.5 rounded text-[10px] border hidden sm:inline"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
            >
              {Math.round((turnUsage.inputTokens + turnUsage.outputTokens) / 100) / 10}k tokens
            </span>
          )}

          {/* Expand/Collapse Drawer Button */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[var(--hover-bg)] text-[11px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--accent)' }}
          >
            <span>{isExpanded ? '收起' : totalSteps > 0 || hasThinking ? '全部步骤' : '详情'}</span>
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* ── 2. Expandable Trajectory & Thinking Drawer (Scrollable) ── */}
      {isExpanded && (
        <div className="border-t border-[var(--border)] px-3 py-2.5 space-y-2 text-xs">
          {/* Real-time thinking stream block */}
          {hasThinking && (
            <div className="p-2 rounded-lg bg-[rgba(168,85,247,0.06)] border border-[rgba(168,85,247,0.15)] font-mono text-[11px] space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-purple-400 text-[10px]">
                <Brain size={12} className="animate-pulse" />
                <span>实时思考与推理流 (Thinking Stream)</span>
              </div>
              <div className="max-h-28 overflow-y-auto whitespace-pre-wrap leading-relaxed opacity-85 text-[var(--text-secondary)] pr-1">
                {activeThinkingText}
                <span className="animate-pulse text-purple-400">▋</span>
              </div>
            </div>
          )}

          {/* Chronological Step List */}
          <div className="space-y-1">
            <div className="text-[10px] font-medium text-[var(--text-muted)] flex items-center justify-between pb-1">
              <span>执行步骤清单 ({allToolCalls.length} 个动作)</span>
              <span className="opacity-60 text-[9px]">支持滚轮滑动浏览</span>
            </div>

            <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 font-mono">
              {allToolCalls.length === 0 && !hasThinking && (
                <div className="py-2 text-center text-[11px] text-[var(--text-muted)]">
                  正在初始化规划与环境...
                </div>
              )}

              {allToolCalls.map((call, idx) => {
                const isRunning = call.result == null && call.error == null
                const isError = !!call.error
                const preview = formatToolArgPreview(call.args)

                return (
                  <div
                    key={idx}
                    className="flex items-start gap-2 p-1.5 rounded-md text-[11px] transition-colors"
                    style={{
                      backgroundColor: isRunning
                        ? 'rgba(245, 158, 11, 0.08)'
                        : isError
                        ? 'rgba(239, 68, 68, 0.08)'
                        : 'var(--hover-bg)',
                    }}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isRunning ? (
                        <Loader2 size={12} className="text-amber-400 animate-spin" />
                      ) : isError ? (
                        <AlertTriangle size={12} className="text-red-400" />
                      ) : (
                        <CheckCircle2 size={12} className="text-emerald-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-[var(--text-primary)]">
                          第 {idx + 1} 步: {call.name}
                        </span>
                        {preview && (
                          <span className="text-[10px] opacity-75 truncate max-w-[260px]" style={{ color: 'var(--text-muted)' }}>
                            ({preview})
                          </span>
                        )}
                        {call.latencyMs != null && call.latencyMs > 0 && (
                          <span className="ml-auto text-[9px] tabular-nums opacity-60">
                            {call.latencyMs}ms
                          </span>
                        )}
                      </div>

                      {isError && (
                        <div className="text-[10px] text-red-400 mt-0.5 truncate">
                          错误: {String(call.error).slice(0, 100)}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="text-[10px] text-[var(--text-muted)] opacity-60 flex items-center justify-between pt-1 border-t border-[var(--border)]">
            <span>💡 提示：Agent 运行中可直接在下方输入框打字进行实时干预</span>
            <span>ESC / 点击收起</span>
          </div>
        </div>
      )}
    </div>
  )
}
