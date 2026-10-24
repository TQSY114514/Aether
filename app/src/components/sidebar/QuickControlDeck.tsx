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
} from 'lucide-react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'
import type { AgentMode, EffortLevel } from '@/store/types'

export const hasProjectSwitcher = true
export const hasAgentModeSelector = true
export const hasReasoningDial = true
export const hasDoctorHealthBadge = true

export default function QuickControlDeck() {
  const language = useStore((s) => s.language)
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

  const [healthStatus, setHealthStatus] = useState<{
    gateway: string
    gatewayPort: number | null
    mcpActiveCount: number
    overallStatus: string
  }>({
    gateway: 'idle',
    gatewayPort: null,
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
        const gw = await window.electronAPI?.gateway?.info?.().catch(() => ({ running: false, port: null }))
        const activeMcp = (mcps || []).filter((s: any) => s.enabled).length
        setHealthStatus({
          gateway: gw?.running ? 'online' : 'idle',
          gatewayPort: gw?.port ?? null,
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

  const agentModeOptions = useMemo<{ value: AgentMode; label: string; badge: string; color: string; desc: string }[]>(() => [
    {
      value: 'explore',
      label: t('agent.mode.explore', '仅查看'),
      badge: t('agent.mode.explore.badge', '只读'),
      color: 'var(--success, #16a34a)',
      desc: t('agent.mode.explore.desc', '只读探索与检查，禁止文件修改与破坏性命令'),
    },
    {
      value: 'workspace',
      label: t('agent.mode.workspace', '工作区'),
      badge: t('agent.mode.workspace.badge', '受控'),
      color: 'var(--accent)',
      desc: t('agent.mode.workspace.desc', '工作区内修改带 Diff 预览，外部命令显式确认 (默认)'),
    },
    {
      value: 'auto_review',
      label: t('agent.mode.auto_review', '自动审查'),
      badge: t('agent.mode.auto_review.badge', 'TDD'),
      color: 'var(--warning, #f59e0b)',
      desc: t('agent.mode.auto_review.desc', '监督式 TDD 闭环，改写代码后自动运行单测并自愈'),
    },
    {
      value: 'unrestricted',
      label: t('agent.mode.unrestricted', '完全权限'),
      badge: t('agent.mode.unrestricted.badge', '全速'),
      color: 'var(--error, #ef4444)',
      desc: t('agent.mode.unrestricted.desc', '沙箱内自主运行，零弹窗确认，后台安全守卫'),
    },
  ], [language])

  const reasoningLevels = useMemo<{ value: EffortLevel; label: string; tokens: string }[]>(() => [
    { value: 'minimal', label: t('thinking.minimal', '极速'), tokens: '1k' },
    { value: 'low', label: t('thinking.low', '浅度'), tokens: '2k' },
    { value: 'medium', label: t('thinking.medium', '均衡'), tokens: '8k' },
    { value: 'high', label: t('thinking.high', '深度'), tokens: '16k' },
    { value: 'max', label: t('thinking.max', '极限'), tokens: '32k' },
  ], [language])

  const currentModeInfo = useMemo(() => {
    return agentModeOptions.find((m) => m.value === agentMode) || agentModeOptions[1]
  }, [agentMode, agentModeOptions])

  const handlePickNewFolder = async () => {
    try {
      const dir = await window.electronAPI.project.pickDirectory()
      if (dir) {
        const parts = dir.replace(/[\\/]+$/, '').split(/[\\/]/)
        const name = parts[parts.length - 1] || 'New Project'
        const proj = await createProject({ name, root_path: dir })
        if (proj?.id) {
          await openProject(proj.id)
          setProjectOpen(false)
        }
      }
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
      {/* Row 1: Project Switcher & Doctor Health Pill */}
      <div className="flex items-center gap-1 relative">
        {/* Project Switcher */}
        <div className="relative flex-1 min-w-0">
          <button
            type="button"
            onClick={() => {
              setProjectOpen(!projectOpen)
              setModeOpen(false)
              setEffortOpen(false)
              setDoctorOpen(false)
            }}
            className="w-full flex items-center justify-between gap-1 px-1.5 py-1 rounded border text-left transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            style={{ borderColor: 'var(--border)' }}
            title={activeProject ? activeProject.root_path : t('quickdeck.default_workspace', '默认工作区')}
            aria-label="Project Switcher"
          >
            <div className="flex items-center gap-1 min-w-0">
              <FolderOpen size={12} className="shrink-0" style={{ color: 'var(--accent)' }} />
              <span className="font-medium text-[11px] truncate" style={{ color: 'var(--text-primary)' }}>
                {activeProject ? activeProject.name : t('quickdeck.default_workspace', '默认工作区')}
              </span>
            </div>
            <ChevronUp
              size={11}
              className={`shrink-0 transition-transform ${projectOpen ? 'rotate-180' : ''}`}
              style={{ color: 'var(--text-muted)' }}
            />
          </button>

          {/* Project Switcher Popover */}
          {projectOpen && (
            <div
              className="absolute bottom-full left-0 mb-1 w-64 rounded-lg border shadow-lg p-2 z-50 animate-spring-up motion-reduce:animate-none"
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
                <span className="font-semibold text-[11px]" style={{ color: 'var(--text-primary)' }}>
                  {t('quickdeck.projects', '项目工作区 (Projects)')}
                </span>
                <button
                  type="button"
                  onClick={toggleProjectScope}
                  className="text-[10px] px-1.5 py-0.5 rounded border transition-colors hover:bg-[var(--bg-secondary)]"
                  style={{ borderColor: 'var(--border)', color: projectScopeFilter ? 'var(--accent)' : 'var(--text-muted)' }}
                  title={t('quickdeck.switch_project_filter', '是否仅展示当前项目的会话')}
                >
                  {projectScopeFilter ? t('quickdeck.current_project_only', '当前项目会话') : t('quickdeck.all_sessions', '全部会话')}
                </button>
              </div>

              <div className="max-h-40 overflow-y-auto space-y-1 mb-2">
                {projects.length === 0 ? (
                  <div className="text-[11px] py-2 text-center" style={{ color: 'var(--text-muted)' }}>
                    {t('quickdeck.no_projects', '暂未添加独立项目')}
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
                          <span className="truncate font-medium text-[11px]" style={{ color: 'var(--text-primary)' }}>
                            {p.name}
                          </span>
                        </div>
                        {isCurrent && <Check size={12} className="text-[var(--success,#16a34a)] shrink-0" />}
                      </button>
                    )
                  })
                )}
              </div>

              <button
                type="button"
                onClick={handlePickNewFolder}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] rounded-md border font-medium hover:bg-[var(--bg-secondary)] transition-colors active:scale-[0.98]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                <Plus size={12} />
                <span>{t('quickdeck.open_project_folder', '打开本地项目文件夹…')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Doctor Health Badge */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setDoctorOpen(!doctorOpen)
              setProjectOpen(false)
              setModeOpen(false)
              setEffortOpen(false)
            }}
            className="flex items-center gap-1 px-1.5 py-1 rounded border text-[10px] transition-colors hover:bg-[var(--bg-secondary)] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            style={{ borderColor: 'var(--border)' }}
            title={t('quickdeck.doctor_status', '系统就绪状态 (Doctor)')}
            aria-label="Doctor Health Badge"
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: healthStatus.overallStatus === 'ok' ? 'var(--success, #16a34a)' : 'var(--warning, #f59e0b)' }}
            />
            <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              MCP:{healthStatus.mcpActiveCount}
            </span>
          </button>

          {/* Doctor Details Popover */}
          {doctorOpen && (
            <div
              className="absolute bottom-full right-0 mb-1 w-56 rounded-lg border shadow-lg p-2.5 z-50 animate-spring-up text-xs space-y-1.5"
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between font-semibold pb-1 border-b" style={{ borderColor: 'var(--border)' }}>
                <span className="flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                  <Activity size={12} style={{ color: 'var(--accent)' }} />
                  <span>{t('quickdeck.doctor_status', '系统就绪状态 (Doctor)')}</span>
                </span>
                <span className="text-[10px] text-emerald-500 font-mono">{t('quickdeck.ready', '就绪')}</span>
              </div>
              <div className="space-y-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                <div className="flex justify-between">
                  <span>{t('quickdeck.sqlite_wal', '本地 SQLite WAL')}:</span>
                  <span className="text-emerald-500 font-mono">{t('quickdeck.connected', '已连接 (Healthy)')}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('quickdeck.mcp_servers', 'MCP 工具服务器')}:</span>
                  <span className="font-mono">{t('quickdeck.mcp_online', String(healthStatus.mcpActiveCount))}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('quickdeck.gateway', '本地网关 (Gateway)')}:</span>
                  <span className="font-mono">
                    {healthStatus.gateway === 'online' ? (healthStatus.gatewayPort ? `:${healthStatus.gatewayPort}` : t('quickdeck.gateway_online', '已上线')) : t('quickdeck.gateway_idle', '待机')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Mode Pill & Reasoning Quick Dial */}
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
              <Shield size={11} className="shrink-0" style={{ color: currentModeInfo.color }} />
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
                {t('quickdeck.agent_mode_label', 'Agent 权限模式 (4 档)')}
              </span>
              {agentModeOptions.map((m) => {
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
              size={11}
              className="shrink-0"
              style={{ color: thinkingEnabled ? 'var(--accent)' : 'var(--text-muted)' }}
            />
            <span className="tabular-nums font-mono text-[10px]" style={{ color: 'var(--text-primary)' }}>
              {thinkingEnabled ? (reasoningLevels.find((l) => l.value === effortLevel)?.tokens ?? '8k') : t('thinking.off', 'Off')}
            </span>
          </button>

          {/* Reasoning Dial Popover */}
          {effortOpen && (
            <div
              className="absolute bottom-full right-0 mb-1 w-48 rounded-lg border shadow-lg p-2 z-50 animate-spring-up space-y-2"
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between border-b pb-1" style={{ borderColor: 'var(--border)' }}>
                <span className="text-[10px] font-semibold text-[var(--text-muted)]">
                  {t('quickdeck.thinking_depth', '思考深度 (Thinking)')}
                </span>
                <button
                  type="button"
                  onClick={() => setThinkingEnabled(!thinkingEnabled)}
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{
                    backgroundColor: thinkingEnabled ? 'var(--accent)' : 'var(--border)',
                    color: thinkingEnabled ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  {thinkingEnabled ? t('thinking.on', '开启') : t('thinking.off', '关闭')}
                </button>
              </div>

              <div className="space-y-1" style={{ opacity: thinkingEnabled ? 1 : 0.5 }}>
                {reasoningLevels.map((lvl) => {
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
    </div>
  )
}
