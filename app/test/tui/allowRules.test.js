// ─────────────────────────────────────────────────────────────────────────────
// allowRules.test.js — 三态权限规则存储（W4-t24）
// 验收：decision 三态（allow/deny/ask/null）; 会话级 > 持久化;
// 精确键 > 通配 `name:*`; 持久化层经 settings 表（permission_rule.<scope>.<key>）,
// 重启模拟（新 store 实例 + 同 db）规则仍在; 非法 decision 行防御性跳过;
// 向后兼容 match() 布尔语义; isReadOnlyTool 兼容真实工具名（read_file 等）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEmptyDatabase } from '../../electron/database.js'
import { taskDbAdapter } from '../../electron/llm/taskDbAdapter.js'
import {
  createAllowRulesStore, loadPersistedRules, savePersistedRule, removePersistedRule,
  permissionRuleKey, isReadOnlyTool, isWriteTool, RULE_DECISIONS,
} from '../../tui/allowRules.js'

let dbPath = ''
let db = null

beforeAll(() => {
  dbPath = join(tmpdir(), `tui-rules-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`)
  db = createEmptyDatabase(dbPath)
})

afterAll(() => {
  try { db?.close() } catch {}
  try { rmSync(dbPath, { force: true }) } catch {}
  try { rmSync(`${dbPath}-wal`, { force: true }) } catch {}
  try { rmSync(`${dbPath}-shm`, { force: true }) } catch {}
})

describe('ruleKey 计算（与 toolLoopCallbacks.js 语义一致）', () => {
  it('run_command → 首 token', () => {
    const store = createAllowRulesStore()
    expect(store.keyOf('run_command', { command: 'git status' })).toBe('git')
    expect(store.keyOf('run_command', { command: '  npm  i ' })).toBe('npm')
  })
  it('write_file / edit_file → 目录（路径去除文件名段）', () => {
    const store = createAllowRulesStore()
    expect(store.keyOf('write_file', { path: 'src/app.js' })).toBe('src')
    expect(store.keyOf('write_file', { path: 'C:\\work\\a.txt' })).toBe('C:\\work')
    expect(store.keyOf('edit_file', { path: 'plain.txt' })).toBe('plain.txt')
  })
  it('其余工具 → 通配 *', () => {
    const store = createAllowRulesStore()
    expect(store.keyOf('web_fetch', { url: 'https://x' })).toBe('*')
  })
})

describe('三态决策（W4-t24）', () => {
  it('无规则 → decision null / match false', () => {
    const store = createAllowRulesStore()
    expect(store.decision('tui', 'run_command', { command: 'git status' })).toBeNull()
    expect(store.match('tui', 'run_command', { command: 'git status' })).toBe(false)
  })

  it('会话级 allow → decision allow / match true', () => {
    const store = createAllowRulesStore()
    store.add('tui', 'run_command', { command: 'git status' })
    expect(store.decision('tui', 'run_command', { command: 'git status' })).toBe('allow')
    expect(store.match('tui', 'run_command', { command: 'git status' })).toBe(true)
    expect(store.match('tui', 'run_command', { command: 'rm -rf x' })).toBe(false)
  })

  it('会话级 deny（setSessionRule）→ decision deny / match false', () => {
    const store = createAllowRulesStore()
    store.setSessionRule('tui', 'run_command:rm', 'deny')
    expect(store.decision('tui', 'run_command', { command: 'rm -rf x' })).toBe('deny')
    expect(store.match('tui', 'run_command', { command: 'rm -rf x' })).toBe(false)
  })

  it('setSessionRule 非法 decision → 抛错（不静默写入）', () => {
    const store = createAllowRulesStore()
    expect(() => store.setSessionRule('tui', 'a:b', 'maybe')).toThrow(/invalid decision/)
  })

  it('会话级规则按 sessionId 隔离', () => {
    const store = createAllowRulesStore()
    store.add('tui', 'run_command', { command: 'git status' })
    expect(store.decision('other', 'run_command', { command: 'git status' })).toBeNull()
  })
})

