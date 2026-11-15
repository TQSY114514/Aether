import { useEffect, useRef, useState } from 'react'
import { Play, RotateCcw, Swords, ShieldCheck, Layers, CheckCircle2, Terminal } from 'lucide-react'

type Lang = 'zh' | 'en'
type StepId = 'arena' | 'vote' | 'act-rollback' | 'memory' | 'reset'

const COPY = {
  zh: {
    badge: 'LIVE INTERACTIVE WORKBENCH · 45S DEMO',
    title: 'Aether 本地多模型桌面工作台',
    subtitle: '真实渲染进程直接挂载于脚本化 IPC 桥接之上：体验双模型盲测对比、投票定榜、Act 模式写前快照回滚与工作区记忆巩固。',
    steps: [
      { id: 'arena' as const, label: '1. 触发 Arena 盲测', hint: '并行运行两个候选补丁' },
      { id: 'vote' as const, label: '2. 盲测投票定榜', hint: '写入本地 ELO 并胜出' },
      { id: 'act-rollback' as const, label: '3. Act 补丁与快照', hint: '写前备份支持一键回滚' },
      { id: 'memory' as const, label: '4. 记忆摘要与隔离', hint: '查看工作区 Digest 与 H5 隔离' },
    ],
    reset: '重置演示',
    footnote: '无需后端密钥 · 全流程运行真实 Aether React/Zustand UI 组件树',
  },
  en: {
    badge: 'LIVE INTERACTIVE WORKBENCH · 45S DEMO',
    title: 'Aether Local-First Multi-Model Workbench',
    subtitle: 'The real GUI renderer mounted directly on a scripted ElectronAPI bridge: blind dual-model Arena battle, ELO vote, Act pre-write snapshot rollback, and workspace memory digest.',
    steps: [
      { id: 'arena' as const, label: '1. Run Arena Battle', hint: 'Parallel candidate patches' },
      { id: 'vote' as const, label: '2. Vote Winner', hint: 'Update local ELO ratings' },
      { id: 'act-rollback' as const, label: '3. Act Patch & Snapshot', hint: 'Pre-write checkpoint ready' },
      { id: 'memory' as const, label: '4. Memory Digest', hint: 'H5-isolated workspace summary' },
    ],
    reset: 'Reset',
    footnote: 'Zero API keys required · Runs the unmodified Aether React/Zustand renderer',
  },
}

export default function Site() {
  const [lang, setLang] = useState<Lang>('zh')
  const [activeStep, setActiveStep] = useState<StepId | null>(null)
  const [demoReady, setDemoReady] = useState(false)
  const [arenaStatus, setArenaStatus] = useState<'idle' | 'running' | 'ready'>('idle')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const copy = COPY[lang]

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const iframeWin = iframeRef.current?.contentWindow
      if (!iframeWin || event.source !== iframeWin) return
      const data = event.data
      if (!data || typeof data.type !== 'string') return
      if (data.type === 'aether-demo:ready') {
        setDemoReady(true)
      } else if (data.type === 'aether-demo:reset-done') {
        setDemoReady(true)
        setArenaStatus('idle')
      } else if (data.type === 'aether-demo:arena-done') {
        setArenaStatus(Number(data.count) > 0 ? 'ready' : 'idle')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const toggleLang = () => {
    setDemoReady(false)
    setArenaStatus('idle')
    setActiveStep(null)
    setLang(lang === 'zh' ? 'en' : 'zh')
  }

  const sendCommand = (step: StepId) => {
    if (!demoReady) return
    if (step === 'vote' && arenaStatus !== 'ready') return
    if (step === 'reset') {
      setActiveStep(null)
      setArenaStatus('idle')
    } else {
      setActiveStep(step)
      if (step === 'arena') setArenaStatus('running')
    }
    iframeRef.current?.contentWindow?.postMessage({ type: 'aether-demo:command', step }, '*')
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <header
        className="border-b px-6 py-4"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
      >
        <div className="max-w-6xl mx-auto flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
              <Terminal size={12} />
              <span>{copy.badge}</span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
            <p className="text-xs max-w-3xl" style={{ color: 'var(--text-secondary)' }}>
              {copy.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={toggleLang}
              className="px-3 py-1.5 text-xs font-mono rounded-md border hover:bg-[var(--bg-secondary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] active:opacity-80 transition-colors motion-reduce:transition-none"
              style={{ borderColor: 'var(--border)' }}
            >
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
            <button
              onClick={() => sendCommand('reset')}
              disabled={!demoReady}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border hover:bg-[var(--bg-secondary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] active:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none"
              style={{ borderColor: 'var(--border)' }}
            >
              <RotateCcw size={12} />
              <span>{copy.reset}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {copy.steps.map((s, idx) => {
            const isSelected = activeStep === s.id
            const isDisabled = !demoReady || (s.id === 'vote' && arenaStatus !== 'ready')
            const Icon = idx === 0 ? Swords : idx === 1 ? CheckCircle2 : idx === 2 ? ShieldCheck : Layers
            return (
              <button
                key={s.id}
                onClick={() => sendCommand(s.id)}
                disabled={isDisabled}
                className="text-left px-3.5 py-2.5 rounded-lg border transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] active:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                style={isSelected
                  ? { borderColor: 'var(--accent)', backgroundColor: 'var(--accent)', color: '#FFFFFF' }
                  : { borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)', color: 'var(--text-primary)' }}
              >
                <div className="flex items-center justify-between gap-2 text-xs font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon size={13} />
                    {s.label}
                  </span>
                  <Play size={11} className="opacity-70" />
                </div>
                <p
                  className="text-[11px] mt-1"
                  style={{ color: isSelected ? 'rgba(255,255,255,0.82)' : 'var(--text-secondary)' }}
                >
                  {s.hint}
                </p>
              </button>
            )
          })}
        </div>

        <div
          className="flex-1 min-h-[640px] rounded-lg border overflow-hidden shadow-sm"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
        >
          <iframe
            ref={iframeRef}
            key={lang}
            src={`./demo.html?lang=${lang}`}
            title="Aether Live Workbench Demo"
            className="w-full h-[680px] border-0"
          />
        </div>

        <footer className="text-[11px] font-mono text-center pb-2" style={{ color: 'var(--text-muted)' }}>
          {copy.footnote}
        </footer>
      </main>
    </div>
  )
}
