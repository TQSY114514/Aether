// ─────────────────────────────────────────────────────────────────────────────
// app/src/components/chat/SessionReviewDrawer.tsx
//
// Session-level aggregated Diff Review Drawer (Roadmap P1: 整任务 Diff Review 流).
// Merges all per-turn fileSummariesByMessage entries across the active session
// by normalized file path so users can inspect every touched file (+N / -M),
// review unified diffs, craft & commit to Git, or jump to snapshot rollback.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/store'
import { cleanDiffLines } from '@/utils/diff'
import { t } from '@/utils/i18n'
import {
  splitPath,
  aggregateSessionFileChanges,
  type AggregatedFileChange,
  type SessionReviewSummary,
} from '@/utils/sessionReview'

export { aggregateSessionFileChanges }
export type { AggregatedFileChange, SessionReviewSummary }
import {
  FileDiff, X, Search, ChevronDown, ChevronRight, GitCommit,
  Check, History, RotateCcw, FileCode, UnfoldVertical, FoldVertical, Copy,
} from 'lucide-react'

const STATUS_BADGE: Record<'created' | 'modified' | 'deleted', { label: string; color: string }> = {
  created: { label: 'A', color: 'var(--success)' },
  modified: { label: 'M', color: 'var(--warning)' },
  deleted: { label: 'D', color: 'var(--error)' },
}

