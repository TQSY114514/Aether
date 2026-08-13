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

  // 剪贴板: 读取/写入（复制 markdown 结果、粘贴内容作上下文）
  ipcMain.handle('system:clipboard-write', (_e, text) => {
    try {
      const { clipboard } = require('electron')
      clipboard.writeText(String(text ?? ''))
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    }
  })

  ipcMain.handle('system:clipboard-read', () => {
    try {
      const { clipboard } = require('electron')
      return { ok: true, text: clipboard.readText() }
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    }
  })

  // 文件关联: 生成填充当前 exe 路径的 reg 文件并以管理员导入。
  // 注册 aetherai:// 协议 + 右键「用 Aether 打开」(.cs/.js/.ts/.tsx/.md/.json + 文件夹)。
  ipcMain.handle('system:register-file-associations', async () => {
    try {
      const { app } = require('electron')
      const fs = require('fs')
      const os = require('os')
      const path = require('path')
      const { execFile } = require('child_process')
      const { promisify } = require('util')
      const execFileP = promisify(execFile)

      const exe = process.execPath
      const tmpl = path.join(__dirname, '..', '..', 'resources', 'register-protocol.reg')
      if (!fs.existsSync(tmpl)) return { ok: false, error: 'reg template not found' }
      const content = fs.readFileSync(tmpl, 'utf8').replace(/<AETHER_EXE>/g, exe.replace(/\\/g, '\\\\'))
      const tmpReg = path.join(os.tmpdir(), `aether-assoc-${Date.now()}.reg`)
      fs.writeFileSync(tmpReg, content, 'utf8')
      try {
        // 以管理员权限导入(reg import 需要 HKCR 写权限)
        await execFileP('reg', ['import', tmpReg], { windowsHide: true })
        return { ok: true }
      } finally {
        try { fs.rmSync(tmpReg, { force: true }) } catch {}
      }
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    }
  })
}

module.exports = { registerSystemHandlers }
