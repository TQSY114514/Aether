import { useState } from 'react'
import { Wrench, ChevronDown, ChevronRight, Check, AlertCircle } from 'lucide-react'
import { t } from '@/utils/i18n'

type ToolCall = { name: string; args: unknown; result: string | null; error: string | null }

// Renders one tool invocation as a collapsible block: tool name + status,
// expandable to show the arguments the model supplied and the result we got back.
export default function ToolCallBlock({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false)
  const status = tool.error
    ? { icon: AlertCircle, color: 'var(--error)', label: t('tool.status.failed') }
    : tool.result != null
    ? { icon: Check, color: 'var(--success)', label: t('tool.status.done') }
    : { icon: Wrench, color: 'var(--text-muted)', label: t('tool.status.running') }
  const StatusIcon = status.icon

  return (
    <div className="rounded-lg border mb-2 overflow-hidden" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--border)] transition-colors">
        {open ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
        <Wrench size={12} className="text-gray-400" />
        <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{tool.name}</span>
        <span className="ml-auto flex items-center gap-1" style={{ color: status.color }}>
          <StatusIcon size={11} />{status.label}
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
