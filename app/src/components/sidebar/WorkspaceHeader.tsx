import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Folder,
  FolderOpen,
  FolderGit2,
  FolderKanban,
  Star,
  Plus,
  Check,
  Search,
  Trash2,
  ExternalLink,
  Copy,
  Terminal,
  RefreshCw,
  ChevronDown,
  ShieldCheck,
  Filter,
} from 'lucide-react'
import { useStore } from '@/store'
import { useUI } from '@/components/ui/feedback'
import { t } from '@/utils/i18n'
import type { Project } from '@/store/projectSlice'
import HoverMarquee from '@/components/ui/HoverMarquee'

export const hasProjectSwitcher = true

export default function WorkspaceHeader() {
  const activeProject = useStore((s) => s.activeProject)
  const projects = useStore((s) => s.projects)
  const loadProjects = useStore((s) => s.loadProjects)
  const openProject = useStore((s) => s.openProject)
  const createProject = useStore((s) => s.createProject)
  const updateProject = useStore((s) => s.updateProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const projectScopeFilter = useStore((s) => s.projectScopeFilter)
  const toggleProjectScope = useStore((s) => s.toggleProjectScope)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const sessions = useStore((s) => s.sessions)
  const { confirm, toast } = useUI()

  const [popoverOpen, setPopoverOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [gitStatus, setGitStatus] = useState<{
    branch?: string
    dirtyCount?: number
    isClean: boolean
    hasGit: boolean
  }>({ isClean: true, hasGit: false })
  const [ruleInfo, setRuleInfo] = useState<{
    has: boolean
    fileName: string | null
    rulesCount?: number
  }>({ has: false, fileName: null })
  const [refreshing, setRefreshing] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  // Load and monitor git status & project rules
  const fetchWorkspaceMeta = useCallback(async () => {
    try {
      const gitRes = await window.electronAPI?.git?.status?.({ sessionId: currentSessionId ?? undefined })
      if (gitRes?.success && gitRes.root) {
        setGitStatus({
          branch: gitRes.branch || 'HEAD',
          dirtyCount: gitRes.dirtyCount ?? 0,
          isClean: (gitRes.dirtyCount ?? 0) === 0,
          hasGit: true,
        })
      } else {
        setGitStatus({ isClean: true, hasGit: false })
      }
    } catch {
      setGitStatus({ isClean: true, hasGit: false })
    }

    try {
      const ruleRes = await window.electronAPI?.agent?.hasProjectInstructions?.(currentSessionId ?? undefined)
      if (ruleRes) {
        setRuleInfo({
          has: !!ruleRes.has,
          fileName: ruleRes.fileName || null,
          rulesCount: ruleRes.rulesCount || 0,
        })
      }
    } catch {
      setRuleInfo({ has: false, fileName: null })
    }
  }, [currentSessionId, activeProject?.root_path])

  useEffect(() => {
    loadProjects?.()
    fetchWorkspaceMeta()
  }, [loadProjects, fetchWorkspaceMeta])

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [popoverOpen])

  // Filter projects by search
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects
    const q = searchQuery.toLowerCase()
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.root_path.toLowerCase().includes(q)
    )
  }, [projects, searchQuery])

  // Current project sessions count
  const projectSessionCount = useMemo(() => {
    if (!activeProject) return sessions.length
    return sessions.filter((s) => s.project_id === activeProject.id).length
  }, [sessions, activeProject])

  const handlePickNewFolder = async () => {
    try {
      const dir = await window.electronAPI?.project?.pickDirectory()
      if (dir) {
        const parts = dir.replace(/[\\/]+$/, '').split(/[\\/]/)
        const name = parts[parts.length - 1] || 'New Project'
        const proj = await createProject({ name, root_path: dir })
        if (proj?.id) {
          await openProject(proj.id)
          setPopoverOpen(false)
          fetchWorkspaceMeta()
          toast?.(`${name} (${t('workspace.open_folder')})`, { type: 'success' })
        }
      }
    } catch (e: any) {
      toast?.(e?.message || t('common.error', 'Error'), { type: 'error' })
    }
  }

  const handleToggleFavorite = async (e: React.MouseEvent, proj: Project) => {
    e.stopPropagation()
    const newFav = proj.is_favorite ? 0 : 1
    await updateProject(proj.id, { is_favorite: newFav })
  }

  const handleDeleteProject = async (e: React.MouseEvent, proj: Project) => {
    e.stopPropagation()
    const ok = await confirm({
      title: t('workspace.delete_confirm_title'),
      description: t('workspace.delete_confirm_desc'),
      confirmText: t('common.delete', 'Delete'),
      danger: true,
    })
    if (ok) {
      await deleteProject(proj.id)
      fetchWorkspaceMeta()
    }
  }

  const handleRevealInExplorer = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const target = activeProject?.root_path
    if (target) {
      await window.electronAPI?.system?.openPath?.(target)
    } else {
      const defaultWs = await window.electronAPI?.agent?.getWorkspace?.()
      if (defaultWs) await window.electronAPI?.system?.openPath?.(defaultWs)
    }
  }

  const handleCopyPath = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const target = activeProject?.root_path || (await window.electronAPI?.agent?.getWorkspace?.())
    if (target) {
      await window.electronAPI?.system?.clipboardWrite?.(target)
      toast?.(`${t('workspace.copied')}: ${target}`, { type: 'success' })
    }
  }

  const handleCopyCd = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const target = activeProject?.root_path || (await window.electronAPI?.agent?.getWorkspace?.())
    if (target) {
      const isWin = target.includes('\\') || target.includes(':')
      const cmd = isWin ? `cd /d "${target}"` : `cd "${target}"`
      await window.electronAPI?.system?.clipboardWrite?.(cmd)
      toast?.(`${t('workspace.copy_cd')}: ${cmd}`, { type: 'success' })
    }
  }

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setRefreshing(true)
    await loadProjects()
    await fetchWorkspaceMeta()
    setTimeout(() => setRefreshing(false), 300)
  }

  return (
    <div ref={containerRef} className="px-2 pt-2 pb-1.5 shrink-0 relative select-none app-no-drag">
      {/* Primary Workspace Card */}
      <div
        onClick={() => setPopoverOpen((v) => !v)}
        className="group relative flex flex-col gap-1 p-2 rounded-[8px] border transition-all cursor-pointer shadow-xs hover:border-[var(--accent)]/40 hover:bg-[var(--bg-secondary)] active:scale-[0.99] motion-reduce:transform-none"
        style={{
          borderColor: popoverOpen ? 'var(--accent)' : 'var(--border)',
          backgroundColor: 'var(--content-bg)',
        }}
        title={activeProject ? activeProject.root_path : t('workspace.default')}
        aria-label="Workspace Hub"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setPopoverOpen((v) => !v)
          }
        }}
      >
        {/* Row 1: Workspace Name + Git Badge + Caret */}
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {gitStatus.hasGit ? (
              <FolderGit2 size={13} className="shrink-0 text-[var(--accent)]" />
            ) : activeProject ? (
              <FolderKanban size={13} className="shrink-0 text-[var(--accent)]" />
            ) : (
              <Folder size={13} className="shrink-0 text-[var(--text-muted)]" />
            )}
            <HoverMarquee
              text={activeProject ? activeProject.name : t('workspace.default')}
              className="text-xs font-semibold tracking-tight truncate flex-1 min-w-0"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {gitStatus.hasGit && gitStatus.branch && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[5px] text-[10px] font-mono border"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-secondary)',
                }}
                title={gitStatus.isClean ? t('workspace.clean') : t('workspace.modified', gitStatus.dirtyCount ?? 0)}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: gitStatus.isClean ? 'var(--success, #16a34a)' : 'var(--warning, #f59e0b)',
                  }}
                />
                <span className="truncate max-w-[55px]">{gitStatus.branch}</span>
              </span>
            )}
            <ChevronDown
              size={12}
              className={`shrink-0 transition-transform duration-200 text-[var(--text-muted)] ${
                popoverOpen ? 'rotate-180 text-[var(--text-primary)]' : ''
              }`}
            />
          </div>
        </div>

        {/* Row 2: Subtitle (Path or Rules) & Micro-Toolbar */}
        <div className="flex items-center justify-between gap-1 min-w-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <div className="flex items-center gap-1 truncate min-w-0 flex-1">
            {ruleInfo.has ? (
              <span
                className="inline-flex items-center gap-1 px-1 py-0.2 rounded-[4px] border font-mono text-[9px] text-[var(--accent)] bg-[var(--bg-secondary)] shrink-0"
                style={{ borderColor: 'var(--border)' }}
                title={ruleInfo.rulesCount ? `${ruleInfo.rulesCount} rules active` : `${ruleInfo.fileName} active`}
              >
                <ShieldCheck size={9} />
                <span>{ruleInfo.rulesCount ? `${ruleInfo.rulesCount} rules` : ruleInfo.fileName}</span>
              </span>
            ) : null}
            <span className="truncate font-mono opacity-80" title={activeProject?.root_path || ''}>
              {activeProject
                ? activeProject.root_path.replace(/\\/g, '/').split('/').slice(-2).join('/')
                : t('workspace.default')}
            </span>
          </div>

          {/* Micro Action Icons (appear clean & subtle) */}
          <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleRevealInExplorer}
              className="p-1 rounded-[5px] hover:bg-[var(--border)]/60 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title={t('workspace.reveal_explorer')}
              aria-label={t('workspace.reveal_explorer')}
            >
              <ExternalLink size={10} />
            </button>
            <button
              type="button"
              onClick={handleCopyCd}
              className="p-1 rounded-[5px] hover:bg-[var(--border)]/60 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title={t('workspace.copy_cd')}
              aria-label={t('workspace.copy_cd')}
            >
              <Terminal size={10} />
            </button>
            <button
              type="button"
              onClick={handleCopyPath}
              className="p-1 rounded-[5px] hover:bg-[var(--border)]/60 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title={t('workspace.copy_path')}
              aria-label={t('workspace.copy_path')}
            >
              <Copy size={10} />
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              className="p-1 rounded-[5px] hover:bg-[var(--border)]/60 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title={t('common.refresh', 'Refresh')}
              aria-label={t('common.refresh', 'Refresh')}
            >
              <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* Workspace Switcher & Manager Popover */}
      {popoverOpen && (
        <div
          className="absolute top-full left-2 right-2 mt-1 rounded-[10px] border shadow-lg p-2.5 z-50 animate-spring-up motion-reduce:animate-none flex flex-col gap-2"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border)',
            minWidth: '234px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Popover Header with Title and Scope Toggle */}
          <div className="flex items-center justify-between pb-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <span className="font-semibold text-xs text-[var(--text-primary)]">
              {t('workspace.recent')}
            </span>
            <button
              type="button"
              onClick={toggleProjectScope}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-[5px] border text-[10px] transition-colors ${
                projectScopeFilter
                  ? 'text-[var(--accent)] bg-[var(--content-bg)] border-[var(--border)] shadow-2xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] border-transparent'
              }`}
              title={projectScopeFilter ? t('workspace.filter_project_desc') : t('workspace.filter_all_desc')}
            >
              <Filter size={10} />
              <span>{projectScopeFilter ? `${projectSessionCount}` : t('sidebar.project_scope.all')}</span>
            </button>
          </div>

          {/* Search Box */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-[6px] border text-xs"
            style={{ backgroundColor: 'var(--content-bg)', borderColor: 'var(--border)' }}
          >
            <Search size={12} className="text-[var(--text-muted)] shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('workspace.search_placeholder')}
              className="w-full bg-transparent outline-none text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              autoFocus
            />
          </div>

          {/* Projects List */}
          <div className="max-h-48 overflow-y-auto space-y-1 pr-0.5 scroll-bounce">
            {/* Option: Default Workspace */}
            <button
              type="button"
              onClick={async () => {
                await openProject(null)
                setPopoverOpen(false)
                fetchWorkspaceMeta()
              }}
              className="w-full flex items-center justify-between gap-1.5 p-1.5 rounded-[6px] text-left transition-colors hover:bg-[var(--bg-secondary)] group"
              style={!activeProject ? { backgroundColor: 'var(--content-bg)' } : {}}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Folder size={12} className="shrink-0 text-[var(--text-muted)]" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                    {t('workspace.default')}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">
                    ~/.aetherai
                  </div>
                </div>
              </div>
              {!activeProject && <Check size={12} className="text-[var(--success,#16a34a)] shrink-0" />}
            </button>

            {filteredProjects.length === 0 && searchQuery ? (
              <div className="text-[11px] py-3 text-center text-[var(--text-muted)]">
                {t('workspace.no_results')}
              </div>
            ) : (
              filteredProjects.map((p) => {
                const isCurrent = activeProject?.id === p.id
                return (
                  <div
                    key={p.id}
                    onClick={async () => {
                      await openProject(p.id)
                      setPopoverOpen(false)
                      fetchWorkspaceMeta()
                    }}
                    className="w-full flex items-center justify-between gap-1.5 p-1.5 rounded-[6px] text-left transition-colors hover:bg-[var(--bg-secondary)] group cursor-pointer"
                    style={isCurrent ? { backgroundColor: 'var(--content-bg)' } : {}}
                  >
                    <button
                      type="button"
                      onClick={(e) => handleToggleFavorite(e, p)}
                      className={`p-0.5 rounded hover:bg-[var(--border)] shrink-0 transition-colors ${
                        p.is_favorite ? 'text-amber-500' : 'text-[var(--text-muted)] opacity-40 group-hover:opacity-100'
                      }`}
                      title={t('workspace.favorite')}
                    >
                      <Star size={11} fill={p.is_favorite ? 'currentColor' : 'none'} />
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <FolderKanban size={12} className="shrink-0 text-[var(--accent)]" />
                        <span className="truncate font-medium text-xs text-[var(--text-primary)]">
                          {p.name}
                        </span>
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">
                        {p.root_path}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isCurrent ? (
                        <Check size={12} className="text-[var(--success,#16a34a)] shrink-0" />
                      ) : null}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteProject(e, p)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--border)] text-[var(--text-muted)] hover:text-[var(--error)] transition-all"
                        title={t('common.delete', 'Delete')}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Action Row */}
          <div className="pt-1.5 border-t flex flex-col gap-1" style={{ borderColor: 'var(--border)' }}>
            <button
              type="button"
              onClick={handlePickNewFolder}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-[6px] border font-medium hover:bg-[var(--bg-secondary)] transition-colors active:scale-[0.99] text-[var(--text-primary)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <Plus size={12} />
              <span>{t('workspace.open_folder')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
