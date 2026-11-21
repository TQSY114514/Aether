// ─────────────────────────────────────────────────────────────────────────────
// app/src/components/chat/SessionReviewDrawer.tsx
//
// Session-level aggregated Diff Review Drawer (Roadmap P1: 整任务 Diff Review 流).
// Merges all per-turn fileSummariesByMessage entries across the active session
// by normalized file path so users can inspect every touched file (+N / -M),
// review unified diffs, craft & commit to Git, or jump to snapshot rollback.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/store'
import type { Message } from '@/types'
import type { TurnFileSummary } from '@/store/types'
import { cleanDiffLines } from '@/utils/diff'
import { t } from '@/utils/i18n'
import {
  FileDiff,
  X,
  Search,
  ChevronDown,
  ChevronRight,
  GitCommit,
  Check,
  History,
  RotateCcw,
  FileCode,
} from 'lucide-react'

export interface AggregatedFileChange {
  path: string
  added: number
  removed: number
  status: 'created' | 'modified' | 'deleted'
  diffs: string[]
  turnsCount: number
}

export interface SessionReviewSummary {
  files: AggregatedFileChange[]
  totalAdded: number
  totalRemoved: number
  fileCount: number
}

function normalizePathKey(p: string): string {
  return String(p || '').replace(/\\/g, '/').toLowerCase()
}

function splitPath(fullPath: string) {
  const parts = fullPath.replace(/\\/g, '/').split('/')
  const fileName = parts.pop() || fullPath
  const dir = parts.length > 0 ? parts.join('/') + '/' : ''
  return { dir, fileName }
}

