import McpSettings from '@/components/settings/McpSettings'
import SkillsSettings from '@/components/settings/SkillsSettings'
import GatewayCard from '@/components/settings/GatewayCard'

export default function ExtensionsMcpDomain() {
  return (
    <div className="space-y-4">
      {/* Model Context Protocol (MCP) Tools */}
      <McpSettings />

      {/* Skills Ecosystem */}
      <SkillsSettings />

      {/* Local Gateway Interface */}
      <GatewayCard />
    </div>
  )
}
