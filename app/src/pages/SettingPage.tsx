import { useState } from 'react'
import {
  Sliders,
  Server,
  Shield,
  Blocks,
  Brain,
} from 'lucide-react'
import { t } from '@/utils/i18n'
import GeneralDomain from '@/components/settings/domains/GeneralDomain'
import ProvidersRoutingDomain from '@/components/settings/domains/ProvidersRoutingDomain'
import AgentRuntimeDomain from '@/components/settings/domains/AgentRuntimeDomain'
import ExtensionsMcpDomain from '@/components/settings/domains/ExtensionsMcpDomain'
import MemoryEvolutionDomain from '@/components/settings/domains/MemoryEvolutionDomain'
import ChatBackgroundPattern from '@/components/chat/ChatBackgroundPattern'

export type SettingsDomainKey =
  | 'general'
  | 'providers-routing'
  | 'agent-runtime'
  | 'extensions-mcp'
  | 'memory-evolution'

interface DomainTab {
  key: SettingsDomainKey
  icon: any
  labelKey: string
  fallback: string
}

const DOMAIN_TABS: DomainTab[] = [
  { key: 'general', icon: Sliders, labelKey: 'settings.tab.general', fallback: '通用' },
  { key: 'providers-routing', icon: Server, labelKey: 'settings.tab.providers', fallback: '模型与路由' },
  { key: 'agent-runtime', icon: Shield, labelKey: 'settings.tab.agent', fallback: 'Agent 执行' },
  { key: 'extensions-mcp', icon: Blocks, labelKey: 'settings.tab.extensions', fallback: '扩展与 MCP' },
  { key: 'memory-evolution', icon: Brain, labelKey: 'settings.tab.memory', fallback: '记忆与自进化' },
]

export default function SettingPage() {
  const [activeDomain, setActiveDomain] = useState<SettingsDomainKey>('general')

  return (
    <div className="flex-1 flex flex-col min-h-0 page-fade-in bg-transparent relative overflow-hidden">
      <ChatBackgroundPattern />

      {/* Header & Domain Navigation */}
      <div className="shrink-0 px-6 pt-5 pb-3 border-b z-10" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          {t('settings.title', '系统设置')}
        </h1>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {DOMAIN_TABS.map((tab) => {
            const Icon = tab.icon
            const active = activeDomain === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveDomain(tab.key)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border font-medium transition-all active:scale-[0.98] ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-xs'
                    : 'hover:bg-[var(--bg-secondary)]'
                }`}
                style={!active ? { borderColor: 'var(--border)', color: 'var(--text-secondary)' } : {}}
              >
                <Icon size={14} />
                <span>{t(tab.labelKey as any, tab.fallback)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Domain Content View */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 z-10 max-w-4xl scroll-bounce">
        {activeDomain === 'general' && <GeneralDomain />}
        {activeDomain === 'providers-routing' && <ProvidersRoutingDomain />}
        {activeDomain === 'agent-runtime' && <AgentRuntimeDomain />}
        {activeDomain === 'extensions-mcp' && <ExtensionsMcpDomain />}
        {activeDomain === 'memory-evolution' && <MemoryEvolutionDomain />}
      </div>
    </div>
  )
}
