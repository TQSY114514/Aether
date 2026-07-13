import { useState } from 'react'
import { Wrench, ChevronDown, ChevronRight, Check, AlertCircle, ShieldAlert, ShieldCheck } from 'lucide-react'
import { t } from '@/utils/i18n'

type ToolCall = { name: string; args: unknown; result: string | null; error: string | null; risk?: string | null; latencyMs?: number | null }

// Renders one tool invocation as a collapsible block: tool name + status,
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

  return (
    <div className="rounded-lg border mb-2 overflow-hidden" style={{ borderColor: dangerous ? 'var(--warning)' : 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--border)] transition-colors">
        {open ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
        {dangerous ? <ShieldAlert size={12} style={{ color: 'var(--warning)' }} /> : <ShieldCheck size={12} className="text-gray-400" />}
        <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{tool.name}</span>
        {dangerous && (
          <span className="text-[9px] px-1 py-0.5 rounded font-medium" style={{ backgroundColor: 'var(--warning)', color: '#fff' }}>{t('tool.risk.dangerous')}</span>
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
