// ─────────────────────────────────────────────────────────────────────────────
// system.handler.js — Windows 系统集成（Phase 3 剩余项）
//
// 开机自启（app.setLoginItemSettings）+ 系统通知（Electron Notification）。
// 桌面助手形态的刚需：任务完成/新消息提醒、常驻后台自启。
// 全部 best-effort，失败不打扰。
// ─────────────────────────────────────────────────────────────────────────────

function registerSystemHandlers(ipcMain, app, getWebContents) {
  // 开机自启: 查询/设置（Settings 页开关）
  ipcMain.handle('system:get-auto-launch', () => {
    try { return { enabled: app.getLoginItemSettings().openAtLogin } } catch { return { enabled: false } }
  })

  ipcMain.handle('system:set-auto-launch', (_e, enabled) => {
    try {
      app.setLoginItemSettings({
        openAtLogin: !!enabled,
        openAsHidden: true,
        path: process.execPath,
      })
      return { ok: true, enabled: !!enabled }
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    }
  })

  // 系统通知: 由渲染进程请求（任务完成/新消息等）
  ipcMain.handle('system:notify', (_e, { title, body } = {}) => {
    try {
      const { Notification } = require('electron')
      if (!Notification.isSupported()) return { ok: false, error: 'notifications not supported' }
      const n = new Notification({
        title: String(title || 'Aether'),
        body: String(body || ''),
        silent: false,
      })
      n.on('click', () => {
        try { getWebContents()?.focus() } catch {}
      })
      n.show()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    }
  })
}

module.exports = { registerSystemHandlers }
