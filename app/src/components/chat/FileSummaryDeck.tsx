import { useState, useCallback } from 'react'
import type { TurnFileSummary, FileChangeEntry } from '@/store/types'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import { FileCode, RotateCcw, ChevronDown, ChevronRight, Check, GitCommit, Play, AlertCircle, Maximize2, X } from 'lucide-react'

interface FileSummaryDeckProps {
  summary: TurnFileSummary
  sessionId?: number
  messageId?: number
}

function formatPath(fullPath: string) {
  const parts = fullPath.replace(/\\/g, '/').split('/')
  const fileName = parts.pop() || fullPath
  const dir = parts.length > 0 ? parts.join('/') + '/' : ''
  return { dir, fileName }
}

export default function FileSummaryDeck({ summary, sessionId, messageId }: FileSummaryDeckProps) {
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({})
  const [modalDiffFile, setModalDiffFile] = useState<FileChangeEntry | null>(null)
  const [rollingBack, setRollingBack] = useState(false)
  const [undone, setUndone] = useState(false)
  const [commitOpen, setCommitOpen] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [crafting, setCrafting] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [committed, setCommitted] = useState(false)
  const [commitHash, setCommitHash] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'passed' | 'failed'>('idle')

  const toggleFile = useCallback((path: string) => {
    setExpandedFiles((prev) => ({ ...prev, [path]: !prev[path] }))
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
        const res = await window.electronAPI.git.craftCommitMessage({ sessionId: sessionId || undefined })
        if (res.success && res.suggestedMessage) {
          setCommitMsg(res.suggestedMessage)
        } else {
          setCommitMsg(`feat: update ${summary.files.length} files`)
        }
      } catch {
        setCommitMsg(`feat: update ${summary.files.length} files`)
      } finally {
        setCrafting(false)
      }
    }
  }, [commitOpen, commitMsg, summary.files.length, sessionId])

  const handleExecuteCommit = useCallback(async () => {
    const trimmed = commitMsg.trim()
    if (!trimmed || committing) return
    setCommitting(true)
    try {
      const filePaths = summary.files.map((f) => f.path)
      const res = await window.electronAPI.git.commit({ message: trimmed, files: filePaths, sessionId: sessionId || undefined })
      if (res.success) {
        setCommitted(true)
        setCommitHash(res.commitHash || null)
        setCommitOpen(false)
        useStore.getState().triggerToast(
          t('filesummary.commit_success', res.commitHash ? `${res.commitHash} - ${trimmed}` : trimmed),
          'success'
        )
      } else {
        useStore.getState().triggerToast(
          t('filesummary.commit_failed', res.error || 'Failed'),
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

  const handleRollback = useCallback(async () => {
    if (!window.confirm(t('filesummary.undo_confirm', '确定要撤销本轮对话对文件所做的修改吗？'))) {
      return
    }

    setRollingBack(true)
    try {
      let rolledBack = false
      let totalFilesRestored = 0
      const failedPaths: string[] = []
      if (messageId && sessionId && window.electronAPI?.agentCheckpoint) {
        const checkpoints = await window.electronAPI.agentCheckpoint.list({ sessionId, messageId })
        if (checkpoints && checkpoints.length > 0) {
          for (const cp of checkpoints) {
            if (!cp.rolled_back_at) {
              const res = await window.electronAPI.agentCheckpoint.rollback({ id: cp.id, sessionId, force: true })
              if (res && !res.success) {
                if (Array.isArray(res.failed) && res.failed.length > 0) {
                  failedPaths.push(...res.failed.map((f: any) => typeof f === 'string' ? f : f.path))
                } else if (res.error) {
                  failedPaths.push(res.error)
                }
              } else if (res && res.success) {
                rolledBack = true
                if (Array.isArray(res.restored)) {
                  totalFilesRestored += res.restored.length
                }
              }
            }
          }
        }
      }

      if (failedPaths.length > 0) {
        useStore.getState().triggerToast(
          t('filesummary.undo_partial', failedPaths.join(', ')),
          'error'
        )
        return
      }

      if (!rolledBack || (files.length > 0 && totalFilesRestored === 0)) {
        useStore.getState().triggerToast(
          t('filesummary.no_files_restored', '本轮修改包含终端命令生成的文件，快照中无可还原的文件条目，请在 Git 中撤销。'),
          'warning'
        )
        return
      }

      setUndone(true)
      useStore.getState().triggerToast(
        t('filesummary.undo_success', '本轮文件修改已成功撤销'),
        'success'
      )
    } catch (err: any) {
      useStore.getState().triggerToast(
        t('filesummary.undo_failed', err?.message || 'Error'),
        'error'
      )
    } finally {
      setRollingBack(false)
    }
  }, [sessionId, messageId])

  const handleRunTest = useCallback(async () => {
    if (testing) return
    setTesting(true)
    setTestStatus('idle')
    try {
      useStore.getState().triggerToast('正在运行项目测试套件...', 'info')
      const res = await window.electronAPI.chat.test({ sessionId: sessionId || undefined })
      if (res.ok || res.passed) {
        setTestStatus('passed')
        useStore.getState().triggerToast(`测试通过 (${res.command}, ${res.durationMs}ms)`, 'success')
      } else {
        setTestStatus('failed')
        useStore.getState().triggerToast(`测试未通过 (${res.command})`, 'error')
        if (sessionId && res.suggestedRepairPrompt) {
          if (window.confirm('项目测试未通过，是否让 Agent 自动分析并修复报错？')) {
            useStore.getState().sendMessage(res.suggestedRepairPrompt)
          }
        }
      }
    } catch (err: any) {
      setTestStatus('failed')
      useStore.getState().triggerToast(`测试执行异常: ${err?.message || 'Error'}`, 'error')
    } finally {
      setTesting(false)
    }
  }, [testing, sessionId])

  if (!summary || !summary.files || summary.files.length === 0) {
    return null
  }

  const { files, totalAdded, totalRemoved, fileCount } = summary
  const summaryTitle = fileCount === 1
    ? t('filesummary.one_changed_file', totalAdded, totalRemoved)
    : t('filesummary.changed_files', fileCount, totalAdded, totalRemoved)

  return (
    <div
      className="mt-3 rounded-[8px] border overflow-hidden text-xs"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--bg-primary)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileCode size={13} className="shrink-0" style={{ color: 'var(--text-secondary)' }} />
          <span className="font-semibold text-xs truncate" style={{ color: 'var(--text-primary)' }}>
            {summaryTitle}
          </span>
          <div className="flex items-center gap-1 font-mono text-[11px] font-semibold shrink-0">
            {totalAdded > 0 && (
              <span className="px-1 py-0.2 rounded" style={{ color: 'var(--success)' }}>
                +{totalAdded}
              </span>
            )}
            {totalRemoved > 0 && (
              <span className="px-1 py-0.2 rounded" style={{ color: 'var(--error)' }}>
                -{totalRemoved}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {/* Run Tests button */}
          <button
            onClick={handleRunTest}
            disabled={testing || rollingBack}
            className="flex items-center gap-1 px-2 py-1 rounded-[6px] text-[11px] font-medium border transition-colors hover:bg-[var(--border)] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            style={{
              borderColor: testStatus === 'passed' ? 'rgba(34,197,94,0.35)' : testStatus === 'failed' ? 'rgba(239,68,68,0.35)' : 'var(--border)',
              backgroundColor: testStatus === 'passed' ? 'rgba(34,197,94,0.1)' : testStatus === 'failed' ? 'rgba(239,68,68,0.1)' : 'transparent',
              color: testStatus === 'passed' ? 'var(--success)' : testStatus === 'failed' ? 'var(--error)' : 'var(--text-primary)',
            }}
            title={t('filesummary.run_tests_title', '运行项目测试并验证代码更改')}
          >
            {testing ? (
              <>
                <RotateCcw size={11} className="animate-spin text-[var(--accent)]" />
                <span>{t('filesummary.testing', '运行中...')}</span>
              </>
            ) : testStatus === 'passed' ? (
              <>
                <Check size={11} style={{ color: 'var(--success)' }} />
                <span>{t('filesummary.test_passed', '测试通过')}</span>
              </>
            ) : testStatus === 'failed' ? (
              <>
                <AlertCircle size={11} style={{ color: 'var(--error)' }} />
                <span>{t('filesummary.test_failed', '测试未过')}</span>
              </>
            ) : (
              <>
                <Play size={11} style={{ color: 'var(--accent)' }} />
                <span>{t('filesummary.run_tests', '运行测试')}</span>
              </>
            )}
          </button>

          {/* Commit button */}
          <button
            onClick={handleOpenCommit}
            disabled={committed || rollingBack}
            className="flex items-center gap-1 px-2 py-1 rounded-[6px] text-[11px] font-medium border transition-colors hover:bg-[var(--border)] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            style={{
              borderColor: committed ? 'rgba(34,197,94,0.35)' : 'var(--border)',
              backgroundColor: committed ? 'rgba(34,197,94,0.1)' : 'transparent',
              color: committed ? 'var(--success)' : 'var(--text-primary)',
            }}
            title={committed ? `${t('filesummary.committed')} ${commitHash || ''}` : t('filesummary.commit')}
          >
            {committed ? (
              <>
                <Check size={11} style={{ color: 'var(--success)' }} />
                <span>{t('filesummary.committed')} {commitHash ? `(${commitHash})` : ''}</span>
              </>
            ) : (
              <>
                <GitCommit size={11} style={{ color: 'var(--accent)' }} />
                <span>{t('filesummary.commit')}</span>
              </>
            )}
          </button>

          {/* Rollback button */}
          <button
            onClick={handleRollback}
            disabled={rollingBack || undone || committed}
            className="flex items-center gap-1 px-2 py-1 rounded-[6px] text-[11px] font-medium border transition-colors hover:bg-[var(--border)] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            style={{
              borderColor: 'var(--border)',
              color: undone ? 'var(--text-muted)' : 'var(--text-primary)',
            }}
            title={undone ? t('filesummary.undone') : t('filesummary.undo_turn')}
          >
            {undone ? (
              <>
                <Check size={11} style={{ color: 'var(--success)' }} />
                <span>{t('filesummary.undone', '已撤销')}</span>
              </>
            ) : (
              <>
                <RotateCcw size={11} className={rollingBack ? 'animate-spin' : ''} />
                <span>{t('filesummary.undo_turn', '撤销修改')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Inline Commit Drawer */}
      {commitOpen && !committed && (
        <div
          className="flex items-center gap-2 px-3 py-2 border-b bg-[var(--bg-secondary)]"
          style={{ borderColor: 'var(--border)' }}
        >
          <GitCommit size={12} className="shrink-0 text-[var(--accent)]" />
          <input
            type="text"
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleExecuteCommit()
              } else if (e.key === 'Escape') {
                setCommitOpen(false)
              }
            }}
            placeholder={crafting ? t('filesummary.committing') : t('filesummary.commit_input_placeholder')}
            disabled={crafting || committing}
            className="flex-1 bg-[var(--bg-primary)] border rounded-[4px] px-2 py-1 text-xs outline-none focus:border-[var(--accent)] font-mono text-[var(--text-primary)]"
            style={{ borderColor: 'var(--border)' }}
            autoFocus
          />
          <button
            type="button"
            onClick={handleExecuteCommit}
            disabled={crafting || committing || !commitMsg.trim()}
            className="px-2.5 py-1 rounded-[4px] text-[11px] font-medium bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
          >
            {committing ? t('filesummary.committing') : t('filesummary.commit_confirm')}
          </button>
          <button
            type="button"
            onClick={() => setCommitOpen(false)}
            disabled={committing}
            className="px-2 py-1 rounded-[4px] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0"
          >
            {t('filesummary.commit_cancel')}
          </button>
        </div>
      )}

      {/* Files list */}
      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {files.map((file: FileChangeEntry) => {
          const isExpanded = !!expandedFiles[file.path]
          const { dir, fileName } = formatPath(file.path)
          const hasDiff = !!file.diff

          return (
            <div key={file.path} className="flex flex-col">
              <button
                type="button"
                onClick={() => hasDiff && toggleFile(file.path)}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors hover:bg-[var(--bg-primary)] ${
                  hasDiff ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {hasDiff ? (
                    isExpanded ? (
                      <ChevronDown size={12} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
                    ) : (
                      <ChevronRight size={12} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
                    )
                  ) : (
                    <span className="w-3" />
                  )}

                  <span
                    className="text-[10px] font-mono px-1 py-0.2 rounded shrink-0 uppercase tracking-wider"
                    style={{
                      backgroundColor:
                        file.status === 'created'
                          ? 'rgba(34, 197, 94, 0.15)'
                          : file.status === 'deleted'
                          ? 'rgba(239, 68, 68, 0.15)'
                          : 'rgba(161, 161, 170, 0.15)',
                      color:
                        file.status === 'created'
                          ? 'var(--success)'
                          : file.status === 'deleted'
                          ? 'var(--error)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    {file.status === 'created' ? 'A' : file.status === 'deleted' ? 'D' : 'M'}
                  </span>

                  <span
                    className="font-mono text-[11px] truncate flex items-center"
                    title={file.path}
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {dir && (
                      <span className="opacity-60 text-[10px] truncate max-w-[160px]">{dir}</span>
                    )}
                    <span className="font-medium">{fileName}</span>
                  </span>
                </div>

                <div className="flex items-center gap-1.5 font-mono text-[11px] shrink-0 ml-2">
                  {file.added > 0 && (
                    <span style={{ color: 'var(--success)' }}>+{file.added}</span>
                  )}
                  {file.removed > 0 && (
                    <span style={{ color: 'var(--error)' }}>-{file.removed}</span>
                  )}
                  {file.diff && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setModalDiffFile(file)
                      }}
                      className="ms-1.5 p-0.5 rounded hover:bg-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                      title={t('filesummary.view_full_diff', '查看完整差异')}
                      aria-label={t('filesummary.view_full_diff', '查看完整差异')}
                    >
                      <Maximize2 size={11} />
                    </button>
                  )}
                </div>
              </button>

              {/* Collapsible Unified Diff */}
              {isExpanded && file.diff && (
                <div
                  className="px-3 py-2 border-t font-mono text-[10px] leading-relaxed overflow-x-auto max-h-60 overflow-y-auto"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <pre className="whitespace-pre">
                    {file.diff.split('\n').map((line, idx) => {
                      let color = 'var(--text-secondary)'
                      let bg = 'transparent'
                      if (line.startsWith('+') && !line.startsWith('+++')) {
                        color = 'var(--success)'
                        bg = 'rgba(34, 197, 94, 0.08)'
                      } else if (line.startsWith('-') && !line.startsWith('---')) {
                        color = 'var(--error)'
                        bg = 'rgba(239, 68, 68, 0.08)'
                      } else if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++')) {
                        color = 'var(--accent)'
                      }
                      return (
                        <div
                          key={idx}
                          className="px-1 rounded-sm"
                          style={{ color, backgroundColor: bg }}
                        >
                          {line || ' '}
                        </div>
                      )
                    })}
                  </pre>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Full Diff Modal */}
      {modalDiffFile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('filesummary.diff_modal_title', modalDiffFile.path)}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setModalDiffFile(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[85vh] rounded-lg border shadow-2xl flex flex-col overflow-hidden"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <FileCode size={14} className="text-[var(--accent)] shrink-0" />
                <span className="font-mono text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {modalDiffFile.path}
                </span>
                <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                  (+{modalDiffFile.added} -{modalDiffFile.removed})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModalDiffFile(null)}
                className="p-1 rounded hover:bg-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                aria-label={t('common.close', '关闭')}
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <pre className="whitespace-pre">
                {(modalDiffFile.diff || '').split('\n').map((line, idx) => {
                  let color = 'var(--text-secondary)'
                  let bg = 'transparent'
                  if (line.startsWith('+') && !line.startsWith('+++')) {
                    color = 'var(--success)'
                    bg = 'rgba(34, 197, 94, 0.08)'
                  } else if (line.startsWith('-') && !line.startsWith('---')) {
                    color = 'var(--error)'
                    bg = 'rgba(239, 68, 68, 0.08)'
                  } else if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++')) {
                    color = 'var(--accent)'
                  }
                  return (
                    <div key={idx} className="px-1 rounded-sm" style={{ color, backgroundColor: bg }}>
                      {line || ' '}
                    </div>
                  )
                })}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
