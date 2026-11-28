import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  CornerDownLeft,
  ExternalLink,
  Folder,
  FolderGit2,
  FolderOpen,
  History,
  ArrowUp,
} from 'lucide-react'
import { useStore } from '@/store'
import Tooltip from '@/components/Tooltip'
import { t } from '@/utils/i18n'

const RECENT_CWDS_KEY = 'aether:recent_cwds'
const IS_CASE_INSENSITIVE_FS =
  typeof navigator !== 'undefined' && /win|mac/i.test(navigator.platform || navigator.userAgent)

function samePath(a: string, b: string): boolean {
  return IS_CASE_INSENSITIVE_FS ? a.toLowerCase() === b.toLowerCase() : a === b
}

type Props = {
  activeCwd: string | null
  headerGit: { branch?: string; isClean?: boolean } | null
  headerRule: { has: boolean; fileName: string | null } | null
  isStreaming: boolean
  onFallbackWorkspaceChange?: (dir: string) => void
}

function loadRecentCwds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_CWDS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string' && p.trim().length > 0) : []
  } catch {
    return []
  }
}

function saveRecentCwd(dir: string) {
  try {
    const prev = loadRecentCwds()
    const next = [dir, ...prev.filter((p) => !samePath(p, dir))].slice(0, 8)
    localStorage.setItem(RECENT_CWDS_KEY, JSON.stringify(next))
  } catch {}
}