/** Merge per-turn file summaries across all messages in a session. */
export function aggregateSessionFileChanges(
  messages: Message[],
  fileSummariesByMessage: Record<number, TurnFileSummary>
): SessionReviewSummary {
  const map = new Map<string, AggregatedFileChange>()

  for (const msg of messages) {
    const summary = fileSummariesByMessage[msg.id]
    if (!summary?.files || summary.files.length === 0) continue

    for (const f of summary.files) {
      if (!f?.path) continue
      const key = normalizePathKey(f.path)
      const existing = map.get(key)
      if (!existing) {
        map.set(key, {
          path: f.path,
          added: Number(f.added) || 0,
          removed: Number(f.removed) || 0,
          status: f.status || 'modified',
          diffs: f.diff ? [f.diff] : [],
          turnsCount: 1,
        })
      } else {
        existing.added += Number(f.added) || 0
        existing.removed += Number(f.removed) || 0
        if (f.status === 'deleted') {
          existing.status = 'deleted'
        } else if (existing.status !== 'created' && f.status) {
          existing.status = f.status
        }
        if (f.diff) existing.diffs.push(f.diff)
        existing.turnsCount += 1
      }
    }
  }

  const files = Array.from(map.values())
  let totalAdded = 0
  let totalRemoved = 0
  for (const f of files) {
    totalAdded += f.added
    totalRemoved += f.removed
  }
  return { files, totalAdded, totalRemoved, fileCount: files.length }
}

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
  sessionId: number
  isOpen: boolean
  onClose: () => void
  summary: SessionReviewSummary
}) {
  const setCheckpointsOpen = useStore((s) => s.setCheckpointsOpen)

  const [search, setSearch] = useState('')
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({})
  const [commitOpen, setCommitOpen] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [crafting, setCrafting] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [committedHash, setCommittedHash] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    setCommittedHash(null)
    setCommitOpen(false)
    setCommitMsg('')
    setSearch('')
  }, [sessionId])

  // Auto-expand single file for immediate review
  useEffect(() => {
    if (isOpen && summary.files.length === 1) {
      setExpandedPaths({ [summary.files[0].path]: true })
    }
  }, [isOpen, summary.files])

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return summary.files
    return summary.files.filter((f) => f.path.toLowerCase().includes(q))
  }, [summary.files, search])

  const toggleFile = useCallback((p: string) => {
    setExpandedPaths((prev) => ({ ...prev, [p]: !prev[p] }))
  }, [])

  const handleOpenCommit = useCallback(async () => {
    if (commitOpen) {
      setCommitOpen(false)
      return
    }
    setCommitOpen(true)
    if (!commitMsg) {
      setCrafting(true)
      try {
        const res = await window.electronAPI.git.craftCommitMessage({ sessionId })
        if (res?.success && res.suggestedMessage) {
          setCommitMsg(res.suggestedMessage)
        } else {
          setCommitMsg(`feat: update ${summary.fileCount} files`)
        }
      } catch {
        setCommitMsg(`feat: update ${summary.fileCount} files`)
      } finally {
        setCrafting(false)
      }
    }
  }, [commitOpen, commitMsg, sessionId, summary.fileCount])

  const handleCommit = useCallback(async () => {
    const trimmed = commitMsg.trim()
    if (!trimmed || committing) return
    setCommitting(true)
    try {
      const files = summary.files.map((f) => f.path)
      const res = await window.electronAPI.git.commit({ message: trimmed, files, sessionId })
      if (res?.success) {
        setCommittedHash(res.commitHash || 'ok')
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
      useStore.getState().triggerToast(
        t('filesummary.commit_failed', err?.message || 'Error'),
        'error'
      )
    } finally {
      setCommitting(false)
    }
  }, [commitMsg, committing, summary.files, sessionId])

  if (!isOpen) return null

  return createPortal(
    <aside
      role="dialog"
      aria-modal="true"
      aria-label={t('chat.review_title')}
      className="fixed top-0 bottom-0 end-0 w-[440px] max-w-[92vw] z-[110] flex flex-col shadow-2xl"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderInlineStart: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="h-12 flex items-center gap-2 px-3 shrink-0 wco-pr app-drag"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <FileDiff size={15} style={{ color: 'var(--accent)' }} className="shrink-0" />
        <span className="text-sm font-semibold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
          {t('chat.review_title')}
        </span>
        {summary.fileCount > 0 && (
          <div className="flex items-center gap-1 font-mono text-[11px] tabular-nums shrink-0">
            <span
              className="px-1.5 py-0.2 rounded-[4px] border"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
            >
              {summary.fileCount}
            </span>
            {summary.totalAdded > 0 && (
              <span style={{ color: 'var(--success)' }}>+{summary.totalAdded}</span>
            )}
            {summary.totalRemoved > 0 && (
              <span style={{ color: 'var(--error)' }}>-{summary.totalRemoved}</span>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            onClose()
            setCheckpointsOpen(true)
          }}
          className="ms-auto flex items-center gap-1 px-2 py-1 rounded-[6px] border text-[11px] hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer app-no-drag"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          title={t('hud.open_outputs')}
        >
          <History size={11} />
          <span>{t('chat.review_checkpoints_btn')}</span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-[6px] hover:bg-[var(--bg-secondary)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)] app-no-drag"
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          <X size={14} />
        </button>
      </div>

      {/* Subheader: Search + Commit */}
      {summary.fileCount > 0 && (
        <div className="p-2.5 space-y-2 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <div
              className="flex-1 flex items-center gap-2 rounded-[6px] border px-2.5 py-1 text-xs"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
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
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleOpenCommit}
              disabled={!!committedHash}
              className="h-7 flex items-center gap-1 px-2.5 rounded-[6px] border text-[11px] font-medium hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-50 transition-colors cursor-pointer shrink-0"
              style={{
                borderColor: committedHash ? 'var(--success)' : 'var(--border)',
                color: committedHash ? 'var(--success)' : 'var(--text-primary)',
                backgroundColor: 'var(--content-bg)',
              }}
            >
              {committedHash ? (
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
                <button
                  type="button"
                  onClick={() => toggleFile(file.path)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-[var(--bg-secondary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
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
                  <div className="flex items-center gap-1 font-mono text-[11px] font-semibold tabular-nums shrink-0">
                    {file.added > 0 && <span style={{ color: 'var(--success)' }}>+{file.added}</span>}
                    {file.removed > 0 && <span style={{ color: 'var(--error)' }}>-{file.removed}</span>}
                  </div>
                </button>

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
                            className="flex px-2.5 py-0.5 leading-snug"
                            style={{
                              backgroundColor: isAdd
                                ? 'rgba(34,197,94,0.08)'
                                : isDel
                                ? 'rgba(239,68,68,0.08)'
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
                            <span className="shrink-0 w-7 select-none text-[10px] text-right pr-2 opacity-50" style={{ color: 'var(--text-muted)' }}>
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
    </aside>,
    document.body
  )
}
