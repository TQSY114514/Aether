import { memo } from 'react'
import { Brain, Wrench, Check, AlertCircle, MessageSquare, ShieldAlert, ShieldCheck } from 'lucide-react'
import ToolCallBlock from './ToolCallBlock'
import ThinkingBlock from './ThinkingBlock'
import { t } from '@/utils/i18n'

type ToolEntry = {
  name: string
  args: unknown
  result: string | null
  error: string | null
  failureKind?: string | null
  recoveryHint?: { action?: string; hint?: string } | null
  risk?: string | null
  latencyMs?: number | null
  startedAt?: number | null
  checkpointId?: number | null
  diff?: string | null
  afterSnapshot?: { path: string; content: string; truncated: boolean } | null
  liveOutput?: string
  liveOutputDone?: boolean
}

type PlanStep = {
  step: number
  depth: number
  assistantText: string
  kind?: 'plan' | 'act' | 'observe'
}

type AgentTimelineProps = {
  thinkingText?: string
  thinkingStreaming?: boolean
  toolCalls?: ToolEntry[]
  planSteps?: PlanStep[]
  streaming?: boolean
}

// Human-phrased label for a tool call (mirrors ToolCallBlock's toolLabel).
function toolLabel(name: string, args: any): string {
  const a = (args && typeof args === 'object' ? args : {}) as any
  const basename = (p: string) => { try { return String(p).replace(/\\/g, '/').split('/').pop() } catch { return p } }
  const first = (s: string, n = 30) => { const x = String(s || '').trim().replace(/\s+/g, ' '); return x.length > n ? x.slice(0, n) + '…' : x }
  switch (name) {
    case 'read_file': return a.path ? `${t('tool.read_file', '读取')} ${basename(a.path)}` : t('tool.read_file', '读取文件')
    case 'list_dir': return a.path ? `${t('tool.list_dir', '列出')} ${basename(a.path)}` : t('tool.list_dir', '列出目录')
    case 'grep_search': return a.pattern ? `${t('tool.grep_search', '搜索')} ${first(a.pattern)}` : t('tool.grep_search', '搜索')
    case 'write_file': return a.path ? `${t('tool.write_file', '写入')} ${basename(a.path)}` : t('tool.write_file', '写入文件')
    case 'edit_file': return a.path ? `${t('tool.edit_file', '编辑')} ${basename(a.path)}` : t('tool.edit_file', '编辑文件')
    case 'run_command': return a.command ? `${t('tool.run_command', '执行')} ${first((a.command + '').split(' ').slice(0, 3).join(' '))}` : t('tool.run_command', '执行命令')
    case 'glob_find': return a.pattern ? `${t('tool.glob_find', '查找')} ${first(a.pattern)}` : t('tool.glob_find', '查找文件')
    case 'web_search': return a.query ? `${t('tool.web_search', '搜索')} ${first(a.query)}` : t('tool.web_search', '搜索')
    case 'web_fetch': return a.url ? `${t('tool.web_fetch', '获取')} ${first(a.url, 35)}` : t('tool.web_fetch', '获取网页')
    default: return name
  }
}

// Status node dot: colored based on state (square engineering node).
function StatusDot({ status, dangerous }: { status: 'running' | 'success' | 'error'; dangerous?: boolean }) {
  const colors = {
    running: 'var(--accent)',
    success: 'var(--success)',
    error: 'var(--error)',
  }
  return (
    <div
      className={`w-2 h-2 rounded-[1px] shrink-0 border ${status === 'running' ? 'animate-pulse' : ''}`}
      style={{ backgroundColor: colors[status], borderColor: dangerous ? 'var(--warning)' : colors[status] }}
    />
  )
}

// Phase badge for plan steps (Plan / Act / Observe).
function PhaseBadge({ kind }: { kind?: string }) {
  if (!kind) return null
  const styles: Record<string, { bg: string; text: string }> = {
    plan: { bg: 'var(--accent)', text: '#fff' },
    act: { bg: 'var(--warning)', text: '#fff' },
    observe: { bg: 'var(--success)', text: '#fff' },
  }
  const s = styles[kind] || styles.plan
  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded-[2px] font-mono font-medium uppercase"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {kind}
    </span>
  )
}

// Unified timeline that interleaves thinking, tool calls, and commentary
// in a connected vertical flow — replacing the old disconnected card blocks.
function AgentTimeline({ thinkingText, thinkingStreaming, toolCalls, planSteps, streaming }: AgentTimelineProps) {
  const hasThinking = !!thinkingText
  const hasTools = !!toolCalls && toolCalls.length > 0
  const hasSteps = !!planSteps && planSteps.length > 0
  const hasAny = hasThinking || hasTools || hasSteps

  if (!hasAny) return null

  return (
    <div className="mb-2">
      {/* Thinking section — rendered first with left-bar style */}
      {hasThinking && (
        <ThinkingBlock
          text={thinkingText!}
          streaming={thinkingStreaming}
          collapsed={false}
        />
      )}

      {/* Tool calls + commentary timeline */}
      {(hasTools || hasSteps) && (
        <div className="relative">
          {/* Vertical timeline line */}
          <div
            className="absolute top-0 bottom-0 w-px"
            style={{ left: '5px', backgroundColor: 'var(--border)' }}
          />

          {/* Interleaved nodes */}
          <div className="space-y-0.5">
            {/* Plan step commentary nodes (interspersed) */}
            {hasSteps && !hasTools && planSteps!.map((step, i) => (
              <div key={`step-${i}`} className="relative flex items-start gap-2.5 pl-3 py-1 timeline-node-enter">
                <div className="absolute left-0.5 top-2.5 w-2 h-2 rounded-[1px] border" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }} />
                <div className="flex items-center gap-1.5 min-w-0">
                  <PhaseBadge kind={step.kind} />
                  <span className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                    {step.assistantText.slice(0, 120)}{step.assistantText.length > 120 ? '…' : ''}
                  </span>
                </div>
              </div>
            ))}

            {/* Tool call nodes */}
            {hasTools && toolCalls!.map((tc, i) => {
              const running = tc.result == null && tc.error == null
              const status = tc.error ? 'error' : tc.result != null ? 'success' : 'running'

              return (
                <div key={i} className="relative pl-3 timeline-node-enter">
                  {/* Timeline dot */}
                  <div className="absolute left-0 top-2" style={{ left: '1.5px' }}>
                    <StatusDot status={status} dangerous={tc.risk === 'dangerous'} />
                  </div>

                  {/* Tool block — compact mode: integrated into timeline */}
                  <ToolCallBlock tool={tc} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(AgentTimeline)
