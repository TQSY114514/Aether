import { useState, useEffect } from 'react'
import { Wrench, ChevronDown, ChevronRight, Check, AlertCircle, ShieldAlert, ShieldCheck } from 'lucide-react'
import { t } from '@/utils/i18n'

type ToolCall = { name: string; args: unknown; result: string | null; error: string | null; risk?: string | null; latencyMs?: number | null }

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
    case 'memory_save': return '保存记忆'
    case 'memory_list': return '列出记忆'
    case 'use_skill': return a.name ? `使用技能 ${first(a.name, 30)}` : '使用技能'
    case 'ask_user': return '向你提问'
    case 'todo_write': return '更新任务清单'
    default: return tool.name
  }
}

// Renders one tool invocation as a collapsible block: a human status label,
// expandable to show the arguments the model supplied and the result we got back.
// Shows a risk badge (dangerous vs safe) and the elapsed time when available.
export default function ToolCallBlock({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false)
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

  return (
    <div className="rounded-lg border mb-2 overflow-hidden" style={{ borderColor: dangerous ? 'var(--warning)' : 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--border)] transition-colors" title={tool.name}>
        {open ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
        {dangerous ? <ShieldAlert size={12} style={{ color: 'var(--warning)' }} /> : <ShieldCheck size={12} className="text-gray-400" />}
        <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{label}</span>
        {dangerous && (
          <span className="text-[9px] px-1 py-0.5 rounded font-medium shrink-0" style={{ backgroundColor: 'var(--warning)', color: '#fff' }}>{t('tool.risk.dangerous')}</span>
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
          {tool.args && Object.keys(tool.args as object).length > 0 && (
            <div>
              <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>{t('tool.args')}</div>
              <pre className="text-[11px] font-mono whitespace-pre-wrap break-all" style={{ color: 'var(--text-secondary)' }}>{JSON.stringify(tool.args, null, 2)}</pre>
            </div>
          )}
          {tool.result != null && (
            <div>
              <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>{t('tool.result')}</div>
              <pre className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto" style={{ color: 'var(--text-secondary)' }}>{tool.result}</pre>
            </div>
          )}
          {tool.error && (
            <div>
              <div className="text-[10px] mb-0.5" style={{ color: 'var(--error)' }}>{t('tool.error')}</div>
              <pre className="text-[11px] font-mono whitespace-pre-wrap break-all" style={{ color: 'var(--error)' }}>{tool.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
