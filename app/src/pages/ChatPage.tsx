import { useMemo, useState, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import ChatWindow from '@/components/chat/ChatWindow'
import ChatInput from '@/components/chat/ChatInput'
import ContextBar from '@/components/chat/ContextBar'
import EmptyState from '@/components/chat/EmptyState'
import Tooltip from '@/components/Tooltip'
import HoverMarquee from '@/components/ui/HoverMarquee'
import { FolderGit2, Folder, ExternalLink, Search, History, FileDiff, Swords } from 'lucide-react'
import { t } from '@/utils/i18n'
import SessionReviewDrawer, { aggregateSessionFileChanges } from '@/components/chat/SessionReviewDrawer'

// Trust badge dot color
const TRUST_DOT: Record<string, string> = {
  green: 'var(--success)',
  yellow: 'var(--warning)',
  red: 'var(--error)',
}
const TRUST_TIP: Record<string, string> = {
  green: 'trusted',
  yellow: 'neutral',
  red: 'cautious',
}

/** Compose the conversation header, message stream, and input composer. */
export default function ChatPage() {
  const currentSessionId = useStore((s) => s.currentSessionId)
  const sessions = useStore((s) => s.sessions)
  const activeSessionTitle = useMemo(() => {
    const found = sessions.find((s) => s.id === currentSessionId)
    return found?.title || t('chat.new')
  }, [sessions, currentSessionId])
  const theme = useStore((s) => s.theme)
  const backgroundImage = useStore((s) => s.backgroundImage)
  const hasBg = !!backgroundImage
  const sessionConfigs = useStore((s) => s.sessionConfigs)
  const setSessionCwd = useStore((s) => s.setSessionCwd)
  const streamingBySession = useStore((s) => s.streamingBySession)
  const isStreaming = currentSessionId ? !!streamingBySession[currentSessionId] : false
  const messages = useStore((s) => s.messages)
  const fileSummariesByMessage = useStore((s) => s.fileSummariesByMessage)
  const [showReview, setShowReview] = useState(false)

  const reviewSummary = useMemo(
    () => aggregateSessionFileChanges(messages, fileSummariesByMessage),
    [messages, fileSummariesByMessage]
  )

  useEffect(() => {
    setShowReview(false)
  }, [currentSessionId])
  const chatMode = useStore((s) => s.chatMode)
  const setChatMode = useStore((s) => s.setChatMode)
  const arenaModelIds = useStore((s) => s.arenaModelIds)
  const setArenaModelIds = useStore((s) => s.setArenaModelIds)
  const arenaTemperatures = useStore((s) => s.arenaTemperatures)
  const setArenaTemperatures = useStore((s) => s.setArenaTemperatures)
  const providers = useStore((s) => s.providers)
  const allModels = useStore((s) => s.allModels)
  const scores = useStore((s) => s.scores)
  const loadScores = useStore((s) => s.loadScores)
  useEffect(() => { if (scores.length === 0) loadScores() }, [scores.length, loadScores])

  const scoreByModel = useMemo(() => {
    const map: Record<number, number> = {}
    for (const sc of scores) { map[sc.model_id] = Math.round(sc.score) }
    return map
  }, [scores])

  const allArenaModels = useMemo(() => {
    const providerIds = new Set(providers.map((p) => p.id))
    return allModels
      .filter((m) => providerIds.has(m.provider_id))
      .map((m) => ({
        id: m.id,
        name: m.display_name || m.model_name,
      }))
  }, [providers, allModels])

  const [localArenaIds, setLocalArenaIds] = useState<[number | null, number | null]>([
    arenaModelIds[0] ?? null,
    arenaModelIds[1] ?? null,
  ])
  useEffect(() => {
    setLocalArenaIds([arenaModelIds[0] ?? null, arenaModelIds[1] ?? null])
  }, [arenaModelIds])

  const setModelSlot = useCallback((slot: 0 | 1, modelId: number | null) => {
    setLocalArenaIds((prev) => {
      const next: [number | null, number | null] = slot === 0 ? [modelId, prev[1]] : [prev[0], modelId]
      const valid = next.filter((id): id is number => id !== null && id > 0)
      setArenaModelIds(valid)
      return next
    })
  }, [setArenaModelIds])

  const handleToggleSplitRun = useCallback(() => {
    const nextMode = chatMode === 'arena' ? 'normal' : 'arena'
    if (nextMode === 'arena') {
      const hasTwo = localArenaIds[0] && localArenaIds[1]
      if (!hasTwo && allArenaModels.length >= 2) {
        const m0 = localArenaIds[0] || allArenaModels[0].id
        const m1 = localArenaIds[1] || (allArenaModels.find((m) => m.id !== m0)?.id ?? allArenaModels[1].id)
        setLocalArenaIds([m0, m1])
        setArenaModelIds([m0, m1])
      } else if (!localArenaIds[0] && allArenaModels.length === 1) {
        setLocalArenaIds([allArenaModels[0].id, allArenaModels[0].id])
        setArenaModelIds([allArenaModels[0].id])
      }
    }
    setChatMode(nextMode)
  }, [chatMode, localArenaIds, allArenaModels, setArenaModelIds, setChatMode])

  const currentSession = useMemo(() => sessions.find((s) => s.id === currentSessionId), [sessions, currentSessionId])
  const [defaultWorkspace, setDefaultWorkspace] = useState<string | null>(null)
  const activeCwd = currentSession?.cwd || (currentSessionId ? sessionConfigs[currentSessionId]?.workspace : null) || defaultWorkspace || null

  const displayFolder = useMemo(() => {
    if (!activeCwd) return t('workspace.default', '默认工作区')
    const parts = activeCwd.replace(/\\/g, '/').split('/').filter(Boolean)
    return parts[parts.length - 1] || activeCwd
  }, [activeCwd])

  const [headerGit, setHeaderGit] = useState<{ branch?: string; isClean?: boolean } | null>(null)
  const [headerRule, setHeaderRule] = useState<{ has: boolean; fileName: string | null } | null>(null)

  useEffect(() => {
    window.electronAPI?.agent?.getWorkspace?.(currentSessionId ?? undefined).then((ws) => {
      if (ws) setDefaultWorkspace(ws)
    }).catch(() => {})

    window.electronAPI?.git?.status?.({ sessionId: currentSessionId ?? undefined }).then((res) => {
      if (res?.success && res.branch) {
        setHeaderGit({ branch: res.branch, isClean: (res.dirtyCount ?? 0) === 0 })
      } else {
        setHeaderGit(null)
      }
    }).catch(() => {})

    window.electronAPI?.agent?.hasProjectInstructions?.(currentSessionId ?? undefined).then((res) => {
      if (res?.has) {
        setHeaderRule({ has: true, fileName: res.fileName })
      } else {
        setHeaderRule(null)
      }
    }).catch(() => {})
  }, [currentSessionId, activeCwd])

  // Trust badge
  const [trustBadge, setTrustBadge] = useState<{ trust: number; color: string; label: string } | null>(null)
  useEffect(() => {
    if (!currentSessionId) { setTrustBadge(null); return }
    window.electronAPI.trust.badge({ sessionId: currentSessionId }).then((badge: any) => {
      if (badge) setTrustBadge(badge)
    }).catch(() => {})
  }, [currentSessionId])

  const handlePickCwd = useCallback(async () => {
    if (isStreaming) return
    try {
      const picked = await window.electronAPI?.system?.pickDirectory?.()
      if (!picked) return
      if (currentSessionId) {
        await setSessionCwd(picked)
      } else {
        await window.electronAPI?.agent?.setWorkspace?.({ dir: picked })
      }
      setDefaultWorkspace(picked)
    } catch {}
  }, [currentSessionId, isStreaming, setSessionCwd])

  const handleOpenCwd = useCallback(async () => {
    const target = activeCwd || (await window.electronAPI?.agent?.getWorkspace?.(currentSessionId ?? undefined))
    if (target) window.electronAPI?.system?.openPath?.(target)
  }, [activeCwd, currentSessionId])

  // Consolidated Header Control Group: Split Run + Unified Workspace/CWD Capsule + On-Demand Search & Timeline
  const renderHeaderControls = () => (
    <div className="flex items-center gap-1.5 shrink-0 ml-auto app-no-drag">
      {/* Collapsible Arena Model A vs Model B Selectors (visible only when Split Run is active) */}
      {chatMode === 'arena' && (
        <div className="flex items-center gap-1 shrink-0 animate-fade-in">
          <div
            className="h-7 flex items-center gap-1 px-1 rounded-[6px] border"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
          >
            <select
              value={localArenaIds[0] ?? ''}
              onChange={(e) => setModelSlot(0, Number(e.target.value) || null)}
              aria-label={t('chat.arena.model1')}
              className="h-5.5 text-[11px] font-medium px-1.5 rounded-[4px] border-0 outline-none max-w-[125px] truncate cursor-pointer transition-colors"
              style={{ backgroundColor: 'var(--content-bg)', color: 'var(--text-primary)' }}
            >
              <option value="">{t('chat.arena.model1')}</option>
              {allArenaModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{scoreByModel[m.id] ? ` (${scoreByModel[m.id]})` : ''}
                </option>
              ))}
            </select>
            <span className="text-[9.5px] font-mono font-semibold px-0.5 select-none" style={{ color: 'var(--text-muted)' }}>
              VS
            </span>
            <select
              value={localArenaIds[1] ?? ''}
              onChange={(e) => setModelSlot(1, Number(e.target.value) || null)}
              aria-label={t('chat.arena.model2')}
              className="h-5.5 text-[11px] font-medium px-1.5 rounded-[4px] border-0 outline-none max-w-[125px] truncate cursor-pointer transition-colors"
              style={{ backgroundColor: 'var(--content-bg)', color: 'var(--text-primary)' }}
            >
              <option value="">{t('chat.arena.model2')}</option>
              {allArenaModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{scoreByModel[m.id] ? ` (${scoreByModel[m.id]})` : ''}
                </option>
              ))}
            </select>
          </div>

          <select
            value={arenaTemperatures ? arenaTemperatures.join(',') : ''}
            onChange={(e) => {
              const v = e.target.value
              setArenaTemperatures(v ? v.split(',').map(Number) : null)
            }}
            title={t('chat.arena.temp_title')}
            className="hidden lg:block h-7 text-[11px] font-medium px-1.5 rounded-[6px] border outline-none max-w-[95px] transition-colors cursor-pointer"
            style={{ backgroundColor: 'var(--content-bg)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <option value="">{t('chat.arena.single')}</option>
            <option value="0.2,0.8">{t('chat.arena.temp_pair')}</option>
            <option value="0.2,0.5,0.8">{t('chat.arena.temp_triple')}</option>
          </select>
        </div>
      )}

      {/* One-Click Split Run Toggle (In-Chat Dual-Model Code Patch Comparison) */}
      <Tooltip
        text={
          chatMode === 'arena'
            ? t('chat.split_run.exit')
            : t('chat.split_run.desc')
        }
      >
        <button
          type="button"
          onClick={handleToggleSplitRun}
          className="h-7 flex items-center gap-1 px-2 rounded-[6px] border text-[11px] font-medium transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer select-none"
          style={
            chatMode === 'arena'
              ? {
                  backgroundColor: 'var(--accent)',
                  borderColor: 'var(--accent)',
                  color: 'var(--accent-fg, #FFFFFF)',
                }
              : {
                  backgroundColor: 'var(--content-bg)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-secondary)',
                }
          }
          aria-pressed={chatMode === 'arena'}
        >
          <Swords size={12} className="shrink-0" style={{ color: chatMode === 'arena' ? 'currentColor' : 'var(--accent)' }} />
          <span>Split Run</span>
        </button>
      </Tooltip>

      {/* Unified Workspace / CWD / Git / AGENTS.md Capsule */}
      <div
        className="h-7 flex items-center rounded-[6px] border text-xs overflow-hidden"
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
      >
        <Tooltip
          text={`${t('cwd.browse', '点击切换工作目录')} · ${activeCwd || '~/.aetherai'}${headerGit?.branch ? ` (${headerGit.branch})` : ''}${headerRule?.has ? ` · [${headerRule.fileName || 'Rules'}]` : ''}`}
        >
          <button
            type="button"
            onClick={handlePickCwd}
            disabled={isStreaming}
            className="h-full flex items-center gap-1.5 px-2 text-xs font-medium transition-colors hover:bg-[var(--content-bg)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 cursor-pointer"
            style={{ color: 'var(--text-primary)' }}
            aria-label="Workspace Directory"
          >
            {headerGit ? (
              <FolderGit2 size={12} className="text-[var(--accent)] shrink-0" />
            ) : (
              <Folder size={12} className="text-[var(--accent)] shrink-0" />
            )}
            <span className="truncate max-w-[120px] text-[11px] font-medium">
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
            {headerRule?.has && (
              <span
                className="px-1 py-0.2 rounded-[4px] border font-mono text-[9px] text-[var(--accent)] bg-[var(--content-bg)] shrink-0"
                style={{ borderColor: 'var(--border)' }}
              >
                {headerRule.fileName || 'Rules'}
              </span>
            )}
          </button>
        </Tooltip>

        <Tooltip text={t('cwd.reveal', '在文件资源管理器中打开')}>
          <button
            type="button"
            onClick={handleOpenCwd}
            className="h-full px-1.5 border-l flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--content-bg)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
            style={{ borderColor: 'var(--border)' }}
            aria-label={t('cwd.reveal', '在文件资源管理器中打开')}
          >
            <ExternalLink size={11} />
          </button>
        </Tooltip>
      </div>

      {/* Session-level Search & Timeline triggers */}
      {currentSessionId && (
        <>
          <Tooltip text={t('chat.search_placeholder', '搜索对话内容 (Ctrl+F)')}>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('aether:toggle-chat-search'))}
              className="h-7 w-7 flex items-center justify-center rounded-[6px] border text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
              aria-label={t('chat.search_placeholder', '搜索对话内容')}
            >
              <Search size={12} />
            </button>
          </Tooltip>

          <Tooltip text={t('chat.review_tooltip')}>
            <button
              type="button"
              onClick={() => setShowReview((v) => !v)}
              className="h-7 flex items-center gap-1.5 px-2 rounded-[6px] border text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
              style={{
                borderColor: showReview ? 'var(--accent)' : 'var(--border)',
                backgroundColor: showReview ? 'var(--bg-secondary)' : 'var(--content-bg)',
              }}
              aria-label={t('chat.review_tooltip')}
            >
              <FileDiff size={12} style={{ color: reviewSummary.fileCount > 0 ? 'var(--accent)' : 'var(--text-muted)' }} />
              <span className="hidden sm:inline">{t('chat.review_btn')}</span>
              {reviewSummary.fileCount > 0 && (
                <span className="flex items-center gap-1 font-mono text-[10.5px] font-semibold tabular-nums">
                  {reviewSummary.totalAdded > 0 && (
                    <span style={{ color: 'var(--success)' }}>+{reviewSummary.totalAdded}</span>
                  )}
                  {reviewSummary.totalRemoved > 0 && (
                    <span style={{ color: 'var(--error)' }}>-{reviewSummary.totalRemoved}</span>
                  )}
                </span>
              )}
            </button>
          </Tooltip>

          <Tooltip text={t('agent.timeline.view_toggle', '运行时间线')}>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('aether:toggle-run-timeline'))}
              className="h-7 flex items-center gap-1 px-2 rounded-[6px] border text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] transition-colors cursor-pointer"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
              aria-label={t('agent.timeline.view_toggle', '运行时间线')}
            >
              <History size={12} style={{ color: 'var(--accent)' }} />
              <span className="hidden sm:inline">{t('agent.timeline.view_toggle', '时间线')}</span>
            </button>
          </Tooltip>
        </>
      )}
    </div>
  )

  // ── Blank new chat — empty state ──
  if (!currentSessionId) {
    return (
      <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden bg-transparent">
        <div className="h-12 border-b flex items-center justify-between px-4 shrink-0 bg-[var(--content-bg)] app-drag wco-pr relative z-[2]" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 min-w-0 mr-3">
            <span className="text-sm font-semibold truncate tracking-tight" style={{ color: 'var(--text-primary)' }}>{t('chat.new')}</span>
          </div>
          {renderHeaderControls()}
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto scroll-bounce px-4 pt-6 pb-4 relative z-[1]">
          <div className="my-auto w-full max-w-3xl mx-auto flex flex-col items-center">
            <EmptyState />
          </div>
        </div>
        <div className="relative z-[2]">
          <ChatInput />
        </div>
      </div>
    )
  }

  // ── Active chat ──
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-transparent relative overflow-hidden">
      <div className="h-12 border-b flex items-center justify-between px-4 shrink-0 bg-[var(--content-bg)] app-drag wco-pr relative z-[2]" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1 max-w-[360px] mr-3 app-no-drag">
          {trustBadge && currentSessionId && (
            <Tooltip text={`Trust: ${trustBadge.trust}/100 · ${TRUST_TIP[trustBadge.color] || trustBadge.label}`}>
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: TRUST_DOT[trustBadge.color] || 'var(--text-muted)' }} />
            </Tooltip>
          )}
          <HoverMarquee
            text={activeSessionTitle}
            className="text-sm font-semibold tracking-tight flex-1 min-w-0"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        {renderHeaderControls()}
      </div>

      <ContextBar />
      <ChatWindow />
      <div className="relative z-20">
        <ChatInput />
      </div>
      <SessionReviewDrawer
        sessionId={currentSessionId}
        isOpen={showReview}
        onClose={() => setShowReview(false)}
        summary={reviewSummary}
      />
    </div>
  )
}
