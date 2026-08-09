// ─────────────────────────────────────────────────────────────────────────────
// headlessMcp.js — CLI/TUI 的 MCP + hooks 贯通桥（todo 14，Electron-free）
//
// MCP：从 mcp_server 表读配置 → 每个服务器直接 new McpClient（不依赖
// mcp/manager.js 的生命周期管理，仅借其 mergedTools 面把适配工具注入，
// toolLoop.js:53-55 的 getMergedTool/getMergedToolsPayload 无差别可见）；
// 进程 exit 时同步 kill 所有子进程。
//
// hooks：hooks.js 的 SessionStart/SessionEnd 生命周期在 headless 侧起跑
// （hook 文件位于 <workspace>/.aetherai/hooks/<Type>.js|.sh）。
// ─────────────────────────────────────────────────────────────────────────────
const { McpClient } = require('../mcp/client')
const manager = require('../mcp/manager')
const hooks = require('./hooks')

const clients = [] // 本桥自有的 McpClient 实例
const toolMap = new Map() // 本桥注入的工具名 → 工具对象（测试/校验用，避免跨模块实例）
let exitHandlerRegistered = false

function ensureExitHandler() {
  if (exitHandlerRegistered) return
  exitHandlerRegistered = true
  process.on('exit', () => {
    for (const c of clients) c.killSync()
  })
}

function parseMaybeJson(v) {
  if (v == null) return undefined
  if (typeof v === 'object') return v
  try { return JSON.parse(String(v)) } catch { return undefined }
}

/**
 * 连接所有启用的 MCP 服务器并注入工具。
 * @param {object} opts
 * @param {object} [opts.db]          裸 better-sqlite3 或带查询能力的连接
 * @param {number} [opts.timeoutMs]   单服务器握手超时（默认 5000）
 * @returns {Promise<Array<{name: string, tools: number}>>}  成功连接的服务器
 */
async function connectMcpServers({ db, timeoutMs = 5000 } = {}) {
  if (!db) return []
  let servers = []
  try {
    servers = db.prepare('SELECT name, command, args, env FROM mcp_server WHERE enabled = 1').all()
  } catch {
    return []
  }
  ensureExitHandler()
  const connected = []
  for (const cfg of servers) {
    const client = new McpClient({
      name: cfg.name,
      command: cfg.command,
      args: parseMaybeJson(cfg.args) || [],
      env: parseMaybeJson(cfg.env) || {},
    })
    try {
      const tools = await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout')), timeoutMs)),
      ])
      manager.registerTools(tools)
      for (const t of tools) toolMap.set(t.name, t)
      clients.push(client)
      connected.push({ name: cfg.name, tools: tools.length })
    } catch (e) {
      // 单服务器失败不阻塞其余；bad server 不破坏 agent
      try { client.killSync() } catch {}
    }
  }
  return connected
}

/** 关闭本桥连接的所有 MCP 服务器。 */
async function disconnectMcpServers() {
  for (const c of clients.splice(0)) {
    try { await c.close() } catch {}
  }
  toolMap.clear()
}

/** 本桥注入的 MCP 工具（自报面，测试/诊断用）。 */
function getMcpTool(name) {
  return toolMap.get(name) || null
}

/** 本桥注入的全部 MCP 工具名。 */
function connectedMcpTools() {
  return [...toolMap.keys()]
}

/**
 * 起跑 hooks 生命周期（SessionStart/SessionEnd 等）。best-effort，不抛错。
 * @param {string} type  'SessionStart' | 'SessionEnd' | ...
 * @param {object} [ctx]
 */
async function runSessionHooks(type, ctx) {
  try {
    hooks.scanHooks() // 重扫 <workspace>/.aetherai/hooks/
    await hooks.runHooks(type, { ...(ctx || {}) })
  } catch { /* hooks 失败不阻塞 agent */ }
}

module.exports = { connectMcpServers, disconnectMcpServers, runSessionHooks, getMcpTool, connectedMcpTools }
