const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const http = require('http')
const fs = require('fs')
const db = require('./database')
const { registerProviderHandlers } = require('./ipc/provider.handler')
const { registerModelHandlers } = require('./ipc/model.handler')
const { registerPersonaHandlers } = require('./ipc/persona.handler')
const { registerSessionHandlers } = require('./ipc/session.handler')
const { registerChatHandlers } = require('./ipc/chat.handler')
const { registerSettingsHandlers } = require('./ipc/settings.handler')
const { registerArenaHandlers } = require('./ipc/arena.handler')
const { registerMemoryHandlers } = require('./ipc/memory.handler')
const { registerBackgroundHandlers } = require('./ipc/background.handler')
const { registerConfigHandlers } = require('./ipc/config.handler')
const { registerMcpHandlers } = require('./ipc/mcp.handler')
const { registerAgentHandlers } = require('./ipc/agent.handler')
const { registerSkillsHandlers } = require('./ipc/skills.handler')
const mcpManager = require('./mcp/manager')
const { setWorkspaceRoot } = require('./tools/sandbox')

let mainWindow = null
let staticServer = null
const DIST_PORT = 19877

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
      let fp = path.join(distDir, req.url === '/' ? 'index.html' : req.url)
      if (!fs.existsSync(fp)) fp = path.join(distDir, 'index.html')
      try {
        const c = fs.readFileSync(fp)
        const ext = path.extname(fp)
        res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' })
        res.end(c)
      } catch {
        res.writeHead(404); res.end('Not found')
      }
    })
    staticServer.listen(DIST_PORT, '127.0.0.1', () => resolve())
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
    },
    backgroundColor: '#FFFFFF',
  })

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${DIST_PORT}`)
  }
}

function setupIpcHandlers() {
  registerProviderHandlers(ipcMain, db)
  registerModelHandlers(ipcMain, db)
  registerPersonaHandlers(ipcMain, db)
  registerSessionHandlers(ipcMain, db)
  registerChatHandlers(ipcMain, db, () => mainWindow?.webContents)
  registerSettingsHandlers(ipcMain, db)
  registerArenaHandlers(ipcMain, db)
  registerMemoryHandlers(ipcMain, db)
  registerBackgroundHandlers(ipcMain)
  registerConfigHandlers(ipcMain, db)
  registerMcpHandlers(ipcMain, db)
  registerAgentHandlers(ipcMain, db)
  registerSkillsHandlers(ipcMain)
}

app.whenReady().then(async () => {
  await db.initDatabase()
  // Restore the agent workspace root from settings so the sandbox is active
  // before any tool runs. Falls back to <userData>/workspace if unset.
  try { const wsr = db.getSetting('agent_workspace_root'); if (wsr) setWorkspaceRoot(wsr) } catch {}
  // Discover skills (Claude-Code SKILL.md format) from workspace + userData + built-in dirs.
  try { const { scanSkills } = require('./llm/skills'); const n = scanSkills(); console.log(`[AetherAI] loaded ${n} skills`) } catch (e) { console.warn('[AetherAI] skill scan failed:', e.message) }
  if (!process.env.VITE_DEV_SERVER_URL && !process.env.NODE_ENV) {
    const distDir = path.join(__dirname, '..', 'dist')
    await startStaticServer(distDir)
    console.log(`Static server on http://127.0.0.1:${DIST_PORT}`)
  }
  createWindow()
  setupIpcHandlers()
  // Connect to all enabled MCP servers so their tools are available before any
  // chat uses the agent. Failures are logged inside the manager, never thrown.
  const mcpServers = db.getMcpServers().filter(s => s.enabled).map(s => ({
    name: s.name, command: s.command,
    args: (() => { try { return JSON.parse(s.args) } catch { return [] } })(),
    env: (() => { try { return JSON.parse(s.env) } catch { return {} } })(),
  }))
  mcpManager.connectAll(mcpServers).catch(() => {})

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (staticServer) staticServer.close()
  if (process.platform !== 'darwin') app.quit()
})

// Ensure debounced DB writes are flushed before the process exits, otherwise
// the last ~200ms of changes (a streaming chunk, a vote) would be lost.
app.on('before-quit', () => {
  if (typeof db.flushDatabase === 'function') db.flushDatabase()
})
