const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, session, protocol, globalShortcut } = require('electron')
const path = require('path')
const http = require('http')
const fs = require('fs')
const db = require('./database')
const log = require('./logger')

// ── GPU acceleration flags ────────────────────────────────────────────────
// Enable GPU rasterization and bypass the hardware acceleration blocklist
// for smoother rendering on machines with older/additional GPUs.
if (!app.isPackaged) {
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  app.commandLine.appendSwitch('enable-zero-copy')
}

// ── Native spellchecker & protocol handler ────────────────────────────────
// session.defaultSession and protocol.handle require the app to be ready in
// Electron v31+. Moved into app.whenReady() so they don't crash on load.
function initAppReady() {
  // Native spellchecker — available only in some Electron builds; guard the
  // method existence so we don't log a noisy warning on every launch.
  try {
    const ss = session.defaultSession
    if (typeof ss.setSpellCheckLanguages === 'function') {
      ss.setSpellCheckLanguages(['en-US', 'zh-CN'])
    }
  } catch (e) {
    log.warn('spellcheck init failed:', e.message)
  }

  // ── aetherai:// protocol handler ─────────────────────────────────────────
  // Allows "open in AetherAI" from browser links and other apps.
  if (!app.isPackaged) {
    protocol.handle('aetherai', (req) => {
      const url = new URL(req.url)
      const action = url.hostname
      if (action === 'new' || action === 'chat') {
        const wc = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null
        if (wc && !wc.isDestroyed()) {
          wc.send('protocol:open', { action })
        }
      }
      return new Response('AetherAI protocol handler', { status: 200 })
    })
  } else {
    // Production: register OS protocol association AND listen for incoming URLs.
    app.setAsDefaultProtocolClient('aetherai')
    app.on('second-instance', (_e, argv) => {
      const url = argv.find(a => a.startsWith('aetherai://'))
      if (url && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('protocol:open', { action: new URL(url).hostname })
        mainWindow.show(); mainWindow.focus()
      }
    })
    app.on('open-url', (e, url) => {
      if (url.startsWith('aetherai://')) {
        e.preventDefault()
        const wc = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null
        if (wc && !wc.isDestroyed()) {
          wc.send('protocol:open', { action: new URL(url).hostname })
          mainWindow.show(); mainWindow.focus()
        }
      }
    })
  }
}

const { registerProviderHandlers } = require('./ipc/provider.handler')
const { registerModelHandlers } = require('./ipc/model.handler')
const { registerPersonaHandlers } = require('./ipc/persona.handler')
const { registerSessionHandlers } = require('./ipc/session.handler')
const { registerChatHandlers } = require('./ipc/chat.handler')
const { registerSettingsHandlers } = require('./ipc/settings.handler')
const { registerArenaHandlers } = require('./ipc/arena.handler')
const { registerMemoryHandlers } = require('./ipc/memory.handler')
const { registerKgHandlers } = require('./ipc/kg.handler')
const { registerBackgroundHandlers } = require('./ipc/background.handler')
const { registerConfigHandlers } = require('./ipc/config.handler')
const { registerMcpHandlers } = require('./ipc/mcp.handler')
const { registerAgentHandlers } = require('./ipc/agent.handler')
const { registerGitHandlers } = require('./ipc/git.handler')
const { registerSkillsHandlers } = require('./ipc/skills.handler')
const { registerTaskHandlers } = require('./ipc/task.handler')
const { registerCronHandlers } = require('./ipc/cron.handler')
const { registerFlagsHandlers } = require('./ipc/flags.handler')
const { initScheduler } = require('./cron/scheduler')
const { runEvolutionCycle } = require('./evolution/gep')
const mcpManager = require('./mcp/manager')
const { setWorkspaceRoot } = require('./tools/sandbox')
const localGateway = require('./llm/localGateway')
const featureFlags = require('./featureFlags')

let mainWindow = null
let staticServer = null
let tray = null
const DIST_PORT = 19877
let actualDistPort = DIST_PORT

