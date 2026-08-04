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

  ipcMain.handle('mcp:create', (_e, data) => {
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
  // live client so tools are available immediately.
  ipcMain.handle('mcp:market:install', async (_e, entry) => {
    try {
      const cfg = normalizeConfig(entry)
      if (!cfg.name || !cfg.command) return { success: false, error: 'invalid config' }
      const existing = db.getMcpServers().find(r => r.name === cfg.name)
      if (existing) return { success: false, error: `MCP server "${cfg.name}" already exists` }
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
