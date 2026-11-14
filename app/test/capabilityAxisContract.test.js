// ─── Binary Plan / Act & High-Risk Gate Contract ────────────────────────────
// Replaces the legacy 6-axis permission matrix contract. Locks that:
//   1. SecurityPage.tsx, AgentSettings.tsx, toolLoop.js, and permissions.js
//      no longer enforce or expose `capability.*` axis matrix settings.
//   2. AgentModeSelector.tsx provides binary Plan / Act mode switching.
//   3. ToolCallBlock.tsx renders inline DiffPreview in the stream with a Revert button.
//   4. capabilityPolicy.js's pure TOOL_AXIS classification remains consistent.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

// capabilityPolicy.js is a pure module (no electron) — safe to import directly.
const { AXES, TOOL_AXIS } = require('../electron/llm/capabilityPolicy.js')
const { TOOLS } = require('../electron/tools/registry.js')

const ENFORCED_AXES = Object.values(AXES).filter(a => a !== AXES.UNKNOWN)

describe('binary Plan / Act & high-risk gate contract', () => {
  const toolLoopSrc = readFileSync(join(__dirname, '../electron/llm/toolLoop.js'), 'utf8')
  const permissionsSrc = readFileSync(join(__dirname, '../electron/llm/permissions.js'), 'utf8')
  const securityPageSrc = readFileSync(join(__dirname, '../src/pages/SecurityPage.tsx'), 'utf8')
  const agentSettingsSrc = readFileSync(join(__dirname, '../src/components/settings/AgentSettings.tsx'), 'utf8')
  const modeSelectorSrc = readFileSync(join(__dirname, '../src/components/chat/input/AgentModeSelector.tsx'), 'utf8')
  const toolCallBlockSrc = readFileSync(join(__dirname, '../src/components/chat/ToolCallBlock.tsx'), 'utf8')

  it('removes 6-axis capability.* enforcement from SecurityPage, AgentSettings, toolLoop, and permissions', () => {
    const securityKeys = [...securityPageSrc.matchAll(/key:\s*'(capability\.[a-z]+)'/g)]
    expect(securityKeys).toEqual([])
    expect(agentSettingsSrc).not.toMatch(/capability\.(filesystem|shell|network)/)
    expect(toolLoopSrc).not.toContain('decideAxisPolicy')
    expect(permissionsSrc).not.toContain('decideAxisPolicy')
  })

  it('toolLoop routes runtime checks through trustEngine binary Plan/Act high-risk gate', () => {
    expect(toolLoopSrc).toContain('checkToolAllowed')
    expect(toolLoopSrc).toContain('highRiskApproved')
    expect(toolLoopSrc).toContain('createCheckpoint')
  })

  it('AgentModeSelector exposes only binary Plan and Act options in the input bar', () => {
    expect(modeSelectorSrc).toContain("value: 'plan'")
    expect(modeSelectorSrc).toContain("value: 'act'")
    expect(modeSelectorSrc).not.toContain("value: 'yolo'")
    expect(modeSelectorSrc).not.toContain("value: 'ask'")
  })

  it('ToolCallBlock renders inline DiffPreview with a Revert turn action', () => {
    expect(toolCallBlockSrc).toContain('diff.revert_turn')
    expect(toolCallBlockSrc).toContain('<DiffPreview')
    expect(toolCallBlockSrc).toContain('rollback')
  })

  it('every tool known to TOOL_AXIS maps to an enforced axis', () => {
    for (const axis of Object.values(TOOL_AXIS)) {
      expect(ENFORCED_AXES).toContain(axis)
    }
  })

  it('every built-in tool dispatch has a capability axis', () => {
    for (const tool of TOOLS) {
      expect(TOOL_AXIS[tool.name], tool.name).toBeTruthy()
    }
  })
})
