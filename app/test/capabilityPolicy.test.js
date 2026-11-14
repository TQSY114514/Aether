// ─────────────────────────────────────────────────────────────────────────────
// capabilityPolicy.test.js — Capability axis policy（评审 P0-2）
//
// 锁定: 工具→轴映射完整; 轴策略三态决策; 未知工具不误伤; normalize 只留合法值;
// 与 PermissionPolicy 集成: deny 轴直接拒、allow 轴放行、ask 轴走 prompter。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { axisFor, decideAxisPolicy, normalizeAxisPolicies, AXES, POLICY, TOOL_AXIS } from '../electron/llm/capabilityPolicy'
import { PermissionPolicy, PermissionMode, PermissionOutcome, PermissionOverride, PermissionPromptDecision } from '../electron/llm/permissions'

describe('axisFor (tool → axis mapping)', () => {
  it('maps representative tools to the three axes', () => {
    expect(axisFor('read_file')).toBe(AXES.FILESYSTEM)
    expect(axisFor('write_file')).toBe(AXES.FILESYSTEM)
    expect(axisFor('run_command')).toBe(AXES.SHELL)
    expect(axisFor('web_fetch')).toBe(AXES.NETWORK)
    expect(axisFor('github_pr_create')).toBe(AXES.NETWORK)
    expect(axisFor('git_commit')).toBe(AXES.FILESYSTEM)
  })

  it('covers every registry tool (no accidental UNKNOWN for built-ins)', () => {
    // 42 个内置工具都应有轴归属
    const known = Object.keys(TOOL_AXIS)
    expect(known.length).toBeGreaterThanOrEqual(40)
    for (const t of known) expect(axisFor(t)).not.toBe(AXES.UNKNOWN)
  })

  it('unknown/MCP tools fall back to UNKNOWN (never mis-routed)', () => {
    expect(axisFor('mcp__custom_tool')).toBe(AXES.UNKNOWN)
    expect(axisFor('brand_new_tool')).toBe(AXES.UNKNOWN)
  })
})

describe('decideAxisPolicy', () => {
  const policies = { filesystem: 'allow', shell: 'deny', network: 'ask' }

  it('returns the policy for a mapped axis', () => {
    expect(decideAxisPolicy('read_file', '{}', policies)).toEqual({ axis: AXES.FILESYSTEM, policy: 'allow', matched: true })
    expect(decideAxisPolicy('run_command', '{}', policies)).toEqual({ axis: AXES.SHELL, policy: 'deny', matched: true })
    expect(decideAxisPolicy('web_fetch', '{}', policies)).toEqual({ axis: AXES.NETWORK, policy: 'ask', matched: true })
  })

  it('unmatched when axis not configured or tool unknown', () => {
    expect(decideAxisPolicy('read_file', '{}', {}).matched).toBe(false)
    expect(decideAxisPolicy('mcp_tool', '{}', policies).matched).toBe(false)
    expect(decideAxisPolicy('read_file', '{}', null).matched).toBe(false)
  })
})

describe('normalizeAxisPolicies', () => {
  it('keeps only valid three-state values on real axes', () => {
    const out = normalizeAxisPolicies({ filesystem: 'allow', shell: 'deny', network: 'ask', unknown: 'deny', bogus: 'maybe' })
    expect(out).toEqual({ filesystem: 'allow', shell: 'deny', network: 'ask' })
  })

  it('returns empty object for empty input', () => {
    expect(normalizeAxisPolicies(null)).toEqual({})
    expect(normalizeAxisPolicies({})).toEqual({})
  })
})

describe('PermissionPolicy decoupled from capability axis matrix', () => {
  it('withAxisPolicies no longer overrides ReadOnly / Allow / rule safeguards at runtime', () => {
    // Under Binary Plan/Act architecture, PermissionPolicy does not enforce
    // axis matrix overrides inside authorizeWithContext.
    const denyReadOnly = new PermissionPolicy(PermissionMode.ReadOnly)
      .withToolRequirement('write_file', PermissionMode.DangerFullAccess)
      .withAxisPolicies({ filesystem: 'allow' })
    expect(denyReadOnly.authorize('write_file', '{"path":"x"}').allowed).toBe(false)

    const pAllow = new PermissionPolicy(PermissionMode.Allow)
      .withToolRequirement('run_command', PermissionMode.DangerFullAccess)
      .withAxisPolicies({ shell: 'deny' })
    expect(pAllow.authorize('run_command', '{"command":"npm test"}').allowed).toBe(true)
  })

  it('destructive shell guard still enforces confirmation in Allow mode regardless of axis policies', () => {
    const p = new PermissionPolicy(PermissionMode.Allow)
      .withToolRequirement('run_command', PermissionMode.DangerFullAccess)
      .withAxisPolicies({ shell: 'allow' })
    expect(p.authorize('run_command', '{"command":"rm -rf /"}').allowed).toBe(false)
    const prompter = { decide: () => PermissionPromptDecision.Allow }
    expect(p.authorize('run_command', '{"command":"rm -rf /"}', prompter).allowed).toBe(true)
  })

  it('explicit permission deny rules still block even when Allow mode + axis allow are set', () => {
    const p = new PermissionPolicy(PermissionMode.Allow)
      .withPermissionRules({ allow: [], ask: [], deny: ['write_file(*)'], denied_tools: [] })
      .withAxisPolicies({ filesystem: 'allow' })
    expect(p.authorize('write_file', '{"path":"x"}').allowed).toBe(false)
  })

  it('no axis policies configured → WorkspaceWrite escalates dangerous tools', () => {
    const p = new PermissionPolicy(PermissionMode.WorkspaceWrite)
      .withToolRequirement('run_command', PermissionMode.DangerFullAccess)
    const out = p.authorize('run_command', '{"command":"ls"}')
    expect(out.allowed).toBe(false)
  })
})
