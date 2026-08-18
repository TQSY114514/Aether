import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ensureAllListeners } from '@/store'
import { applyTheme } from '@/utils/theme'
import Sidebar from '@/components/sidebar/Sidebar'
import ChatPage from '@/pages/ChatPage'
import ModelPage from '@/pages/ModelPage'
import PersonaPage from '@/pages/PersonaPage'
import SettingPage from '@/pages/SettingPage'
import ScoresPage from '@/pages/ScoresPage'
import TokenPage from '@/pages/TokenPage'
import MemoryPage from '@/pages/MemoryPage'
import LearningGraphPage from '@/pages/LearningGraphPage'
import SkillsPage from '@/pages/SkillsPage'
import EvolutionPage from '@/pages/EvolutionPage'
import LearningStatusPage from '@/pages/LearningStatusPage'
import SecurityPage from '@/pages/SecurityPage'
import PermissionDialog from '@/components/chat/PermissionDialog'
import QuestionDialog from '@/components/chat/QuestionDialog'
import CommandPalette from '@/components/CommandPalette'
import ShortcutOverlay from '@/components/ShortcutOverlay'
import ErrorBoundary from '@/components/ErrorBoundary'
import CompletionToasts from '@/components/chat/CompletionToasts'
import FirstRunWizard from '@/components/onboarding/FirstRunWizard'
import { useFeatureFlag } from '@/utils/featureFlags'
import { PanelLeft } from 'lucide-react'
import { t } from '@/utils/i18n'
export default function App() {
  const currentView = useStore((s) => s.currentView)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const createSession = useStore((s) => s.createSession)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const loadProviders = useStore((s) => s.loadProviders)
  const loadSessions = useStore((s) => s.loadSessions)
  const loadPersonas = useStore((s) => s.loadPersonas)
  const loadScores = useStore((s) => s.loadScores)
  const loadAllModels = useStore((s) => s.loadAllModels)
  const loadSettings = useStore((s) => s.loadSettings)
  const loadModels = useStore((s) => s.loadModels)
  const selectSession = useStore((s) => s.selectSession)
  const sessions = useStore((s) => s.sessions)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const mainRef = useRef<HTMLDivElement>(null)
  const shortcutsOpenRef = useRef(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null)
  const backgroundImage = useStore((s) => s.backgroundImage)
  const backgroundOpacity = useStore((s) => s.backgroundOpacity)
  const backgroundBlur = useStore((s) => s.backgroundBlur)
  const hasBg = backgroundImage !== null
  const providers = useStore((s) => s.providers)
  // Onboarding wizard: first-run only (no providers + not completed). The flag
  // default is on; fallback=true so it shows before the flags snapshot loads.
  const showWizard = useFeatureFlag('ux.firstRunWizard', true)

  // Read whether onboarding was completed/dismissed (persisted in settings).
  useEffect(() => {
    let cancelled = false
    window.electronAPI.settings.get('onboarding_done').then((v) => {
      if (!cancelled) setOnboardingDone(v === '1')
    }).catch(() => { if (!cancelled) setOnboardingDone(false) })
    return () => { cancelled = true }
  }, [])

  // Keep shortcutsOpenRef in sync with state so the keyboard handler (empty dep
  // array) can read the current value without re-binding on every toggle.
  useEffect(() => { shortcutsOpenRef.current = shortcutsOpen }, [shortcutsOpen])

  // Ensure global IPC listeners are registered (idempotent).
  useEffect(() => { ensureAllListeners() }, [])

  // Warn before closing/refreshing while streaming or with unsent input.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const { sending, streamingBySession } = useStore.getState()
      if (sending || Object.keys(streamingBySession).length > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Window-level overscroll spring bounce: F = -k*off - b*vel
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    let off = 0, vel = 0, act = false
    const tick = () => {
      if (!act) return
      const f = -0.04 * off - 0.72 * vel
      vel += f; off += vel
      if (Math.abs(off) < 0.5 && Math.abs(vel) < 0.5) {
        act = false; off = 0; vel = 0
        root.style.transform = ''
        return
      }
      root.style.transform = `translateY(${off}px)`
      requestAnimationFrame(tick)
    }
    const kick = (v: number) => {
      vel += v; if (!act) { act = true; requestAnimationFrame(tick) }
    }
    const onWheel = (e: WheelEvent) => {
      const scroller = (e.target as HTMLElement).closest('[class*="overflow-y-auto"], .scroll-bounce')
      if (scroller) {
        const el = scroller as HTMLElement
        if ((el.scrollTop <= 0 && e.deltaY < 0) || (el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && e.deltaY > 0)) {
          e.preventDefault(); kick(e.deltaY * 0.06)
        }
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  const bgLoadedRef = useRef(false)
  const sessionAutoSelectedRef = useRef(false)

  useEffect(() => {
    const init = async () => {
      await Promise.all([
        loadSettings(),
        loadProviders(),
        loadSessions(),
        loadPersonas(),
        loadScores(),
        loadAllModels(),
      ])
      // Build modelsByProvider from the already-loaded allModels — avoids N
      // extra IPC round-trips (one per provider). This cuts startup time
      // significantly when multiple providers are configured.
      const allModels = useStore.getState().allModels
      const byProvider: Record<number, typeof allModels> = {}
      for (const m of allModels) {
        if (!byProvider[m.provider_id]) byProvider[m.provider_id] = []
        byProvider[m.provider_id].push(m)
      }
      useStore.setState({ modelsByProvider: byProvider })
      // Defer session auto-select and background-image load to next frame so
      // the EmptyState UI can paint first. This cuts perceived startup time.
      if (!sessionAutoSelectedRef.current) {
        sessionAutoSelectedRef.current = true
        requestAnimationFrame(async () => {
          const s = useStore.getState()
          if (s.sessions.length > 0 && !s.currentSessionId) {
            await s.selectSession(s.sessions[0].id)
          }
        })
      }
      if (!bgLoadedRef.current) {
        bgLoadedRef.current = true
        requestAnimationFrame(async () => {
          try {
            const dataUrl = await window.electronAPI.background.get()
            if (dataUrl) {
              applyTheme(useStore.getState().theme, true)
              useStore.setState({ backgroundImage: dataUrl })
            }
          } catch {}
        })
      }
    }
    init()
  }, [])

  // Protocol handler: respond to aetherai:// links
  useEffect(() => {
    const off = window.electronAPI?.protocol?.onOpen?.(async (payload: { action: string; workspace?: string }) => {
      if (payload.action === 'open' && payload.workspace) {
        // M6（2026-08 安全审计）：深链可静默切换 agent 工作区，先展示完整
        // 路径让用户确认；取消则不发生任何变更。
        const ok = window.confirm(`是否将 Aether 的 Agent 工作区切换到：\n${payload.workspace}`)
        if (!ok) return
        // 右键/协议「用 Aether 打开文件夹」→ 设为 agent 工作区 + 新建会话
        try { await window.electronAPI?.agent?.setWorkspace?.({ dir: payload.workspace }) } catch {}
        useStore.getState().newChat()
        return
      }
      if (payload.action === 'new' || payload.action === 'chat') {
        useStore.getState().newChat()
      }
      // 'tui' 动作属终端形态，桌面无对应 UI，忽略
    })
    return () => off?.()
  }, [])

  // Keyboard shortcuts — use getState() to avoid re-binding on every store change.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '?') {
        e.preventDefault()
        setShortcutsOpen(o => !o)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setShortcutsOpen(o => !o)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        useStore.getState().newChat()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        const s = useStore.getState()
        if (s.currentSessionId && s.messages.length > 0) { e.preventDefault(); s.regenerate() }
        return
      }
      if (e.key === 'Escape') {
        if (shortcutsOpenRef.current) return // ShortcutOverlay handles its own ESC
        const s = useStore.getState()
        if (s.sending) { e.preventDefault(); s.stopGeneration() }
        else if (s.currentView !== 'chat') s.setCurrentView('chat')
      }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); useStore.getState().goBack() }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); useStore.getState().goForward() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const renderPage = () => {
    switch (currentView) {
      case 'chat': return <ChatPage />
      case 'models': return <ModelPage />
      case 'agents': return <PersonaPage />
      case 'settings': return <SettingPage />
      case 'scores': return <ScoresPage />
      case 'tokens': return <TokenPage />
      case 'memory': return <MemoryPage />
      case 'learning': return <LearningGraphPage />
      case 'skills': return <SkillsPage />
      case 'evolution': return <EvolutionPage />
      case 'learningStatus': return <LearningStatusPage />
      case 'security': return <SecurityPage />
    }
  }

  return (
    <ErrorBoundary>
      <div ref={mainRef} className="flex h-full w-full" style={{ backgroundColor: hasBg ? 'transparent' : 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        {hasBg && (
          <div aria-hidden className="fixed inset-0 pointer-events-none"
            style={{
              zIndex: 0,
              backgroundImage: `url("${backgroundImage}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
              opacity: backgroundOpacity / 100,
              transform: backgroundBlur > 0 ? 'scale(1.05)' : undefined,
            }} />
        )}
        {sidebarOpen ? (
          <Sidebar />
        ) : (
          /* Collapsed: slim expand rail with a single button — visible on every
             view (chat, settings, memory, ...), not just chat. */
          <div className="w-10 shrink-0 flex flex-col items-center pt-3" style={{ borderRight: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)' }}>
            <button onClick={toggleSidebar} aria-label="Open sidebar" title={t('sidebar.nav.expand')}
              className="p-1.5 rounded-md hover:bg-[var(--border)] transition-colors">
              <PanelLeft size={16} className="text-[var(--text-muted)]" />
            </button>
          </div>
        )}
        <main className="flex-1 flex flex-col min-w-0 relative" style={{ zIndex: 1 }}>
          {renderPage()}
        </main>
        <CompletionToasts />
        <PermissionDialog />
        <QuestionDialog />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <ShortcutOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        {showWizard && onboardingDone === false && providers.length === 0 && (
          <FirstRunWizard onDone={() => setOnboardingDone(true)} />
        )}
      </div>
    </ErrorBoundary>
  )
}
