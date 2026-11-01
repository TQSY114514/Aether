import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FolderKanban, FolderGit2, FolderOpen, Copy, ExternalLink, Terminal,
  Plus, Star, Trash2, Check, Edit3, Save, X, FileCode, MessageSquare,
  Sparkles, GitBranch, RefreshCw, Folder, Layers
} from 'lucide-react'
import { useStore } from '@/store'
import { useUI } from '@/components/ui/feedback'
import { t } from '@/utils/i18n'
import type { Project } from '@/store/projectSlice'
import FileTree from '@/components/sidebar/FileTree'

const BTN_BASE = 'px-2.5 py-1 text-xs font-medium rounded-[6px] border flex items-center gap-1.5 transition-colors cursor-pointer hover:bg-[var(--bg-secondary)] active:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-50'

export default function ProjectPage() {
  const activeProject = useStore((s) => s.activeProject)
  const projects = useStore((s) => s.projects)
  const loadProjects = useStore((s) => s.loadProjects)
  const openProject = useStore((s) => s.openProject)
  const createProject = useStore((s) => s.createProject)
  const updateProject = useStore((s) => s.updateProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const sessions = useStore((s) => s.sessions)
  const selectSession = useStore((s) => s.selectSession)
  const createSession = useStore((s) => s.createSession)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const allModels = useStore((s) => s.allModels)
  const loadAllModels = useStore((s) => s.loadAllModels)
  const { toast, confirm } = useUI()

  const [gitStatus, setGitStatus] = useState<{ branch?: string; dirtyCount?: number; isClean: boolean; hasGit: boolean }>({ isClean: true, hasGit: false })
  const [instructions, setInstructions] = useState<{ fileName: string; path: string; content: string; exists: boolean } | null>(null)
  const [instructionsLoading, setInstructionsLoading] = useState(false)
  const [isEditingInstructions, setIsEditingInstructions] = useState(false)
  const [instructionDraft, setInstructionDraft] = useState('')
  const [isSavingInstructions, setIsSavingInstructions] = useState(false)

  useEffect(() => {
    loadProjects?.()
    if (!allModels || allModels.length === 0) loadAllModels?.()
  }, [loadProjects, loadAllModels, allModels])

  const fetchGitStatus = useCallback(async (rootPath?: string) => {
    if (!rootPath) {
      setGitStatus({ isClean: true, hasGit: false })
      return
    }
    try {
      const gitRes = await window.electronAPI?.git?.status?.({ cwd: rootPath })
      if (gitRes?.success && gitRes.root) {
        setGitStatus({ branch: gitRes.branch || 'HEAD', dirtyCount: gitRes.dirtyCount ?? 0, isClean: (gitRes.dirtyCount ?? 0) === 0, hasGit: true })
      } else {
        setGitStatus({ isClean: true, hasGit: false })
      }
    } catch {
      setGitStatus({ isClean: true, hasGit: false })
    }
  }, [])

  const loadInstructions = useCallback(async (projId?: number) => {
    if (!projId) {
      setInstructions(null)
      setIsEditingInstructions(false)
      return
    }
    setInstructionsLoading(true)
    try {
      const res = await window.electronAPI?.project?.getInstructions?.(projId)
      if (res) {
        setInstructions(res)
        setInstructionDraft(res.content || '')
      }
    } catch (err) {
      console.error('[ProjectPage] Failed to load instructions:', err)
    } finally {
      setInstructionsLoading(false)
      setIsEditingInstructions(false)
    }
  }, [])

  useEffect(() => {
    if (activeProject) {
      fetchGitStatus(activeProject.root_path)
      loadInstructions(activeProject.id)
    } else {
      setGitStatus({ isClean: true, hasGit: false })
      setInstructions(null)
      setIsEditingInstructions(false)
    }
  }, [activeProject?.id, activeProject?.root_path, fetchGitStatus, loadInstructions])

  const projectSessions = useMemo(() => {
    if (!activeProject) return []
    return sessions.filter((s) => s.project_id === activeProject.id)
  }, [sessions, activeProject])

  const handlePickFolder = async () => {
    try {
      const folderPath = await window.electronAPI?.project?.pickDirectory?.()
      if (!folderPath) return
      let existing = projects.find((p) => p.root_path.toLowerCase() === folderPath.toLowerCase())
      if (!existing) {
        const name = folderPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'New Project'
        existing = await createProject({ name, root_path: folderPath })
      }
      if (existing) {
        await openProject(existing.id)
        toast(`${t('projects.matrix.switch', 'Switched to')} "${existing.name}"`, { type: 'success' })
      }
    } catch (err: any) {
      toast(err?.message || 'Failed to open directory', { type: 'error' })
    }
  }

  const handleRevealExplorer = async () => {
    if (!activeProject?.root_path) return
    try {
      if (window.electronAPI?.system?.showItemInFolder) await window.electronAPI.system.showItemInFolder(activeProject.root_path)
      else if (window.electronAPI?.system?.openPath) await window.electronAPI.system.openPath(activeProject.root_path)
    } catch {}
  }

  const handleCopyPath = async (p?: string) => {
    const target = p || activeProject?.root_path
    if (!target) return
    try {
      await navigator.clipboard.writeText(target)
      toast(t('projects.overview.copy_path', 'Path copied to clipboard'), { type: 'success' })
    } catch {
      await window.electronAPI?.system?.clipboardWrite?.(target)
      toast(t('projects.overview.copy_path', 'Path copied to clipboard'), { type: 'success' })
    }
  }

  const handleCopyCd = async () => {
    if (!activeProject?.root_path) return
    const cmd = `cd ${activeProject.root_path.includes(' ') ? `"${activeProject.root_path}"` : activeProject.root_path}`
    try {
      await navigator.clipboard.writeText(cmd)
      toast(t('projects.overview.cd_terminal', 'Terminal cd command copied'), { type: 'success' })
    } catch {
      await window.electronAPI?.system?.clipboardWrite?.(cmd)
      toast(t('projects.overview.cd_terminal', 'Terminal cd command copied'), { type: 'success' })
    }
  }

  const handleSaveInstructions = async () => {
    if (!activeProject) return
    setIsSavingInstructions(true)
    try {
      const fileName = instructions?.fileName || 'AGENTS.md'
      const res = await window.electronAPI?.project?.saveInstructions?.({ projectId: activeProject.id, content: instructionDraft, fileName })
      if (res?.ok) {
        toast(t('projects.rules.saved', 'Instructions saved successfully'), { type: 'success' })
        setInstructions({ fileName, path: res.path || '', content: instructionDraft, exists: true })
        setIsEditingInstructions(false)
      } else {
        toast(res?.error || 'Failed to save instructions', { type: 'error' })
      }
    } catch (err: any) {
      toast(err?.message || 'Failed to save instructions', { type: 'error' })
    } finally {
      setIsSavingInstructions(false)
    }
  }

  const handleCreateTemplate = () => {
    setInstructionDraft(`# AGENTS.md\n\n## Project Overview\n${activeProject?.name || 'Project'}\n\n## Key Architecture & Conventions\n- Core modules and architectural standards.\n- Follow clean design patterns and type safety.\n\n## Testing & Verification\n- Run unit and integration tests before submitting changes.\n`)
    setIsEditingInstructions(true)
  }

  const handleNewProjectSession = async () => {
    if (!activeProject) return
    await createSession()
  }

  const handleDeleteProject = async (e: React.MouseEvent, p: Project) => {
    e.stopPropagation()
    const ok = await confirm({
      title: t('projects.matrix.delete', 'Remove Project'),
      description: t('projects.matrix.delete_confirm', 'Are you sure you want to remove this project from the workspace list? (Disk files will not be deleted)'),
      confirmText: t('projects.all.remove', 'Remove'),
      danger: true,
    })
    if (!ok) return
    await deleteProject(p.id)
    toast(`${t('projects.all.remove', 'Removed')} "${p.name}"`, { type: 'info' })
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden select-none bg-[var(--content-bg)]">
      {/* Top Header Toolbar */}
      <div className="px-6 py-3 border-b flex items-center justify-between shrink-0 bg-[var(--bg-primary)]" style={{ borderColor: 'var(--border)' }}>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <FolderKanban size={18} style={{ color: 'var(--accent)' }} />
            <h1 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {t('projects.hub.title', 'Projects Hub')}
            </h1>
          </div>
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {t('projects.hub.subtitle', 'Manage local workspaces, configure project instructions (AGENTS.md), and project sessions')}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handlePickFolder} className={BTN_BASE} style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} title={t('projects.all.open_folder', 'Open Folder…')}>
            <FolderOpen size={13} />
            <span>{t('projects.all.open_folder', 'Open Folder…')}</span>
          </button>

          {activeProject && (
            <>
              <button onClick={handleRevealExplorer} className={BTN_BASE} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }} title={t('projects.overview.reveal_explorer', 'Reveal in File Explorer')}>
                <ExternalLink size={13} />
                <span className="hidden sm:inline">{t('projects.overview.reveal_explorer', 'Reveal in Explorer')}</span>
              </button>
              <button onClick={() => handleCopyPath()} className={BTN_BASE} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }} title={t('projects.overview.copy_path', 'Copy Path')}>
                <Copy size={13} />
                <span className="hidden sm:inline">{t('projects.overview.copy_path', 'Copy Path')}</span>
              </button>
              <button onClick={handleCopyCd} className={BTN_BASE} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }} title={t('projects.overview.cd_terminal', 'Copy cd command')}>
                <Terminal size={13} />
                <span className="hidden sm:inline">{t('projects.overview.cd_terminal', 'Copy cd')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5 min-h-0">
        {activeProject === null ? (
          /* Empty / Welcome State */
          <div className="max-w-2xl mx-auto py-8">
            <div className="rounded-[10px] border p-8 text-center bg-[var(--bg-primary)] mb-6 shadow-sm" style={{ borderColor: 'var(--border)' }}>
              <div className="w-12 h-12 rounded-[10px] mx-auto mb-4 flex items-center justify-center bg-[var(--bg-secondary)]" style={{ color: 'var(--accent)' }}>
                <FolderKanban size={26} />
              </div>
              <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                {t('projects.empty.title', 'No Project Selected')}
              </h2>
              <p className="text-xs max-w-md mx-auto mb-5" style={{ color: 'var(--text-secondary)' }}>
                {t('projects.empty.desc', 'Open a local folder or select a workspace to get started')}
              </p>
              <button
                onClick={handlePickFolder}
                className="px-4 py-2 text-xs font-medium rounded-[6px] inline-flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-90 active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] text-white"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                <FolderOpen size={14} />
                <span>{t('projects.empty.open_folder', 'Open Project Folder')}</span>
              </button>
            </div>

            {projects.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--text-secondary)' }}>
                  {t('projects.all.title', 'All Workspaces')} ({projects.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => openProject(p.id)}
                      className="rounded-[8px] border p-3 flex flex-col justify-between transition-colors cursor-pointer hover:bg-[var(--bg-secondary)] bg-[var(--bg-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Folder size={15} className="shrink-0" style={{ color: 'var(--accent)' }} />
                          <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); updateProject(p.id, { is_favorite: p.is_favorite ? 0 : 1 }) }}
                          className="p-1 rounded hover:bg-[var(--border)] shrink-0 transition-colors"
                          title={t('projects.matrix.favorite', 'Toggle Favorite')}
                        >
                          <Star size={12} style={{ color: p.is_favorite ? 'var(--accent)' : 'var(--text-muted)', fill: p.is_favorite ? 'var(--accent)' : 'none' }} />
                        </button>
                      </div>
                      <div className="text-[11px] font-mono truncate select-text" style={{ color: 'var(--text-secondary)' }}>{p.root_path}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Active Project Dashboard: 2-Column Responsive View */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-full min-h-0">
            {/* Left Column (Overview, Instructions, Sessions) */}
            <div className="lg:col-span-7 flex flex-col gap-4 overflow-y-auto pr-1">
              {/* Active Project Overview & Runtime Defaults */}
              <div className="rounded-[10px] border p-4 bg-[var(--bg-primary)] flex flex-col gap-3.5 shadow-sm" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 bg-[var(--bg-secondary)]" style={{ color: 'var(--accent)' }}>
                      {gitStatus.hasGit ? <FolderGit2 size={19} /> : <FolderKanban size={19} />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{activeProject.name}</h2>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[4px] border shrink-0" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                          ID: {activeProject.id}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-mono mt-1 select-text" style={{ color: 'var(--text-secondary)' }}>
                        <span className="truncate">{activeProject.root_path}</span>
                        <button onClick={() => handleCopyPath()} className="p-1 rounded hover:bg-[var(--bg-secondary)] shrink-0 transition-colors cursor-pointer" title={t('projects.overview.copy_path', 'Copy Path')}>
                          <Copy size={11} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Git Status Badge */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {gitStatus.hasGit ? (
                      <div
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium"
                        style={{
                          borderColor: gitStatus.isClean ? 'var(--border)' : 'var(--accent)',
                          backgroundColor: 'var(--bg-secondary)',
                          color: gitStatus.isClean ? 'var(--text-secondary)' : 'var(--accent)',
                        }}
                      >
                        <GitBranch size={11} />
                        <span>{gitStatus.branch}</span>
                        <span>•</span>
                        <span>{gitStatus.isClean ? t('projects.overview.git_clean') : t('projects.overview.git_modified', gitStatus.dirtyCount ?? 0)}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>No Git</span>
                    )}
                    <button onClick={() => fetchGitStatus(activeProject.root_path)} className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer" title={t('filetree.refresh', 'Refresh')}>
                      <RefreshCw size={11} className="text-[var(--text-muted)]" />
                    </button>
                  </div>
                </div>

                {/* Runtime Defaults Configuration */}
                <div className="border-t pt-3 flex flex-col gap-2" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    <Layers size={13} style={{ color: 'var(--accent)' }} />
                    <span>{t('projects.defaults.title', 'Runtime Defaults')}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                    {/* Default Model */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{t('projects.defaults.default_model_label', 'Default Model')}</label>
                      <select
                        value={activeProject.default_model_id ?? ''}
                        onChange={async (e) => {
                          const mId = e.target.value ? Number(e.target.value) : null
                          try {
                            await updateProject(activeProject.id, { default_model_id: mId })
                            toast(t('projects.defaults.title', 'Runtime Defaults') + ' updated', { type: 'success' })
                          } catch (err: any) {
                            toast(err?.message || 'Failed to update default model', { type: 'error' })
                          }
                        }}
                        className="text-xs px-2.5 py-1.5 rounded-[6px] border bg-[var(--bg-secondary)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      >
                        <option value="">(Global Default Model)</option>
                        {allModels.map((m) => (
                          <option key={m.id} value={m.id}>{m.display_name || m.model_name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Default Agent Mode */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{t('projects.defaults.default_mode_label', 'Default Agent Mode')}</label>
                      <select
                        value={activeProject.default_agent_mode ?? 'workspace'}
                        onChange={async (e) => {
                          const mode = e.target.value
                          try {
                            await updateProject(activeProject.id, { default_agent_mode: mode })
                            toast(t('projects.defaults.title', 'Runtime Defaults') + ' updated', { type: 'success' })
                          } catch (err: any) {
                            toast(err?.message || 'Failed to update default agent mode', { type: 'error' })
                          }
                        }}
                        className="text-xs px-2.5 py-1.5 rounded-[6px] border bg-[var(--bg-secondary)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      >
                        <option value="workspace">工作区修改 (Workspace - Default)</option>
                        <option value="auto_review">自动审查 (Auto-Review TDD)</option>
                        <option value="explore">仅查看 (Explore - Read-Only)</option>
                        <option value="unrestricted">完全权限 (Unrestricted - Yolo)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Project Instructions & Rules */}
              <div className="rounded-[10px] border p-4 bg-[var(--bg-primary)] flex flex-col gap-3 shadow-sm" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode size={16} style={{ color: 'var(--accent)' }} />
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {t('projects.rules.title', 'Project Instructions & Rules')}
                      </span>
                      {instructions?.exists && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[4px] border shrink-0" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                          {instructions.fileName}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {instructionsLoading ? (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('projects.rules.saving', 'Loading...')}</span>
                    ) : isEditingInstructions ? (
                      <>
                        <button onClick={() => setIsEditingInstructions(false)} disabled={isSavingInstructions} className={BTN_BASE} style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                          <X size={12} />
                          <span>{t('projects.rules.cancel', 'Cancel')}</span>
                        </button>
                        <button onClick={handleSaveInstructions} disabled={isSavingInstructions} className="px-2.5 py-1 text-xs rounded-[6px] flex items-center gap-1 transition-opacity cursor-pointer hover:opacity-90 disabled:opacity-50 text-white" style={{ backgroundColor: 'var(--accent)' }}>
                          <Save size={12} />
                          <span>{isSavingInstructions ? t('projects.rules.saving', 'Saving...') : t('projects.rules.save', 'Save Changes')}</span>
                        </button>
                      </>
                    ) : instructions?.exists ? (
                      <button onClick={() => setIsEditingInstructions(true)} className={BTN_BASE} style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                        <Edit3 size={12} />
                        <span>{t('projects.rules.edit', 'Edit Instructions')}</span>
                      </button>
                    ) : (
                      <button onClick={handleCreateTemplate} className="px-2.5 py-1 text-xs rounded-[6px] flex items-center gap-1 transition-opacity cursor-pointer hover:opacity-90 text-white" style={{ backgroundColor: 'var(--accent)' }}>
                        <Sparkles size={12} />
                        <span>{t('projects.rules.create_template', 'Generate AGENTS.md')}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Instructions Content or Empty Prompt */}
                {isEditingInstructions ? (
                  <textarea
                    value={instructionDraft}
                    onChange={(e) => setInstructionDraft(e.target.value)}
                    className="w-full h-56 p-3 text-xs font-mono rounded-[6px] border resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] bg-[var(--bg-secondary)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    placeholder="Write project guidelines, architectural decisions, and agent instructions here..."
                  />
                ) : instructions?.exists ? (
                  <pre className="p-3 text-xs font-mono rounded-[6px] border max-h-56 overflow-y-auto whitespace-pre-wrap select-text bg-[var(--bg-secondary)]" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                    {instructions.content || '// (Empty instruction file)'}
                  </pre>
                ) : (
                  <div className="p-4 rounded-[6px] border border-dashed text-center flex flex-col items-center justify-center gap-2 bg-[var(--bg-secondary)]" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-xs max-w-md" style={{ color: 'var(--text-secondary)' }}>
                      {t('projects.rules.empty_hint', 'No instruction file found in workspace root. You can create AGENTS.md to define guidelines for agents.')}
                    </p>
                    <button onClick={handleCreateTemplate} className={BTN_BASE} style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                      <Plus size={12} />
                      <span>{t('projects.rules.create_template', 'Generate AGENTS.md')}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Project Sessions */}
              <div className="rounded-[10px] border p-4 bg-[var(--bg-primary)] flex flex-col gap-3 shadow-sm" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={16} style={{ color: 'var(--accent)' }} />
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {t('projects.sessions.title', 'Project Sessions')} ({projectSessions.length})
                    </span>
                  </div>
                  <button onClick={handleNewProjectSession} className={BTN_BASE} style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                    <Plus size={12} />
                    <span>{t('projects.sessions.new', 'New Session in Project')}</span>
                  </button>
                </div>

                {projectSessions.length === 0 ? (
                  <div className="py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t('projects.sessions.empty', 'No sessions in this project yet')}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {projectSessions.map((s) => (
                      <div
                        key={s.id}
                        onClick={async () => { await selectSession(s.id); setCurrentView('chat') }}
                        className="px-3 py-2 rounded-[6px] border text-xs flex items-center justify-between gap-3 cursor-pointer transition-colors hover:bg-[var(--bg-secondary)] bg-[var(--bg-primary)]"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>{s.title || `Session #${s.id}`}</span>
                        <span className="text-[11px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                          {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column (File Explorer & All Projects Matrix) */}
            <div className="lg:col-span-5 flex flex-col gap-4 min-h-0 overflow-hidden">
              {/* Workspace File Explorer */}
              <div className="rounded-[10px] border p-4 bg-[var(--bg-primary)] flex flex-col flex-1 min-h-[340px] shadow-sm overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between pb-2 mb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <FolderOpen size={15} style={{ color: 'var(--accent)' }} />
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {t('projects.explorer.title', 'Workspace File Explorer')}
                    </span>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <FileTree rootPath={activeProject.root_path} alwaysOpen={true} showHeader={false} className="h-full" />
                </div>
              </div>

              {/* All Workspaces Matrix */}
              <div className="rounded-[10px] border p-4 bg-[var(--bg-primary)] flex flex-col max-h-[280px] shrink-0 shadow-sm" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between pb-2 mb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('projects.matrix.title', 'All Workspaces')} ({projects.length})
                  </span>
                  <button onClick={handlePickFolder} className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer" title={t('projects.all.open_folder', 'Open Folder…')}>
                    <Plus size={13} style={{ color: 'var(--text-secondary)' }} />
                  </button>
                </div>

                <div className="flex flex-col gap-1.5 overflow-y-auto pr-1">
                  {projects.map((p) => {
                    const isActive = p.id === activeProject.id
                    return (
                      <div
                        key={p.id}
                        onClick={() => openProject(p.id)}
                        className="px-2.5 py-1.5 rounded-[6px] border flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer hover:bg-[var(--bg-secondary)]"
                        style={{
                          borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                          backgroundColor: isActive ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isActive ? (
                            <Check size={13} className="shrink-0" style={{ color: 'var(--accent)' }} />
                          ) : (
                            <Folder size={13} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
                          )}
                          <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); updateProject(p.id, { is_favorite: p.is_favorite ? 0 : 1 }) }}
                            className="p-1 rounded hover:bg-[var(--border)] transition-colors"
                            title={t('projects.matrix.favorite', 'Toggle Favorite')}
                          >
                            <Star size={12} style={{ color: p.is_favorite ? 'var(--accent)' : 'var(--text-muted)', fill: p.is_favorite ? 'var(--accent)' : 'none' }} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteProject(e, p)}
                            className="p-1 rounded hover:bg-[var(--border)] text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
                            title={t('projects.matrix.delete', 'Remove Project')}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
