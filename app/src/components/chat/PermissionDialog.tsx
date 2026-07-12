import { useStore } from '@/store'
import { ShieldAlert, FileText, Globe, FileEdit, Terminal } from 'lucide-react'

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

const TOOL_META: Record<string, { icon: typeof FileText; label: string }> = {
  read_file: { icon: FileText, label: '读取文件' },
  list_dir: { icon: FileText, label: '列出目录' },
  web_search: { icon: Globe, label: '联网搜索' },
  write_file: { icon: FileEdit, label: '写入文件' },
  run_command: { icon: Terminal, label: '执行命令' },
}

function summarizeArgs(name: string, args: unknown): string {
  if (!args || typeof args !== 'object') return String(args ?? '')
  const a = args as Record<string, unknown>
  if (name === 'write_file') return `${a.path}\n(${String(a.content ?? '').length} 字符)`
  if (name === 'run_command') return `${a.command}${a.cwd ? '  @' + a.cwd : ''}`
  return Object.entries(a).map(([k, v]) => `${k}: ${String(v).slice(0, 120)}`).join('\n')
}

export default function PermissionDialog() {
  const requests = useStore((s) => s.permissionRequests)
  const resolve = useStore((s) => s.resolvePermission)
  const req = requests[0]
  if (!req) return null
  const meta = TOOL_META[req.name] || { icon: ShieldAlert, label: req.name }
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
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Agent 请求执行操作</h3>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{meta.label} · 风险等级：高</p>
          </div>
        </div>
        <pre className="text-xs font-mono whitespace-pre-wrap break-all rounded-lg p-2.5 mb-4 max-h-32 overflow-y-auto"
          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>{summarizeArgs(req.name, req.args)}</pre>
        <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>
          允许后，模型将立即执行此操作。如不确定，请拒绝。
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => resolve(req.reqId, false)} className="px-3.5 py-1.5 text-xs rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>拒绝</button>
          <button onClick={() => resolve(req.reqId, true)}
            className="px-3.5 py-1.5 text-xs rounded-lg text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--error)' }}>允许执行</button>
        </div>
      </div>
    </div>
  )
}