describe('持久化层（settings 表, 重启存活）', () => {
  it('seeded 持久化 deny → 新 store 实例 decision deny / match false', () => {
    savePersistedRule(db, 'run_command', 'rm', 'deny')
    const store = createAllowRulesStore({ db })
    expect(store.decision('tui', 'run_command', { command: 'rm -rf x' })).toBe('deny')
    expect(store.match('tui', 'run_command', { command: 'rm -rf x' })).toBe(false)
    removePersistedRule(db, 'run_command', 'rm') // 清场, 不污染其他用例
  })

  it('seeded 持久化 allow → 重启后仍 allow（QA: permission_rule.run_command.git_status=allow）', () => {
    taskDbAdapter(db).setSetting('permission_rule.run_command.git_status', 'allow')
    const store = createAllowRulesStore({ db })
    expect(store.decision('tui', 'run_command', { command: 'git_status --short' })).toBe('allow')
    expect(store.match('tui', 'run_command', { command: 'git_status --short' })).toBe(true)
  })

  it('persist() 写 settings 行 + 内存同步; 新 store 实例可见（重启模拟）', () => {
    const s1 = createAllowRulesStore({ db })
    s1.persist(db, 'run_command', 'npm', 'deny')
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('permission_rule.run_command.npm')
    expect(row).toEqual({ value: 'deny' })
    // 同一 db 上的全新实例（模拟重启）→ 规则仍在
    const s2 = createAllowRulesStore({ db })
    expect(s2.decision('tui', 'run_command', { command: 'npm install' })).toBe('deny')
    // 清场
    s1.removePersisted(db, 'run_command', 'npm')
  })

  it('removePersisted 删 settings 行 + 内存同步', () => {
    const s1 = createAllowRulesStore({ db })
    s1.persist(db, 'write_file', 'src', 'ask')
    expect(s1.decision('tui', 'write_file', { path: 'src/a.js' })).toBe('ask')
    s1.removePersisted(db, 'write_file', 'src')
    expect(s1.decision('tui', 'write_file', { path: 'src/a.js' })).toBeNull()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('permission_rule.write_file.src')
    expect(row).toBeUndefined()
  })

  it('loadPersistedRules 防御: 非法 decision 行跳过, 不抛错', () => {
    taskDbAdapter(db).setSetting('permission_rule.run_command.bogus', 'maybe')
    taskDbAdapter(db).setSetting('permission_rule.run_command.ok', 'ask')
    const rules = loadPersistedRules(db)
    expect(rules.has('run_command:bogus')).toBe(false)
    expect(rules.get('run_command:ok')).toBe('ask')
    // 清场
    db.prepare('DELETE FROM settings WHERE key IN (?, ?)')
      .run('permission_rule.run_command.bogus', 'permission_rule.run_command.ok')
  })

  it('persist 非法 decision → 抛错且不写库', () => {
    const store = createAllowRulesStore({ db })
    expect(() => store.persist(db, 'run_command', 'x', 'maybe')).toThrow(/invalid decision/)
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('permission_rule.run_command.x')
    expect(row).toBeUndefined()
  })

  it('无 db 时 persist 仅内存生效（降级不抛错）', () => {
    const store = createAllowRulesStore()
    store.persist(null, 'run_command', 'git', 'allow')
    expect(store.decision('tui', 'run_command', { command: 'git log' })).toBe('allow')
  })

  it("ruleKey 含 '.' 的键保真（首段切出工具名, 其余为 ruleKey）", () => {
    taskDbAdapter(db).setSetting('permission_rule.run_command.git.exe', 'deny')
    const store = createAllowRulesStore({ db })
    expect(store.decision('tui', 'run_command', { command: 'git.exe status' })).toBe('deny')
    db.prepare('DELETE FROM settings WHERE key = ?').run('permission_rule.run_command.git.exe')
  })
})

