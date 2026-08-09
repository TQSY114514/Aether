// ─────────────────────────────────────────────────────────────────────────────
// memory.test.js — TUI 记忆检索（todo 8）
// 验收：mock db 有 memory → /memory 关键词 → 渲染卡片（内容/时间/来源）。
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMemoryDb, searchMemory } from '../../tui/memorySearch.js'
import { parseSessionCommand } from '../../tui/sessionCommands.js'
import { tuiReducer, initialTuiState } from '../../tui/reducer.js'

const tmpDirs = []
function seedDb() {
  const dir = mkdtempSync(join(tmpdir(), 'memory-'))
  tmpDirs.push(dir)
  const dbPath = join(dir, 'test.db')
  const db = new Database(dbPath)
  db.exec("CREATE TABLE memory (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, type TEXT DEFAULT 'fact', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
  db.prepare('INSERT INTO memory (content, type) VALUES (?, ?)').run('用户偏好使用 TypeScript 写后端服务', 'preference')
  db.prepare('INSERT INTO memory (content, type) VALUES (?, ?)').run('项目采用 vitest 作为测试框架', 'fact')
  db.prepare('INSERT INTO memory (content, type) VALUES (?, ?)').run('deploy pipeline uses GitHub Actions', 'fact')
  db.close()
  return dbPath
}
afterAll(() => { for (const d of tmpDirs) { try { rmSync(d, { recursive: true, force: true }) } catch {} } })

describe('/memory 检索（todo 8）', () => {
  it('中文关键词命中并带时间/类型（keyword 兜底路径）', () => {
    const dbPath = seedDb()
    const { results } = searchMemory(dbPath, 'vitest')
    expect(results.length).toBeGreaterThan(0)
    const hit = results.find((r) => r.content.includes('vitest'))
    expect(hit).toBeTruthy()
    expect(hit.createdAt).toBeTruthy() // 时间
    expect(hit.type).toBe('fact')      // 来源类型
  })

  it('偏好类记忆可检索', () => {
    const dbPath = seedDb()
    const { results } = searchMemory(dbPath, 'TypeScript 偏好')
    const hit = results.find((r) => r.content.includes('TypeScript'))
    expect(hit).toBeTruthy()
    expect(hit.type).toBe('preference')
  })

  it('无匹配 → 空结果不抛错', () => {
    const dbPath = seedDb()
    const { results } = searchMemory(dbPath, '不存在的关键词xyz123')
    expect(Array.isArray(results)).toBe(true)
  })

  it('db 缺失 → 空结果不抛错', () => {
    const { results } = searchMemory(join(tmpdir(), 'does-not-exist-memory', 'x.db'), 'q')
    expect(results).toEqual([])
  })

  it('MEMORY_SET → reducer 渲染卡片数据（内容+时间+类型）', () => {
    const dbPath = seedDb()
    const { results } = searchMemory(dbPath, 'vitest')
    const state = tuiReducer(initialTuiState, { type: 'MEMORY_SET', results })
    expect(state.memoryResults.length).toBeGreaterThan(0)
    const card = state.memoryResults[0]
    expect(card.content).toBeTruthy()
    expect(card.createdAt).toBeTruthy()
    expect(card.type).toBeTruthy()
  })

  it('/memory 命令解析', () => {
    expect(parseSessionCommand('/memory vitest')).toEqual({ type: 'memory', query: 'vitest' })
    expect(parseSessionCommand('/memory')).toEqual({ type: 'memory' })
  })

  it('createMemoryDb 包装暴露 getMemories（autoMemory.search 需要）', () => {
    const dbPath = seedDb()
    const db = createMemoryDb(dbPath)
    expect(typeof db.getMemories).toBe('function')
    expect(typeof db.searchMemories).toBe('function')
    const rows = db.getMemories()
    expect(rows.length).toBe(3)
  })
})
