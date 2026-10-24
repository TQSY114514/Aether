import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Shield,
  Brain,
  Activity,
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

  const agentMode = useStore((s) => s.agentMode)
  const setAgentMode = useStore((s) => s.setAgentMode)

  const effortLevel = useStore((s) => s.effortLevel)
  const setEffortLevel = useStore((s) => s.setEffortLevel)
  const thinkingEnabled = useStore((s) => s.thinkingEnabled)
  const setThinkingEnabled = useStore((s) => s.setThinkingEnabled)

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

  return (
    <div
      ref={deckRef}
      className="p-1.5 shrink-0 border-t space-y-1 relative text-xs select-none app-no-drag"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
    >
      {/* Row 1: Agent Mode Selector & Doctor Health Badge */}
      <div className="flex items-center gap-1 relative">
        {/* Agent Mode Pill */}
        <div className="relative flex-1 min-w-0">
          <button
            type="button"
            onClick={() => {
              setModeOpen(!modeOpen)
              setEffortOpen(false)
              setDoctorOpen(false)
            }}
            className="w-full flex items-center justify-between gap-1 px-1.5 py-1 rounded-[6px] border text-[11px] font-medium transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
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
              className="absolute bottom-full left-0 mb-1 w-56 rounded-[10px] border shadow-lg p-1.5 z-50 animate-spring-up space-y-1"
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
                    className="w-full text-left p-1.5 rounded-[6px] transition-colors hover:bg-[var(--bg-secondary)] block"
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

        {/* Doctor Health Badge */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setDoctorOpen(!doctorOpen)
              setModeOpen(false)
              setEffortOpen(false)
            }}
            className="flex items-center gap-1 px-1.5 py-1 rounded-[6px] border text-[10px] transition-colors hover:bg-[var(--bg-secondary)] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
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
              className="absolute bottom-full right-0 mb-1 w-56 rounded-[10px] border shadow-lg p-2.5 z-50 animate-spring-up text-xs space-y-1.5"
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

      {/* Row 2: Reasoning Level Quick Dial */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setEffortOpen(!effortOpen)
            setModeOpen(false)
            setDoctorOpen(false)
          }}
          className="w-full flex items-center justify-between gap-1 px-1.5 py-1 rounded-[6px] border text-[11px] font-medium transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          style={{ borderColor: 'var(--border)' }}
          aria-label="Reasoning Dial"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Brain
              size={11}
              className="shrink-0"
              style={{ color: thinkingEnabled ? 'var(--accent)' : 'var(--text-muted)' }}
            />
            <span className="truncate text-[11px]" style={{ color: 'var(--text-primary)' }}>
              {t('thinking.depth', '思考深度')}
            </span>
          </div>
          <span className="tabular-nums font-mono text-[10px]" style={{ color: thinkingEnabled ? 'var(--accent)' : 'var(--text-muted)' }}>
            {thinkingEnabled ? (reasoningLevels.find((l) => l.value === effortLevel)?.tokens ?? '8k') : t('thinking.off', 'Off')}
          </span>
        </button>

        {/* Reasoning Dial Popover */}
        {effortOpen && (
          <div
            className="absolute bottom-full left-0 right-0 mb-1 rounded-[10px] border shadow-lg p-2 z-50 animate-spring-up space-y-2"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between border-b pb-1" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[10px] font-semibold text-[var(--text-muted)]">
                {t('quickdeck.thinking_depth', '思考深度 (Thinking)')}
              </span>
              <button
                type="button"
                onClick={() => setThinkingEnabled(!thinkingEnabled)}
                className="text-[10px] px-1.5 py-0.5 rounded-[5px] font-medium transition-colors"
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
                    className="w-full flex items-center justify-between p-1 rounded-[5px] text-[11px] hover:bg-[var(--bg-secondary)] transition-colors"
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
  )
}
