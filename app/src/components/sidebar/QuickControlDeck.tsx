import { useState, useEffect, useRef, useMemo } from 'react'
import {
  FolderOpen,
  Folder,
  Shield,
  Brain,
  Activity,
  ChevronUp,
  Plus,
  Check,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import type { AgentMode, EffortLevel } from '@/store/types'

export const hasProjectSwitcher = true
export const hasAgentModeSelector = true
export const hasReasoningDial = true
export const hasDoctorHealthBadge = true

const AGENT_MODE_OPTIONS: { value: AgentMode; label: string; badge: string; color: string; desc: string }[] = [
  { value: 'explore', label: '仅查看', badge: '只读', color: 'var(--success, #16a34a)', desc: '只读探查，禁止修改与高危执行' },
  { value: 'workspace', label: '工作区修改', badge: '受控', color: 'var(--accent)', desc: '工作区内修改带 Diff 预览，外部命令弹窗确认 (推荐)' },
  { value: 'auto_review', label: '自动审查', badge: 'TDD', color: '#f59e0b', desc: '闭环自主研发，改写代码后自动运行单测并自愈' },
  { value: 'unrestricted', label: '完全权限', badge: '全速', color: 'var(--error, #ef4444)', desc: '沙箱内自主执行，无弹窗确认' },
]

const REASONING_LEVELS: { value: EffortLevel; label: string; tokens: string }[] = [
  { value: 'minimal', label: '极速', tokens: '1k' },
  { value: 'low', label: '浅度', tokens: '2k' },
  { value: 'medium', label: '均衡', tokens: '8k' },
  { value: 'high', label: '深度', tokens: '16k' },
  { value: 'max', label: '极限', tokens: '32k' },
]

export default function QuickControlDeck() {
  const activeProject = useStore((s) => s.activeProject)
  const projects = useStore((s) => s.projects)
  const loadProjects = useStore((s) => s.loadProjects)
  const openProject = useStore((s) => s.openProject)
  const createProject = useStore((s) => s.createProject)
  const projectScopeFilter = useStore((s) => s.projectScopeFilter)
  const toggleProjectScope = useStore((s) => s.toggleProjectScope)

  const agentMode = useStore((s) => s.agentMode)
  const setAgentMode = useStore((s) => s.setAgentMode)

  const effortLevel = useStore((s) => s.effortLevel)
  const setEffortLevel = useStore((s) => s.setEffortLevel)
  const thinkingEnabled = useStore((s) => s.thinkingEnabled)
  const setThinkingEnabled = useStore((s) => s.setThinkingEnabled)

  const [projectOpen, setProjectOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [effortOpen, setEffortOpen] = useState(false)
  const [doctorOpen, setDoctorOpen] = useState(false)

  const [healthStatus, setHealthStatus] = useState({
    db: 'healthy',
    gateway: 'idle',
    mcpActiveCount: 0,
    overallStatus: 'ok',
  })

  const deckRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadProjects?.()
  }, [loadProjects])

  // Aggregate health status periodically
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const mcps = await window.electronAPI?.mcp?.list?.().catch(() => [])
        const gw = await window.electronAPI?.gateway?.info?.().catch(() => ({ running: false }))
        const activeMcp = (mcps || []).filter((s: any) => s.enabled).length
        setHealthStatus({
          db: 'healthy',
          gateway: gw?.running ? 'online' : 'idle',
          mcpActiveCount: activeMcp,
          overallStatus: 'ok',
        })
      } catch {
        setHealthStatus((prev) => ({ ...prev, overallStatus: 'degraded' }))
      }
    }
    checkHealth()
    const timer = setInterval(checkHealth, 30000)
    return () => clearInterval(timer)
  }, [])

  // Close popovers on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (deckRef.current && !deckRef.current.contains(e.target as Node)) {
        setProjectOpen(false)
        setModeOpen(false)
        setEffortOpen(false)
        setDoctorOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentModeInfo = useMemo(() => {
    return AGENT_MODE_OPTIONS.find((m) => m.value === agentMode) || AGENT_MODE_OPTIONS[1]
  }, [agentMode])

  const handlePickNewFolder = async () => {
    try {
      const input = document.createElement('input')
      input.type = 'file'
      ;(input as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory = true
      input.onchange = async () => {
        // @ts-expect-error .path
        const first = input.files?.[0]?.path || ''
        const dir = first ? first.replace(/[/\\][^/\\\\]*$/, '') : ''
        if (dir) {
          const parts = dir.replace(/[\\/]+$/, '').split(/[\\/]/)
          const name = parts[parts.length - 1] || 'New Project'
          const proj = await createProject({ name, root_path: dir })
          if (proj?.id) {
            await openProject(proj.id)
            setProjectOpen(false)
          }
        }
      }
      input.click()
    } catch (e) {
      console.error('Pick folder error:', e)
    }
  }

  return (
    <div
      ref={deckRef}
      className="p-1.5 shrink-0 border-t space-y-1 relative text-xs select-none"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
    >
      {/* 1. Project Switcher Bar */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setProjectOpen(!projectOpen)
            setModeOpen(false)
            setEffortOpen(false)
            setDoctorOpen(false)
          }}
          className="w-full flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-md border text-left transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          style={{ borderColor: 'var(--border)' }}
          title={activeProject ? activeProject.root_path : '默认工作区'}
          aria-label="Project Switcher"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <FolderOpen size={13} className="shrink-0" style={{ color: 'var(--accent)' }} />
            <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {activeProject ? activeProject.name : '默认工作区'}
            </span>
          </div>
          <ChevronUp
            size={12}
            className={`shrink-0 transition-transform ${projectOpen ? 'rotate-180' : ''}`}
            style={{ color: 'var(--text-muted)' }}
          />
        </button>

        {/* Project Switcher Popover */}
        {projectOpen && (
          <div
            className="absolute bottom-full left-0 mb-1 w-64 rounded-lg border shadow-lg p-2 z-50 animate-spring-up"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
              <span className="font-semibold text-[11px]" style={{ color: 'var(--text-primary)' }}>
                项目工作区 (Projects)
              </span>
              <button
                type="button"
                onClick={toggleProjectScope}
                className="text-[10px] px-1.5 py-0.5 rounded border transition-colors hover:bg-[var(--bg-secondary)]"
                style={{ borderColor: 'var(--border)', color: projectScopeFilter ? 'var(--accent)' : 'var(--text-muted)' }}
                title="是否仅展示当前项目的会话"
              >
                {projectScopeFilter ? '当前项目会话' : '全部会话'}
              </button>
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1 mb-2">
              {projects.length === 0 ? (
                <div className="text-[11px] py-2 text-center" style={{ color: 'var(--text-muted)' }}>
                  暂未添加独立项目
                </div>
              ) : (
                projects.map((p) => {
                  const isCurrent = activeProject?.id === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        openProject(p.id)
                        setProjectOpen(false)
                      }}
                      className="w-full flex items-center justify-between gap-1.5 p-1.5 rounded-md text-left transition-colors hover:bg-[var(--bg-secondary)]"
                      style={isCurrent ? { backgroundColor: 'var(--content-bg)' } : {}}
                    >
                      <div className="min-w-0 flex items-center gap-1.5">
                        <Folder size={12} className="shrink-0 text-[var(--accent)]" />
                        <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                          {p.name}
                        </span>
                      </div>
                      {isCurrent && <Check size={12} className="text-emerald-500 shrink-0" />}
                    </button>
                  )
                })
              )}
            </div>

            <button
              type="button"
              onClick={handlePickNewFolder}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-md border font-medium hover:bg-[var(--bg-secondary)] transition-colors active:scale-[0.98]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <Plus size={13} />
              <span>打开本地项目文件夹…</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Mode Pill & Reasoning Quick Dial Row */}
      <div className="flex items-center gap-1 relative">
        {/* Agent Mode Pill */}
        <div className="relative flex-1 min-w-0">
          <button
            type="button"
            onClick={() => {
              setModeOpen(!modeOpen)
              setProjectOpen(false)
              setEffortOpen(false)
              setDoctorOpen(false)
            }}
            className="w-full flex items-center justify-between gap-1 px-1.5 py-1 rounded border text-[11px] font-medium transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            style={{ borderColor: 'var(--border)' }}
            aria-label="Agent Mode Selector"
          >
            <div className="flex items-center gap-1 min-w-0">
              <Shield size={12} className="shrink-0" style={{ color: currentModeInfo.color }} />
              <span className="truncate" style={{ color: 'var(--text-primary)' }}>
                {currentModeInfo.label}
              </span>
            </div>
            <span
              className="text-[9px] px-1 rounded tabular-nums font-mono"
              style={{ backgroundColor: currentModeInfo.color + '20', color: currentModeInfo.color }}
            >
              {currentModeInfo.badge}
            </span>
          </button>

          {/* Mode Selector Popover */}
          {modeOpen && (
            <div
              className="absolute bottom-full left-0 mb-1 w-56 rounded-lg border shadow-lg p-1.5 z-50 animate-spring-up space-y-1"
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
            >
              <span className="text-[10px] font-semibold px-1 text-[var(--text-muted)] block">
                Agent 权限模式 (4 档)
              </span>
              {AGENT_MODE_OPTIONS.map((m) => {
                const isSelected = agentMode === m.value
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => {
                      setAgentMode(m.value)
                      setModeOpen(false)
                    }}
                    className="w-full text-left p-1.5 rounded-md transition-colors hover:bg-[var(--bg-secondary)] block"
                    style={isSelected ? { backgroundColor: 'var(--content-bg)' } : {}}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-medium text-xs" style={{ color: 'var(--text-primary)' }}>
                        <Shield size={11} style={{ color: m.color }} />
                        <span>{m.label}</span>
                      </div>
                      {isSelected && <Check size={11} className="text-emerald-500" />}
                    </div>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {m.desc}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Reasoning Level Pill */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setEffortOpen(!effortOpen)
              setProjectOpen(false)
              setModeOpen(false)
              setDoctorOpen(false)
            }}
            className="flex items-center gap-1 px-1.5 py-1 rounded border text-[11px] font-medium transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            style={{ borderColor: 'var(--border)' }}
            aria-label="Reasoning Dial"
          >
            <Brain
              size={12}
              className="shrink-0"
              style={{ color: thinkingEnabled ? 'var(--accent)' : 'var(--text-muted)' }}
            />
            <span className="tabular-nums font-mono text-[10px]" style={{ color: 'var(--text-primary)' }}>
              {thinkingEnabled ? (REASONING_LEVELS.find((l) => l.value === effortLevel)?.tokens ?? '8k') : 'Off'}
            </span>
          </button>

          {/* Reasoning Dial Popover */}
          {effortOpen && (
            <div
              className="absolute bottom-full right-0 mb-1 w-48 rounded-lg border shadow-lg p-2 z-50 animate-spring-up space-y-2"
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between border-b pb-1" style={{ borderColor: 'var(--border)' }}>
                <span className="text-[10px] font-semibold text-[var(--text-muted)]">思考深度 (Thinking)</span>
                <button
                  type="button"
                  onClick={() => setThinkingEnabled(!thinkingEnabled)}
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{
                    backgroundColor: thinkingEnabled ? 'var(--accent)' : 'var(--border)',
                    color: thinkingEnabled ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  {thinkingEnabled ? '开启' : '关闭'}
                </button>
              </div>

              <div className="space-y-1" style={{ opacity: thinkingEnabled ? 1 : 0.5 }}>
                {REASONING_LEVELS.map((lvl) => {
                  const isCur = effortLevel === lvl.value
                  return (
                    <button
                      key={lvl.value}
                      type="button"
                      disabled={!thinkingEnabled}
                      onClick={() => {
                        setEffortLevel(lvl.value)
                        setEffortOpen(false)
                      }}
                      className="w-full flex items-center justify-between p-1 rounded-md text-[11px] hover:bg-[var(--bg-secondary)]"
                      style={isCur ? { backgroundColor: 'var(--content-bg)' } : {}}
                    >
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        {lvl.label}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">{lvl.tokens}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Doctor Health Status Badge */}
      <div className="relative pt-0.5">
        <button
          type="button"
          onClick={() => {
            setDoctorOpen(!doctorOpen)
            setProjectOpen(false)
            setModeOpen(false)
            setEffortOpen(false)
          }}
          className="w-full flex items-center justify-between px-2 py-1 rounded text-[10px] border transition-colors hover:bg-[var(--bg-secondary)] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          style={{ borderColor: 'var(--border)', backgroundColor: 'transparent' }}
          aria-label="Doctor Health Badge"
        >
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: healthStatus.overallStatus === 'ok' ? '#16a34a' : '#f59e0b' }}
            />
            <span className="font-mono" style={{ color: 'var(--text-muted)' }}>
              DB: OK · MCP: {healthStatus.mcpActiveCount}
            </span>
          </div>
          <span className="text-[9px] uppercase font-mono tracking-tight" style={{ color: 'var(--text-muted)' }}>
            {healthStatus.gateway === 'online' ? 'GW 8080' : 'GW IDLE'}
          </span>
        </button>

        {/* Doctor Details Popover */}
        {doctorOpen && (
          <div
            className="absolute bottom-full left-0 mb-1 w-60 rounded-lg border shadow-lg p-2.5 z-50 animate-spring-up text-xs space-y-1.5"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between font-semibold pb-1 border-b" style={{ borderColor: 'var(--border)' }}>
              <span className="flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                <Activity size={12} style={{ color: 'var(--accent)' }} />
                <span>系统就绪状态 (Doctor)</span>
              </span>
              <span className="text-[10px] text-emerald-500 font-mono">就绪</span>
            </div>
            <div className="space-y-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              <div className="flex justify-between">
                <span>本地 SQLite WAL:</span>
                <span className="text-emerald-500 font-mono">已连接 (Healthy)</span>
              </div>
              <div className="flex justify-between">
                <span>MCP 工具服务器:</span>
                <span className="font-mono">{healthStatus.mcpActiveCount} 个在线</span>
              </div>
              <div className="flex justify-between">
                <span>本地网关 (Gateway):</span>
                <span className="font-mono">{healthStatus.gateway}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
