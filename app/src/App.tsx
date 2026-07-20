import { useEffect, useCallback, useRef, useState } from 'react'
import { useStore } from '@/store'
import Sidebar from '@/components/sidebar/Sidebar'
import ChatPage from '@/pages/ChatPage'
import ModelPage from '@/pages/ModelPage'
import PersonaPage from '@/pages/PersonaPage'
import SettingPage from '@/pages/SettingPage'
import ScoresPage from '@/pages/ScoresPage'
import TokenPage from '@/pages/TokenPage'
import MemoryPage from '@/pages/MemoryPage'
import LearningGraphPage from '@/pages/LearningGraphPage'
import PermissionDialog from '@/components/chat/PermissionDialog'
import QuestionDialog from '@/components/chat/QuestionDialog'
import CommandPalette from '@/components/CommandPalette'
import ErrorBoundary from '@/components/ErrorBoundary'
import { t } from '@/utils/i18n'

export default function App() {
  const currentView = useStore((s) => s.currentView)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const createSession = useStore((s) => s.createSession)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
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
  const [paletteOpen, setPaletteOpen] = useState(false)
  const backgroundImage = useStore((s) => s.backgroundImage)
  const backgroundOpacity = useStore((s) => s.backgroundOpacity)
  const backgroundBlur = useStore((s) => s.backgroundBlur)
  const hasBg = backgroundImage !== null

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

  useEffect(() => {
    const init = async () => {
      // These 6 loads are independent IPC round-trips — run them in parallel
      // instead of serially to cut cold-start latency (was 6+N serial awaits).
      await Promise.all([
        loadSettings(),
        loadProviders(),
        loadSessions(),
        loadPersonas(),
        loadScores(),
        loadAllModels(),
      ])
      // Per-provider model loads depend on loadAllModels resolving, but are
      // themselves independent — parallelize too.
      const providers = useStore.getState().providers
      if (providers.length) {
        await Promise.all(providers.map(p => loadModels(p.id)))
      }
      // Auto-select first session if none selected
      const s = useStore.getState().sessions
      if (s.length > 0 && !useStore.getState().currentSessionId) {
        await selectSession(s[0].id)
      }
    }
    init()
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl/Cmd+K toggles the command palette.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        createSession()
        setCurrentView('chat')
        return
      }
      // Ctrl/Cmd+R → regenerate the last assistant reply (browser-style re-roll).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        const s = useStore.getState()
        if (s.currentSessionId && s.messages.length > 0) { e.preventDefault(); s.regenerate() }
        return
      }
      // Esc during streaming → stop generation (Esc elsewhere → back to chat).
      if (e.key === 'Escape') {
        const s = useStore.getState()
        if (s.sending) { e.preventDefault(); s.stopGeneration() }
        else if (currentView !== 'chat') setCurrentView('chat')
      }
      // Alt+Left / Alt+Right — browser-style session back/forward.
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); useStore.getState().goBack() }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); useStore.getState().goForward() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentView, createSession, setCurrentView])

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
        {sidebarOpen && <Sidebar />}
        <main className="flex-1 flex flex-col min-w-0 relative" style={{ zIndex: 1 }}>
          {renderPage()}
        </main>
        <PermissionDialog />
        <QuestionDialog />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </div>
    </ErrorBoundary>
  )
}
