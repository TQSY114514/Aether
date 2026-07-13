import { useStore } from '@/store'
import { ShieldAlert, FileText, Globe, FileEdit, Terminal } from 'lucide-react'
import { t } from '@/utils/i18n'

// ───────────────────────────────────────────────────────────────────────────
// Permission gate for dangerous agent tools.
//
// When the tool loop in the main process is about to run a `dangerous` tool in
// `ask` mode, it sends a `chat:permission-request`. This component renders each
// pending request as a modal dialog; the user's choice is sent back via
// `replyPermission`, which unblocks the waiting tool loop.
//
// Mirrors Claude Code's permission UX: risky actions never run silently.
// ───────────────────────────────────────────────────────────────────────────

const TOOL_META: Record<string, { icon: typeof FileText; labelKey: string }> = {
  read_file: { icon: FileText, labelKey: 'tool.read_file' },
  list_dir: { icon: FileText, labelKey: 'tool.list_dir' },
  glob_find: { icon: FileText, labelKey: 'tool.glob_find' },
  grep_search: { icon: FileText, labelKey: 'tool.grep_search' },
  web_search: { icon: Globe, labelKey: 'tool.web_search' },
  web_fetch: { icon: Globe, labelKey: 'tool.web_fetch' },
  write_file: { icon: FileEdit, labelKey: 'tool.write_file' },
  edit_file: { icon: FileEdit, labelKey: 'tool.edit_file' },
  run_command: { icon: Terminal, labelKey: 'tool.run_command' },
  git_status: { icon: Terminal, labelKey: 'tool.git_status' },
  git_diff: { icon: Terminal, labelKey: 'tool.git_diff' },
  memory_save: { icon: FileText, labelKey: 'tool.memory_save' },
  memory_list: { icon: FileText, labelKey: 'tool.memory_list' },
}

function summarizeArgs(name: string, args: unknown): string {
  if (!args || typeof args !== 'object') return String(args ?? '')
  const a = args as Record<string, unknown>
  if (name === 'write_file') return `${a.path}\n(${String(a.content ?? '').length} ${t('tool.chars')})`
  if (name === 'run_command') return `${a.command}${a.cwd ? '  @' + a.cwd : ''}`
  return Object.entries(a).map(([k, v]) => `${k}: ${String(v).slice(0, 120)}`).join('\n')
}

export default function PermissionDialog() {
  const requests = useStore((s) => s.permissionRequests)
  const resolve = useStore((s) => s.resolvePermission)
  const req = requests[0]
  if (!req) return null
  const meta = TOOL_META[req.name] || { icon: ShieldAlert, labelKey: 'tool.unknown' }
  const Icon = meta.icon

  return (
    <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-blur-fade" onClick={() => resolve(req.reqId, false)} />
      <div className="relative w-full max-w-md rounded-2xl border shadow-xl p-5 animate-blur-fade"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(220,38,38,0.1)' }}>
            <Icon size={16} style={{ color: 'var(--error)' }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('agent.permission.title')}</h3>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{t(meta.labelKey)} · {t('tool.risk.high')}</p>
          </div>
        </div>
        <pre className="text-xs font-mono whitespace-pre-wrap break-all rounded-lg p-2.5 mb-4 max-h-32 overflow-y-auto"
          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>{summarizeArgs(req.name, req.args)}</pre>
        <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>
          {t('agent.permission.desc')}
        </p>
        <div className="flex justify-end gap-2 flex-wrap">
          <button onClick={() => resolve(req.reqId, false)} className="px-3.5 py-1.5 text-xs rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>{t('agent.permission.deny')}</button>
          <button onClick={() => resolve(req.reqId, true, true)}
            className="px-3.5 py-1.5 text-xs rounded-lg border transition-colors hover:opacity-90"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>{t('agent.permission.allow_remember')}</button>
          <button onClick={() => resolve(req.reqId, true)}
            className="px-3.5 py-1.5 text-xs rounded-lg text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--error)' }}>{t('agent.permission.allow_once')}</button>
        </div>
      </div>
    </div>
  )
}
