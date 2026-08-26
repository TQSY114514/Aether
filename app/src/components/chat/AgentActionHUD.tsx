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
  Bot,
  Layers,
  Sparkles,
} from 'lucide-react'

function getToolIcon(name: string) {
  if (/file|patch|write|edit/i.test(name)) return <FileCode size={13} className="text-amber-400 shrink-0" />
  if (/search|fetch|find|grep/i.test(name)) return <Search size={13} className="text-blue-400 shrink-0" />
  if (/command|bash|terminal|run/i.test(name)) return <Terminal size={13} className="text-emerald-400 shrink-0" />
  if (/subagent|delegate|agent/i.test(name)) return <Bot size={13} className="text-cyan-400 shrink-0" />
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
  if (args.prompt) return `"${String(args.prompt).slice(0, 30)}"`
  return ''
}

export default function AgentActionHUD({ sessionId }: { sessionId: number | null }) {
  const loopingSessions = useStore((s) => s.loopingSessions)
  const streamingBySession = useStore((s) => s.streamingBySession)
  const toolCallsByMessage = useStore((s) => s.toolCallsByMessage)
  const planStepsByMessage = useStore((s) => s.planStepsByMessage)
  const todosByMessage = useStore((s) => s.todosByMessage)
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

  // 1. Check if there are structured Todos/Plan for this session (含已完成、进行中、将要执行的步骤)
  const latestTodos = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.session_id === sessionId) {
        const tList = todosByMessage[msg.id]
        if (tList && tList.length > 0) return tList
      }
    }
    if (activeMessageId && todosByMessage[activeMessageId]) {
      return todosByMessage[activeMessageId]
    }
    return []
  }, [messages, todosByMessage, sessionId, activeMessageId])

  // 2. Collect parallel subagents from status lines and tool calls
  const subagents = useMemo(() => {
    const list: { name: string; status: 'running' | 'done' | 'error'; latencyMs?: number; info?: string }[] = []
    
    // Scan tool calls for subagents
    for (const [midStr, calls] of Object.entries(toolCallsByMessage)) {
      const mid = Number(midStr)
      if (sessionMsgIds.has(mid) || (activeMessageId && mid === activeMessageId)) {
        if (Array.isArray(calls)) {
          for (const c of calls) {
            if (/subagent|runSubagent|delegate/i.test(c.name)) {
              const isRunning = c.result == null && c.error == null
              list.push({
                name: (c.args as any)?.role ? `子代理 [${(c.args as any).role}]` : `子代理 (${c.name})`,
                status: isRunning ? 'running' : c.error ? 'error' : 'done',
                latencyMs: c.latencyMs ?? undefined,
                info: (c.args as any)?.prompt ? String((c.args as any).prompt).slice(0, 40) : undefined,
              })
            }
          }
        }
      }
    }

    // Scan status lines for parallel subagent events
    for (const [midStr, lines] of Object.entries(statusLinesByMessage)) {
      const mid = Number(midStr)
      if (sessionMsgIds.has(mid) || (activeMessageId && mid === activeMessageId)) {
        if (Array.isArray(lines)) {
          for (const l of lines) {
            if (l.includes('子代理') || l.includes('subagent')) {
              const isDone = l.includes('完成') || l.includes('done')
              const isFail = l.includes('失败') || l.includes('fail')
              const isRunning = !isDone && !isFail
              // Don't duplicate if already in list
              if (!list.some((sa) => sa.name === l)) {
                list.push({
                  name: l,
                  status: isRunning ? 'running' : isFail ? 'error' : 'done',
                })
              }
            }
          }
        }
      }
    }

    return list
  }, [toolCallsByMessage, statusLinesByMessage, sessionMsgIds, activeMessageId])

  // 3. Collect chronological tool execution steps
  const toolSteps = useMemo(() => {
    const list: { name: string; args?: any; status: 'done' | 'running' | 'error'; latencyMs?: number; error?: string }[] = []
    for (const [midStr, calls] of Object.entries(toolCallsByMessage)) {
      const mid = Number(midStr)
      if (sessionMsgIds.has(mid) || (activeMessageId && mid === activeMessageId)) {
        if (Array.isArray(calls)) {
          for (const c of calls) {
            const isRunning = c.result == null && c.error == null
            list.push({
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
    return list
  }, [toolCallsByMessage, sessionMsgIds, activeMessageId])

  const hasPlan = latestTodos.length > 0
  const hasSubagents = subagents.length > 0

  // Calculate plan progress
  const planCompleted = latestTodos.filter((t) => t.status === 'completed').length
  const planTotal = latestTodos.length
  const planActive = latestTodos.find((t) => t.status === 'in_progress')

  const toolCompleted = toolSteps.filter((s) => s.status === 'done').length
  const toolTotal = toolSteps.length
  const activeTool = toolSteps.find((s) => s.status === 'running') || (toolSteps.length > 0 ? toolSteps[toolSteps.length - 1] : null)
  const isToolRunning = activeTool?.status === 'running'
  const activeArgPreview = activeTool ? formatToolArgPreview(activeTool.args) : ''

  return (
    <div
      className="mb-2 rounded-xl border shadow-sm transition-all duration-200"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: isToolRunning
          ? 'var(--warning, #f59e0b)'
          : hasPlan
          ? 'var(--accent)'
          : 'var(--border)',
      }}
    >
      {/* ── 1. Top HUD Capsule (Always Visible while running) ── */}
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-[var(--hover-bg)] transition-colors rounded-xl"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        {/* Left: Status Pill + Active Action / Plan */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium text-[11px] shrink-0"
            style={{
              backgroundColor: isToolRunning
                ? 'rgba(245, 158, 11, 0.15)'
                : hasSubagents
                ? 'rgba(6, 182, 212, 0.15)'
                : 'rgba(59, 130, 246, 0.15)',
              color: isToolRunning
                ? 'var(--warning, #f59e0b)'
                : hasSubagents
                ? '#06b6d4'
                : 'var(--accent)',
            }}
          >
            {isToolRunning ? (
              <Loader2 size={12} className="animate-spin shrink-0" />
            ) : hasSubagents ? (
              <Bot size={12} className="animate-pulse shrink-0" />
            ) : hasPlan ? (
              <Layers size={12} className="animate-pulse shrink-0" />
            ) : (
              <Cpu size={12} className="animate-pulse shrink-0" />
            )}
            <span>
              {hasPlan
                ? `任务计划 (${planCompleted}/${planTotal})`
                : hasSubagents
                ? `多子代理并行 (${subagents.filter((sa) => sa.status === 'done').length}/${subagents.length})`
                : isToolRunning
                ? t('agent.status.running_tool', '正在执行工具')
                : isLooping
                ? t('agent.status.orchestrating', 'Agent 编排执行中')
                : t('agent.status.generating', '生成回复中')}
              {!hasPlan && toolTotal > 0 && ` (${toolCompleted}/${toolTotal})`}
            </span>
          </div>

          {/* Current Live Detail */}
          {hasPlan && planActive ? (
            <div className="flex items-center gap-1.5 truncate text-[11px]" style={{ color: 'var(--text-primary)' }}>
              <Loader2 size={11} className="animate-spin text-amber-400 shrink-0" />
              <span className="font-semibold">{planActive.content}</span>
            </div>
          ) : activeTool && isToolRunning ? (
            <div className="flex items-center gap-1.5 truncate text-[11px]" style={{ color: 'var(--text-primary)' }}>
              {getToolIcon(activeTool.name)}
              <span className="font-mono font-medium">{activeTool.name}</span>
              {activeArgPreview && (
                <span className="truncate max-w-[220px] font-mono text-[10px] opacity-75" style={{ color: 'var(--text-muted)' }}>
                  ({activeArgPreview})
                </span>
              )}
            </div>
          ) : activeTool ? (
            <div className="flex items-center gap-1.5 truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              <span className="font-mono font-medium">{activeTool.name}</span>
              {activeArgPreview && (
                <span className="truncate max-w-[200px] font-mono text-[10px] opacity-60">
                  ({activeArgPreview})
                </span>
              )}
            </div>
          ) : (
            <span className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {t('agent.status.initializing', '正在分析并规划执行步骤...')}
            </span>
          )}
        </div>

        {/* Right: Latency, Tokens & Expand Toggle */}
        <div className="flex items-center gap-2 shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {activeTool?.latencyMs != null && activeTool.latencyMs > 0 && (
            <span className="tabular-nums font-mono hidden sm:inline">
              {activeTool.latencyMs}ms
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

      {/* ── 2. Expandable Numbered Plan & Execution Checklist (Scrollable) ── */}
      {isExpanded && (
        <div className="border-t border-[var(--border)] px-3 py-2.5 space-y-3 text-xs">
          
          {/* Section A: Multi-Subagents Parallel Matrix (if any) */}
          {hasSubagents && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium text-cyan-400 flex items-center gap-1.5">
                <Bot size={12} />
                <span>多子代理并行协作状态 ({subagents.length} 个 Subagent)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[11px]">
                {subagents.map((sa, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 p-1.5 rounded-lg border ${
                      sa.status === 'running'
                        ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
                        : sa.status === 'error'
                        ? 'bg-red-500/10 border-red-500/30 text-red-300'
                        : 'bg-[var(--content-bg)] border-[var(--border)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {sa.status === 'running' ? (
                      <Loader2 size={12} className="text-cyan-400 animate-spin shrink-0" />
                    ) : sa.status === 'error' ? (
                      <AlertTriangle size={12} className="text-red-400 shrink-0" />
                    ) : (
                      <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                    )}
                    <span className="font-semibold truncate flex-1">{sa.name}</span>
                    {sa.latencyMs != null && (
                      <span className="text-[9px] opacity-60 tabular-nums shrink-0">{sa.latencyMs}ms</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section B: High-Level Execution Plan (含已完成、进行中、将要执行的完整计划) */}
          {hasPlan && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium text-[var(--text-muted)] flex items-center justify-between pb-0.5">
                <span className="flex items-center gap-1.5">
                  <Layers size={11} className="text-[var(--accent)]" />
                  <span>任务规划执行清单 (已完成 {planCompleted} / 共 {planTotal} 步)</span>
                </span>
                <span className="opacity-60 text-[9px]">支持滚轮滑动</span>
              </div>

              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 font-mono">
                {latestTodos.map((todo, idx) => {
                  const isDone = todo.status === 'completed'
                  const isRunning = todo.status === 'in_progress'
                  const isPending = todo.status === 'pending' || (!isDone && !isRunning)

                  return (
                    <div
                      key={(todo as any).id || idx}
                      className={`flex items-start gap-2 p-1.5 rounded-lg text-[11px] transition-colors ${
                        isRunning
                          ? 'bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--text-primary)] font-medium'
                          : isDone
                          ? 'bg-[var(--content-bg)] text-[var(--text-secondary)] opacity-75'
                          : 'bg-[var(--bg-secondary)] border border-dashed border-[var(--border)] text-[var(--text-muted)]'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isDone ? (
                          <CheckCircle2 size={13} className="text-emerald-400" />
                        ) : isRunning ? (
                          <Loader2 size={13} className="text-amber-400 animate-spin" />
                        ) : (
                          <Circle size={13} className="text-gray-400 opacity-40" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold shrink-0">{idx + 1}.</span>
                          <span className={`truncate flex-1 ${isDone ? 'line-through opacity-70' : ''}`}>
                            {todo.content}
                          </span>
                          <span
                            className={`text-[9px] px-1 py-0.2 rounded shrink-0 ${
                              isDone
                                ? 'text-emerald-400 bg-emerald-500/10'
                                : isRunning
                                ? 'text-amber-400 bg-amber-500/10 animate-pulse'
                                : 'text-gray-400 bg-gray-500/10'
                            }`}
                          >
                            {isDone ? '已完成' : isRunning ? '正在执行' : '将要执行'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Section C: Detailed Tool Actions List */}
          {toolSteps.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-[var(--border)]">
              <div className="text-[10px] font-medium text-[var(--text-muted)] flex items-center justify-between pb-0.5">
                <span>底层动作轨迹 ({toolSteps.length} 个工具调用)</span>
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1 pr-1 font-mono">
                {toolSteps.map((s, idx) => {
                  const isRunning = s.status === 'running'
                  const isError = s.status === 'error'
                  const preview = formatToolArgPreview(s.args)

                  return (
                    <div
                      key={idx}
                      className={`flex items-start gap-2 p-1 rounded-md text-[10px] ${
                        isRunning
                          ? 'bg-amber-500/10 text-amber-300'
                          : isError
                          ? 'bg-red-500/10 text-red-300'
                          : 'text-[var(--text-secondary)] opacity-80'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isRunning ? (
                          <Loader2 size={10} className="text-amber-400 animate-spin" />
                        ) : isError ? (
                          <AlertTriangle size={10} className="text-red-400" />
                        ) : (
                          <CheckCircle2 size={10} className="text-emerald-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold">{s.name}</span>
                        {preview && <span className="opacity-60 truncate max-w-[220px]">({preview})</span>}
                        {s.latencyMs != null && s.latencyMs > 0 && (
                          <span className="ml-auto text-[9px] tabular-nums opacity-60">{s.latencyMs}ms</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="text-[10px] text-[var(--text-muted)] opacity-60 flex items-center justify-between pt-1 border-t border-[var(--border)]">
            <span className="flex items-center gap-1.5"><Wand2 size={11} className="text-[var(--accent)]" /><span>提示：Agent 运行中可直接在下方输入框打字进行实时干预</span></span>
            <span>ESC / 点击收起</span>
          </div>
        </div>
      )}
    </div>
  )
}
