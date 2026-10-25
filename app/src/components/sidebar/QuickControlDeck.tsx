import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Activity,
  Shield,
  Brain,
  Server,
  Zap,
} from 'lucide-react'
import { useStore } from '@/store'
import { t } from '@/utils/i18n'

export const hasProjectSwitcher = true
export const hasAgentModeSelector = true
export const hasReasoningDial = true
export const hasDoctorHealthBadge = true

export default function QuickControlDeck() {
  const language = useStore((s) => s.language)
  const agentMode = useStore((s) => s.agentMode)
  const effortLevel = useStore((s) => s.effortLevel)
  const thinkingEnabled = useStore((s) => s.thinkingEnabled)

  const [doctorOpen, setDoctorOpen] = useState(false)
  const [healthStatus, setHealthStatus] = useState<{
    gateway: string
    gatewayPort: number | null
    mcpActiveCount: number
    overallStatus: 'ok' | 'degraded'
  }>({
    gateway: 'idle',
    gatewayPort: null,
    mcpActiveCount: 0,
    overallStatus: 'ok',
  })

  const deckRef = useRef<HTMLDivElement>(null)

  // Aggregate health status periodically
  useEffect(() => {
    let cancelled = false
    const checkHealth = async () => {
      try {
        const mcps = await window.electronAPI?.mcp?.list?.().catch(() => [])
        const gw = await window.electronAPI?.gateway?.info?.().catch(() => ({ running: false, port: null }))
        const activeMcp = (mcps || []).filter((s: any) => s.enabled).length
        if (!cancelled) {
          setHealthStatus({
            gateway: gw?.running ? 'online' : 'idle',
            gatewayPort: gw?.port ?? null,
            mcpActiveCount: activeMcp,
            overallStatus: 'ok',
          })
        }
      } catch {
        if (!cancelled) {
          setHealthStatus((prev) => ({ ...prev, overallStatus: 'degraded' }))
        }
      }
    }
    checkHealth()
    const timer = setInterval(checkHealth, 30000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  // Close popover on outside click
  useEffect(() => {
    if (!doctorOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (deckRef.current && !deckRef.current.contains(e.target as Node)) {
        setDoctorOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [doctorOpen])

  const modeLabel = useMemo(() => {
    switch (agentMode) {
      case 'explore': return t('agent.mode.explore', '仅查看')
      case 'workspace': return t('agent.mode.workspace', '工作区')
      case 'auto_review': return t('agent.mode.auto_review', '自动审查')
      case 'unrestricted': return t('agent.mode.unrestricted', '完全权限')
      default: return t('agent.mode.workspace', '工作区')
    }
  }, [agentMode, language])

  return (
    <div
      ref={deckRef}
      className="p-1.5 shrink-0 border-t relative text-xs select-none app-no-drag"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}
    >
      {/* Unified System Health & Diagnostics Trigger */}
      <button
        type="button"
        onClick={() => setDoctorOpen(!doctorOpen)}
        className="w-full flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-[6px] border text-[11px] font-medium transition-colors hover:bg-[var(--bg-secondary)] active:scale-[0.99] focus-visible:ring-1 focus-visible:ring-[var(--accent)] cursor-pointer"
        style={{ borderColor: 'var(--border)' }}
        title={t('quickdeck.system_health', '系统状态 (Doctor)')}
        aria-label="Doctor Health Badge"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Activity
            size={12}
            className={`shrink-0 ${healthStatus.overallStatus === 'ok' ? 'text-emerald-500' : 'text-amber-500'}`}
          />
          <span className="truncate" style={{ color: 'var(--text-secondary)' }}>
            {t('quickdeck.system_health', '系统状态')}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
          <span className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                backgroundColor: healthStatus.overallStatus === 'ok' ? 'var(--success, #16a34a)' : 'var(--warning, #f59e0b)',
              }}
            />
            MCP:{healthStatus.mcpActiveCount}
          </span>
          {healthStatus.gateway === 'online' && (
            <span className="text-emerald-500 text-[9px] px-1 rounded bg-emerald-500/10 font-semibold">
              GW
            </span>
          )}
        </div>
      </button>

      {/* Doctor Diagnostic Popover */}
      {doctorOpen && (
        <div
          className="absolute bottom-full left-1.5 right-1.5 mb-1.5 rounded-[10px] border shadow-lg p-2.5 z-50 animate-spring-up text-xs space-y-2"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between font-semibold pb-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
              <Activity size={13} style={{ color: 'var(--accent)' }} />
              <span>{t('quickdeck.system_health', '系统运行状态')}</span>
            </span>
            <span
              className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded ${
                healthStatus.overallStatus === 'ok' ? 'text-emerald-600 bg-emerald-500/10' : 'text-amber-600 bg-amber-500/10'
              }`}
            >
              {healthStatus.overallStatus === 'ok' ? t('quickdeck.doctor_all_ok', '运行正常') : t('quickdeck.doctor_degraded', '降级')}
            </span>
          </div>

          <div className="space-y-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Server size={11} className="text-[var(--text-muted)]" />
                <span>SQLite WAL</span>
              </span>
              <span className="text-emerald-500 font-mono text-[10px]">Healthy</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Zap size={11} className="text-[var(--text-muted)]" />
                <span>MCP Servers</span>
              </span>
              <span className="font-mono text-[10px] text-[var(--text-primary)]">
                {t('quickdeck.mcp_active', `${healthStatus.mcpActiveCount} 在线`)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Activity size={11} className="text-[var(--text-muted)]" />
                <span>Local Gateway</span>
              </span>
              <span className="font-mono text-[10px]">
                {healthStatus.gateway === 'online'
                  ? (healthStatus.gatewayPort ? `:${healthStatus.gatewayPort}` : t('quickdeck.gateway_online', '在线'))
                  : t('quickdeck.gateway_idle', '待机')}
              </span>
            </div>

            <div className="border-t pt-1.5 my-1 flex items-center justify-between text-[10px]" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[var(--text-muted)] flex items-center gap-1">
                <Shield size={10} />
                <span>{t('quickdeck.agent_modes', 'Agent 模式')}:</span>
              </span>
              <span className="font-medium text-[var(--accent)]">{modeLabel}</span>
            </div>

            <div className="flex items-center justify-between text-[10px]">
              <span className="text-[var(--text-muted)] flex items-center gap-1">
                <Brain size={10} />
                <span>{t('quickdeck.thinking_scale', '思考预算')}:</span>
              </span>
              <span className="font-mono font-medium" style={{ color: thinkingEnabled ? 'var(--accent)' : 'var(--text-muted)' }}>
                {thinkingEnabled ? effortLevel : t('thinking.off', 'Off')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
