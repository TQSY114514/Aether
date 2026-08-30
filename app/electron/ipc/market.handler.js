const { ipcMain } = require('electron')
const market = require('../mcp/market')
const log = require('../logger')

function registerMarketHandlers(ipcMain, db, mcpManager) {
  ipcMain.handle('mcp:market:list', async () => {
    try {
      const servers = await market.list()
      return { servers }
    } catch (e) {
      log.error('market:list error', e)
      return { servers: [] }
    }
  })
  
  ipcMain.handle('mcp:market:search', async (_e, query) => {
    try {
      const servers = await market.search(query)
      return { servers }
    } catch (e) {
      log.error('market:search error', e)
      return { servers: [] }
    }
  })

  // Installation simply returns a config and expects the user to approve/save it,
  // or it could save to DB directly. Let's look at env.d.ts to see what it expects.
  // env.d.ts: install: (entry: MarketServer | { name: string; command: string; args?: string[]; env?: Record<string, string> }) => Promise<{ success: boolean; id?: number; error?: string; cancelled?: boolean }>
  ipcMain.handle('mcp:market:install', async (_e, entry) => {
    try {
      let cfg = entry
      // If it's a MarketServer (has config object), extract it, or build it
      if (entry && entry.config) cfg = entry.config
      else if (entry && entry.packages) cfg = market.buildConfig(entry)
      
      if (!cfg || !cfg.command) return { success: false, error: 'Invalid config' }

      // Save to database
      const info = db.prepare('INSERT INTO mcp_server (name, command, args, env) VALUES (?, ?, ?, ?)').run(
        cfg.name,
        cfg.command,
        JSON.stringify(cfg.args || []),
        JSON.stringify(cfg.env || {})
      )
      
      const id = Number(info.lastInsertRowid)
      
      // Tell mcp manager to connect
      if (mcpManager && mcpManager.connectServer) {
        await mcpManager.connectServer({ id, name: cfg.name, command: cfg.command, args: cfg.args, env: cfg.env })
      }
      
      return { success: true, id }
    } catch (e) {
      log.error('market:install error', e)
      return { success: false, error: e.message }
    }
  })
}

module.exports = { registerMarketHandlers }