describe('优先级（W4-t24）', () => {
  it('会话级 > 持久化（同键会话 allow 覆盖持久化 deny）', () => {
    savePersistedRule(db, 'run_command', 'rm', 'deny')
    const store = createAllowRulesStore({ db })
    store.add('tui', 'run_command', { command: 'rm -rf x' })
    expect(store.decision('tui', 'run_command', { command: 'rm -rf x' })).toBe('allow')
    // 其他会话无会话规则 → 持久化 deny 生效
    expect(store.decision('other', 'run_command', { command: 'rm -rf x' })).toBe('deny')
    removePersistedRule(db, 'run_command', 'rm')
  })

  it('精确键 > 通配 `name:*`（deny 具体命令盖过 allow 通配）', () => {
    savePersistedRule(db, 'run_command', '*', 'allow')
    savePersistedRule(db, 'run_command', 'rm', 'deny')
    const store = createAllowRulesStore({ db })
    expect(store.decision('tui', 'run_command', { command: 'rm -rf x' })).toBe('deny')
    expect(store.decision('tui', 'run_command', { command: 'git status' })).toBe('allow')
    // 清场
    db.prepare('DELETE FROM settings WHERE key IN (?, ?)')
      .run('permission_rule.run_command.*', 'permission_rule.run_command.rm')
  })

  it('同层通配兜底: 仅 `name:*` 时其余命令命中通配', () => {
    const store = createAllowRulesStore()
    store.setSessionRule('tui', 'run_command:*', 'allow')
    expect(store.decision('tui', 'run_command', { command: 'anything --x' })).toBe('allow')
  })

  it('ask 决策原样返回（不吞掉询问语义）', () => {
    const store = createAllowRulesStore()
    store.setSessionRule('tui', 'write_file:src', 'ask')
    expect(store.decision('tui', 'write_file', { path: 'src/a.js' })).toBe('ask')
    expect(store.match('tui', 'write_file', { path: 'src/a.js' })).toBe(false)
  })
})

describe('会话规则列表 API（W4-t25 对话框数据源）', () => {
  it('list / listPersisted 返回 [{ key, decision }]', () => {
    const store = createAllowRulesStore()
    store.add('tui', 'run_command', { command: 'git status' })
    store.add('tui', 'write_file', { path: 'src/app.js' })
    expect(store.list('tui')).toEqual([
      { key: 'run_command:git', decision: 'allow' },
      { key: 'write_file:src', decision: 'allow' },
    ])
    expect(store.list('nope')).toEqual([])
    expect(store.listPersisted()).toEqual([])
    store.remove('tui', 'run_command:git')
    expect(store.list('tui')).toEqual([{ key: 'write_file:src', decision: 'allow' }])
  })

  it('clear 清空会话规则', () => {
    const store = createAllowRulesStore()
    store.add('tui', 'run_command', { command: 'git status' })
    store.clear('tui')
    expect(store.list('tui')).toEqual([])
    expect(store.decision('tui', 'run_command', { command: 'git status' })).toBeNull()
  })
})

describe('工具名判定（W4-t26; READ_ONLY_TOOLS 短名 vs 真实工具名）', () => {
  it('isReadOnlyTool: 真实工具名 read_file/list_dir/grep_search/glob_find 全部命中', () => {
    expect(isReadOnlyTool('read_file')).toBe(true)
    expect(isReadOnlyTool('list_dir')).toBe(true)
    expect(isReadOnlyTool('grep_search')).toBe(true)
    expect(isReadOnlyTool('glob_find')).toBe(true)
  })
  it('isReadOnlyTool: 桌面短名原样命中; 写/执行工具不命中', () => {
    expect(isReadOnlyTool('read')).toBe(true)
    expect(isReadOnlyTool('write_file')).toBe(false)
    expect(isReadOnlyTool('edit_file')).toBe(false)
    expect(isReadOnlyTool('run_command')).toBe(false)
    expect(isReadOnlyTool('')).toBe(false)
  })
  it('isWriteTool: 兼容 edit/write 与 edit_file/write_file', () => {
    expect(isWriteTool('write_file')).toBe(true)
    expect(isWriteTool('edit_file')).toBe(true)
    expect(isWriteTool('write')).toBe(true)
    expect(isWriteTool('edit')).toBe(true)
    expect(isWriteTool('read_file')).toBe(false)
  })
  it('RULE_DECISIONS 恒为 allow|deny|ask（存根常量）', () => {
    expect(RULE_DECISIONS).toEqual(['allow', 'deny', 'ask'])
  })
  it('permissionRuleKey 格式: permission_rule.<name>.<ruleKey>', () => {
    expect(permissionRuleKey('run_command', 'git_status')).toBe('permission_rule.run_command.git_status')
  })
})