function startStaticServer(distDir) {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.woff2': 'font/woff2',
  }
  return new Promise((resolve) => {
    staticServer = http.createServer((req, res) => {
      const rawUrl = req.url.split('?')[0]   // strip query string (e.g. HMR hash)
      const reqPath = rawUrl === '/' ? '/index.html' : rawUrl
      const relative = reqPath.startsWith('/') ? reqPath.slice(1) : reqPath
      const base = path.resolve(distDir)
      const resolved = path.resolve(base, relative)
      const rel = path.relative(base, resolved)
      // rel is relative & not starting with '..' iff resolved stays inside
      // distDir; path.isAbsolute(rel) also catches cross-drive escapes.
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        res.writeHead(403); res.end('Forbidden'); return
      }
      const fp = fs.existsSync(resolved) ? resolved : path.join(distDir, 'index.html')
      try {
        const c = fs.readFileSync(fp)
        const ext = path.extname(fp)
        res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' })
        res.end(c)
      } catch {
        res.writeHead(404); res.end('Not found')
      }
    })
    staticServer.listen(actualDistPort, '127.0.0.1', () => resolve())
    staticServer.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        actualDistPort++
        staticServer.listen(actualDistPort, '127.0.0.1', () => resolve())
        log.info(`port ${DIST_PORT} in use, using ${actualDistPort}`)
      } else {
        throw e
      }
    })
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, '..', 'resources', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: true,
    },
    backgroundColor: '#FFFFFF',
    show: false,  // hide until page is ready — no blank flash on startup
  })

  // Show the window only after the page has rendered, avoiding the flash of
  // blank/white content that users see on every launch.
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    // On Windows, bring to front explicitly.
    if (process.platform === 'win32') {
      mainWindow?.focus()
    }
  })

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL('http://localhost:5173')
    // DevTools are available via Ctrl+Shift+I / Cmd+Option+I but not opened
    // automatically — opening on startup adds 1-3s of latency on low-end machines.
    // mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${actualDistPort}`)
  }
}


// 唤出/创建主窗口（托盘点击、全局快捷键共用；todo 16）。
function showMainWindow() {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
    return
  }
  createWindow()
}

// 全局快捷键（todo 16）：Ctrl+Alt+A 唤出主窗口（未启动则创建）。
function setupGlobalShortcut() {
  try {
    const ok = globalShortcut.register('Ctrl+Alt+A', () => showMainWindow())
    log.info(`global shortcut Ctrl+Alt+A registered: ${ok}`)
  } catch (e) {
    log.warn('global shortcut register failed:', e.message)
  }
}

function createTray() {
  if (tray) return
  try {
    const iconPath = path.join(__dirname, '..', 'resources', 'icon.png')
    let trayImg = null
    if (fs.existsSync(iconPath)) {
      try { trayImg = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }) } catch {}
    }
    if (!trayImg || trayImg.isEmpty()) {
      // Minimal 16x16 tray icon: blue circle with white "A".
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAANklEQVQ4T2nk5uamgAH8wMwMDO8MDO8MDO8MDO8MDO8MDO8MDO8MDO8MDO8MDO8MDO8YGD4A4QBUOQ4m6p7/AAAAABJRU5ErkJggg=='
      trayImg = nativeImage.createFromBuffer(Buffer.from(b64, 'base64'))
    }
    tray = new Tray(trayImg)
    tray.setToolTip('AetherAI')
    updateTrayMenu()
    tray.on('click', () => {
      if (!mainWindow) return
      mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus())
    })
  } catch (e) {
    log.warn('Tray init failed:', e.message)
  }
}

function updateTrayMenu() {
  if (!tray) return
  const ctx = { show: 'Show AetherAI', hide: 'Hide', newChat: 'New Chat', newTask: 'New Task', quit: 'Quit AetherAI' }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: ctx.show, click: () => showMainWindow() },
    { label: ctx.hide, click: () => { if (mainWindow) mainWindow.hide() } },
    { type: 'separator' },
    { label: ctx.newChat, click: () => showMainWindow() },
    // todo 16：新建任务 → 唤窗 + 打开 TaskPanel（renderer 经 preload 'ui:open-tasks' 订阅）。
    { label: ctx.newTask, click: () => {
      showMainWindow()
      try { mainWindow?.webContents.send('ui:open-tasks') } catch {}
    } },
    { type: 'separator' },
    { label: ctx.quit, click: () => { app.quit() } },
  ]))
}

