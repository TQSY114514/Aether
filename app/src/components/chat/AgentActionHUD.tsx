import React, { useState, useMemo } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import {
  Zap,
  Cpu,
  AlertTriangle,
  Loader2,
  Terminal,
  FileCode,
  Search,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
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
  const planStepsByMessage = useStore((s) => s.planStepsByMessage)
  const statusLinesByMessage = useStore((s) => s.statusLinesByMessage)
  const messages = useStore((s) => s.messages)
  const turnUsage = useStore((s) => (sessionId ? s.turnUsageBySession[sessionId] : null))

  const [isExpanded, setIsExpanded] = useState(false)

  const isLooping = sessionId ? loopingSessions.has(sessionId) : false
  const isStreaming = sessionId ? !!streamingBySession[sessionId] : false
  if (!isLooping && !isStreaming) return null

  // Strict session scoping: only include messages in the active session
  const sessionMsgIds = new Set(messages.map((m) => m.id))
  const activeMessageId = sessionId ? streamingBySession[sessionId]?.messageId : null

  // Collect structured steps for the current session
  const steps: { name: string; args?: any; status: 'done' | 'running' | 'error'; latencyMs?: number; error?: string }[] = []

  // 1. Tool calls
  for (const [midStr, calls] of Object.entries(toolCallsByMessage)) {
    const mid = Number(midStr)
    if (sessionMsgIds.has(mid) || (activeMessageId && mid === activeMessageId)) {
      if (Array.isArray(calls)) {
        for (const c of calls) {
          const isRunning = c.result == null && c.error == null
          steps.push({
            name: c.name,
            args: c.args,
            status: isRunning ? 'running' : c.error ? 'error' : 'done',
            latencyMs: c.latencyMs ?? undefined,
            error: c.error ?? undefined,
          })
        }
      }
    }
  }

  // 2. Plan steps (if no tool calls yet)
  if (steps.length === 0) {
    for (const [midStr, pList] of Object.entries(planStepsByMessage)) {
      const mid = Number(midStr)
      if (sessionMsgIds.has(mid) || (activeMessageId && mid === activeMessageId)) {
        pList?.forEach((p) => {
          steps.push({
            name: p.assistantText,
            status: 'done',
          })
        })
      }
    }
  }

  const completedCount = steps.filter((s) => s.status === 'done').length
  const totalSteps = steps.length
  const activeStep = steps.find((s) => s.status === 'running') || (steps.length > 0 ? steps[steps.length - 1] : null)
  const isToolRunning = activeStep?.status === 'running'
  const activeArgPreview = activeStep ? formatToolArgPreview(activeStep.args) : ''

  return (
    <div
      className="mb-2 rounded-xl border shadow-sm transition-all duration-200"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: isToolRunning
          ? 'var(--warning, #f59e0b)'
          : 'var(--accent)',
      }}
    >
      {/* ── 1. Top HUD Capsule (Always Visible while running) ── */}
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-[var(--hover-bg)] transition-colors rounded-xl"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        {/* Left: Status Pill + Current Step Detail */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium text-[11px] shrink-0"
            style={{
              backgroundColor: isToolRunning
                ? 'rgba(245, 158, 11, 0.15)'
                : 'rgba(59, 130, 246, 0.15)',
              color: isToolRunning
                ? 'var(--warning, #f59e0b)'
                : 'var(--accent)',
            }}
          >
            {isToolRunning ? (
              <Loader2 size={12} className="animate-spin shrink-0" />
            ) : (
              <Cpu size={12} className="animate-pulse shrink-0" />
            )}
            <span>
              {isToolRunning
                ? t('agent.status.running_tool', '正在执行工具')
                : isLooping
                ? t('agent.status.orchestrating', '任务执行计划')
                : t('agent.status.generating', '生成回复中')}
              {totalSteps > 0 && ` (${completedCount}/${totalSteps})`}
            </span>
          </div>

          {/* Current Live Detail */}
          {activeStep && isToolRunning ? (
            <div className="flex items-center gap-1.5 truncate text-[11px]" style={{ color: 'var(--text-primary)' }}>
              {getToolIcon(activeStep.name)}
              <span className="font-mono font-medium">{activeStep.name}</span>
              {activeArgPreview && (
                <span className="truncate max-w-[220px] font-mono text-[10px] opacity-75" style={{ color: 'var(--text-muted)' }}>
                  ({activeArgPreview})
                </span>
              )}
            </div>
          ) : activeStep ? (
            <div className="flex items-center gap-1.5 truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              <span className="font-mono font-medium">{activeStep.name}</span>
              {activeArgPreview && (
                <span className="truncate max-w-[200px] font-mono text-[10px] opacity-60">
                  ({activeArgPreview})
                </span>
              )}
            </div>
          ) : (
            <span className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {t('agent.status.initializing', '正在准备执行环境...')}
            </span>
          )}
        </div>

        {/* Right: Latency, Tokens & Expand Toggle */}
        <div className="flex items-center gap-2 shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {activeStep?.latencyMs != null && activeStep.latencyMs > 0 && (
            <span className="tabular-nums font-mono hidden sm:inline">
              {activeStep.latencyMs}ms
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
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer"
            style={{ color: 'var(--accent)' }}
          >
            <span>{isExpanded ? t('common.collapse', '收起') : t('agent.action.all_steps', '全部步骤')}</span>
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* ── 2. Expandable Numbered Step List (1. xxx / 2. xxx / 3. xxx) (Scrollable) ── */}
      {isExpanded && (
        <div className="border-t border-[var(--border)] px-3 py-2.5 space-y-2 text-xs">
          <div className="text-[10px] font-medium text-[var(--text-muted)] flex items-center justify-between pb-1">
            <span>{t('agent.steps.list_title', `执行步骤清单 (${steps.length} 个步骤)`)}</span>
            <span className="opacity-60 text-[9px]">{t('agent.steps.scroll_hint', '支持鼠标滚轮滑动浏览')}</span>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 font-mono">
            {steps.length === 0 ? (
              <div className="py-2 text-center text-[11px] text-[var(--text-muted)]">
                {t('agent.steps.empty', '正在初始化规划与步骤...')}
              </div>
            ) : (
              steps.map((s, idx) => {
                const isRunning = s.status === 'running'
                const isError = s.status === 'error'
                const preview = formatToolArgPreview(s.args)

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
                          {idx + 1}. {s.name}
                        </span>
                        {preview && (
                          <span className="text-[10px] opacity-75 truncate max-w-[260px]" style={{ color: 'var(--text-muted)' }}>
                            ({preview})
                          </span>
                        )}
                        {s.latencyMs != null && s.latencyMs > 0 && (
                          <span className="ml-auto text-[9px] tabular-nums opacity-60">
                            {s.latencyMs}ms
                          </span>
                        )}
                      </div>

                      {isError && s.error && (
                        <div className="text-[10px] text-red-400 mt-0.5 truncate">
                          错误: {String(s.error).slice(0, 100)}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="text-[10px] text-[var(--text-muted)] opacity-60 flex items-center justify-between pt-1 border-t border-[var(--border)]">
            <span className="flex items-center gap-1.5"><Wand2 size={11} className="text-[var(--accent)]" /><span>提示：Agent 运行中可直接在下方输入框打字进行实时干预</span></span>
            <span>ESC / 点击收起</span>
          </div>
        </div>
      )}
    </div>
  )
}
