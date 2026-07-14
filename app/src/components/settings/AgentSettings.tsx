import { useState, useEffect } from 'react'
import { useUI } from '@/components/ui/feedback'
import { t } from '@/utils/i18n'
import { Shield, FolderOpen } from 'lucide-react'

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

  useEffect(() => {
    // Guard: agent IPC may be absent on an older preload build.
    try { window.electronAPI?.agent?.getWorkspace?.().then(setWorkspace).catch(() => {}) } catch {}
  }, [])

  const pickFolder = async () => {
    setBusy(true)
    try {
      // Use a hidden <input type=file webkitdirectory> — simplest cross-platform
      // folder picker available in Electron without a native dialog module.
      const input = document.createElement('input')
      input.type = 'file'
      // @ts-expect-error non-standard but supported in chromium/Electron
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
    const res = await window.electronAPI.agent.setWorkspace(dir)
    if (res?.success) {
      setWorkspace(res.root)
      toast(t('settings.agent.workspace_saved'), { type: 'success' })
    }
  }

  const resetToDefault = () => applyWorkspace(null)

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
      </div>
    </div>
  )
}
