// H5: memory:create 的 type 白名单 —— 越界 type 拒绝。type 会被 prefetch
// 用来分流（project 恒注入等），放行任意字符串会让渲染层/注入内容操纵
// 记忆行为。
const path = require('path')
const fs = require('fs')
const os = require('os')
const MEMORY_TYPES = new Set(['fact', 'context', 'project', 'preference', 'review'])
const memoryProjector = require('../llm/memoryProjector')
const { isAuthorizedWorkspace, isWorkspaceTrusted, getWorkspaceRoot } = require('../tools/sandbox')

function registerMemoryHandlers(ipcMain, db) {
  // Project Brain: memory:list 接受可选 {workspace} 过滤 —— 传入时返回全局行
  // (workspace IS NULL) + 当前 workspace 行(getMemoriesScoped)，workspace 字段
  // 随行可见供 UI 区分 Global/Project；未传时回退全量列表(旧行为)。
  ipcMain.handle('memory:list', (_e, opts) => {
    const workspace = opts && opts.workspace ? String(opts.workspace) : null
    return workspace ? db.getMemoriesScoped(workspace) : db.getMemories()
  })
  ipcMain.handle('memory:create', (_e, data) => {
    const type = data && data.type != null && data.type !== '' ? String(data.type) : 'fact'
    if (!MEMORY_TYPES.has(type)) throw new Error(`invalid memory type: ${type}`)
    // 手动创建的记忆 origin='user'（与自动提取的 'assistant'、外部来源的
    // 'external' 区分）。addMemory 未消费该字段时自动忽略，无害。
    const res = db.addMemory({ ...data, type, origin: 'user' })
    if (data && data.workspace && isAuthorizedWorkspace(db, data.workspace)) {
      memoryProjector.debounceProjectWorkspaceMemory(db, data.workspace)
    }
    return res
  })
  ipcMain.handle('memory:update', (_e, id, data) => {
    const res = db.updateMemory(id, data)
    let ws = data && data.workspace
    if (!ws) {
      try {
        const row = db.prepare ? db.prepare('SELECT workspace FROM memory WHERE id = ?').get(id) : null
        ws = row?.workspace || null
      } catch {}
    }
    if (ws && isAuthorizedWorkspace(db, ws)) memoryProjector.debounceProjectWorkspaceMemory(db, ws)
    return res
  })
  ipcMain.handle('memory:delete', (_e, id) => {
    let ws = null
    try {
      const row = db.prepare ? db.prepare('SELECT workspace FROM memory WHERE id = ?').get(id) : null
      ws = row?.workspace || null
    } catch {}
    const res = db.deleteMemory(id)
    if (ws && isAuthorizedWorkspace(db, ws)) memoryProjector.debounceProjectWorkspaceMemory(db, ws)
    return res
  })
  ipcMain.handle('memory:conflicts', () => db.getMemoryConflicts())
  ipcMain.handle('memory:conflict:resolve', (_e, keepId, removeId) => { db.resolveMemoryConflict(keepId, removeId); return { ok: true } })
  // Increment access count (called when memory is injected into context).
  ipcMain.handle('memory:access', (_e, id) => { db.incrementMemoryAccess(id) })
  // 合并完全重复的记忆(去重失效后积累的冗余数据)。
  ipcMain.handle('memory:dedupe', () => db.mergeDuplicateMemories())

  // MEMORY.md 双轨文件投射与同步
  ipcMain.handle('memory:project-workspace', (_e, ws) => {
    const targetWs = ws ? path.resolve(ws) : getWorkspaceRoot()
    if (!targetWs || !isAuthorizedWorkspace(db, targetWs)) {
      return { success: false, count: 0, updated: false, error: 'Unauthorized workspace: path does not match any configured session workspace' }
    }
    return memoryProjector.projectWorkspaceMemory(db, targetWs)
  })
  ipcMain.handle('memory:sync-from-file', (_e, ws) => {
    const targetWs = ws ? path.resolve(ws) : getWorkspaceRoot()
    if (!targetWs || !isAuthorizedWorkspace(db, targetWs)) {
      return { success: false, added: 0, removed: 0, total: 0, error: 'Unauthorized workspace: path does not match any configured session workspace' }
    }
    const isTrusted = isWorkspaceTrusted(db, targetWs)
    return memoryProjector.syncMemoryFileToDb(db, targetWs, { origin: isTrusted ? 'user' : 'external' })
  })
  ipcMain.handle('memory:file-status', (_e, ws) => {
    const targetWs = ws ? path.resolve(ws) : getWorkspaceRoot()
    if (!targetWs || !isAuthorizedWorkspace(db, targetWs)) {
      return { exists: false, path: null, mtime: null, lineCount: 0 }
    }
    return memoryProjector.getMemoryFileStatus(targetWs)
  })
  ipcMain.handle('memory:pin-to-agents-md', (_e, { id, content, workspace }) => {
    let ws = workspace ? path.resolve(workspace) : getWorkspaceRoot()
    if (!ws || !isAuthorizedWorkspace(db, ws)) {
      ws = null
    }
    const targetFile = ws ? path.join(ws, 'AGENTS.md') : path.join(os.homedir(), '.aether', 'AGENTS.md')
    try {
      fs.mkdirSync(path.dirname(targetFile), { recursive: true })
      let prev = ''
      if (fs.existsSync(targetFile)) {
        prev = fs.readFileSync(targetFile, 'utf8')
      }
      const header = '## Pinned Rules / Memories'
      const entry = `- ${String(content).trim()}`
      let next = ''
      if (prev.includes(header)) {
        next = prev.replace(header, `${header}\n${entry}`)
      } else {
        next = `${prev.trim()}\n\n${header}\n${entry}\n`.trimStart()
      }
      fs.writeFileSync(targetFile, next, 'utf8')
      return { success: true, targetFile }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('memory:distill-skill', async (_e, { sessionId, clusterIds }) => {
    try {
      const bridge = require('../llm/memorySkillBridge')
      const electron = require('electron')
      const app = electron?.app || (typeof electron === 'object' ? electron : null)
      const skillsDir = app?.getPath
        ? path.join(app.getPath('userData'), 'skills')
        : path.join(process.cwd(), '.aetherai', 'skills')

      let memories = []
      if (Array.isArray(clusterIds) && clusterIds.length > 0) {
        for (const cid of clusterIds) {
          try {
            const row = db.prepare('SELECT * FROM memory WHERE id = ?').get(cid)
            if (row) memories.push(row)
          } catch {}
        }
      }
      if (memories.length < bridge.MIN_CLUSTER_SIZE) {
        memories = (db.getMemories(30) || []).slice(0, 5)
      }

      const pId = db.getSetting('llm.lastProvider') || db.getSetting('activeProviderId')
      const mName = db.getSetting('llm.lastModel') || db.getSetting('activeModelId')
      let provider = null, model = null
      if (pId) {
        try { provider = db.getProvider(Number(pId)) || db.getProviders().find(p => p.id === Number(pId) || p.name === pId) } catch {}
      }
      if (!provider) {
        const providers = db.getProviders()
        provider = providers.find(p => p.is_active) || providers[0]
      }
      if (provider) {
        const models = db.getModels(provider.id)
        model = models.find(m => m.model_name === mName) || models[0]
      }

      if (!provider || !model) {
        return { success: false, error: 'No active provider/model found for skill distillation' }
      }

      const draft = await bridge.generateDraftSkill({ provider, model, memories })
      if (!draft) {
        return { success: false, error: 'Failed to generate draft skill' }
      }
      const saved = bridge.saveDraftSkill(draft, skillsDir)
      return { success: !!saved, draft: saved }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}

module.exports = { registerMemoryHandlers }