function buildBreadcrumbs(cwd: string | null): { label: string; fullPath: string }[] {
  if (!cwd) return []
  const isWin = /^[a-zA-Z]:/.test(cwd) || cwd.includes('\\')
  if (isWin) {
    const norm = cwd.replace(/\//g, '\\')
    const driveMatch = norm.match(/^([a-zA-Z]:)\\?(.*)$/)
    if (!driveMatch) return [{ label: norm, fullPath: norm }]
    const drive = driveMatch[1] + '\\'
    const rest = driveMatch[2].split('\\').filter(Boolean)
    const crumbs: { label: string; fullPath: string }[] = [{ label: driveMatch[1], fullPath: drive }]
    let acc = drive
    for (const seg of rest) {
      acc = acc.endsWith('\\') ? `${acc}${seg}` : `${acc}\\${seg}`
      crumbs.push({ label: seg, fullPath: acc })
    }
    return crumbs
  }
  const parts = cwd.split('/').filter(Boolean)
  const crumbs: { label: string; fullPath: string }[] = [{ label: '/', fullPath: '/' }]
  let acc = ''
  for (const seg of parts) {
    acc += '/' + seg
    crumbs.push({ label: seg, fullPath: acc })
  }
  return crumbs
}

function splitNameAndParent(p: string): { name: string; parent: string } {
  const clean = p.replace(/[\\/]+$/, '')
  const idx = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  if (idx < 0) return { name: clean || p, parent: '' }
  return { name: clean.slice(idx + 1) || clean, parent: clean.slice(0, idx) || clean.slice(0, idx + 1) }
}

/** Minimal top-bar CWD pill + terminal-style path navigator popover. */
export default function CwdNavigator({
  activeCwd,
  headerGit,
  headerRule,
  isStreaming,
  onFallbackWorkspaceChange,
}: Props) {
  const currentSessionId = useStore((s) => s.currentSessionId)
  const setSessionCwd = useStore((s) => s.setSessionCwd)

  const [open, setOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(true)
  const [draft, setDraft] = useState(activeCwd || '')
  const [error, setError] = useState<string | null>(null)
  const [recentCwds, setRecentCwds] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(activeCwd || '')
    setError(null)
  }, [activeCwd, open])

  useEffect(() => {
    if (open) {
      setRecentCwds(loadRecentCwds())
      if (containerRef.current && typeof window !== 'undefined') {
        const rect = containerRef.current.getBoundingClientRect()
        const popW = Math.min(390, window.innerWidth - 32)
        const rightOverflow = rect.left + popW > window.innerWidth - 16
        const leftHasRoom = rect.right - popW >= 16
        setAlignRight(rightOverflow && leftHasRoom)
      }
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const displayFolder = useMemo(() => {
    if (!activeCwd) return t('cwd.default_short')
    const clean = activeCwd.replace(/[\\/]+$/, '')
    const parts = clean.replace(/\\/g, '/').split('/').filter(Boolean)
    return parts[parts.length - 1] || clean || '/'
  }, [activeCwd])

  const breadcrumbs = useMemo(() => buildBreadcrumbs(activeCwd), [activeCwd])
  const parentCwd = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2].fullPath : null

  const applyPath = async (target: string, closeOnSuccess = true) => {
    const trimmed = target.trim()
    if (!trimmed || isStreaming) return
    setError(null)
    try {
      if (currentSessionId) {
        await setSessionCwd(trimmed)
      } else {
        const res = await window.electronAPI?.agent?.setWorkspace?.({ dir: trimmed })
        const canonical = res?.root || trimmed
        saveRecentCwd(canonical)
        onFallbackWorkspaceChange?.(canonical)
      }
      setRecentCwds(loadRecentCwds())
      if (closeOnSuccess) setOpen(false)
    } catch (err: any) {
      setError(err?.message || t('cwd.invalid_path'))
    }
  }

  const handleBrowse = async () => {
    if (isStreaming) return
    try {
      const picked = await window.electronAPI?.system?.pickDirectory?.()
      if (picked) await applyPath(picked)
    } catch (err: any) {
      setError(err?.message || t('cwd.invalid_path'))
    }
  }

  const handleReveal = async () => {
    const target = activeCwd || (await window.electronAPI?.agent?.getWorkspace?.(currentSessionId ?? undefined))
    if (target) window.electronAPI?.system?.openPath?.(target)
  }

  return (
    <div ref={containerRef} className="relative flex items-center">
      <Tooltip
        text={`${activeCwd || '~'}${headerGit?.branch ? ` (${headerGit.branch})` : ''} · ${t('cwd.click_to_navigate')}`}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t('cwd.navigator_title')}
          className="h-7 flex items-center gap-1.5 px-2.5 rounded-[6px] border text-xs transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
          style={{
            backgroundColor: open ? 'var(--bg-secondary)' : 'var(--content-bg)',
            borderColor: open ? 'var(--accent)' : 'var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          {headerGit ? (
            <FolderGit2 size={12} className="text-[var(--accent)] shrink-0" />
          ) : (
            <Folder size={12} className="text-[var(--accent)] shrink-0" />
          )}
          <span className="truncate max-w-[130px] text-[11px] font-medium font-mono">
            {displayFolder}
          </span>
          {headerGit?.branch && (
            <span className="font-mono text-[10px] text-[var(--text-muted)] flex items-center gap-1 pl-0.5">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: headerGit.isClean ? 'var(--success)' : 'var(--warning)' }}
              />
              <span className="truncate max-w-[65px]">{headerGit.branch}</span>
            </span>
          )}
          <ChevronDown
            size={11}
            className={`text-[var(--text-muted)] shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </Tooltip>

      {open && (
        <div
          role="dialog"
          aria-label={t('cwd.navigator_title')}
          className={`popover-scale-up absolute top-full ${alignRight ? 'right-0' : 'left-0'} mt-1.5 w-[390px] max-w-[calc(100vw-32px)] rounded-[10px] border shadow-xl z-50 p-3 flex flex-col gap-2.5`}
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        >
          {/* Header + quiet rules badge + quick actions */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                {t('cwd.navigator_title')}
              </span>
              {headerRule?.has && (
                <span
                  className="px-1.5 py-0.5 rounded-[4px] border font-mono text-[10px] text-[var(--accent)] truncate"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
                >
                  {headerRule.fileName || 'AGENTS.md'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {parentCwd && (
                <Tooltip text={t('cwd.parent_dir')}>
                  <button
                    type="button"
                    disabled={isStreaming}
                    onClick={() => applyPath(parentCwd, false)}
                    className="h-6 px-1.5 rounded-[5px] border flex items-center gap-0.5 text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--content-bg)] disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <ArrowUp size={11} />
                    <span>..</span>
                  </button>
                </Tooltip>
              )}
              <Tooltip text={t('cwd.browse_folder')}>
                <button
                  type="button"
                  disabled={isStreaming}
                  onClick={handleBrowse}
                  className="h-6 w-6 rounded-[5px] border flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--content-bg)] disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                  style={{ borderColor: 'var(--border)' }}
                  aria-label={t('cwd.browse_folder')}
                >
                  <FolderOpen size={12} />
                </button>
              </Tooltip>
              <Tooltip text={t('cwd.reveal')}>
                <button
                  type="button"
                  onClick={handleReveal}
                  className="h-6 w-6 rounded-[5px] border flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--content-bg)] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                  style={{ borderColor: 'var(--border)' }}
                  aria-label={t('cwd.reveal')}
                >
                  <ExternalLink size={12} />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Terminal address bar input */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              applyPath(draft)
            }}
            className="flex items-center gap-1.5"
          >
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                if (error) setError(null)
              }}
              disabled={isStreaming}
              placeholder={t('cwd.input_placeholder')}
              className="flex-1 h-7 px-2 rounded-[6px] border font-mono text-[11px] bg-[var(--content-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
              style={{ borderColor: error ? 'var(--error)' : 'var(--border)' }}
            />
            <button
              type="submit"
              disabled={isStreaming || !draft.trim()}
              className="h-7 px-2 rounded-[6px] border text-[11px] font-medium flex items-center gap-1 transition-colors hover:bg-[var(--content-bg)] disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              aria-label={t('cwd.go')}
            >
              <CornerDownLeft size={11} />
              <span>{t('cwd.go')}</span>
            </button>
          </form>

          {error && (
            <p role="alert" className="text-[11px] text-[var(--error)] leading-snug">
              {error}
            </p>
          )}

          {/* Clickable ancestor breadcrumbs */}
          {breadcrumbs.length > 0 && (
            <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar pb-0.5 border-b" style={{ borderColor: 'var(--border)' }}>
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1
                const isRoot = idx === 0 && (crumb.label === '/' || /^[a-zA-Z]:$/.test(crumb.label))
                return (
                  <div key={crumb.fullPath} className="flex items-center shrink-0">
                    {idx > 0 && <span className="text-[10px] text-[var(--text-muted)] px-0.5">/</span>}
                    <button
                      type="button"
                      disabled={isStreaming || isLast}
                      onClick={() => applyPath(crumb.fullPath, false)}
                      className={`px-1 py-0.5 rounded-[4px] font-mono text-[10px] transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-default focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                        isLast
                          ? 'text-[var(--text-primary)] font-medium cursor-default'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--content-bg)] cursor-pointer'
                      }`}
                    >
                      {isRoot ? crumb.label : crumb.label}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Recent directories */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1 text-[10px] font-medium text-[var(--text-muted)]">
              <History size={10} />
              <span>{t('cwd.recent')}</span>
            </div>
            {recentCwds.length === 0 ? (
              <div className="text-[11px] text-[var(--text-muted)] py-1">
                {t('cwd.empty_recent')}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5 max-h-[156px] overflow-y-auto">
                {recentCwds.slice(0, 6).map((dir) => {
                  const { name, parent } = splitNameAndParent(dir)
                  const isCurrent = !!activeCwd && samePath(dir, activeCwd)
                  return (
                    <button
                      key={dir}
                      type="button"
                      disabled={isStreaming || isCurrent}
                      onClick={() => applyPath(dir)}
                      className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded-[5px] text-left transition-colors active:scale-[0.99] disabled:opacity-40 disabled:cursor-default focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                        isCurrent
                          ? 'bg-[var(--content-bg)] text-[var(--accent)] cursor-default'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--content-bg)] cursor-pointer'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Folder size={11} className="shrink-0 opacity-75" />
                        <span className="truncate font-mono text-[11px] font-medium">{name}</span>
                      </span>
                      <span className="truncate font-mono text-[10px] text-[var(--text-muted)] max-w-[190px]">
                        {parent}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
