// H5: memory:create 的 type 白名单 —— 越界 type 拒绝。type 会被 prefetch
// 用来分流（project 恒注入等），放行任意字符串会让渲染层/注入内容操纵
// 记忆行为。
const MEMORY_TYPES = new Set(['fact', 'context', 'project', 'preference', 'review'])

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
    return db.addMemory({ ...data, type, origin: 'user' })
  })
  ipcMain.handle('memory:update', (_e, id, data) => db.updateMemory(id, data))
  ipcMain.handle('memory:delete', (_e, id) => db.deleteMemory(id))
  ipcMain.handle('memory:conflicts', () => db.getMemoryConflicts())
  ipcMain.handle('memory:conflict:resolve', (_e, keepId, removeId) => { db.resolveMemoryConflict(keepId, removeId); return { ok: true } })
  // Increment access count (called when memory is injected into context).
  ipcMain.handle('memory:access', (_e, id) => { db.incrementMemoryAccess(id) })
  // 合并完全重复的记忆(去重失效后积累的冗余数据)。
  ipcMain.handle('memory:dedupe', () => db.mergeDuplicateMemories())
}

module.exports = { registerMemoryHandlers }
