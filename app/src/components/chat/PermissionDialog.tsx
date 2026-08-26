import { useStore } from '@/store'
import { ShieldAlert, FileText, Globe, FileEdit, Terminal, ShieldCheck, RotateCcw, FileDiff } from 'lucide-react'
import { t } from '@/utils/i18n'

// ───────────────────────────────────────────────────────────────────────────
// Permission gate for dangerous agent tools — enhanced with explanation card.
//
// Mirrors Claude Code's permission UX: risky actions never run silently.
// Now shows WHY the agent needs this, WHAT it will do, ROLLBACK options,
// and ALTERNATIVE approaches.
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
  git_commit: { icon: Terminal, labelKey: 'tool.git_commit' },
  apply_patch: { icon: FileEdit, labelKey: 'tool.edit_file' },
  use_skill: { icon: FileText, labelKey: 'tool.unknown' },
  delegate_task: { icon: ShieldCheck, labelKey: 'tool.unknown' },
  debug_loop: { icon: ShieldCheck, labelKey: 'tool.unknown' },
  memory_save: { icon: FileText, labelKey: 'tool.memory_save' },
  memory_list: { icon: FileText, labelKey: 'tool.memory_list' },
}

const RISK_TAG_LABELS: Record<string, string> = {
  writes_files: t('risk.writes_files'),
  network_or_install: t('risk.network_or_install'),
  installs_deps: t('risk.installs_deps'),
  deletes_files: t('risk.deletes_files'),
  long_process: t('risk.long_process'),
  read_only: t('risk.read_only'),
}

