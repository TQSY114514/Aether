// ───────────────────────────────────────────────────────────────────────────
// MCP IPC handlers.
//
// CRUD for MCP server configs (stored in the mcp_server table) plus a
// `mcp:connect` that (re)connects a server and returns the tools it exposes,
// and `mcp:status` reporting live connections. On app startup, main.js calls
// connectAll() so configured servers are ready before any chat uses tools.
// ───────────────────────────────────────────────────────────────────────────

const manager = require('../mcp/manager')
const market = require('../mcp/market')

// In headless mode (cli.js / rpc) `require('electron')` resolves to a path
// string, so destructuring `dialog` yields undefined. Guard the same way
// sandbox.js does; when no dialog exists we default to DENY (safe default).
const electron = (() => { try { return require('electron') } catch { return null } })()
const dialog = (electron && typeof electron === 'object' && electron.dialog) ? electron.dialog : null

// Native confirmation gate (spec P1-H3): before an MCP server config is
// persisted or spawned, show the FULL command line — command, args, and env
// KEY NAMES only (values may hold secrets, never render them). Cancel is the
// default button, and closing the dialog (ESC / X) counts as cancel.
async function confirmServerConfig(cfg, action) {
  if (!dialog || typeof dialog.showMessageBox !== 'function') return false
  const envKeys = Object.keys((cfg.env && typeof cfg.env === 'object') ? cfg.env : {})
  const lines = [
    `command: ${cfg.command}`,
    `args: ${Array.isArray(cfg.args) && cfg.args.length ? cfg.args.join(' ') : '(none)'}`,
    `env keys: ${envKeys.length ? envKeys.join(', ') : '(none)'}`,
  ]
  const buttons = [action, 'Cancel']
  const res = await dialog.showMessageBox({
    type: 'warning',
    title: 'Aether — MCP server',
    message: `Allow MCP server "${cfg.name}" to be ${action.toLowerCase()}${action === 'Install' ? ' and launched' : ''}?`,
    detail: lines.join('\n'),
    buttons,
    defaultId: 1, // Cancel is the safe default
    cancelId: 1,
    noLink: true,
  })
  return res.response === 0
}

function registerMcpHandlers(ipcMain, db) {
  ipcMain.handle('mcp:list', () => {
    const rows = db.getMcpServers()
    // Parse args/env JSON back to arrays/objects for the renderer.
    return rows.map(r => ({
      ...r,
      args: safeParse(r.args, []),
      env: safeParse(r.env, {}),
    }))
  })

  ipcMain.handle('mcp:create', async (_e, data) => {
    const cfg = {
      name: data && data.name,
      command: data && data.command,
      args: Array.isArray(data && data.args) ? data.args : [],
      env: (data && data.env && typeof data.env === 'object') ? data.env : {},
    }
    if (!cfg.name || !cfg.command) return { error: 'invalid config' }
    const confirmed = await confirmServerConfig(cfg, 'Add')
    if (!confirmed) return { cancelled: true }
    const res = db.addMcpServer(data)
    return { lastInsertRowid: res.lastInsertRowid }
  })

  ipcMain.handle('mcp:update', (_e, id, data) => {
    db.updateMcpServer(id, data)
    return { success: true }
  })

  ipcMain.handle('mcp:delete', async (_e, id) => {
    // Find the server name to disconnect its live client, then delete the row.
    const rows = db.getMcpServers()
    const row = rows.find(r => r.id === id)
    if (row) await manager.disconnectServer(row.name)
    db.deleteMcpServer(id)
    return { success: true }
  })

  // (Re)connect a server by id and return the tools it contributed.
  ipcMain.handle('mcp:connect', async (_e, id) => {
    const rows = db.getMcpServers()
    const row = rows.find(r => r.id === id)
    if (!row) return { success: false, error: 'not found' }
    await manager.disconnectServer(row.name)
    const tools = await manager.connectServer({
      name: row.name,
      command: row.command,
      args: safeParse(row.args, []),
      env: safeParse(row.env, {}),
    })
    return { success: true, tools: tools.map(t => ({ name: t.name, description: t.description, risk: t.risk })) }
  })

  // Report which servers are currently connected.
  ipcMain.handle('mcp:status', () => ({ connected: manager.connectedServers() }))

  // ── MCP Market ────────────────────────────────────────────────────────────
  // Build a config object from a market entry (or a raw config), returning the
  // { name, command, args, env } shape the manager + db layer expect.
  function normalizeConfig(entry) {
    const cfg = entry && entry.config ? entry.config : entry
    return {
      name: cfg.name,
      command: cfg.command,
      args: Array.isArray(cfg.args) ? cfg.args : [],
      env: cfg.env && typeof cfg.env === 'object' ? cfg.env : {},
    }
  }

  // Community server list from the MCP Registry.
  ipcMain.handle('mcp:market:list', async () => {
    const servers = await market.list()
    return { servers }
  })

  // Search the registry by query.
  ipcMain.handle('mcp:market:search', async (_e, query) => {
    const servers = await market.search(query)
    return { servers }
  })

  // One-click install: write the config to the mcp_server table and connect the
  // live client so tools are available immediately. Hardened (spec P0-C3 /
  // P1-H3): the entry round-tripped through the renderer, so the main process
  // re-validates runtime whitelist + package identifier BEFORE any dialog, DB
  // write, or spawn — a hostile `command` is machine-rejected outright, and a
  // valid one still requires explicit native confirmation.
  ipcMain.handle('mcp:market:install', async (_e, entry) => {
    try {
      const cfg = normalizeConfig(entry)
      const valid = market.validateInstallConfig(cfg)
      if (!valid.ok) return { success: false, error: valid.error }
      const existing = db.getMcpServers().find(r => r.name === cfg.name)
      if (existing) return { success: false, error: `MCP server "${cfg.name}" already exists` }
      const confirmed = await confirmServerConfig(cfg, 'Install')
      if (!confirmed) return { success: false, cancelled: true, error: 'cancelled by user' }
      const res = db.addMcpServer({ name: cfg.name, command: cfg.command, args: cfg.args, env: cfg.env, enabled: 1 })
      // Best-effort connect; failures are logged inside the manager, never thrown.
      await manager.connectServer(cfg)
      return { success: true, id: res.lastInsertRowid }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}

function safeParse(s, fallback) {
  if (!s) return fallback
  try { return JSON.parse(s) } catch { return fallback }
}

module.exports = { registerMcpHandlers }
