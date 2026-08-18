// ─────────────────────────────────────────────────────────────────────────────
// sessionContext.js — persona + 记忆注入基座（todo 13，Electron-free）
// buildSessionContext({ db, sessionId, personaId, userMessage }) →
//   { prefix: [system persona 块, system 记忆块, ...], memoryCount }
// 供 CLI（--persona）/ TUI（/persona）/ SDK 三方共用；runAgent 收到可选
// personaId/db 时内部调用本函数把前缀并入 convo（首条 persona、次条记忆）。
// ─────────────────────────────────────────────────────────────────────────────
const autoMemory = require('./autoMemory')

// 裸 better-sqlite3 → autoMemory.prefetch 需要的 db 面（无则注入跳过）
function ensureMemDb(db) {
  if (!db) return null
  if (typeof db.getMemories === 'function') return db
  try {
    return {
      getMemories(limit = 200) {
        // 与 database.js memory 表列面一致（默认无 confidence 列，不做假设）。
        // H5: 带上 origin 列 —— autoMemory.prefetch 靠它把 origin='external'
        // 的记忆分流进 <untrusted_memory> 降权块。旧库尚无该列时回退查询。
        const l = Number(limit) || 200
        try {
          return db.prepare('SELECT id, content, type, origin, created_at AS createdAt FROM memory ORDER BY id DESC LIMIT ?').all(l)
        } catch {
          return db.prepare('SELECT id, content, type, created_at AS createdAt FROM memory ORDER BY id DESC LIMIT ?').all(l)
        }
      },
      // knowledgeGraph.searchGraph 需要 allRows；kg_nodes/kg_edges 表在裸连接下
      // 不存在时静默返回 []（graph 增强是 best-effort，缺失不报错、不刷日志）。
      allRows(sql, params) {
        try { return db.prepare(sql).all(params || []) } catch { return [] }
      },
    }
  } catch {
    return null
  }
}

/**
 * 组装会话前缀。
 * @param {object} opts
 * @param {object} [opts.db]          数据库（裸连接或带 getMemories 的包装）
 * @param {string|number} [opts.sessionId]
 * @param {string|number} [opts.personaId]  指定 persona 记录 id
 * @param {string} [opts.userMessage]      当前用户消息（记忆相关度打分）
 * @returns {{ prefix: Array<{role:'system', content:string}>, memoryCount: number }}
 */
function buildSessionContext({ db, sessionId, personaId, userMessage } = {}) {
  const prefix = []
  let memoryCount = 0

  // 1) persona system 块
  if (personaId != null && db) {
    try {
      const row = db.prepare('SELECT id, name, prompt FROM persona WHERE id = ?').get(Number(personaId))
      if (row && row.prompt) {
        prefix.push({ role: 'system', content: `[Persona: ${row.name || String(row.id)}]\n${row.prompt}` })
      }
    } catch { /* persona 表缺失/行缺失 → 跳过 */ }
  }

  // 2) 记忆注入（autoMemory.prefetch，keyword 相关度；无 getMemories 面时跳过）
  const memDb = ensureMemDb(db)
  if (memDb && userMessage) {
    try {
      const block = autoMemory.prefetch(memDb, String(userMessage))
      if (block) {
        prefix.push({ role: 'system', content: block })
        memoryCount = block.split('\n').filter((l) => l.trim().startsWith('- ')).length
      }
    } catch { /* 记忆表缺失/查询失败 → 跳过 */ }
  }

  return { prefix, memoryCount }
}

module.exports = { buildSessionContext }