export default function SessionReviewDrawer({
  sessionId,
  isOpen,
  onClose,
  summary,
}: {
  sessionId: number | null
  isOpen: boolean
  onClose: () => void
  summary: SessionReviewSummary
}) {
  const setCheckpointsOpen = useStore((s) => s.setCheckpointsOpen)

  const [search, setSearch] = useState('')
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({})
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [commitOpen, setCommitOpen] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [crafting, setCrafting] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [committedHash, setCommittedHash] = useState<string | null>(null)
  const [committedFingerprint, setCommittedFingerprint] = useState<string | null>(null)
  const prevOpenRef = useRef(false)
  const drawerRef = useRef<HTMLElement>(null)
  const prevActiveElementRef = useRef<HTMLElement | null>(null)
  const asyncGenRef = useRef(0)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const changesFingerprint = useMemo(() => {
    return `${summary.fileCount}:${summary.totalAdded}:${summary.totalRemoved}:${summary.files
      .map((f) => `${f.path}:${f.added}:${f.removed}`)
      .join(',')}`
  }, [summary])

  const isCommittedForCurrentChanges = Boolean(committedHash && committedFingerprint === changesFingerprint)

  useEffect(() => {
    if (!isOpen) {
      if (prevActiveElementRef.current && typeof prevActiveElementRef.current.focus === 'function') {
        prevActiveElementRef.current.focus()
        prevActiveElementRef.current = null
      }
      return
    }
    prevActiveElementRef.current = document.activeElement as HTMLElement | null

    const timer = setTimeout(() => {
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (focusable && focusable.length > 0) {
        focusable[0].focus()
      } else {
        drawerRef.current?.focus()
      }
    }, 50)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = Array.from(
          drawerRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null)
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    setCommittedHash(null)
    setCommittedFingerprint(null)
    setCommitOpen(false)
    setCommitMsg('')
    setSearch('')
  }, [sessionId])

  // Auto-expand single file for immediate review only on initial drawer open transition
  useEffect(() => {
    if (isOpen && !prevOpenRef.current && summary.files.length === 1) {
      setExpandedPaths({ [summary.files[0].path]: true })
    }
    prevOpenRef.current = isOpen
  }, [isOpen, summary.files.length])

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return summary.files
    return summary.files.filter((f) => f.path.toLowerCase().includes(q))
  }, [summary.files, search])

  const toggleFile = useCallback((p: string) => {
    setExpandedPaths((prev) => ({ ...prev, [p]: !prev[p] }))
  }, [])

  const allExpanded = filteredFiles.length > 0 && filteredFiles.every((f) => expandedPaths[f.path])
  const toggleAll = useCallback(() => {
    if (allExpanded) {
      setExpandedPaths({})
    } else {
      const next: Record<string, boolean> = {}
      for (const f of filteredFiles) next[f.path] = true
      setExpandedPaths(next)
    }
  }, [allExpanded, filteredFiles])

  const handleCopyPath = useCallback(async (path: string) => {
    let ok = false
    try {
      if (window.electronAPI?.system?.clipboardWrite) {
        await window.electronAPI.system.clipboardWrite(path)
        ok = true
      } else if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(path)
        ok = true
      }
    } catch {
      ok = false
    }
    if (ok) {
      setCopiedPath(path)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopiedPath(null), 1800)
    }
  }, [])

  const handleOpenCommit = useCallback(async () => {
    if (commitOpen) {
      setCommitOpen(false)
      return
    }
    setCommitOpen(true)
    if (!commitMsg) {
      setCrafting(true)
      const currentGen = ++asyncGenRef.current
      const activeSessionId = sessionId
      try {
        const res = sessionId != null
          ? await window.electronAPI.git.craftCommitMessage({ sessionId })
          : null
        if (asyncGenRef.current !== currentGen || sessionId !== activeSessionId) return
        if (res?.success && res.suggestedMessage) {
          setCommitMsg(res.suggestedMessage)
        } else {
          setCommitMsg(`feat: update ${summary.fileCount} files`)
        }
      } catch {
        if (asyncGenRef.current !== currentGen || sessionId !== activeSessionId) return
        setCommitMsg(`feat: update ${summary.fileCount} files`)
      } finally {
        if (asyncGenRef.current === currentGen) {
          setCrafting(false)
        }
      }
    }
  }, [commitOpen, commitMsg, sessionId, summary.fileCount])

  const handleCommit = useCallback(async () => {
    const trimmed = commitMsg.trim()
    if (!trimmed || committing || sessionId == null) return
    setCommitting(true)
    const currentGen = ++asyncGenRef.current
    const activeSessionId = sessionId
    try {
      const files = summary.files.map((f) => f.path)
      const res = await window.electronAPI.git.commit({ message: trimmed, files, sessionId })
      if (asyncGenRef.current !== currentGen || sessionId !== activeSessionId) return
      if (res?.success) {
        setCommittedHash(res.commitHash || 'ok')
        setCommittedFingerprint(changesFingerprint)
        setCommitOpen(false)
        useStore.getState().triggerToast(
          t('filesummary.commit_success', res.commitHash ? `${res.commitHash} - ${trimmed}` : trimmed),
          'success'
        )
      } else {
        useStore.getState().triggerToast(
          t('filesummary.commit_failed', res?.error || 'Failed'),
          'error'
        )
      }
    } catch (err: any) {
      if (asyncGenRef.current !== currentGen || sessionId !== activeSessionId) return
      useStore.getState().triggerToast(
        t('filesummary.commit_failed', err?.message || 'Error'),
        'error'
      )
    } finally {
      if (asyncGenRef.current === currentGen) {
        setCommitting(false)
      }
    }
  }, [commitMsg, committing, summary.files, sessionId, changesFingerprint])

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[110] flex justify-end">
      <div
        className="absolute inset-0 bg-black/15 backdrop-fade-plain"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('chat.review_title')}
        className="relative w-[480px] max-w-[94vw] h-full flex flex-col shadow-2xl drawer-slide-in"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderInlineStart: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="h-12 flex items-center gap-2 px-3.5 shrink-0 wco-pr app-drag"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <FileDiff size={15} style={{ color: 'var(--accent)' }} className="shrink-0" />
          <span className="text-sm font-semibold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
            {t('chat.review_title')}
          </span>

          <button
            type="button"
            onClick={() => {
              onClose()
              setCheckpointsOpen(true)
            }}
            className="ms-auto flex items-center gap-1 px-2 py-1 rounded-[6px] border text-[11px] hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer app-no-drag shrink-0"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            title={t('hud.open_outputs')}
          >
            <History size={11} />
            <span>{t('chat.review_checkpoints_btn')}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-[6px] hover:bg-[var(--bg-secondary)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)] app-no-drag shrink-0"
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X size={14} />
          </button>
        </div>

        {/* Subheader: Metrics + Search + Commit */}
        {summary.fileCount > 0 && (
          <div className="p-3 space-y-2.5 shrink-0" style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
            <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
              <span style={{ color: 'var(--text-secondary)' }}>
                {summary.fileCount === 1
                  ? t('filesummary.one_changed_file', summary.totalAdded, summary.totalRemoved)
                  : t('filesummary.changed_files', summary.fileCount, summary.totalAdded, summary.totalRemoved)}
              </span>
              <div className="flex items-center gap-1.5 font-semibold shrink-0">
                {summary.totalAdded > 0 && (
                  <span style={{ color: 'var(--success)' }}>+{summary.totalAdded}</span>
                )}
                {summary.totalRemoved > 0 && (
                  <span style={{ color: 'var(--error)' }}>-{summary.totalRemoved}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="flex-1 flex items-center gap-2 rounded-[6px] border px-2.5 py-1 text-xs"
                style={{ backgroundColor: 'var(--content-bg)', borderColor: 'var(--border)' }}
              >
                <Search size={12} className="text-[var(--text-muted)] shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('chat.review_search_placeholder')}
                  className="flex-1 bg-transparent outline-none text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label={t('common.clear')}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={toggleAll}
                disabled={filteredFiles.length === 0}
                title={allExpanded ? t('chat.review_collapse_all') : t('chat.review_expand_all')}
                aria-label={allExpanded ? t('chat.review_collapse_all') : t('chat.review_expand_all')}
                className="h-7 w-7 flex items-center justify-center rounded-[6px] border text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] active:scale-[0.98] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer shrink-0"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
              >
                {allExpanded ? <FoldVertical size={12} /> : <UnfoldVertical size={12} />}
              </button>

              <button
                type="button"
                onClick={handleOpenCommit}
                disabled={isCommittedForCurrentChanges}
                className="h-7 flex items-center gap-1 px-2.5 rounded-[6px] border text-[11px] font-medium hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-50 transition-colors cursor-pointer shrink-0"
                style={{
                  borderColor: isCommittedForCurrentChanges ? 'var(--success)' : 'var(--border)',
                  color: isCommittedForCurrentChanges ? 'var(--success)' : 'var(--text-primary)',
                  backgroundColor: 'var(--content-bg)',
                }}
              >
              {isCommittedForCurrentChanges ? (
                <>
                  <Check size={11} />
                  <span>{t('filesummary.committed')}</span>
                </>
              ) : (
                <>
                  <GitCommit size={12} className="text-[var(--accent)]" />
                  <span>{t('filesummary.commit')}</span>
                </>
              )}
            </button>
          </div>

          {commitOpen && !committedHash && (
            <div className="flex items-center gap-1.5 pt-1">
              <input
                type="text"
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                disabled={crafting || committing}
                placeholder={crafting ? t('filesummary.committing') : t('filesummary.commit_input_placeholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && commitMsg.trim()) handleCommit()
                }}
                className="flex-1 px-2.5 py-1 text-xs font-mono rounded-[6px] border outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                style={{
                  borderColor: 'var(--border)',
                  backgroundColor: 'var(--content-bg)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                type="button"
                onClick={handleCommit}
                disabled={!commitMsg.trim() || crafting || committing}
                className="px-2.5 py-1 rounded-[6px] text-xs font-medium text-white hover:opacity-90 active:scale-[0.98] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer shrink-0"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {committing ? <RotateCcw size={12} className="animate-spin" /> : t('filesummary.commit')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Body: File List & Diffs */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {summary.fileCount === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 text-center px-6">
            <FileCode size={28} className="text-[var(--text-muted)] opacity-40 mb-2" />
            <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {t('chat.review_empty_title')}
            </p>
            <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {t('chat.review_empty_desc')}
            </p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-12 text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('common.no_results')}
          </div>
        ) : (
          filteredFiles.map((file) => {
            const expanded = !!expandedPaths[file.path]
            const { dir, fileName } = splitPath(file.path)
            const badge = STATUS_BADGE[file.status] || STATUS_BADGE.modified
            const mergedDiff = file.diffs.join('\n')
            const lines = expanded && mergedDiff ? cleanDiffLines(mergedDiff) : []

            return (
              <div
                key={file.path}
                className="rounded-[10px] border overflow-hidden"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
              >
                <div
                  onClick={() => toggleFile(file.path)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleFile(file.path)
                    }
                  }}
                  aria-expanded={expanded}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-[var(--bg-secondary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer group"
                >
                  {expanded ? (
                    <ChevronDown size={13} className="shrink-0 text-[var(--text-muted)]" />
                  ) : (
                    <ChevronRight size={13} className="shrink-0 text-[var(--text-muted)]" />
                  )}
                  <span
                    className="font-mono text-[10px] font-bold w-4 h-4 rounded-[4px] flex items-center justify-center shrink-0 border"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: badge.color,
                    }}
                  >
                    {badge.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {fileName}
                      </span>
                      {file.turnsCount > 1 && (
                        <span
                          className="font-mono text-[9.5px] px-1 rounded-[4px] shrink-0"
                          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                        >
                          {t('chat.review_turns_touched', file.turnsCount)}
                        </span>
                      )}
                    </div>
                    {dir && (
                      <div className="font-mono text-[10px] truncate" style={{ color: 'var(--text-muted)' }} title={file.path}>
                        {dir}
                      </div>
                    )}
                  </div>

                  {/* Copy Path Quick Action */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCopyPath(file.path)
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                    }}
                    title={copiedPath === file.path ? t('chat.review_path_copied') : t('chat.review_copy_path')}
                    aria-label={copiedPath === file.path ? t('chat.review_path_copied') : t('chat.review_copy_path')}
                    className="p-1 rounded-[4px] hover:bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer shrink-0"
                  >
                    {copiedPath === file.path ? (
                      <Check size={11} className="text-[var(--success)]" />
                    ) : (
                      <Copy size={11} />
                    )}
                  </button>

                  <div className="flex items-center gap-1 font-mono text-[11px] font-semibold tabular-nums shrink-0">
                    {file.added > 0 && <span style={{ color: 'var(--success)' }}>+{file.added}</span>}
                    {file.removed > 0 && <span style={{ color: 'var(--error)' }}>-{file.removed}</span>}
                  </div>
                </div>

                {expanded && (
                  <div className="border-t font-mono text-[11px] max-h-[320px] overflow-y-auto" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}>
                    {lines.length === 0 ? (
                      <div className="px-3 py-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {t('chat.review_no_diff')}
                      </div>
                    ) : (
                      lines.map((line, i) => {
                        const isAdd = line.startsWith('+') && !line.startsWith('+++')
                        const isDel = line.startsWith('-') && !line.startsWith('---')
                        const isHunk = line.startsWith('@@')
                        return (
                          <div
                            key={i}
                            className="flex px-2.5 py-0.5 leading-[1.55]"
                            style={{
                              backgroundColor: isAdd
                                ? 'color-mix(in srgb, var(--success) 8%, transparent)'
                                : isDel
                                ? 'color-mix(in srgb, var(--error) 8%, transparent)'
                                : isHunk
                                ? 'var(--bg-secondary)'
                                : 'transparent',
                              color: isAdd
                                ? 'var(--success)'
                                : isDel
                                ? 'var(--error)'
                                : isHunk
                                ? 'var(--accent)'
                                : 'var(--text-secondary)',
                            }}
                          >
                            <span
                              className="shrink-0 w-7 select-none text-[10px] text-right pr-2 mr-2 border-r opacity-50 tabular-nums"
                              style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                            >
                              {i + 1}
                            </span>
                            <span className="whitespace-pre-wrap break-all">{line}</span>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </aside>
    </div>,
    document.body
  )
}
