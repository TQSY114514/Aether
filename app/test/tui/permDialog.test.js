// ─────────────────────────────────────────────────────────────────────────────
// permDialog.test.js — /permissions 对话框纯逻辑（W4-t25）
// 验收：mergeRules 合并会话级 + 持久化规则并标注来源; splitRuleKey 首个 ':' 切分
// （Windows 盘符保留）; filterRules 过滤（name/ruleKey/decision/source）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { mergeRules, filterRules, splitRuleKey } from '../../tui/permDialog.js'

describe('splitRuleKey（W4-t25）', () => {
  it('首个 : 切分工具名与规则键', () => {
    expect(splitRuleKey('run_command:git')).toEqual({ name: 'run_command', ruleKey: 'git' })
    expect(splitRuleKey('run_command:*')).toEqual({ name: 'run_command', ruleKey: '*' })
  })
  it('Windows 盘符冒号保留在 ruleKey 侧（首冒号切分）', () => {
    expect(splitRuleKey('write_file:C:\\src')).toEqual({ name: 'write_file', ruleKey: 'C:\\src' })
  })
  it('无冒号 → name 原样, ruleKey 空（防御）', () => {
    expect(splitRuleKey('lonely')).toEqual({ name: 'lonely', ruleKey: '' })
  })
})

describe('mergeRules（W4-t25）', () => {
  it('会话行在前 + 持久化行在后, 来源标注', () => {
    const session = [{ key: 'run_command:git', decision: 'allow' }]
    const persisted = [{ key: 'run_command:rm', decision: 'deny' }, { key: 'write_file:src', decision: 'ask' }]
    expect(mergeRules(session, persisted)).toEqual([
      { key: 'run_command:git', name: 'run_command', ruleKey: 'git', decision: 'allow', source: 'session' },
      { key: 'run_command:rm', name: 'run_command', ruleKey: 'rm', decision: 'deny', source: 'persisted' },
      { key: 'write_file:src', name: 'write_file', ruleKey: 'src', decision: 'ask', source: 'persisted' },
    ])
  })
  it('空输入防御（null/undefined/缺省）', () => {
    expect(mergeRules(undefined, undefined)).toEqual([])
    expect(mergeRules(null, [])).toEqual([])
    expect(mergeRules([], null)).toEqual([])
  })
})

describe('filterRules（W4-t25）', () => {
  const rules = mergeRules(
    [{ key: 'run_command:git', decision: 'allow' }],
    [{ key: 'run_command:rm', decision: 'deny' }, { key: 'write_file:src', decision: 'ask' }],
  )
  it('空 filter → 原样返回', () => {
    expect(filterRules(rules, '')).toBe(rules)
    expect(filterRules(rules, null)).toBe(rules)
  })
  it('按 name 过滤（大小写不敏感）', () => {
    expect(filterRules(rules, 'RUN_COMMAND').map((r) => r.key)).toEqual(['run_command:git', 'run_command:rm'])
  })
  it('按 ruleKey / decision / source 过滤', () => {
    expect(filterRules(rules, 'deny').map((r) => r.key)).toEqual(['run_command:rm'])
    expect(filterRules(rules, 'persisted').map((r) => r.key)).toEqual(['run_command:rm', 'write_file:src'])
    expect(filterRules(rules, 'src').map((r) => r.key)).toEqual(['write_file:src'])
  })
  it('无命中 → 空数组', () => {
    expect(filterRules(rules, 'zzz')).toEqual([])
  })
})
