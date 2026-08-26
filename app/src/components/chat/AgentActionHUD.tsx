import React, { useState, useMemo } from 'react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import {
  Zap,
  Cpu,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Wand2,
  Bot,
  Layers,
} from 'lucide-react'

export default function AgentActionHUD({ sessionId }: { sessionId: number | null }) {
  const loopingSessions = useStore((s) => s.loopingSessions)
  const streamingBySession = useStore((s) => s.streamingBySession)
  const toolCallsByMessage = useStore((s) => s.toolCallsByMessage)
  const todosByMessage = useStore((s) => s.todosByMessage)
  const subagentsByMessage = useStore((s) => s.subagentsByMessage)
  const statusLinesByMessage = useStore((s) => s.statusLinesByMessage)
  const messages = useStore((s) => s.messages)
  const turnUsage = useStore((s) => (sessionId ? s.turnUsageBySession[sessionId] : null))

  const [isExpanded, setIsExpanded] = useState(false)

  const isLooping = sessionId ? loopingSessions.has(sessionId) : false
  const isStreaming = sessionId ? !!streamingBySession[sessionId] : false
  if (!isLooping && !isStreaming) return null

  // Strict session scoping: only include messages in the active session
  const sessionMsgIds = useMemo(() => new Set(messages.filter((m) => !sessionId || m.session_id === sessionId).map((m) => m.id)), [messages, sessionId])
  const activeMessageId = sessionId ? streamingBySession[sessionId]?.messageId : null

  // 1. Check if there are structured Todos/Plan for this session
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

  // 2. Collect parallel subagents from subagentsByMessage, status lines, and tool calls
  const subagents = useMemo(() => {
    const list: { id?: string; name: string; status: 'running' | 'done' | 'error'; latencyMs?: number; info?: string }[] = []

    // Read direct subagent events from store
    for (const [midStr, saList] of Object.entries(subagentsByMessage)) {
      const mid = Number(midStr)
      if (sessionMsgIds.has(mid) || (activeMessageId && mid === activeMessageId)) {
        if (Array.isArray(saList)) {
          for (const sa of saList) {
            list.push({
              id: sa.id,
              name: sa.name,
              status: sa.status,
              latencyMs: sa.latencyMs,
              info: sa.task || sa.output,
            })
          }
        }
      }
    }

    // Scan tool calls for subagents fallback
    for (const [midStr, calls] of Object.entries(toolCallsByMessage)) {
      const mid = Number(midStr)
      if (sessionMsgIds.has(mid) || (activeMessageId && mid === activeMessageId)) {
        if (Array.isArray(calls)) {
          for (const c of calls) {
            if (/subagent|runSubagent|delegate/i.test(c.name)) {
              const isRunning = c.result == null && c.error == null
              const name = (c.args as any)?.role ? `子代理 [${(c.args as any).role}]` : `子代理 (${c.name})`
              if (!list.some(sa => sa.name === name)) {
                list.push({
                  name,
                  status: isRunning ? 'running' : c.error ? 'error' : 'done',
                  latencyMs: c.latencyMs ?? undefined,
                  info: (c.args as any)?.prompt ? String((c.args as any).prompt).slice(0, 40) : undefined,
                })
              }
            }
          }
        }
      }
    }

    return list
  }, [subagentsByMessage, toolCallsByMessage, sessionMsgIds, activeMessageId])

  // 3. Tool call summary
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
  const planPct = planTotal > 0 ? Math.round((planCompleted / planTotal) * 100) : 0

  const activeTool = toolSteps.find((s) => s.status === 'running') || (toolSteps.length > 0 ? toolSteps[toolSteps.length - 1] : null)
  const isToolRunning = activeTool?.status === 'running'

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
                ? `任务执行计划 (已完成 ${planCompleted}/${planTotal} 步 · ${planPct}%)`
                : hasSubagents
                ? `多子代理协作 (${subagents.filter((sa) => sa.status === 'done').length}/${subagents.length})`
                : isToolRunning
                ? t('agent.status.running_tool', '正在执行工具')
                : isLooping
                ? t('agent.status.orchestrating', 'Agent 编排执行中')
                : t('agent.status.generating', '生成回复中')}
            </span>
          </div>

          {/* Current Live Detail */}
          {hasPlan && planActive ? (
            <div className="flex items-center gap-1.5 truncate text-[11px]" style={{ color: 'var(--text-primary)' }}>
              <Loader2 size={11} className="animate-spin text-amber-400 shrink-0" />
              <span className="font-semibold">{planActive.activeForm || planActive.content}</span>
            </div>
          ) : activeTool && isToolRunning ? (
            <div className="flex items-center gap-1.5 truncate text-[11px]" style={{ color: 'var(--text-primary)' }}>
              <span className="font-mono font-medium">{activeTool.name}</span>
            </div>
          ) : (
            <span className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {hasPlan ? '计划执行中...' : t('agent.status.initializing', '正在分析并规划执行步骤...')}
            </span>
          )}
        </div>

        {/* Right: Tokens & Expand Toggle */}
        <div className="flex items-center gap-2 shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>
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
            <span>{isExpanded ? t('common.collapse', '收起') : t('agent.action.all_steps', '展开全部')}</span>
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* ── 2. Expandable Plan & Subagent Matrix Drawer ── */}
      {isExpanded && (
        <div className="border-t border-[var(--border)] px-3 py-2.5 space-y-3 text-xs">
          
          {/* Section A: Multi-Subagents Parallel Matrix (if any) */}
          {hasSubagents && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium text-cyan-400 flex items-center gap-1.5">
                <Bot size={12} />
                <span>多子代理并行协作矩阵 ({subagents.length} 个 Subagent)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[11px]">
                {subagents.map((sa, idx) => (
                  <div
                    key={sa.id || idx}
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
                    {sa.info && (
                      <span className="text-[10px] opacity-75 truncate max-w-[120px]">{sa.info}</span>
                    )}
                    {sa.latencyMs != null && (
                      <span className="text-[9px] opacity-60 tabular-nums shrink-0">{sa.latencyMs}ms</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section B: High-Level Execution Plan Checklist */}
          {hasPlan ? (
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium text-[var(--text-muted)] flex items-center justify-between pb-0.5">
                <span className="flex items-center gap-1.5">
                  <Layers size={11} className="text-[var(--accent)]" />
                  <span>任务执行计划 (已完成 {planCompleted} / 共 {planTotal} 步 · {planPct}%)</span>
                </span>
                <span className="opacity-60 text-[9px]">支持滚轮滑动</span>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 font-mono">
                {latestTodos.map((todo, idx) => {
                  const isDone = todo.status === 'completed'
                  const isRunning = todo.status === 'in_progress'

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
                            className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${
                              isDone
                                ? 'text-emerald-400 bg-emerald-500/10'
                                : isRunning
                                ? 'text-amber-400 bg-amber-500/10 animate-pulse'
                                : 'text-gray-400 bg-gray-500/10'
                            }`}
                          >
                            {isDone ? '✓ 已完成' : isRunning ? '⟳ 进行中' : '○ 将要执行'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="py-2 text-center text-[11px] text-[var(--text-muted)]">
              暂无结构化任务计划，工具执行卡片直接在上方对话气泡中实时呈现
            </div>
          )}

          <div className="text-[10px] text-[var(--text-muted)] opacity-70 flex items-center justify-between pt-1 border-t border-[var(--border)]">
            <span className="flex items-center gap-1.5"><Wand2 size={11} className="text-[var(--accent)]" /><span>提示：可在下方输入框打字直接干预 Agent</span></span>
            <span>ESC / 点击收起</span>
          </div>
        </div>
      )}
    </div>
  )
}
