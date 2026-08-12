// ───────────────────────────────────────────────────────────────────────────
// Feature-flag IPC handler (Phase 0 infrastructure).
//
// Exposes the centralized flag registry to the renderer:
//   flags:list  → full listing (key / default / value / enabled / category)
//   flags:set   → persist a toggle; emits `flags:changed` on ipcMain so any
//                 in-process listener (settings UI cache, main-process
//                 consumers) can react.
// ───────────────────────────────────────────────────────────────────────────

const flags = require('../featureFlags')

function registerFlagsHandlers(ipcMain, db) {
  ipcMain.handle('flags:list', () => flags.list(db))

  ipcMain.handle('flags:set', async (_e, key, value) => {
    const result = flags.set(db, key, value)
    if (result.ok) {
      // Emit on ipcMain so main-process modules can subscribe to flag changes
      // without importing the renderer window.
      try { ipcMain.emit('flags:changed', key, result.value) } catch {}
    }
    return result
  })

  // 一键安全默认: 关闭全部 Experimental/Beta 能力(保留 debug 观测与
  // 已发布 UX), 返回实际写入的清单; 供 Settings 页"安全模式"按钮调用。
  ipcMain.handle('flags:safe-mode', () => {
    const written = flags.applySafeMode(db)
    for (const w of written) {
      try { ipcMain.emit('flags:changed', w.key, w.value) } catch {}
    }
    return { ok: true, written }
  })
}

module.exports = { registerFlagsHandlers }
