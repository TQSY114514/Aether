import React from 'react'
import ReactDOM from 'react-dom/client'
import '../../app/src/index.css'
import App from '@/App'
import { UIProvider } from '@/components/ui/feedback'
import { applyTheme } from '@/utils/theme'
import { useStore } from '@/store'
import { installDemoBridge } from './demo-bridge'

const params = new URLSearchParams(window.location.search)
const lang = params.get('lang') === 'en' ? 'en' : 'zh'
const { reset } = installDemoBridge(lang)
applyTheme('light', false)

let resetNonce = 0
let activeArenaPromise: Promise<unknown> | null = null

// Listen for step orchestration commands from the outer Site showcase chrome
window.addEventListener('message', async (event) => {
  const data = event.data as { type?: string; step?: string } | null
  if (!data || data.type !== 'aether-demo:command') return
  const store = useStore.getState()

  if (data.step === 'reset') {
    resetNonce++
    reset()
    // Wait for any canceled in-flight runArena() promise to settle its error/finally
    // handling before wiping the store so it cannot overwrite arenaError afterwards.
    if (activeArenaPromise) {
      await activeArenaPromise.catch(() => {})
    }
    useStore.setState({
      sending: false,
      arenaPending: 0,
      arenaResults: [],
      arenaResultsSessionId: null,
      arenaVoted: false,
      arenaVoteWinnerId: null,
      arenaError: null,
      streamingBySession: {},
      queuedMessages: [],
    })
    await store.loadSessions()
    await store.loadScores()
    store.setCurrentView('chat')
    await store.selectSession(101)
    window.parent?.postMessage({ type: 'aether-demo:reset-done' }, '*')
    return
  }

  if (data.step === 'arena') {
    const myReset = resetNonce
    store.setCurrentView('chat')
    await store.selectSession(101)
    store.setArenaModelIds([11, 12])
    const run = store.runArena(
      lang === 'zh'
        ? '对比修复 IdleGate 并发重入的最小补丁方案：先写冷却时间戳再检查 hasMaterial()。'
        : 'Compare minimal patches for IdleGate concurrency: stamp cooldown before hasMaterial().',
    )
    let tracked: Promise<unknown> | null = null
    tracked = run.finally(() => {
      if (activeArenaPromise === tracked) activeArenaPromise = null
    })
    activeArenaPromise = tracked
    await tracked
    if (myReset !== resetNonce) return
    window.parent?.postMessage(
      { type: 'aether-demo:arena-done', count: useStore.getState().arenaResults.length },
      '*',
    )
    return
  }

  if (data.step === 'vote') {
    const res = store.arenaResults
    if (res.length >= 2) {
      await store.arenaVote(res[0], res.slice(1))
    }
    return
  }

  if (data.step === 'act-rollback') {
    store.setCurrentView('chat')
    await store.selectSession(101)
    store.setAgentMode('act')
    await store.sendMessage(
      lang === 'zh'
        ? '在 Act 模式下应用最佳补丁并保存写前快照以测试回滚。'
        : 'Apply the winning patch in Act mode with a pre-write snapshot ready for rollback.',
    )
    return
  }

  if (data.step === 'memory') {
    store.setCurrentView('memory')
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UIProvider>
      <App />
    </UIProvider>
  </React.StrictMode>,
)

window.parent?.postMessage({ type: 'aether-demo:ready', lang }, '*')
