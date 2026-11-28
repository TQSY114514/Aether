import { useState, useEffect } from 'react'
import { useUI } from '@/components/ui/feedback'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import {
  Shield,
  FileText,
  Cpu,
} from 'lucide-react'

export default function AgentSettings() {
  const { toast } = useUI()
  const currentSessionId = useStore((s) => s.currentSessionId)
  const setSessionCwd = useStore((s) => s.setSessionCwd)
  const [workspace, setWorkspace] = useState('')
  const [maxIter, setMaxIter] = useState(25)
  const [toolTimeoutSec, setToolTimeoutSec] = useState(60)
  const [projectInst, setProjectInst] = useState<{ has: boolean; fileName: string | null }>({ has: false, fileName: null })

  useEffect(() => {
    try { window.electronAPI?.agent?.getWorkspace?.(currentSessionId ?? undefined).then(setWorkspace).catch(() => {}) } catch {}
    try {
      window.electronAPI?.settings?.get?.('agent_max_iterations').then((v) => {
        const n = Number(v)
        if (Number.isInteger(n) && n > 0) setMaxIter(n)
      }).catch(() => {})
    } catch {}
    try {
      window.electronAPI?.settings?.get?.('agent_tool_timeout_ms').then((v) => {
        const ms = Number(v)
        if (Number.isFinite(ms) && ms >= 5000) setToolTimeoutSec(Math.round(ms / 1000))
      }).catch(() => {})
    } catch {}
    try { window.electronAPI?.agent?.hasProjectInstructions?.(currentSessionId ?? undefined).then(setProjectInst).catch(() => {}) } catch {}
  }, [currentSessionId])

  const saveMaxIter = async (v: number) => {
    const clamped = Math.max(1, Math.min(200, Math.floor(v)))
    setMaxIter(clamped)
    try { await window.electronAPI?.settings?.set?.('agent_max_iterations', String(clamped)) } catch {}
  }

  const saveToolTimeoutSec = async (sec: number) => {
    setToolTimeoutSec(sec)
    try { await window.electronAPI?.settings?.set?.('agent_tool_timeout_ms', String(sec * 1000)) } catch {}
  }

  return (
    <div className="space-y-4">
      {/* ── Card 1: Workspace Sandbox & Project Instructions ── */}
      <div className="rounded-lg p-4" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center gap-2 mb-1">
          <Shield size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.agent.title')}</h2>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          {t('settings.agent.mode_summary')}
        </p>

        <div className="space-y-3">
          {/* Workspace Root Section */}
          <div className="p-3 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('settings.agent.workspace')}</label>
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-md border text-xs" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                  {workspace || t('workspace.default')}
                </div>
                <div className="font-mono text-[11px] truncate opacity-80" style={{ color: 'var(--text-muted)' }}>
                  {workspace || '~/.aetherai/sandbox'}
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const picked = await window.electronAPI?.system?.pickDirectory?.()
                    if (picked) {
                      await window.electronAPI?.agent?.setWorkspace?.({ dir: picked })
                      if (currentSessionId) {
                        await setSessionCwd(picked)
                      }
                      setWorkspace(picked)
                      try {
                        const inst = await window.electronAPI?.agent?.hasProjectInstructions?.(currentSessionId ?? undefined)
                        if (inst) setProjectInst(inst)
                      } catch {}
                      toast(t('settings.agent.workspace_saved'), { type: 'success' })
                    }
                  } catch (e) {
                    toast(e instanceof Error ? e.message : String(e), { type: 'error' })
                  }
                }}
                className="px-2.5 py-1 text-xs rounded-md border font-medium transition-colors hover:bg-[var(--border)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] shrink-0 cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                {t('common.browse')}
              </button>
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('settings.agent.workspace_hint')}
            </p>
          </div>

          {/* Project instructions status */}
          <div className="flex items-center gap-2 p-2.5 rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
            <FileText size={13} className="mt-0.5 shrink-0" style={{ color: projectInst.has ? 'var(--success)' : 'var(--text-muted)' }} />
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.agent.project_inst')}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {projectInst.has
                  ? t('settings.agent.project_inst_active', projectInst.fileName || '')
                  : t('settings.agent.project_inst_empty')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Card 2: Execution Loop Budget & Tool Timeout ── */}
      <div className="rounded-lg p-4 space-y-4" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu size={15} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {t('settings.agent.loop_budget_title')}
            </h2>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            Plan / Act
          </span>
        </div>

        {/* Max Iterations with presets */}
        <div className="p-3 rounded-lg space-y-2 border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {t('settings.agent.max_iterations')}
            </label>
            <div className="flex items-center gap-1.5">
              {[
                { label: t('settings.agent.preset_light'), val: 15 },
                { label: t('settings.agent.preset_standard'), val: 25 },
                { label: t('settings.agent.preset_deep'), val: 50 },
                { label: t('settings.agent.preset_auto'), val: 100 },
              ].map((p) => (
                <button
                  key={p.val}
                  type="button"
                  onClick={() => saveMaxIter(p.val)}
                  className="px-2 py-0.5 text-[10px] rounded border transition-colors font-mono cursor-pointer active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                  style={
                    maxIter === p.val
                      ? { backgroundColor: 'var(--accent)', color: '#fff', borderColor: 'transparent' }
                      : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
                  }
                >
                  {p.label}
                </button>
              ))}
              <span className="text-xs font-mono font-semibold ml-1" style={{ color: 'var(--accent)' }}>
                {t('settings.agent.rounds_count', maxIter)}
              </span>
            </div>
          </div>
          <input
            type="range"
            min={3}
            max={120}
            step={1}
            value={maxIter}
            onChange={(e) => saveMaxIter(parseInt(e.target.value, 10))}
            className="effort-slider w-full"
            style={{ ['--fill' as string]: `${((maxIter - 3) / 117) * 100}%` }}
          />
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t('settings.agent.max_iterations_hint')}</p>
        </div>

        {/* Per-tool execution timeout */}
        <div className="p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.agent.tool_timeout_title')}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('settings.agent.tool_timeout_desc')}</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {[30, 60, 120, 300].map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => saveToolTimeoutSec(sec)}
                className="px-2.5 py-1 text-[11px] font-mono rounded border transition-colors cursor-pointer active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                style={
                  toolTimeoutSec === sec
                    ? { backgroundColor: 'var(--accent)', color: '#fff', borderColor: 'transparent' }
                    : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
                }
              >
                {sec}s
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
