import { useMemo, useState, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import ChatWindow from '@/components/chat/ChatWindow'
import ChatInput from '@/components/chat/ChatInput'
import ContextBar from '@/components/chat/ContextBar'
import EmptyState from '@/components/chat/EmptyState'
import Tooltip from '@/components/Tooltip'
import HoverMarquee from '@/components/ui/HoverMarquee'
import { FolderGit2, Folder, ExternalLink, Search, History } from 'lucide-react'
import { t } from '@/utils/i18n'

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

  // Consolidated Header Control Group: Unified Workspace/CWD Capsule + On-Demand Search & Timeline
  const renderHeaderControls = () => (
    <div className="flex items-center gap-1.5 shrink-0 ml-auto app-no-drag">
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
    </div>
  )
}
