// ─────────────────────────────────────────────────────────────────────────────
// sessionCommands.test.js — /provider 斜杠命令解析（W0-t6）
// parseSessionCommand 纯函数验收：/provider add|list 解析、缺参/非法 api-format
// 拒绝并给 usage（不崩溃）、补全候选表含新命令、既有命令不回归。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { parseSessionCommand, SLASH_COMMANDS } from '../../tui/sessionCommands.js'

describe('SLASH_COMMANDS 补全表（W0-t6）', () => {
  it('包含 /provider 及 add/list 候选', () => {
    expect(SLASH_COMMANDS).toContain('/provider')
    expect(SLASH_COMMANDS).toContain('/provider add')
    expect(SLASH_COMMANDS).toContain('/provider list')
  })
})

describe('/provider add 解析（W0-t6）', () => {
  it('完整参数 → provider-add 对象（name/url/apiFormat）', () => {
    expect(parseSessionCommand('/provider add deepseek https://api.deepseek.com openai')).toEqual({
      type: 'provider-add',
      name: 'deepseek',
      url: 'https://api.deepseek.com',
      apiFormat: 'openai',
    })
  })

  it('省略 api-format → apiFormat null（落库时默认 openai）', () => {
    expect(parseSessionCommand('/provider add deepseek https://api.deepseek.com')).toEqual({
      type: 'provider-add',
      name: 'deepseek',
      url: 'https://api.deepseek.com',
      apiFormat: null,
    })
  })

  it('anthropic 是合法 api-format', () => {
    expect(parseSessionCommand('/provider add claude https://api.anthropic.com anthropic')).toMatchObject({
      type: 'provider-add',
      name: 'claude',
      apiFormat: 'anthropic',
    })
  })

  it('非法 api-format → usage 拒绝（不产生 provider-add 对象）', () => {
    const r = parseSessionCommand('/provider add deepseek https://api.deepseek.com gemini')
    expect(r.type).toBe('provider-add')
    expect(r.usage).toMatch(/openai or anthropic/)
    expect(r.name).toBeUndefined()
  })

  it('缺 name → usage 提示', () => {
    const r = parseSessionCommand('/provider add')
    expect(r.type).toBe('provider-add')
    expect(r.usage).toMatch(/usage: \/provider add <name> <base-url>/)
    expect(r.name).toBeUndefined()
  })

  it('缺 base-url → usage 提示', () => {
    const r = parseSessionCommand('/provider add deepseek')
    expect(r.type).toBe('provider-add')
    expect(r.usage).toMatch(/usage: \/provider add <name> <base-url>/)
    expect(r.name).toBeUndefined()
  })
})

describe('/provider list 与裸 /provider（W0-t6）', () => {
  it('/provider list → provider-list 对象', () => {
    expect(parseSessionCommand('/provider list')).toEqual({ type: 'provider-list' })
  })

  it('裸 /provider → usage 提示（不崩溃）', () => {
    const r = parseSessionCommand('/provider')
    expect(r.type).toBe('provider-usage')
    expect(r.usage).toMatch(/usage: \/provider add/)
  })

  it('未知子命令 → usage 提示', () => {
    const r = parseSessionCommand('/provider delete deepseek')
    expect(r.type).toBe('provider-usage')
    expect(r.usage).toMatch(/usage: \/provider add/)
  })
})

describe('既有命令不回归', () => {
  it('/use 5 仍解析为 use', () => {
    expect(parseSessionCommand('/use 5')).toEqual({ type: 'use', sessionId: 5 })
  })
  it('/apikey deepseek sk-x 仍解析为 apikey', () => {
    expect(parseSessionCommand('/apikey deepseek sk-x')).toEqual({ type: 'apikey', provider: 'deepseek', key: 'sk-x' })
  })
  it('非斜杠输入返回 null', () => {
    expect(parseSessionCommand('hello')).toBeNull()
  })
})

describe('W1 会话上下文命令（t10-t14）', () => {
  it('/compact 解析（多余参数忽略）', () => {
    expect(parseSessionCommand('/compact')).toEqual({ type: 'compact' })
    expect(parseSessionCommand('/compact   ')).toEqual({ type: 'compact' })
    expect(parseSessionCommand('/compact aggressively')).toEqual({ type: 'compact' })
  })
  it('/compress-fast /context /clear /undo /recap 解析', () => {
    expect(parseSessionCommand('/compress-fast')).toEqual({ type: 'compress-fast' })
    expect(parseSessionCommand('/context')).toEqual({ type: 'context' })
    expect(parseSessionCommand('/clear')).toEqual({ type: 'clear' })
    expect(parseSessionCommand('/undo')).toEqual({ type: 'undo' })
    expect(parseSessionCommand('/recap')).toEqual({ type: 'recap' })
  })
  it('SLASH_COMMANDS 补全表包含全部新命令', () => {
    for (const c of ['/compact', '/compress-fast', '/context', '/clear', '/undo', '/recap']) {
      expect(SLASH_COMMANDS).toContain(c)
    }
  })
})

