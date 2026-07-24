import { useState, useEffect } from 'react'
import { Wrench, ChevronDown, ChevronRight, Check, AlertCircle, ShieldAlert, ShieldCheck, RotateCcw, Info } from 'lucide-react'
import { t } from '@/utils/i18n'

type ToolCall = { name: string; args: unknown; result: string | null; error: string | null; failureKind?: string | null; recoveryHint?: { action?: string; hint?: string } | null; risk?: string | null; latencyMs?: number | null; checkpointId?: number | null }

const FAILURE_LABELS: Record<string, string> = {
  timeout: 'tool.failure.timeout',
  permission_denied: 'tool.failure.permission_denied',
  env_missing_dependency: 'tool.failure.env_missing_dependency',
  test_failure: 'tool.failure.test_failure',
  model_invalid_args: 'tool.failure.model_invalid_args',
  unknown: 'tool.failure.unknown',
}

// Human-phrased status label for a tool call: "Reading api.md", "Searching the
// web for …", "Running git status", etc. Falls back to the raw tool name when
// there is no specific phrasing or the primary arg is missing. The raw name is
// kept as the title attribute so it's still discoverable.
function toolLabel(tool: ToolCall): string {
  const a = (tool.args && typeof tool.args === 'object' ? tool.args : {}) as any
  const basename = (p: string) => { try { return String(p).replace(/\\/g, '/').split('/').pop() } catch { return p } }
  const first = (s: string, n = 40) => { const x = String(s || '').trim().replace(/\s+/g, ' '); return x.length > n ? x.slice(0, n) + '…' : x }
  switch (tool.name) {
    case 'read_file': return a.path ? `读取 ${basename(a.path)}` : '读取文件'
    case 'list_dir': return a.path ? `列出 ${basename(a.path)}` : '列出目录'
    case 'glob_find': return a.pattern ? `查找 ${first(a.pattern, 30)}` : '查找文件'
    case 'grep_search': return a.pattern ? `搜索 ${first(a.pattern, 30)}` : '搜索内容'
    case 'web_search': return a.query ? `联网搜索 ${first(a.query)}` : '联网搜索'
    case 'web_fetch': return a.url ? `抓取 ${first(a.url, 40)}` : '抓取网页'
    case 'write_file': return a.path ? `写入 ${basename(a.path)}` : '写入文件'
    case 'edit_file': return a.path ? `编辑 ${basename(a.path)}` : '编辑文件'
    case 'run_command': return a.command ? `运行 ${first((a.command + '').split(' ').slice(0, 3).join(' '), 30)}` : '运行命令'
    case 'git_status': return '查看 git 状态'
    case 'git_diff': return '查看 git 差异'
    case 'git_log': return a.count ? `查看 git 日志 (${a.count} 条)` : '查看 git 日志'
    case 'git_commit': return a.message ? `提交: ${first(a.message, 30)}` : 'git 提交'
    case 'memory_save': return '保存记忆'
    case 'memory_list': return '列出记忆'
    case 'use_skill': return a.name ? `使用技能 ${first(a.name, 30)}` : '使用技能'
    case 'ask_user': return '向你提问'
    case 'todo_write': return '更新任务清单'
    default: return tool.name
  }
}

function argsCount(args: unknown): number {
  return (args && typeof args === 'object' && !Array.isArray(args) ? Object.keys(args as Record<string, unknown>).length : 0)
}

// Renders one tool invocation as a collapsible block: a human status label,
// expandable to show the arguments the model supplied and the result we got back.
// Shows a risk badge (dangerous vs safe), failure type, recovery hint, and the elapsed time when available.
export default function ToolCallBlock({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false)
  const [rollbackState, setRollbackState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const status = tool.error
    ? { icon: AlertCircle, color: 'var(--error)', label: t('tool.status.failed') }
    : tool.result != null
    ? { icon: Check, color: 'var(--success)', label: t('tool.status.done') }
    : { icon: Wrench, color: 'var(--text-muted)', label: t('tool.status.running') }
  const StatusIcon = status.icon
  const dangerous = tool.risk === 'dangerous'
  const label = toolLabel(tool)
  // Auto-expand when there's an error so the user can see what went wrong.
  useEffect(() => { if (tool.error) setOpen(true) }, [tool.error])
  const rollback = async () => {
    if (!tool.checkpointId || rollbackState === 'running') return
    setRollbackState('running')
    const res = await window.electronAPI.agentCheckpoint.rollback({ id: tool.checkpointId })
    setRollbackState(res.success ? 'done' : 'error')
    if (!res.success) setOpen(true)
  }
  const hasArgs = argsCount(tool.args) > 0
  const failureKey = tool.failureKind && FAILURE_LABELS[tool.failureKind] ? FAILURE_LABELS[tool.failureKind] : null

  return (
    <div className="rounded-lg border mb-2 overflow-hidden" style={{ borderColor: dangerous ? 'var(--warning)' : 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--border)] transition-colors" title={tool.name}>
        {open ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
        {dangerous ? <ShieldAlert size={12} style={{ color: 'var(--warning)' }} /> : <ShieldCheck size={12} className="text-gray-400" />}
        <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{label}</span>
        {dangerous && (
          <span className="text-[9px] px-1 py-0.5 rounded font-medium shrink-0" style={{ backgroundColor: 'var(--warning)', color: '#fff' }}>{t('tool.risk.dangerous')}</span>
        )}
        {failureKey && tool.error && (
          <span className="text-[9px] px-1 py-0.5 rounded font-medium shrink-0" style={{ backgroundColor: 'rgba(234,179,8,0.15)', color: 'var(--warning)' }}>{t(failureKey)}</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {tool.latencyMs != null && tool.result != null && (
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{tool.latencyMs < 1000 ? `${tool.latencyMs}ms` : `${(tool.latencyMs/1000).toFixed(1)}s`}</span>
          )}
          <span className="flex items-center gap-1" style={{ color: status.color }}>
            <StatusIcon size={11} />{status.label}
          </span>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 space-y-1.5">
          {hasArgs ? (
            <div>
              <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>{t('tool.args')}</div>
              <pre className="text-[11px] font-mono whitespace-pre-wrap break-all" style={{ color: 'var(--text-secondary)' }}>{JSON.stringify(tool.args, null, 2)}</pre>
            </div>
          ) : null}
          {tool.result != null && (
            <div>
              <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>{t('tool.result')}</div>
              <pre className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto" style={{ color: 'var(--text-secondary)' }}>{tool.result}</pre>
            </div>
          )}
          {tool.checkpointId && (
            <button
              type="button"
              onClick={rollback}
              disabled={rollbackState === 'running' || rollbackState === 'done'}
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] disabled:opacity-60"
              style={{ borderColor: 'var(--border)', color: rollbackState === 'error' ? 'var(--error)' : 'var(--text-secondary)' }}
            >
              <RotateCcw size={12} />
              {rollbackState === 'running' ? t('tool.rollback.running') : rollbackState === 'done' ? t('tool.rollback.done') : rollbackState === 'error' ? t('tool.rollback.error') : t('tool.rollback')}
            </button>
          )}
          {tool.error && (
            <div>
              <div className="text-[10px] mb-0.5" style={{ color: 'var(--error)' }}>{t('tool.error')}</div>
              <pre className="text-[11px] font-mono whitespace-pre-wrap break-all" style={{ color: 'var(--error)' }}>{tool.error}</pre>
            </div>
          )}
          {tool.recoveryHint && tool.recoveryHint.hint && (
            <div className="flex items-start gap-1.5 rounded border p-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}>
              <Info size={11} className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{tool.recoveryHint.hint}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