const SEVERITY_COLORS: Record<string, string> = {
  high: 'var(--error)',
  medium: 'var(--warning)',
  low: 'var(--success)',
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
  const impact = (req as any).impact as { summary?: string; severity?: string; affectedFiles?: string[]; command?: string; riskTags?: string[]; rollback?: string; alternatives?: string } | undefined
  const severityColor = impact?.severity ? SEVERITY_COLORS[impact.severity] || 'var(--text-muted)' : 'var(--text-muted)'
  // P0-2 人话透传：策略层原因（capability 轴 ask 等）
  const reasonRaw = (req as any).reason as string | undefined
  const axisMatch = reasonRaw ? reasonRaw.match(/^capability policy: (\w+) axis requires approval$/) : null

  const handleDeny = () => resolve(req.reqId, false, false)
  const handleAllowSession = () => resolve(req.reqId, true, 'session')
  const handleAllowRemember = () => resolve(req.reqId, true, 'remember')
  const handleAllowOnce = () => resolve(req.reqId, true, false)

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

        {/* Axis policy attribution — capability.<axis> = ask */}
        {axisMatch && (
          <div className="rounded-lg px-3 py-2 mb-3 text-[11px] font-medium"
            style={{ backgroundColor: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.35)', color: '#d97706' }}>
            {t('agent.permission.axis_ask').replace('{0}', t(`capability.axis.${axisMatch[1]}`))}
          </div>
        )}

        {/* Explanation card — what / impact / risk tags / affected files / command / rollback / alternatives */}
        <div className="rounded-lg border p-3 mb-3 space-y-2" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          {/* What */}
          {impact?.summary && (
            <div>
              <div className="text-[10px] font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>{t('agent.permission.what')}</div>
              <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{impact.summary}</p>
            </div>
          )}
          {/* Severity badge */}
          {impact?.severity && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{t('agent.permission.impact')}:</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: severityColor + '20', color: severityColor }}>{impact.severity === 'high' ? t('agent.permission.high_impact') : impact.severity === 'medium' ? t('agent.permission.medium_impact') : t('agent.permission.low_impact')}</span>
            </div>
          )}
          {/* Risk tags */}
          {impact?.riskTags && impact.riskTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {impact.riskTags.map(tag => (
                <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: 'rgba(234,179,8,0.15)', color: 'var(--warning)' }}>
                  {RISK_TAG_LABELS[tag] || tag}
                </span>
              ))}
            </div>
          )}
          {/* Affected files */}
          {impact?.affectedFiles && impact.affectedFiles.length > 0 && impact.affectedFiles.some(f => f) && (
            <div>
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{t('agent.permission.affected_files')}:</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {impact.affectedFiles.filter(f => f).map(f => (
                  <span key={f} className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>{f}</span>
                ))}
              </div>
            </div>
          )}
          {/* Command preview for run_command */}
          {impact?.command && (
            <div>
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{t('agent.permission.command')}:</span>
              <pre className="text-[10px] font-mono mt-0.5 px-2 py-1 rounded break-all" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>{impact.command}</pre>
            </div>
          )}
          {/* Rollback info */}
          {impact?.rollback && (
            <div className="flex items-start gap-1.5">
              <RotateCcw size={10} className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{impact.rollback}</span>
            </div>
          )}
          {/* Alternatives */}
          {impact?.alternatives && (
            <div>
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{t('agent.permission.alternatives')}:</span>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{impact.alternatives}</p>
            </div>
          )}
        </div>

        <pre className="text-xs font-mono whitespace-pre-wrap break-all rounded-lg p-2.5 mb-3 max-h-24 overflow-y-auto"
          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>{summarizeArgs(req.name, req.args)}</pre>

        {/* Diff preview for file-touching tools (Claude Code / Cline pattern) */}
        {['write_file', 'edit_file', 'apply_patch'].includes(req.name) && (() => {
          const args = req.args as Record<string, string> | undefined
          if (!args) return null
          const oldLines = req.name === 'write_file' ? [] : (args.old_string || '').split('\n')
          const newLines = req.name === 'apply_patch'
            ? (args.patch || '').split('\n').filter(l => l.startsWith('+') || l.startsWith(' ') || l.startsWith('-')).map(l => l.slice(1))
            : (args.content || args.new_string || '').split('\n')
          const total = oldLines.length + newLines.length
          if (total === 0) return null
          const maxShow = 60
          const showOld = oldLines.slice(0, maxShow)
          const showNew = newLines.slice(0, maxShow)
          return (
            <div className="rounded-lg border mb-3 overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                <FileDiff size={11} /> Diff Preview {total > maxShow ? `(showing ${maxShow} of ${total} lines)` : `(${total} lines)`}
              </div>
              <div className="flex text-[11px] font-mono">
                {showOld.map((line, i) => (
                  <div key={`old-${i}`} className="flex w-full" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="shrink-0 px-2 text-right select-none" style={{ color: 'var(--error)', backgroundColor: 'rgba(239,68,68,0.06)', width: '2.5rem' }}>{i + 1}</span>
                    <span className="px-2 truncate" style={{ color: 'var(--text-secondary)' }}>-{line}</span>
                  </div>
                ))}
                {showNew.map((line, i) => (
                  <div key={`new-${i}`} className="flex w-full" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="shrink-0 px-2 text-right select-none" style={{ color: 'var(--success)', backgroundColor: 'rgba(34,197,94,0.06)', width: '2.5rem' }}>{i + 1}</span>
                    <span className="px-2 truncate" style={{ color: 'var(--text-secondary)' }}>+{line}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
        <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>
          {t('agent.permission.desc')}
        </p>
        <div className="flex justify-end gap-2 flex-wrap">
          <button onClick={handleDeny} className="px-3.5 py-1.5 text-xs rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>{t('agent.permission.deny')}</button>
          <button onClick={handleAllowSession}
            className="px-3.5 py-1.5 text-xs rounded-lg border transition-colors hover:opacity-90"
            style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>{t('agent.permission.allow_session')}</button>
          <button onClick={handleAllowRemember}
            className="px-3.5 py-1.5 text-xs rounded-lg border transition-colors hover:opacity-90"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>{t('agent.permission.allow_remember')}</button>
          <button onClick={handleAllowOnce}
            className="px-3.5 py-1.5 text-xs rounded-lg text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--error)' }}>{t('agent.permission.allow_once')}</button>
        </div>
      </div>
    </div>
  )
}
