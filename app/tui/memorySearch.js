// ─────────────────────────────────────────────────────────────────────────────
// memorySearch.js — TUI 记忆检索（todo 8）
// Electron-free：裸 better-sqlite3 → autoMemory.search 需要的 db 面
// （getMemories/searchMemories）。无 FTS 表时 searchMemories 返回 null，
// autoMemory.search 自动走 keyword 打分兜底（兼容 CJK）。
// ─────────────────────────────────────────────────────────────────────────────
import { openDatabase } from '../electron/llm/agentCore.js'
import { search } from '../electron/llm/autoMemory.js'

export function createMemoryDb(dbPath) {
  const raw = openDatabase(dbPath)
  if (!raw) return null
  return {
    getMemories() {
      try {
        return raw.prepare('SELECT id, content, type, created_at AS createdAt FROM memory ORDER BY id DESC').all()
      } catch {
        return []
      }
    },
    // 无 FTS 索引 → 交给 autoMemory.search 的 keyword 兜底
    searchMemories() { return null },
  }
}

/**
 * 检索记忆。返回 { results }（db 缺失时 results 为空数组，不抛错）。
 * 结果行：{ id, content, type, createdAt, _score? }。
 */
export function searchMemory(dbPath, query, limit = 20) {
  const db = createMemoryDb(dbPath)
  if (!db) return { results: [] }
  try {
    return { results: search(db, String(query || ''), limit) }
  } catch {
    return { results: [] }
  }
}
