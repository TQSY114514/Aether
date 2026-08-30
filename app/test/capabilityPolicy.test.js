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
    expect(axisFor('read_file')).toBe(AXES.READ)
    expect(axisFor('write_file')).toBe(AXES.WRITE)
    expect(axisFor('run_command')).toBe(AXES.EXECUTE)
    expect(axisFor('web_fetch')).toBe(AXES.NETWORK)
    expect(axisFor('github_pr_create')).toBe(AXES.EXTERNAL)
    expect(axisFor('git_commit')).toBe(AXES.GIT)
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
  const policies = { read: 'allow', execute: 'deny', network: 'ask' }

  it('returns the policy for a mapped axis', () => {
    expect(decideAxisPolicy('read_file', '{}', policies)).toEqual({ axis: AXES.READ, policy: 'allow', matched: true })
    expect(decideAxisPolicy('run_command', '{}', policies)).toEqual({ axis: AXES.EXECUTE, policy: 'deny', matched: true })
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
    const out = normalizeAxisPolicies({ read: 'allow', execute: 'deny', network: 'ask', unknown: 'deny', bogus: 'maybe' })
    expect(out).toEqual({ read: 'allow', execute: 'deny', network: 'ask' })
  })

  it('returns empty object for empty input', () => {
    expect(normalizeAxisPolicies(null)).toEqual({})
    expect(normalizeAxisPolicies({})).toEqual({})
  })
})

describe('PermissionPolicy + axis policies integration', () => {
  const policy = new PermissionPolicy(PermissionMode.WorkspaceWrite)
    .withToolRequirement('write_file', PermissionMode.DangerFullAccess)
    .withToolRequirement('run_command', PermissionMode.DangerFullAccess)

  it('deny axis rejects before the 5-tier fallback', () => {
    const p = new PermissionPolicy(PermissionMode.Allow)
      .withAxisPolicies({ shell: 'deny' })
    const out = p.authorize('run_command', '{"command":"rm -rf /"}')
    expect(out.allowed).toBe(false)
    expect(out.reason).toContain('capability policy')
  })

  it('deny axis cannot be bypassed by a hook allow override', () => {
    const p = new PermissionPolicy(PermissionMode.Allow)
      .withAxisPolicies({ shell: 'deny' })
    const out = p.authorizeWithContext(
      'run_command',
      '{"command":"npm test"}',
      { permissionOverride: PermissionOverride.Allow },
    )
    expect(out.allowed).toBe(false)
  })

  it('allow axis permits even in a stricter mode', () => {
    const p = new PermissionPolicy(PermissionMode.ReadOnly)
      .withAxisPolicies({ filesystem: 'allow' })
    // ReadOnly 模式下写文件本应被拒, 但轴策略 allow 放行
    const out = p.authorize('write_file', '{"path":"x"}')
    expect(out.allowed).toBe(true)
  })

  it('ask axis routes to the prompter', () => {
    const p = new PermissionPolicy(PermissionMode.WorkspaceWrite)
      .withAxisPolicies({ network: 'ask' })
    let request = null
    const prompter = { decide: (r) => { request = r; return PermissionPromptDecision.Allow } }
    expect(p.authorize('web_fetch', '{"url":"http://x"}', prompter).allowed).toBe(true)
    expect(request.tool_name).toBe('web_fetch')
    expect(request.reason).toContain('network axis requires approval')
    const denyPrompter = { decide: () => PermissionPromptDecision.Deny }
    expect(p.authorize('web_fetch', '{"url":"http://x"}', denyPrompter).allowed).toBe(false)
  })

  it('ask axis still prompts when a hook requests allow', () => {
    const p = new PermissionPolicy(PermissionMode.Allow)
      .withAxisPolicies({ network: 'ask' })
    let requests = 0
    const prompter = { decide: () => { requests++; return PermissionPromptDecision.Deny } }
    const out = p.authorizeWithContext(
      'web_fetch',
      '{"url":"http://x"}',
      { permissionOverride: PermissionOverride.Allow },
      prompter,
    )
    expect(requests).toBe(1)
    expect(out.allowed).toBe(false)
  })

  it('allow axis retains higher-priority deny safeguards', () => {
    const p = new PermissionPolicy(PermissionMode.Allow)
      .withPermissionRules({ allow: [], ask: [], deny: ['write_file(*)'], denied_tools: [] })
      .withAxisPolicies({ filesystem: 'allow' })
    expect(p.authorize('write_file', '{"path":"x"}').allowed).toBe(false)
  })

  it('no axis policies configured → 5-tier behavior unchanged', () => {
    const out = policy.authorize('run_command', '{"command":"ls"}')
    // WorkspaceWrite 模式下 dangerous 工具 → prompt/deny
    expect(out.allowed).toBe(false)
  })
})
