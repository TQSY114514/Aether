// ─────────────────────────────────────────────────────────────────────────────
// system.handler.js — Windows 系统集成（Phase 3 剩余项）
//
// 开机自启（app.setLoginItemSettings）+ 系统通知（Electron Notification）。
// 桌面助手形态的刚需：任务完成/新消息提醒、常驻后台自启。
// 全部 best-effort，失败不打扰。
// ─────────────────────────────────────────────────────────────────────────────

function registerSystemHandlers(ipcMain, app, getWebContents, db) {
  // 开机自启: 查询/设置（Settings 页开关）
  ipcMain.handle('system:get-auto-launch', () => {
    try { return { enabled: app.getLoginItemSettings().openAtLogin } } catch { return { enabled: false } }
  })

  ipcMain.handle('system:set-auto-launch', (_e, enabled) => {
    try {
      // Electron 44 移除了 openAsHidden 选项（仅 macOS 12 及以下生效）；
      // Windows 打包目标（portable/nsis）本就忽略该选项。
      app.setLoginItemSettings({
        openAtLogin: !!enabled,
        path: process.execPath,
      })
      return { ok: true, enabled: !!enabled }
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    }
  })

  // 系统通知: 由渲染进程请求（任务完成/新消息等）
  ipcMain.handle('system:notify', (_e, { title, body, sessionId, taskId } = {}) => {
    try {
      const { Notification, BrowserWindow } = require('electron')
      if (!Notification.isSupported()) return { ok: false, error: 'notifications not supported' }
      const n = new Notification({
        title: String(title || 'Aether'),
        body: String(body || ''),
        silent: false,
      })
      n.on('click', () => {
        try {
          const wc = getWebContents()
          const win = wc ? BrowserWindow.fromWebContents(wc) : (BrowserWindow.getAllWindows()[0] || null)
          if (win) {
            if (win.isMinimized()) win.restore()
            win.show()
            win.focus()
          }
          if (sessionId && wc && !wc.isDestroyed()) {
            wc.send('session:switch-requested', { sessionId: Number(sessionId), taskId: taskId ? String(taskId) : undefined })
          }
        } catch {}
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

  // Shared image resolution helpers for clipboard image copy, save-as, and safe local preview
  const IMAGE_EXT_MIME = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
  }
  const MAX_IMAGE_BYTES = 20 * 1024 * 1024

  function isPathInsideDir(parentDir, targetPath) {
    const path = require('path')
    const fs = require('fs')
    if (!parentDir || !targetPath) return false
    let realParent = path.resolve(parentDir)
    try { if (fs.existsSync(realParent)) realParent = fs.realpathSync(realParent) } catch {}
    const rel = path.relative(
      process.platform === 'win32' ? realParent.toLowerCase() : realParent,
      process.platform === 'win32' ? targetPath.toLowerCase() : targetPath
    )
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  }

  function resolveLocalImagePath(rawPath) {
    const path = require('path')
    const fs = require('fs')
    const os = require('os')
    const { fileURLToPath } = require('url')
    const { hasUnsafeWindowsPrefix, isSensitivePath, isDangerousRoot, getWorkspaceRoot } = require('../tools/sandbox')
    if (!rawPath || typeof rawPath !== 'string') return { ok: false, error: 'path required' }
    let local = rawPath.trim()
    if (/^file:\/\//i.test(local)) {
      try { local = fileURLToPath(local) } catch { return { ok: false, error: 'invalid file url' } }
    }
    if (hasUnsafeWindowsPrefix(local) || isSensitivePath(local) || isDangerousRoot(local)) {
      return { ok: false, error: 'unsafe or sensitive path' }
    }
    const ext = path.extname(local).toLowerCase()
    const mime = IMAGE_EXT_MIME[ext]
    if (!mime) return { ok: false, error: 'unsupported image extension' }
    const abs = path.resolve(local)
    if (!fs.existsSync(abs)) return { ok: false, error: 'file not found' }
    let real
    try { real = fs.realpathSync(abs) } catch { return { ok: false, error: 'cannot resolve path' } }
    if (hasUnsafeWindowsPrefix(real) || isSensitivePath(real) || isDangerousRoot(real)) {
      return { ok: false, error: 'unsafe resolved path' }
    }
    const allowedRoots = [os.tmpdir(), getWorkspaceRoot()]
    try { if (app && typeof app.getPath === 'function') allowedRoots.push(app.getPath('userData')) } catch {}
    try {
      if (db && typeof db.prepare === 'function') {
        for (const r of db.prepare('SELECT cwd FROM session WHERE cwd IS NOT NULL').all()) {
          if (r && r.cwd) allowedRoots.push(r.cwd)
        }
        for (const r of db.prepare('SELECT config FROM session WHERE config IS NOT NULL').all()) {
          try { const c = JSON.parse(r.config); if (c && c.workspace) allowedRoots.push(c.workspace) } catch {}
        }
        for (const r of db.prepare('SELECT root_path FROM project WHERE root_path IS NOT NULL').all()) {
          if (r && r.root_path) allowedRoots.push(r.root_path)
        }
      }
    } catch {}
    if (!allowedRoots.some((root) => isPathInsideDir(root, real))) {
      return { ok: false, error: 'path outside authorized directories' }
    }
    const stat = fs.statSync(real)
    if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) {
      return { ok: false, error: 'image too large or not a file' }
    }
    return { ok: true, real, mime, ext }
  }

  async function resolveImageBuffer(source) {
    const fs = require('fs')
    if (!source || typeof source !== 'string') return { ok: false, error: 'image source required' }
    const s = source.trim()
    const dataMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(s)
    if (dataMatch) {
      const buf = Buffer.from(dataMatch[2].replace(/\s+/g, ''), 'base64')
      if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return { ok: false, error: 'invalid or oversized image data' }
      return { ok: true, buf, mime: dataMatch[1].toLowerCase() }
    }
    if (/^https?:\/\//i.test(s)) {
      const res = await fetch(s, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
      const len = Number(res.headers.get('content-length') || 0)
      if (len > MAX_IMAGE_BYTES) return { ok: false, error: 'remote image too large' }
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return { ok: false, error: 'empty or oversized remote image' }
      const ct = (res.headers.get('content-type') || 'image/png').split(';')[0].trim().toLowerCase()
      return { ok: true, buf, mime: ct.startsWith('image/') ? ct : 'image/png' }
    }
    const localRes = resolveLocalImagePath(s)
    if (!localRes.ok) return localRes
    const buf = await fs.promises.readFile(localRes.real)
    return { ok: true, buf, mime: localRes.mime }
  }

  ipcMain.handle('system:read-local-image', async (_e, targetPath) => {
    try {
      const fs = require('fs')
      const resolved = resolveLocalImagePath(targetPath)
      if (!resolved.ok) return { ok: false, error: resolved.error }
      const buf = await fs.promises.readFile(resolved.real)
      return { ok: true, dataUrl: `data:${resolved.mime};base64,${buf.toString('base64')}` }
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    }
  })

  ipcMain.handle('system:clipboard-write-image', async (_e, source) => {
    try {
      const { clipboard, nativeImage } = require('electron')
      const res = await resolveImageBuffer(source)
      if (!res.ok) return { ok: false, error: res.error }
      const img = nativeImage.createFromBuffer(res.buf)
      if (!img || img.isEmpty()) return { ok: false, error: 'unsupported image format' }
      clipboard.writeImage(img)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    }
  })

  ipcMain.handle('system:save-image', async (_e, { source, defaultName } = {}) => {
    try {
      const fs = require('fs')
      const path = require('path')
      const { dialog } = require('electron')
      const res = await resolveImageBuffer(source)
      if (!res.ok) return { ok: false, error: res.error }
      const fallbackExt = res.mime === 'image/jpeg' ? '.jpg'
        : res.mime === 'image/webp' ? '.webp'
        : res.mime === 'image/gif' ? '.gif'
        : res.mime === 'image/svg+xml' ? '.svg'
        : '.png'
      const rawName = path.basename(String(defaultName || `image${fallbackExt}`).replace(/[<>:"/\\|?*]+/g, '_'))
      const safeName = path.extname(rawName) ? rawName : `${rawName}${fallbackExt}`
      const picked = await dialog.showSaveDialog({
        defaultPath: safeName,
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })
      if (picked.canceled || !picked.filePath) return { ok: false, canceled: true }
      await fs.promises.writeFile(picked.filePath, res.buf)
      return { ok: true, filePath: picked.filePath }
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

  // 窗口沉浸式标题栏 Overlay 控制 (WCO): 动态调整标题栏三键颜色与背景色
  ipcMain.handle('system:set-title-bar-overlay', (_e, { color, symbolColor, height } = {}) => {
    try {
      const { BrowserWindow } = require('electron')
      const win = BrowserWindow.fromWebContents(_e.sender)
      if (win && typeof win.setTitleBarOverlay === 'function') {
        const opts = {}
        if (color !== undefined) opts.color = color
        if (symbolColor !== undefined) opts.symbolColor = symbolColor
        if (height !== undefined) opts.height = height
        win.setTitleBarOverlay(opts)
        return { ok: true }
      }
      return { ok: false, error: 'not supported or window unavailable' }
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    }
  })

  // API Key 加密状态: 渲染进程用于在设置页显式提示 safeStorage 不可用时密钥明文落盘
  ipcMain.handle('system:encryption-status', () => {
    try {
      const { safeStorage } = require('electron')
      return { ok: true, available: !!safeStorage.isEncryptionAvailable() }
    } catch (e) {
      return { ok: false, available: false, error: e && e.message ? e.message : String(e) }
    }
  })

  // 打开外部路径 / 文件夹 / 资源管理器
  ipcMain.handle('system:open-path', async (_e, targetPath) => {
    try {
      if (!targetPath || typeof targetPath !== 'string') return { ok: false, error: 'path required' }
      const path = require('path')
      const { shell } = require('electron')
      const resolved = path.resolve(String(targetPath))
      const errMsg = await shell.openPath(resolved)
      if (errMsg) return { ok: false, error: errMsg }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    }
  })

  // 在系统文件资源管理器中定位高亮指定文件或文件夹
  ipcMain.handle('system:show-item-in-folder', (_e, targetPath) => {
    try {
      if (!targetPath || typeof targetPath !== 'string') return { ok: false, error: 'path required' }
      const path = require('path')
      const { shell } = require('electron')
      const resolved = path.resolve(String(targetPath))
      shell.showItemInFolder(resolved)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    }
  })

  // 目录选择: 弹出原生文件夹选择框，供 CWD 切换与目录选择使用（替代原 project:pickDirectory）
  ipcMain.handle('system:pickDirectory', async () => {
    try {
      const { dialog } = require('electron')
      const res = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择工作目录 (CWD)',
      })
      if (res.canceled || !res.filePaths || res.filePaths.length === 0) return null
      return res.filePaths[0]
    } catch {
      return null
    }
  })

  // 系统与工作区全面体检 (Claude Code / OpenHands 对齐)
  ipcMain.handle('system:doctor', async (_e, { cwd, sessionId } = {}) => {
    try {
      const path = require('path')
      const { isAuthorizedWorkspace, getWorkspaceRoot } = require('../tools/sandbox')
      const rawRoot = cwd ? String(cwd) : getWorkspaceRoot(sessionId)
      const targetRoot = rawRoot ? path.resolve(rawRoot) : null
      if (targetRoot && !isAuthorizedWorkspace(db, targetRoot)) {
        return {
          overallStatus: 'degraded',
          error: 'Unauthorized workspace path',
          markdownReport: '### Aether 系统体检\n> 拒绝访问：未经授权的工作区路径',
          checks: [],
          summary: { total: 0, passes: 0, warnings: 0, failures: 1 },
        }
      }
      const { runDoctorDiagnostics } = require('../system/doctor')
      return await runDoctorDiagnostics(db, { cwd: targetRoot, sessionId })
    } catch (e) {
      return {
        overallStatus: 'degraded',
        error: e && e.message ? e.message : String(e),
        markdownReport: `### Aether 系统体检执行异常\n> 错误原因: ${e && e.message ? e.message : String(e)}`,
        checks: [],
        summary: { total: 0, passes: 0, warnings: 0, failures: 1 },
      }
    }
  })
}

module.exports = { registerSystemHandlers }
