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
  if (typeof db.getMemories === 'function' && typeof db.getMemoriesScoped === 'function') return db
  if (typeof db.getMemories === 'function' && typeof db.getMemoriesScoped !== 'function') {
    return {
      ...db,
      getMemoriesScoped(_scopeKey) {
        return db.getMemories(200)
      }
    }
  }
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
      getMemoriesScoped(scopeKey) {
        try {
          if (scopeKey === null) {
            return db.prepare("SELECT id, content, type, origin, created_at AS createdAt FROM memory WHERE workspace IS NULL ORDER BY created_at DESC, id DESC").all()
          } else if (scopeKey) {
            return db.prepare("SELECT id, content, type, origin, created_at AS createdAt FROM memory WHERE workspace IS NULL OR workspace = ? ORDER BY (workspace IS NULL) ASC, created_at DESC, id DESC").all(String(scopeKey))
          }
        } catch {
          try {
            if (scopeKey === null) {
              return db.prepare("SELECT id, content, type, created_at AS createdAt FROM memory WHERE workspace IS NULL ORDER BY created_at DESC, id DESC").all()
            } else if (scopeKey) {
              return db.prepare("SELECT id, content, type, created_at AS createdAt FROM memory WHERE workspace IS NULL OR workspace = ? ORDER BY (workspace IS NULL) ASC, created_at DESC, id DESC").all(String(scopeKey))
            }
          } catch {}
        }
        return this.getMemories(200)
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
 * @param {object} [opts]
 * @param {object} [opts.db]          数据库（裸连接或带 getMemories 的包装）
 * @param {string|number} [opts.sessionId]
 * @param {string|number} [opts.personaId]  指定 persona 记录 id
 * @param {string} [opts.userMessage]      当前用户消息（记忆相关度打分）
 * @param {string} [opts.cwd]              显式当前工作目录
 * @returns {{ prefix: Array<{role:'system', content:string}>, memoryCount: number }}
 */
function buildSessionContext(opts = {}) {
  const { db, sessionId, personaId, userMessage, cwd } = opts || {}
  const prefix = []
  let memoryCount = 0

  // 1) persona system 块 (stable cache prefix)
  if (personaId != null && db) {
    try {
      const row = db.prepare('SELECT id, name, prompt FROM persona WHERE id = ?').get(Number(personaId))
      if (row && row.prompt) {
        prefix.push({ role: 'system', content: `[Persona: ${row.name || String(row.id)}]\n${row.prompt}`, cacheHint: 'stable' })
      }
    } catch { /* persona 表缺失/行缺失 → 跳过 */ }
  }

  // Determine effective working directory once in function scope
  let effectiveCwd = (cwd && typeof cwd === 'string' && cwd.trim()) ? cwd.trim() : null
  if (!effectiveCwd) {
    try {
      const { getWorkspaceRoot } = require('../tools/sandbox')
      effectiveCwd = getWorkspaceRoot(sessionId)
    } catch {}
  }
  if (!effectiveCwd && sessionId && db) {
    try {
      if (typeof db.getSession === 'function') {
        const s = db.getSession(sessionId)
        if (s && s.cwd) effectiveCwd = s.cwd
      } else if (typeof db.prepare === 'function') {
        const r = db.prepare('SELECT cwd FROM session WHERE id = ?').get(Number(sessionId))
        if (r && r.cwd) effectiveCwd = r.cwd
      }
    } catch {}
  }
  if (!effectiveCwd) {
    effectiveCwd = process.cwd()
  }

  // 2) Context Engine 核心扩充 (AGENTS.md — stable CWD prefix, placed BEFORE dynamic memory!)
  try {
    const fs = require('fs')
    const path = require('path')
    if (effectiveCwd) {
      const agentsMdPath = path.join(effectiveCwd, 'AGENTS.md')
      if (fs.existsSync(agentsMdPath)) {
        const agentsMd = fs.readFileSync(agentsMdPath, 'utf8')
        if (agentsMd && agentsMd.trim()) {
          prefix.push({ role: 'system', content: `[Workspace Context: AGENTS.md]\n${agentsMd.slice(0, 8000)}`, cacheHint: 'stable' })
        }
      }
    }
  } catch { /* 容错：防止因文件读取失败导致会话崩溃 */ }

  // 3) Provider topology snapshot injection (Milestone 3: Feature 18)
  if (db) {
    try {
      const { buildTopologyPromptXml } = require('./providerTopology')
      const topoXml = buildTopologyPromptXml(db)
      if (topoXml) {
        prefix.push({ role: 'system', content: topoXml, cacheHint: 'stable' })
      }
    } catch {
      /* Best-effort topology injection — silent fallback on error */
    }
  }

  // 4) 记忆注入（autoMemory.prefetch，keyword 相关度；dynamic per-turn suffix so stable prefix stays cache-hot）
  const memDb = ensureMemDb(db)
  if (memDb && userMessage) {
    try {
      const block = autoMemory.prefetch(memDb, String(userMessage), effectiveCwd || sessionId)
      if (block) {
        prefix.push({ role: 'system', content: block, cacheHint: 'dynamic' })
        memoryCount = block.split('\n').filter((l) => l.trim().startsWith('- ')).length
      }
    } catch { /* 记忆表缺失/查询失败 → 跳过 */ }
  }

  return { prefix, memoryCount }
}

const fs = require('fs')
const path = require('path')

// Session file activity ledger: Map<sessionId, Map<filePath, { score: number, lastAccessed: number }>>
const _sessionFileActivities = new Map()

/**
 * Record read/edit file activity in a session
 * @param {string|number} sessionId
 * @param {string} filePath
 * @param {'read'|'edit'|string} type
 */
function recordFileActivity(sessionId, filePath, type = 'read') {
  if (!sessionId || !filePath) return
  const sid = String(sessionId)
  if (!_sessionFileActivities.has(sid)) {
    _sessionFileActivities.set(sid, new Map())
  }
  const fileMap = _sessionFileActivities.get(sid)
  const normPath = path.normalize(filePath)
  const current = fileMap.get(normPath) || { score: 0, lastAccessed: Date.now() }
  const weight = (type === 'edit' || type === 'write') ? 2 : 1
  current.score += weight
  current.lastAccessed = Date.now()
  fileMap.set(normPath, current)
}

/**
 * Extract top-N active files for rehydration after compaction
 * @param {string|number} sessionId
 * @param {object} [opts]
 * @param {number} [opts.maxFiles=3]
 * @param {number} [opts.maxLinesPerFile=80]
 * @param {string} [opts.wsRoot]
 * @returns {Array<{ path: string, snippet: string }>}
 */
function getActiveFileSnippets(sessionId, { maxFiles = 3, maxLinesPerFile = 80, wsRoot } = {}) {
  const sid = String(sessionId)
  const fileMap = _sessionFileActivities.get(sid)
  if (!fileMap || fileMap.size === 0) return []

  let effectiveWsRoot = wsRoot
  if (!effectiveWsRoot) {
    try {
      const { getWorkspaceRoot } = require('../tools/sandbox')
      effectiveWsRoot = getWorkspaceRoot(sessionId)
    } catch {}
  }
  if (!effectiveWsRoot) {
    effectiveWsRoot = process.cwd()
  }

  const sortedFiles = Array.from(fileMap.entries())
    .sort((a, b) => b[1].score - a[1].score || b[1].lastAccessed - a[1].lastAccessed)
    .slice(0, maxFiles)

  const maxLines = Math.min(Number(maxLinesPerFile) || 80, 80)
  const snippets = []

  for (const [filePath] of sortedFiles) {
    try {
      let resolved = filePath
      if (effectiveWsRoot && !path.isAbsolute(resolved)) {
        resolved = path.resolve(effectiveWsRoot, resolved)
      }
      if (!fs.existsSync(resolved)) continue

      const stat = fs.statSync(resolved)
      if (stat.isDirectory()) continue

      const maxBytes = Math.min(stat.size, Math.max(4096, maxLines * 500))
      let text = ''
      if (maxBytes > 0) {
        const buf = Buffer.alloc(maxBytes)
        const fd = fs.openSync(resolved, 'r')
        let bytesRead = 0
        try {
          bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0)
        } finally {
          fs.closeSync(fd)
        }
        text = buf.toString('utf8', 0, bytesRead)
      }
      const lines = text.split(/\r?\n/).slice(0, maxLines)
      const snippet = lines.join('\n')
      snippets.push({
        path: filePath,
        snippet,
      })
    } catch {
      // Tolerate file read errors gracefully
    }
  }

  return snippets
}

function clearFileActivities(sessionId) {
  if (sessionId === undefined) {
    _sessionFileActivities.clear()
  } else {
    _sessionFileActivities.delete(String(sessionId))
  }
}

module.exports = {
  buildSessionContext,
  recordFileActivity,
  getActiveFileSnippets,
  clearFileActivities,
}