function setupIpcHandlers() {
  registerProviderHandlers(ipcMain, db)
  registerModelHandlers(ipcMain, db)
  registerPersonaHandlers(ipcMain, db)
  registerSessionHandlers(ipcMain, db)
  const chatState = registerChatHandlers(ipcMain, db, () => mainWindow?.webContents)
  registerSettingsHandlers(ipcMain, db, () => mainWindow?.webContents)
  registerArenaHandlers(ipcMain, db, () => mainWindow?.webContents)
  registerMemoryHandlers(ipcMain, db)
  registerKgHandlers(ipcMain, db)
  registerBackgroundHandlers(ipcMain)
  registerConfigHandlers(ipcMain, db)
  registerMcpHandlers(ipcMain, db)
  registerAgentHandlers(ipcMain, db)
  registerGitHandlers(ipcMain, db)
  registerSkillsHandlers(ipcMain, db)
  registerTaskHandlers(ipcMain, db, () => mainWindow?.webContents)
  registerCronHandlers(ipcMain, db)
  registerFlagsHandlers(ipcMain, db)

  // ── Phase 0: apply feature-flag-driven runtime config (never throws) ──
  try {
    log.setFileLogging(featureFlags.isEnabled(db, 'debug.fileLog'))
    if (featureFlags.isEnabled(db, 'debug.logForward')) {
      // Forward main-process log entries to the renderer (logs panel).
      log.addEntryListener((entry) => {
        const wc = mainWindow?.webContents
        try { if (wc && !wc.isDestroyed()) wc.send('main:log', entry) } catch {}
      })
    }
  } catch {}

  // ── Evolution IPC ──
  ipcMain.handle('evolution:run-cycle', (_e, { strategy, auditTrail } = {}) => {
    try {
      // Accept an optional real audit trail (e.g. from the Evolution UI);
      // fall back to the most recent tool trace persisted by the tool loop.
      let trail = Array.isArray(auditTrail) ? auditTrail : []
      if (trail.length === 0) {
        try {
          const last = db.allRows('SELECT payload FROM agent_execution_log ORDER BY id DESC LIMIT 1')
          const parsed = last && last[0] && last[0].payload ? JSON.parse(last[0].payload) : null
          if (parsed && Array.isArray(parsed.toolCalls)) trail = parsed.toolCalls
        } catch {}
      }
      const result = runEvolutionCycle(db, trail, strategy || 'balanced')
      // Manual cycles also feed forward: store the generated guidance as the
      // global fallback so subsequent agent turns inject it (session-scoped
      // guidance would be preferred when the manual run targets a session).
      if (result && result.prompt) {
        try { require('./evolution/gep').storeGuidance(null, result.prompt, result.capsule) } catch {}
      }
      return { ok: true, result }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })
  ipcMain.handle('evolution:history', () => {
    try {
      const { getEvolutionHistory } = require('./evolution/gep')
      return getEvolutionHistory(db)
    } catch (e) {
      return []
    }
  })
  const { registerUsageHandlers } = require('./ipc/usage.handler')
  registerUsageHandlers(ipcMain, db)
  // Search (FTS5) handler
  try { require('./ipc/search.handler').registerSearchHandlers(ipcMain, db) } catch (e) { log.warn('search handler failed:', e.message) }

  // ── Local gateway (VS Code / browser / external tools) ──────────────────
  // Connection info for the settings UI. The token is generated + persisted on
  // first access so it's stable across restarts.
  const gatewayInfo = () => {
    const enabled = (db.getSetting('gateway_enabled') ?? '1') === '1'
    const port = parseInt(db.getSetting('gateway_port') || String(localGateway.DEFAULT_PORT), 10)
    const token = localGateway.getOrCreateToken(db)
    return { enabled, port, token, running: !!localGateway.isRunning() }
  }
  ipcMain.handle('gateway:info', gatewayInfo)
  const gatewaySetEnabled = async (_e, enabled) => {
    await db.setSetting('gateway_enabled', enabled ? '1' : '0')
    if (enabled) {
      const port = parseInt(db.getSetting('gateway_port') || String(localGateway.DEFAULT_PORT), 10)
      localGateway.start(db, port)
    } else {
      localGateway.stop()
    }
    return { ok: true, running: !!localGateway.isRunning() }
  }
  ipcMain.handle('gateway:set-enabled', gatewaySetEnabled)

  // Proxy channels for the HTTP gateway: ipcMain.handle() channels are NOT
  // visible to ipcMain.listeners(), so every channel the gateway should expose
  // must be registered explicitly here. Register before start() (called later
  // in app.whenReady) so the proxy table is populated for the first request.
  localGateway.registerHandler('gateway:info', gatewayInfo)
  localGateway.registerHandler('gateway:set-enabled', gatewaySetEnabled)
  if (chatState && chatState.handleChatComplete) {
    localGateway.registerHandler('chat:complete', chatState.handleChatComplete)
  }
}

app.whenReady().then(async () => {
  initAppReady()
  await db.initDatabase()
  try { db.migrateLegacyPlaintextKeys() } catch (e) { log.warn('migrateLegacyPlaintextKeys failed:', e.message) }
  // Independent init steps run in parallel after DB is ready.
  await Promise.all([
    (async () => { try { await db.pruneEmptySessions() } catch (e) { log.warn('pruneEmptySessions failed:', e.message) } })(),
    (async () => { try { require('./llm/credentialPool').init(db) } catch (e) { log.warn('credentialPool init failed:', e.message) } })(),
    (async () => {
      try { const wsr = db.getSetting('agent_workspace_root'); if (wsr) setWorkspaceRoot(wsr) }
      catch (e) { log.warn('workspace root init failed:', e.message) }
    })(),
    (async () => {
      try { const { scanSkills } = require('./llm/skills'); scanSkills() }
      catch (e) { log.warn('skill scan failed:', e.message) }
    })(),
    // Skill curator: run automatic state transitions on startup (idle trigger).
    (async () => {
      try { require('./llm/curator').maybeRunCurator(db) }
      catch (e) { log.warn('curator init failed:', e.message) }
    })(),
    // Background review queue: flush any pending agent_task review rows at
    // startup (fire-and-forget — never blocks window creation). Gated by the
    // agent.backgroundReview feature flag inside enqueueReview/runPendingReviews.
    (async () => {
      try {
        const br = require('./llm/backgroundReview')
        if (br.isReviewEnabled(db)) {
          const model = db.getPrimaryModel()
          const provider = model ? db.getProvider(model.provider_id) : null
          if (provider && model && typeof br.runPendingReviews === 'function') {
            br.runPendingReviews(db, { provider, model })
              .then(() => {})
              .catch((e) => log.warn('backgroundReview flush failed:', e && e.message))
          }
        }
      } catch (e) { log.warn('backgroundReview init failed:', e && e.message) }
    })(),
    (async () => {
      try { require('./llm/hooks').scanHooks() }
      catch (e) { log.warn('hooks scan failed:', e.message) }
    })(),
  ])
  if (!process.env.VITE_DEV_SERVER_URL && !process.env.NODE_ENV) {
    const distDir = path.join(__dirname, '..', 'dist')
    await startStaticServer(distDir)
    log.info(`Static server on http://127.0.0.1:${actualDistPort}`)
  }
  createWindow()
  createTray()
  setupGlobalShortcut()
  setupIpcHandlers()
  // Local gateway: expose the API to the VS Code extension / browser / scripts.
  // Defaults to enabled so external tools work out of the box; bound to 127.0.0.1
  // and requires a token. Disable via the "Local Gateway" toggle in Settings.
  try {
    if ((db.getSetting('gateway_enabled') ?? '1') === '1') {
      const port = parseInt(db.getSetting('gateway_port') || String(localGateway.DEFAULT_PORT), 10)
      localGateway.start(db, port)
      log.info(`Local gateway on http://127.0.0.1:${localGateway.getPort()}`)
    }
  } catch (e) { log.warn('gateway start failed:', e.message) }
  // Cron scheduler: start recurring agent tasks (memory cleanup, skill scan, etc.)
  try { initScheduler(db) } catch (e) { log.warn('cron scheduler init failed:', e.message) }
  // Connect to all enabled MCP servers so their tools are available before any
  // chat uses the agent. Failures are logged inside the manager, never thrown.
  const mcpServers = db.getMcpServers().filter(s => s.enabled).map(s => ({
    name: s.name, command: s.command,
    args: (() => { try { return JSON.parse(s.args) } catch { return [] } })(),
    env: (() => { try { return JSON.parse(s.env) } catch { return {} } })(),
  }))
  mcpManager.connectAll(mcpServers).catch(() => {})

  // Auto-update (electron-updater, GitHub provider). No-op in dev; in a packaged
  // build it checks the latest Release and downloads if newer. Unsigned build:
  // update works, SmartScreen warns on first launch of the new version.
  try {
    const updater = require('./updater')
    updater.init(() => mainWindow?.webContents)
    updater.registerHandlers()
    // electron-updater's method is checkForUpdates(); the old
    // checkForUpdatesAndNotifications call doesn't exist here and threw on startup.
    updater.check().catch(() => {})
  } catch (e) {
    log.warn('updater init failed:', e.message)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (staticServer) staticServer.close()
  // On macOS, keep the app running (standard behavior). On other platforms,
  // if a tray icon exists, minimize to tray instead of quitting. Otherwise quit.
  if (process.platform !== 'darwin') {
    if (tray) {
      // Minimize to tray — the user can quit from the tray menu.
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
        mainWindow.hide()
      }
    } else {
      app.quit()
    }
  }
})

// Ensure debounced DB writes are flushed before the process exits, otherwise
// the last ~200ms of changes (a streaming chunk, a vote) would be lost.
app.on('before-quit', async () => {
  if (typeof db.flushDatabase === 'function') {
    try { await db.flushDatabase() } catch {}
  }
})
