// ─────────────────────────────────────────────────────────────────────────────
// sessionTree.js — TUI 会话树操作（todo 5）
// Electron-free 薄封装：openDatabase + taskDbAdapter（与 CLI --task 同款 DB 面）。
// ─────────────────────────────────────────────────────────────────────────────
import { openDatabase } from '../electron/llm/agentCore.js'
import { taskDbAdapter } from '../electron/llm/taskDbAdapter.js'

export function openSessionDb(dbPath) {
  return openDatabase(dbPath)
}

/** 最近会话列表（含 parent 指针，供 /sessions + 树展示）。 */
export function listSessions(db, limit = 50) {
  if (!db) return []
  try {
    return db.prepare(
      'SELECT id, title, parent_session_id AS parentId, created_at AS createdAt FROM session ORDER BY id DESC LIMIT ?',
    ).all(limit)
  } catch {
    return []
  }
}

/**
 * fork 子会话：父会话 id 写入 parent_session_id（todo 5，不级联删除）。
 * @returns {{ lastInsertRowid: number }}
 */
export function forkSession(db, { title, parentSessionId }) {
  return taskDbAdapter(db).createSession({ title: title || 'fork', parentSessionId })
}
