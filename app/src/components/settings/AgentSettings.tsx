import { useState, useEffect } from 'react'
import { useUI } from '@/components/ui/feedback'
import { t } from '@/utils/i18n'
import { Shield, ShieldCheck, FolderOpen, FileText } from 'lucide-react'

// ───────────────────────────────────────────────────────────────────────────
// Agent workspace + safety settings.
//
// The workspace root is the directory the agent is allowed to write/edit files
// within (write_file, edit_file). Writes outside it are refused by the sandbox.
// Defaults to <userData>/workspace. Users can point it at a project folder so
// the agent can edit that project but not, say, clobber system files.
// Also shows the command-blocklist backstop status (always on).
// ───────────────────────────────────────────────────────────────────────────
export default function AgentSettings() {
  const { toast } = useUI()
  const [workspace, setWorkspace] = useState('')
  const [busy, setBusy] = useState(false)
  const [maxIter, setMaxIter] = useState(25)
  const [autoMemory, setAutoMemory] = useState(true)
  const [projectInst, setProjectInst] = useState<{ has: boolean; fileName: string | null }>({ has: false, fileName: null })

  useEffect(() => {
    // Guard: agent IPC may be absent on an older preload build.
    try { window.electronAPI?.agent?.getWorkspace?.().then(setWorkspace).catch(() => {}) } catch {}
    try { window.electronAPI?.settings?.get?.('agent_max_iterations').then((v) => { if (v) setMaxIter(parseInt(v, 10) || 25) }).catch(() => {}) } catch {}
    try { window.electronAPI?.settings?.get?.('auto_memory_enabled').then((v) => setAutoMemory(v !== '0')).catch(() => {}) } catch {}
    // Check for project instruction file (CLAUDE.md / .aetherai.md) in workspace.
    try { window.electronAPI?.agent?.hasProjectInstructions?.().then(setProjectInst).catch(() => {}) } catch {}
  }, [])

  const saveMaxIter = async (v: number) => {
    const clamped = Math.max(1, Math.min(200, Math.floor(v)))
    setMaxIter(clamped)
    try { await window.electronAPI?.settings?.set?.('agent_max_iterations', String(clamped)) } catch {}
  }

  const saveAutoMemory = async (v: boolean) => {
    setAutoMemory(v)
    try { await window.electronAPI?.settings?.set?.('auto_memory_enabled', v ? '1' : '0') } catch {}
  }

  const pickFolder = async () => {
    setBusy(true)
    try {
      // Use a hidden <input type=file webkitdirectory> — simplest cross-platform
      // folder picker available in Electron without a native dialog module.
      const input = document.createElement('input')
      input.type = 'file'
      input.webkitdirectory = true
      input.onchange = () => {
        const f = input.files?.[0]
        // webkitRelativePath gives the selected dir name; but we want the real
        // absolute path. Electron exposes .path on File. Fall back to that.
        // @ts-expect-error .path is Electron-only
        const abs = f?.path || f?.webkitRelativePath || ''
        // webkitRelativePath is "DirName/..."; we want just the root. Take
        // the path up to the first separator after the dir name.
        const root = abs.split(/[/\\]/).slice(0, 1).join('') || abs
        // Actually: for webkitdirectory, files[].path is the absolute path on
        // disk in Electron. Use the first file's path minus the relative tail.
        // @ts-expect-error
        const firstPath = input.files?.[0]?.path || ''
        const target = firstPath ? firstPath.replace(/[/\\][^/\\]*$/, '') : root
        if (target) applyWorkspace(target)
      }
      input.click()
    } finally { setBusy(false) }
  }

  const applyWorkspace = async (dir: string | null) => {
    const res = await window.electronAPI.agent.setWorkspace({ dir })
    if (res?.success) {
      setWorkspace(res.root)
      toast(t('settings.agent.workspace_saved'), { type: 'success' })
    }
  }

  const resetToDefault = () => applyWorkspace(null)

  // 一键安全默认（评审建议 #7-1）: 关闭全部 Experimental/Beta 能力。
  // 走主进程 flags:safe-mode 聚合 IPC —— 只关实验项, 保留 debug 观测与已发布 UX。
  const [safeBusy, setSafeBusy] = useState(false)
  const applySafeMode = async () => {
    setSafeBusy(true)
    try {
      const r = await window.electronAPI?.flags?.safeMode?.()
      if (r?.ok) {
        toast(r.written.length > 0
          ? `安全模式已启用: 关闭 ${r.written.length} 个实验功能`
          : '已是安全模式(无实验功能开启)', { type: 'success' })
      } else {
        toast('安全模式应用失败', { type: 'error' })
      }
    } catch { toast('安全模式应用失败', { type: 'error' }) }
    finally { setSafeBusy(false) }
  }

  return (
    <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-1">
        <Shield size={15} style={{ color: 'var(--accent)' }} />
        <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.agent.title')}</h2>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{t('settings.agent.desc')}</p>

      <div className="space-y-3">
        {/* Workspace root picker */}
        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('settings.agent.workspace')}</label>
          <div className="flex items-center gap-2">
            <input readOnly value={workspace} placeholder={t('settings.agent.workspace_placeholder')}
              className="flex-1 px-3 py-2 text-xs rounded-lg border outline-none font-mono"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }} />
            <button onClick={pickFolder} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--border)' }}>
              <FolderOpen size={13} />{t('settings.agent.browse')}
            </button>
            <button onClick={resetToDefault} className="px-3 py-2 text-xs rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors" style={{ borderColor: 'var(--border)' }}>{t('settings.agent.reset')}</button>
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>{t('settings.agent.workspace_hint')}</p>
        </div>

        {/* Command blocklist — always on, informational */}
        <div className="flex items-start gap-2 p-2.5 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <Shield size={13} className="text-gray-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{t('settings.agent.blocklist')}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('settings.agent.blocklist_hint')}</p>
          </div>
        </div>

        {/* One-click safe mode — close all experimental capabilities. */}
        <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg" style={{ backgroundColor: 'rgba(99,102,241,0.05)', border: '1px solid var(--border)' }}>
          <div className="flex items-start gap-2">
            <ShieldCheck size={14} className="text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>一键安全模式</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                关闭全部实验性功能(子 Agent / 编排器 / 经验回放 / 插件 SDK 等), 保留基础对话与已发布能力。适合稳定使用。
              </p>
            </div>
          </div>
          <button onClick={applySafeMode} disabled={safeBusy}
            className="px-3 py-1.5 text-xs rounded-lg text-white disabled:opacity-50 transition-opacity shrink-0"
            style={{ backgroundColor: 'var(--accent)' }}>
            {safeBusy ? '应用中…' : '应用'}
          </button>
        </div>

        {/* Project instructions status (CLAUDE.md / .aetherai.md). */}
        <div className="flex items-center gap-2 p-2.5 rounded-lg" style={{ backgroundColor: projectInst.has ? 'rgba(34,197,94,0.06)' : 'var(--bg-secondary)' }}>
          <FileText size={13} className={projectInst.has ? 'text-green-500 mt-0.5 shrink-0' : 'text-gray-400 mt-0.5 shrink-0'} />
          <div>
            <p className="text-xs" style={{ color: 'var(--text-primary)' }}>Project Instructions</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {projectInst.has
                ? `Active: ${projectInst.fileName} — agent will follow project conventions`
                : 'No instruction file found — place CLAUDE.md or .aetherai.md in your workspace root'}
            </p>
          </div>
        </div>

        {/* Max agent iterations (budget) — from Hermes' iteration_budget. */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t('settings.agent.max_iterations')}</label>
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{maxIter}</span>
          </div>
          <input type="range" min={3} max={100} step={1} value={maxIter}
            onChange={(e) => saveMaxIter(parseInt(e.target.value, 10))}
            className="effort-slider w-full" style={{ ['--fill' as string]: `${((maxIter - 3) / 97) * 100}%` }} />
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>{t('settings.agent.max_iterations_hint')}</p>
        </div>

        {/* Auto long-term memory (Hermes-style) toggle. */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{t('settings.agent.auto_memory')}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('settings.agent.auto_memory_hint')}</p>
          </div>
          <button onClick={() => saveAutoMemory(!autoMemory)}
            className="relative w-10 h-5 rounded-full transition-colors shrink-0"
            style={{ backgroundColor: autoMemory ? 'var(--accent)' : 'var(--border)' }}>
            <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm"
              style={{ left: autoMemory ? '20px' : '2px' }} />
          </button>
        </div>
      </div>
    </div>
  )
}
