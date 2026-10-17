// ─────────────────────────────────────────────────────────────────────────────
// test/leanMcp.test.js — Tests for Lean MCP Bridge (agent.leanMcp)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const mcpManager = require('../electron/mcp/manager')
const featureFlags = require('../electron/featureFlags')

describe('Lean MCP Bridge', () => {
  const mockTools = [
    { name: 'mock_server__search', description: 'search docs', risk: 'safe', parameters: { type: 'object' }, run: async () => 'search result' },
    { name: 'mock_server__create', description: 'create doc', risk: 'dangerous', parameters: { type: 'object' }, run: async (args) => `created ${args.title}` },
  ]

  beforeAll(() => {
    mcpManager.registerTools(mockTools)
  })

  afterAll(() => {
    mcpManager.unregisterTools(mockTools.map((t) => t.name))
  })

  it('registers agent.leanMcp feature flag with default false', () => {
    expect(featureFlags.has('agent.leanMcp')).toBe(true)
    expect(featureFlags.isEnabled(null, 'agent.leanMcp')).toBe(false)
  })

  it('exposes mcp_list_tools and mcp_call_tool via getMergedTool', () => {
    const listTool = mcpManager.getMergedTool('mcp_list_tools')
    const callTool = mcpManager.getMergedTool('mcp_call_tool')

    expect(listTool).toBeDefined()
    expect(listTool.risk).toBe('safe')
    expect(typeof listTool.run).toBe('function')

    expect(callTool).toBeDefined()
    expect(callTool.risk).toBe('dangerous')
    expect(typeof callTool.run).toBe('function')
  })

  it('filters MCP tools according to leanMcp flag in getMergedToolsPayload', () => {
    // Non-lean mode (default): individual MCP tools appear in payload, lean gateway tools are hidden
    const nonLeanPayload = mcpManager.getMergedToolsPayload('auto', { leanMcp: false })
    const nonLeanNames = nonLeanPayload.map((t) => t.function.name)
    expect(nonLeanNames).toContain('mock_server__search')
    expect(nonLeanNames).toContain('mock_server__create')
    expect(nonLeanNames).not.toContain('mcp_list_tools')
    expect(nonLeanNames).not.toContain('mcp_call_tool')

    // Lean mode (leanMcp: true): individual MCP tools are hidden, replaced by gateway tools
    const leanPayload = mcpManager.getMergedToolsPayload('auto', { leanMcp: true })
    const leanNames = leanPayload.map((t) => t.function.name)
    expect(leanNames).not.toContain('mock_server__search')
    expect(leanNames).not.toContain('mock_server__create')
    expect(leanNames).toContain('mcp_list_tools')
    expect(leanNames).toContain('mcp_call_tool')
  })

  it('executes tools on-demand via mcp_list_tools and mcp_call_tool', async () => {
    const listTool = mcpManager.getMergedTool('mcp_list_tools')
    const callTool = mcpManager.getMergedTool('mcp_call_tool')

    const listJson = await listTool.run({ server: 'mock_server' })
    const list = JSON.parse(listJson)
    expect(Array.isArray(list)).toBe(true)
    expect(list.some((t) => t.name === 'mock_server__search')).toBe(true)

    const callResult = await callTool.run({
      tool_name: 'mock_server__create',
      arguments: { title: 'Architecture.md' },
    })
    expect(callResult).toBe('created Architecture.md')
  })

  it('blocks executing built-in tools via mcp_call_tool', async () => {
    const callTool = mcpManager.getMergedTool('mcp_call_tool')
    await expect(
      callTool.run({ tool_name: 'run_command', arguments: { command: 'echo evil' } })
    ).rejects.toThrow(/built-in tool/)
  })
})
