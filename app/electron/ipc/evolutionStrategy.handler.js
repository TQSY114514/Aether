'use strict'
// ─── 策略库 IPC（自进化反思产物，有界 STRATEGY.md）────────────────────────
// 从 main.js 迁出，遵循 ipc/ 模块化惯例（参照 memory.handler.js / kg.handler.js）。

function registerStrategyHandlers(ipcMain, db) {
  ipcMain.handle('evolution:strategy:get', () => {
    try {
      const s = require('../evolution/strategyStore')
      return { ...s.stats(), entries: s.load().entries, file: s.getStoreFile() }
    } catch (e) { return { count: 0, chars: 0, maxChars: 2200, needsMerge: false, entries: [], error: e.message } }
  })
  ipcMain.handle('evolution:strategy:add', (_e, text) => {
    try { return require('../evolution/strategyStore').addEntry(text) } catch (e) { return { ok: false, reason: e.message } }
  })
  ipcMain.handle('evolution:strategy:replace', (_e, { id, text } = {}) => {
    try { return require('../evolution/strategyStore').replaceEntry(id, text) } catch (e) { return { ok: false, reason: e.message } }
  })
  ipcMain.handle('evolution:strategy:remove', (_e, id) => {
    try { return require('../evolution/strategyStore').removeEntry(id) } catch (e) { return { ok: false, reason: e.message } }
  })
  ipcMain.handle('evolution:strategy:reflect', async () => {
    try { return await require('../evolution/reflect').reflectNow(db) } catch (e) { return { ok: false, reason: 'error', error: e.message } }
  })
}

module.exports = { registerStrategyHandlers }