describe('W2-t16 /rename + /delete 解析', () => {
  it('/rename <title> → rename 对象（title 原样保留多词）', () => {
    expect(parseSessionCommand('/rename 修 bug 并写测试')).toEqual({ type: 'rename', title: '修 bug 并写测试' })
    expect(parseSessionCommand('/rename   spaced  title  ')).toEqual({ type: 'rename', title: 'spaced title' })
  })

  it('/rename 无标题 → usage 提示（不产生 rename 落库对象）', () => {
    const r = parseSessionCommand('/rename')
    expect(r.type).toBe('rename')
    expect(r.usage).toMatch(/usage: \/rename <title>/)
    expect(r.title).toBeUndefined()
    expect(parseSessionCommand('/rename   ').usage).toMatch(/usage: \/rename <title>/)
  })

  it('/delete → delete 对象（无参数, 当前会话由 App 层取 dbSessionId）', () => {
    expect(parseSessionCommand('/delete')).toEqual({ type: 'delete' })
    expect(parseSessionCommand('/delete 5')).toEqual({ type: 'delete' }) // 多余参数忽略
  })

  it('SLASH_COMMANDS 补全表包含 /rename /delete', () => {
    expect(SLASH_COMMANDS).toContain('/rename')
    expect(SLASH_COMMANDS).toContain('/delete')
  })
})

describe('W3-t23 /diff 命令', () => {
  it('/diff → { type: diff }; SLASH_COMMANDS 含 /diff', () => {
    expect(parseSessionCommand('/diff')).toEqual({ type: 'diff' })
    expect(parseSessionCommand('/diff extra')).toEqual({ type: 'diff' })
    expect(SLASH_COMMANDS).toContain('/diff')
  })
})

describe('W4-t25 /permissions add 解析', () => {
  it('裸 /permissions → { type: permissions }（打开对话框）', () => {
    expect(parseSessionCommand('/permissions')).toEqual({ type: 'permissions' })
    expect(parseSessionCommand('/permissions   ')).toEqual({ type: 'permissions' })
  })

  it('完整参数 → permissions-add 对象（name/ruleKey/decision）', () => {
    expect(parseSessionCommand('/permissions add run_command git_status deny')).toEqual({
      type: 'permissions-add', name: 'run_command', ruleKey: 'git_status', decision: 'deny',
    })
    expect(parseSessionCommand('/permissions add write_file src allow')).toEqual({
      type: 'permissions-add', name: 'write_file', ruleKey: 'src', decision: 'allow',
    })
    expect(parseSessionCommand('/permissions add run_command * ask')).toEqual({
      type: 'permissions-add', name: 'run_command', ruleKey: '*', decision: 'ask',
    })
  })

  it('非法 decision → usage 拒绝（不产生落库对象）', () => {
    const r = parseSessionCommand('/permissions add run_command git maybe')
    expect(r.type).toBe('permissions-add')
    expect(r.usage).toMatch(/allow\|deny\|ask/)
    expect(r.decision).toBeUndefined()
  })

  it('缺参 → usage 提示', () => {
    for (const bad of ['/permissions add', '/permissions add run_command', '/permissions add run_command git']) {
      const r = parseSessionCommand(bad)
      expect(r.type).toBe('permissions-add')
      expect(r.usage).toMatch(/usage: \/permissions add <name> <ruleKey> <allow\|deny\|ask>/)
      expect(r.name).toBeUndefined()
    }
  })

  it('未知子命令 → 回落打开对话框（/permissions foo 当对话框处理）', () => {
    expect(parseSessionCommand('/permissions foo')).toEqual({ type: 'permissions' })
  })

  it('SLASH_COMMANDS 含 /permissions 与 /permissions add', () => {
    expect(SLASH_COMMANDS).toContain('/permissions')
    expect(SLASH_COMMANDS).toContain('/permissions add')
  })
})

describe('W4-t26 /approval-mode 解析', () => {
  it('无参 → { type: approval-mode }（查当前）', () => {
    expect(parseSessionCommand('/approval-mode')).toEqual({ type: 'approval-mode' })
  })

  it('四模式全接受（manual/auto-edits/plan/dontask）', () => {
    expect(parseSessionCommand('/approval-mode manual')).toEqual({ type: 'approval-mode', mode: 'manual' })
    expect(parseSessionCommand('/approval-mode auto-edits')).toEqual({ type: 'approval-mode', mode: 'auto-edits' })
    expect(parseSessionCommand('/approval-mode plan')).toEqual({ type: 'approval-mode', mode: 'plan' })
    expect(parseSessionCommand('/approval-mode dontask')).toEqual({ type: 'approval-mode', mode: 'dontask' })
  })

  it('非法模式 → usage 拒绝', () => {
    const r = parseSessionCommand('/approval-mode yolo')
    expect(r.type).toBe('approval-mode')
    expect(r.usage).toMatch(/usage: \/approval-mode <manual\|auto-edits\|plan\|dontask>/)
    expect(r.mode).toBeUndefined()
  })

  it('SLASH_COMMANDS 含 /approval-mode', () => {
    expect(SLASH_COMMANDS).toContain('/approval-mode')
  })
})
