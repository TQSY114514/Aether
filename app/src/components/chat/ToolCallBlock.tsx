import { useState, useEffect } from 'react'
import { Wrench, ChevronDown, ChevronRight, Check, AlertCircle, ShieldAlert, ShieldCheck, RotateCcw, Info, FileDiff, FileText, Terminal, Sparkles } from 'lucide-react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'

type ToolCall = {
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
  exitCode?: number | null
  commandFailed?: boolean
  timedOut?: boolean
}

const FAILURE_LABELS: Record<string, string> = {
  timeout: 'tool.failure.timeout',
  permission_denied: 'tool.failure.permission_denied',
  env_missing_dependency: 'tool.failure.env_missing_dependency',
  test_failure: 'tool.failure.test_failure',
  model_invalid_args: 'tool.failure.model_invalid_args',
  command_failed: 'tool.failure.command_failed',
  unknown: 'tool.failure.unknown',
}

function detectCommandFailure(tool: ToolCall): { failed: boolean; exitCode?: number; reason: string } {
  if (tool.name !== 'run_command' && !tool.name.includes('exec') && !tool.name.includes('terminal')) {
    return { failed: false, reason: '' }
  }
  if (tool.exitCode != null && tool.exitCode !== 0) {
    return { failed: true, exitCode: tool.exitCode, reason: `exit ${tool.exitCode}` }
  }
  const text = (tool.error || tool.result || '') + ''
  const exitMatch = text.match(/(?:\[FAILED:\s*exit\s+|exit\s+code:\s*)(-?\d+)/i)
  if (exitMatch) {
    const code = parseInt(exitMatch[1], 10)
    if (code !== 0) return { failed: true, exitCode: code, reason: `exit ${code}` }
  }
  if (text.includes('[TIMED OUT]') || tool.timedOut) {
    return { failed: true, reason: 'timeout' }
  }
  if (text.includes('[COMMAND NOT FOUND]')) {
    return { failed: true, exitCode: 127, reason: 'command not found' }
  }
  if (tool.commandFailed) {
    return { failed: true, reason: 'failed' }
  }
  return { failed: false, reason: '' }
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
    case 'read_file': return a.path ? `${t('tool.read_file')} ${basename(a.path)}` : t('tool.read_file')
    case 'list_dir': return a.path ? `${t('tool.list_dir')} ${basename(a.path)}` : t('tool.list_dir')
    case 'glob_find': return a.pattern ? `${t('tool.glob_find')} ${first(a.pattern, 30)}` : t('tool.glob_find')
    case 'grep_search': return a.pattern ? `${t('tool.grep_search')} ${first(a.pattern, 30)}` : t('tool.grep_search')
    case 'web_search': return a.query ? `${t('tool.web_search')} ${first(a.query)}` : t('tool.web_search')
    case 'web_fetch': return a.url ? `${t('tool.web_fetch')} ${first(a.url, 40)}` : t('tool.web_fetch')
    case 'write_file': return a.path ? `${t('tool.write_file')} ${basename(a.path)}` : t('tool.write_file')
    case 'edit_file': return a.path ? `${t('tool.edit_file')} ${basename(a.path)}` : t('tool.edit_file')
    case 'run_command': return a.command ? `${t('tool.run_command')} ${first((a.command + '').split(' ').slice(0, 3).join(' '), 30)}` : t('tool.run_command')
    case 'git_status': return t('tool.git_status')
    case 'git_diff': return t('tool.git_diff')
    case 'git_log': return a.count ? `${t('tool.git_log')} (${a.count})` : t('tool.git_log')
    case 'git_commit': return a.message ? `${t('tool.git_commit')}: ${first(a.message, 30)}` : t('tool.git_commit')
    case 'memory_save': return t('tool.memory_save')
    case 'memory_list': return t('tool.memory_list')
    case 'use_skill': return a.name ? `${t('tool.use_skill')} ${first(a.name, 30)}` : t('tool.use_skill')
    case 'ask_user': return t('tool.ask_user')
    case 'todo_write': return t('tool.todo_write')
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
  const running = tool.result == null && tool.error == null
  // Live elapsed timer while the tool is running (Feature C). Only ticks when a
  // startedAt timestamp is present; once the tool completes we fall back to the
  // server-reported latencyMs, so this state is just for the running phase.
  const [elapsed, setElapsed] = useState<number | null>(null)
  useEffect(() => {
    const started = tool.startedAt
    if (!running || started == null) { setElapsed(null); return }
    setElapsed(Math.max(0, Date.now() - started))
    const iv = setInterval(() => setElapsed(Math.max(0, Date.now() - started)), 500)
    return () => clearInterval(iv)
  }, [running, tool.startedAt])
  // Long results default to a collapsed single line with a click-to-expand
  // toggle (Feature C2). Short results render fully as before.
  const [collapsed, setCollapsed] = useState(true)
  const resultText = tool.result ?? ''
  const isLongResult = resultText.length > 300 || resultText.split('\n').length > 6
  const cmdFailure = detectCommandFailure(tool)
  const isFailed = !!tool.error || cmdFailure.failed
  const status = tool.error
    ? { icon: AlertCircle, color: 'var(--error)', label: t('tool.status.failed') }
    : cmdFailure.failed
    ? { icon: AlertCircle, color: 'var(--error)', label: cmdFailure.reason || t('tool.status.failed') }
    : tool.result != null
    ? { icon: Check, color: 'var(--success)', label: t('tool.status.done') }
    : { icon: Wrench, color: 'var(--text-muted)', label: t('tool.status.running') }
  const StatusIcon = status.icon
  const dangerous = tool.risk === 'dangerous'
  const label = toolLabel(tool)
  // Auto-expand when there's an error or command failure so the user can see what went wrong.
  useEffect(() => { if (tool.error || cmdFailure.failed) setOpen(true) }, [tool.error, cmdFailure.failed])
  const rollback = async () => {
    if (!tool.checkpointId || rollbackState === 'running') return
    setRollbackState('running')
    const res = await window.electronAPI.agentCheckpoint.rollback({ id: tool.checkpointId })
    setRollbackState(res.success ? 'done' : 'error')
    if (!res.success) setOpen(true)
  }
  const handleQuickFix = () => {
    const a = (tool.args && typeof tool.args === 'object' ? tool.args : {}) as any
    const cmd = a.command ? String(a.command) : tool.name
    const fullText = (tool.error || tool.result || tool.liveOutput || '').trim()
    const lines = fullText.split('\n')
    const snippet = lines.length > 25 ? lines.slice(-25).join('\n') : fullText
    const exitReason = cmdFailure.reason ? `(${cmdFailure.reason})` : ''

    const fixPrompt = `${t('tool.quick_fix.prompt_prefix')}: \`${cmd}\` ${exitReason}\n\`\`\`\n${snippet}\n\`\`\`\n${t('tool.quick_fix.prompt_suffix')}`
    useStore.getState().sendMessage(fixPrompt)
  }
  const hasArgs = argsCount(tool.args) > 0
  const failureKey = tool.failureKind && FAILURE_LABELS[tool.failureKind] ? FAILURE_LABELS[tool.failureKind] : null

  return (
    <div className="rounded-[2px] border mb-1.5 overflow-hidden transition-all text-xs" style={{ borderColor: dangerous ? 'rgba(217,119,6,0.35)' : isFailed ? 'rgba(239,68,68,0.35)' : 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-2.5 py-1 text-xs hover:bg-[var(--border)]/40 transition-colors" title={tool.name}>
        {open ? <ChevronDown size={12} className="text-[var(--text-muted)]" /> : <ChevronRight size={12} className="text-[var(--text-muted)]" />}
        {dangerous ? <ShieldAlert size={12} className="text-amber-500 shrink-0" /> : <ShieldCheck size={12} className="text-[var(--text-muted)] shrink-0" />}
        <span className="font-medium truncate text-left" style={{ color: 'var(--text-primary)' }}>{label}</span>
        {dangerous && (
          <span className="text-[9px] px-1.5 py-0.2 rounded-[2px] font-mono font-medium shrink-0 border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">{t('tool.risk.dangerous')}</span>
        )}
        {failureKey && tool.error && (
          <span className="text-[9px] px-1.5 py-0.2 rounded-[2px] font-mono font-medium shrink-0 border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">{t(failureKey)}</span>
        )}
        {cmdFailure.failed && !tool.error && (
          <span className="text-[9px] px-1.5 py-0.2 rounded-[2px] font-mono font-medium shrink-0 border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">{cmdFailure.reason || t('tool.failure.command_failed')}</span>
        )}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {tool.result != null && tool.latencyMs != null && (
            <span className="text-[10px] font-mono tabular-nums opacity-60" style={{ color: 'var(--text-muted)' }}>{tool.latencyMs < 1000 ? `[${tool.latencyMs}ms]` : `[${(tool.latencyMs/1000).toFixed(1)}s]`}</span>
          )}
          {running && elapsed != null && (
            <span className="text-[10px] font-mono tabular-nums opacity-60" style={{ color: 'var(--text-muted)' }}>[{(elapsed/1000).toFixed(1)}s]</span>
          )}
          <span className="flex items-center gap-1 font-mono text-[10px]" style={{ color: status.color }}>
            <StatusIcon size={11} />{status.label}
          </span>
        </span>
      </button>
      <div
        className="transition-[grid-template-rows] duration-250 ease-out"
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
        }}
      >
        <div className="overflow-hidden">
          <div className="px-2.5 pb-2 pt-1 border-t border-[var(--border)] space-y-1.5" style={{ backgroundColor: 'var(--content-bg)' }}>
            {hasArgs ? (
              <div>
                <div className="text-[10px] font-mono mb-0.5" style={{ color: 'var(--text-muted)' }}>{t('tool.args')}</div>
                <pre className="text-[11px] font-mono p-1.5 rounded-[2px] border border-[var(--border)] whitespace-pre-wrap break-all bg-[var(--bg-secondary)]" style={{ color: 'var(--text-secondary)' }}>{JSON.stringify(tool.args, null, 2)}</pre>
              </div>
            ) : null}
            {/* Live terminal output — streamed stdout/stderr from run_command and
                other streaming tools. Shown while running and after completion so
                the user can see exactly what the command printed. */}
            {tool.liveOutput && (
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono mb-0.5" style={{ color: 'var(--text-muted)' }}>
                  <Terminal size={10} />
                  <span>stdout</span>
                  {running && !tool.liveOutputDone && <span className="animate-pulse" style={{ color: 'var(--accent)' }}>▋</span>}
                </div>
                <pre className="text-[11px] font-mono p-2 rounded-[2px] border whitespace-pre-wrap break-all max-h-48 overflow-y-auto leading-relaxed" style={{ backgroundColor: '#0d1117', color: '#e6edf3', borderColor: 'var(--border)' }}>{tool.liveOutput}{running && !tool.liveOutputDone && <span className="animate-pulse" style={{ color: 'var(--accent)' }}>▋</span>}</pre>
              </div>
            )}
            {tool.result != null && (
              <div>
                <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>{t('tool.result')}</div>
                {isLongResult && collapsed ? (
                  <>
                    <pre className="text-[11px] font-mono whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: 'var(--text-secondary)' }} title={resultText}>{resultText.split('\n')[0]}</pre>
                    <button
                      type="button"
                      onClick={() => setCollapsed(false)}
                      className="inline-flex items-center gap-1 mt-1 text-[10px] hover:text-[var(--text-primary)]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <ChevronDown size={10} />{t('tool.result.expand')}
                    </button>
                  </>
                ) : (
                  <>
                    <pre className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto" style={{ color: 'var(--text-secondary)' }}>{tool.result}</pre>
                    {isLongResult && (
                      <button
                        type="button"
                        onClick={() => setCollapsed(true)}
                        className="inline-flex items-center gap-1 mt-1 text-[10px] hover:text-[var(--text-primary)]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <ChevronRight size={10} />{t('tool.result.collapse')}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
            {/* Diff preview — shown for write_file / edit_file / apply_patch (Claude Code-style) */}
            {tool.diff && !tool.error && (
              <DiffPreview diff={tool.diff} toolName={tool.name} />
            )}
            {/* After-snapshot — shows the file's current content after the tool ran */}
            {tool.afterSnapshot && !tool.error && (
              <AfterSnapshotView snapshot={tool.afterSnapshot} />
            )}
            {/* Actions: Rollback and One-Click Fix */}
            {(tool.checkpointId || tool.error || cmdFailure.failed) && (
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {tool.checkpointId && (
                  <button
                    type="button"
                    onClick={rollback}
                    disabled={rollbackState === 'running' || rollbackState === 'done'}
                    className="inline-flex items-center gap-1 rounded-[2px] border px-2 py-1 text-[11px] disabled:opacity-60 transition-colors"
                    style={{ borderColor: 'var(--border)', color: rollbackState === 'error' ? 'var(--error)' : 'var(--text-secondary)' }}
                  >
                    <RotateCcw size={12} />
                    {rollbackState === 'running' ? t('tool.rollback.running') : rollbackState === 'done' ? t('tool.rollback.done') : rollbackState === 'error' ? t('tool.rollback.error') : t('tool.rollback')}
                  </button>
                )}
                {(tool.error || cmdFailure.failed) && (
                  <button
                    type="button"
                    onClick={handleQuickFix}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-[2px] border transition-colors bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/20 active:scale-[0.98]"
                    title={t('tool.quick_fix.tooltip')}
                  >
                    <Sparkles size={11} />
                    <span>{t('tool.quick_fix')}</span>
                  </button>
                )}
              </div>
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
        </div>
      </div>
    </div>
  )
}

// ─── Diff Preview (Claude Code-style) ───────────────────────────────────────
// Shows a unified diff for write_file / edit_file / apply_patch results.
// Green (+) for additions, red (-) for deletions, gray for context.

function DiffPreview({ diff, toolName }: { diff: string; toolName: string }) {
  const [showFull, setShowFull] = useState(false)
  const lines = diff.split('\n')
  const maxShow = 60
  const isTruncated = lines.length > maxShow
  const displayLines = showFull || !isTruncated ? lines : lines.slice(0, maxShow)

  return (
    <div className="rounded-[2px] border overflow-hidden" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}>
      <div className="flex items-center gap-1.5 px-2.5 py-1.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <FileDiff size={11} style={{ color: 'var(--accent)' }} />
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>
          {toolName === 'write_file' ? '新建文件预览' : toolName === 'apply_patch' ? '补丁预览' : '编辑差异'}
        </span>
        <span className="text-[10px] ml-auto font-mono" style={{ color: 'var(--text-muted)' }}>
          +{lines.filter(l => l.startsWith('+')).length} -{lines.filter(l => l.startsWith('-')).length}
        </span>
      </div>
      <pre className="text-[10px] font-mono whitespace-pre overflow-x-auto max-h-56 overflow-y-auto p-2 leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}>
        {displayLines.map((line, i) => {
          let color = 'var(--text-muted)'
          if (line.startsWith('+') && !line.startsWith('+++')) color = 'var(--success)'
          else if (line.startsWith('-') && !line.startsWith('---')) color = 'var(--error)'
          else if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++')) color = 'var(--accent)'
          return <span key={i} style={{ color }}>{line || '\n'}</span>
        })}
      </pre>
      {isTruncated && (
        <button onClick={() => setShowFull(true)}
          className="w-full text-[10px] py-1 hover:bg-[var(--border)] transition-colors"
          style={{ color: 'var(--text-muted)' }}>
          展开全部 {lines.length} 行
        </button>
      )}
    </div>
  )
}

// ─── After Snapshot ─────────────────────────────────────────────────────────
// Shows the file's content after the tool ran (for verification).

function AfterSnapshotView({ snapshot }: { snapshot: { path: string; content: string; truncated: boolean } }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-[2px] border overflow-hidden" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-[var(--border)] transition-colors"
        style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <FileText size={11} style={{ color: 'var(--text-muted)' }} />
        <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
          执行后快照: {snapshot.path.split('/').pop()?.split('\\').pop()}
        </span>
        <span className="text-[10px] ml-auto font-mono" style={{ color: 'var(--text-muted)' }}>
          {snapshot.content.length.toLocaleString()} chars {snapshot.truncated && '…'}
        </span>
        {open ? <ChevronDown size={10} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={10} style={{ color: 'var(--text-muted)' }} />}
      </button>
      {open && (
        <pre className="text-[10px] font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto p-2.5 leading-relaxed"
          style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)' }}>
          {snapshot.content.slice(0, 4000)}{snapshot.truncated ? '\n\n[… content truncated …]' : ''}
        </pre>
      )}
    </div>
  )
}
