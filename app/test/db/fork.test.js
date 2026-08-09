// ─────────────────────────────────────────────────────────────────────────────
// fork.test.js — 会话树 fork（todo 5）
// 验收：迁移后 PRAGMA table_info(session) 含 parent 列；建会话→fork→断言
// parent 指向；taskDbAdapter 与 sessionTree 同 SQL 同列行为；vitest 全绿。
// （database.js 依赖 Electron app，无法 headless 导入——用同款 schema + 同款
// addCol 机制复刻迁移验证。）
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { taskDbAdapter } from '../../electron/llm/taskDbAdapter.js'
import { parseSessionCommand } from '../../tui/sessionCommands.js'
import { openSessionDb, listSessions, forkSession } from '../../tui/sessionTree.js'

const tmpDirs = []
function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'fork-'))
  tmpDirs.push(dir)
  const dbPath = join(dir, 'test.db')
  const db = new Database(dbPath)
  // 复刻 database.js:112 的旧 session schema（无 parent_session_id）
  db.exec("CREATE TABLE session (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT '新会话', persona_id INTEGER, pinned INTEGER NOT NULL DEFAULT 0, config TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, is_placeholder INTEGER NOT NULL DEFAULT 0)")
  return { db, dbPath, dir }
}
afterAll(() => { for (const d of tmpDirs) { try { rmSync(d, { recursive: true, force: true }) } catch {} } })

// 与 database.js:281-285 完全一致的 addCol 迁移机制
function applyAddColMigration(db) {
  const cols = db.prepare('PRAGMA table_info(session)').all().map((c) => c.name)
  if (!cols.includes('parent_session_id')) {
    db.exec('ALTER TABLE session ADD COLUMN parent_session_id INTEGER')
  }
}

describe('session.parent_session_id 迁移（todo 5）', () => {
  it('旧库迁移后 PRAGMA table_info(session) 含 parent 列', () => {
    const { db } = makeDb()
    const before = db.prepare('PRAGMA table_info(session)').all().map((c) => c.name)
    expect(before).not.toContain('parent_session_id')
    applyAddColMigration(db)
    const after = db.prepare('PRAGMA table_info(session)').all().map((c) => c.name)
    expect(after).toContain('parent_session_id')
    db.close()
  })

  it('迁移幂等：重复执行不报错', () => {
    const { db } = makeDb()
    applyAddColMigration(db)
    applyAddColMigration(db) // 第二次：列已存在，跳过
    const after = db.prepare('PRAGMA table_info(session)').all().map((c) => c.name)
    expect(after).toContain('parent_session_id')
    db.close()
  })
})

describe('建会话 → fork → parent 指向（todo 5）', () => {
  it('taskDbAdapter.createSession 写 parent_session_id，父指针正确', () => {
    const { db } = makeDb()
    applyAddColMigration(db)
    const adapter = taskDbAdapter(db)
    const root = adapter.createSession({ title: 'root' })
    const child = adapter.createSession({ title: 'child', parentSessionId: root.lastInsertRowid })
    const row = db.prepare('SELECT parent_session_id FROM session WHERE id = ?').get(child.lastInsertRowid)
    expect(row.parent_session_id).toBe(root.lastInsertRowid)
    // 根会话 parent 为空
    const rootRow = db.prepare('SELECT parent_session_id FROM session WHERE id = ?').get(root.lastInsertRowid)
    expect(rootRow.parent_session_id).toBeNull()
    db.close()
  })

  it('sessionTree.forkSession + listSessions 展示父指针（TUI 侧同款）', () => {
    const { db, dbPath } = makeDb()
    applyAddColMigration(db)
    const tree = openSessionDb(dbPath) || db
    const root = forkSession(tree, { title: 'main' })
    const child = forkSession(tree, { title: 'feature', parentSessionId: root.lastInsertRowid })
    const list = listSessions(tree)
    const childRow = list.find((s) => s.id === child.lastInsertRowid)
    const rootRow = list.find((s) => s.id === root.lastInsertRowid)
    expect(childRow.parentId).toBe(root.lastInsertRowid)
    expect(rootRow.parentId).toBeNull()
    tree.close()
    db.close()
  })

  it('fork 不级联删除父会话（外键关闭，行为与 database.js 一致）', () => {
    const { db } = makeDb()
    applyAddColMigration(db)
    const adapter = taskDbAdapter(db)
    const root = adapter.createSession({ title: 'root' })
    const child = adapter.createSession({ title: 'child', parentSessionId: root.lastInsertRowid })
    db.prepare('DELETE FROM session WHERE id = ?').run(child.lastInsertRowid)
    const rootRow = db.prepare('SELECT id FROM session WHERE id = ?').get(root.lastInsertRowid)
    expect(rootRow).not.toBeUndefined()
    db.close()
  })
})

describe('TUI 命令解析（todo 5）', () => {
  it('/sessions /use /fork 解析', () => {
    expect(parseSessionCommand('/sessions')).toEqual({ type: 'sessions' })
    expect(parseSessionCommand('/use 3')).toEqual({ type: 'use', sessionId: 3 })
    expect(parseSessionCommand('/use abc')).toEqual({ type: 'use', sessionId: null })
    expect(parseSessionCommand('/fork fix bug')).toEqual({ type: 'fork', title: 'fix bug' })
    expect(parseSessionCommand('/fork')).toEqual({ type: 'fork' })
    expect(parseSessionCommand('normal text')).toBeNull()
    expect(parseSessionCommand('/unknown')).toBeNull()
  })
})
