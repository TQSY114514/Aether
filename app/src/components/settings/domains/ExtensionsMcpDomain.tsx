import { Blocks, Wrench, Plug, Sparkles } from 'lucide-react'
import { t } from '@/utils/i18n'
import McpSettings from '@/components/settings/McpSettings'
import SkillsSettings from '@/components/settings/SkillsSettings'
import GatewayCard from '@/components/settings/GatewayCard'
import FeatureFlagsSettings from '@/components/settings/FeatureFlagsSettings'

export default function ExtensionsMcpDomain() {
  return (
    <div className="space-y-4">
      {/* Model Context Protocol (MCP) Tools */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center gap-1.5 mb-1">
          <Blocks size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {t('settings.mcp', 'Model Context Protocol (MCP) 服务器')}
          </h2>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          {t('settings.mcp_desc', '挂载标准 stdio MCP 工具服务器，赋予智能体数据库查询、代码分析与外部系统联动能力。')}
        </p>
        <McpSettings />
      </div>

      {/* Skills Ecosystem */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center gap-1.5 mb-1">
          <Wrench size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {t('settings.tools.skills', '技能生态 (Skills)')}
          </h2>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          {t('settings.tools.skills_desc', '管理与安装可复用的工作流扩展技能，扩展智能体在多领域研发的专业能力。')}
        </p>
        <SkillsSettings />
      </div>

      {/* Local Gateway Interface */}
      <GatewayCard />

      {/* Experimental Feature Flags */}
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--content-bg)' }}>
        <div className="flex items-center gap-1.5 mb-1">
          <Sparkles size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {t('settings.flags', '特性开关 (Feature Flags)')}
          </h2>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          按需启闭实验性运行时内核特性，包括本地轻量压缩、阶段工具路由与后台自进化。
        </p>
        <FeatureFlagsSettings />
      </div>
    </div>
  )
}
