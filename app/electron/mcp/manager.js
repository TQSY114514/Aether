// MCP server manager.
//
// Owns the live McpClient instances. On startup (or when the user adds a
// server via settings), it connects to each configured MCP server, collects its
// tools, and merges them with the built-in tools. The tool loop calls
// `getMergedTools(mode)` / `getMergedTool(name)` which transparently include
// both built-ins and MCP tools — so the agent can use external tools (file
// systems, databases, browsers, anything with an MCP server) with no special
// handling, and the permission gate applies uniformly.

const { McpClient } = require('./client')
const builtin = require('../tools/registry')
const log = require('../logger')

const clients = new Map() // name -> McpClient
const mergedTools = new Map() // tool name -> tool object (built-ins + MCP)
const MCP_CONNECT_TIMEOUT = 5000 // 5s per server — a hung server must not block startup

function isMcpTool(t) {
  if (!t || !t.name) return false
  if (t.name === 'mcp_list_tools' || t.name === 'mcp_call_tool') return false
  return t.name.includes('__')
}

const LEAN_MCP_TOOLS = [
  {
    name: 'mcp_list_tools',
    description: 'List available tools from connected MCP servers with their descriptions and argument schemas. Call this before using mcp_call_tool.',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        server: { type: 'string', description: 'Optional MCP server name to filter tools by' }
      }
    },
    run: async ({ server } = {}) => {
      ensureSeeded()
      const tools = []
      for (const [name, tool] of mergedTools.entries()) {
        if (!isMcpTool(tool)) continue
        if (server && !name.startsWith(`${server}__`)) continue
        tools.push({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })
      }
      if (tools.length === 0) {
        return server ? `No MCP tools found for server "${server}".` : 'No MCP tools are currently connected.'
      }
      return JSON.stringify(tools, null, 2)
    }
  },
  {
    name: 'mcp_call_tool',
    description: 'Execute a specific MCP tool on a connected MCP server with arguments. Use mcp_list_tools to inspect tool signatures first.',
    risk: 'dangerous',
    parameters: {
      type: 'object',
      properties: {
        tool_name: { type: 'string', description: 'The exact name of the MCP tool to call (e.g. "github__create_issue")' },
        arguments: { type: 'object', description: 'Arguments object matching the tool parameters schema' }
      },
      required: ['tool_name']
    },
    run: async ({ tool_name, arguments: toolArgs } = {}, context) => {
      ensureSeeded()
      if (!tool_name) throw new Error('tool_name is required')
      let tool = mergedTools.get(tool_name)
      if (!tool && !tool_name.includes('__')) {
        for (const [k, v] of mergedTools.entries()) {
          if (k.endsWith(`__${tool_name}`)) {
            tool = v
            break
          }
        }
      }
      if (!tool) {
        throw new Error(`MCP tool "${tool_name}" not found. Call mcp_list_tools to see available tools.`)
      }
      if (!isMcpTool(tool)) {
        throw new Error(`Tool "${tool_name}" is a built-in tool and cannot be executed via mcp_call_tool. Use the tool directly.`)
      }
      if (typeof tool.run !== 'function') {
        throw new Error(`Tool "${tool_name}" does not have a run function`)
      }
      return await tool.run(toolArgs || {}, context)
    }
  }
]

// Seed with built-in tools on first use.
function ensureSeeded() {
  if (mergedTools.size === 0) {
    for (const t of builtin.TOOLS) mergedTools.set(t.name, t)
  }
  for (const t of LEAN_MCP_TOOLS) {
    if (!mergedTools.has(t.name)) mergedTools.set(t.name, t)
  }
}

// Connect to one MCP server config { name, command, args, env } and merge its
// tools. Failures are logged but never throw — a bad server shouldn't break
// the agent. Returns the list of tools it contributed.
async function connectServer(cfg) {
  ensureSeeded()
  if (clients.has(cfg.name)) return []
  const client = new McpClient(cfg)
  try {
    // Race the connect call against a timeout so a hung server never blocks startup.
    const tools = await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout')), MCP_CONNECT_TIMEOUT))
    ])
    for (const t of tools) mergedTools.set(t.name, t)
    clients.set(cfg.name, client)
    return tools
  } catch (e) {
    log.warn(`${cfg.name} connect failed:`, e.message)
    return []
  }
}

// Connect to all servers in the given config list (used at startup).
async function connectAll(servers) {
  ensureSeeded()
  for (const cfg of servers || []) {
    await connectServer(cfg)
  }
}

// Disconnect one server and remove its tools.
async function disconnectServer(name) {
  const client = clients.get(name)
  if (!client) return
  // Remove every tool whose name starts with `${name}__`.
  for (const key of [...mergedTools.keys()]) {
    if (key.startsWith(`${name}__`)) mergedTools.delete(key)
  }
  await client.close()
  clients.delete(name)
}

async function disconnectAll() {
  for (const name of [...clients.keys()]) await disconnectServer(name)
}

// Look up a tool (built-in or MCP) by name.
function getMergedTool(name) {
  ensureSeeded()
  return mergedTools.get(name)
}

// The OpenAI tools payload, filtered by permission mode. Mirrors the built-in
// registry's toolsPayload but over the merged set.
// Sorted via sortToolsForCacheStability (CORE -> UNCLASSIFIED/MCP -> CATEGORY)
// unless opts.cacheStable === false so staged category additions are tail appends.
function getMergedToolsPayload(mode, opts = {}) {
  ensureSeeded()
  const isLean = Boolean(
    opts && (
      opts.leanMcp ||
      (opts.db && (() => {
        try {
          const featureFlags = require('../featureFlags')
          return featureFlags.isEnabled(opts.db, 'agent.leanMcp')
        } catch {
          return false
        }
      })())
    )
  )

  let list = mode === 'plan'
    ? [...mergedTools.values()].filter(t => t.risk === 'safe')
    : [...mergedTools.values()]

  if (isLean) {
    const hasMcpTools = [...mergedTools.values()].some(isMcpTool)
    list = list.filter(t => {
      if (isMcpTool(t)) return false
      if (!hasMcpTools && (t.name === 'mcp_list_tools' || t.name === 'mcp_call_tool')) return false
      return true
    })
  } else {
    list = list.filter(t => t.name !== 'mcp_list_tools' && t.name !== 'mcp_call_tool')
  }

  const raw = list.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
  if (opts && opts.cacheStable === false) return raw
  try {
    const { sortToolsForCacheStability } = require('../llm/toolRouter')
    return sortToolsForCacheStability(raw)
  } catch {
    return raw
  }
}

// Which servers are currently connected (for the settings UI).
function connectedServers() {
  return [...clients.keys()]
}

// Headless bridge injection（todo 14）：外部（CLI/TUI）自行 new McpClient 连接
// 后，把适配好的工具注册进 mergedTools，让 toolLoop（getMergedTool /
// getMergedToolsPayload，toolLoop.js:53-55）无差别可见。生命周期由调用方管理。
function registerTools(tools) {
  ensureSeeded()
  let n = 0
  for (const t of tools || []) {
    if (t && t.name) { mergedTools.set(t.name, t); n++ }
  }
  return n
}

function unregisterTools(toolsOrNames) {
  let n = 0
  for (const item of toolsOrNames || []) {
    const name = typeof item === 'string' ? item : item?.name
    if (name && mergedTools.has(name)) {
      mergedTools.delete(name)
      n++
    }
  }
  return n
}

module.exports = {
  connectServer, connectAll, disconnectServer, disconnectAll,
  getMergedTool, getMergedToolsPayload, connectedServers,
  registerTools, unregisterTools,
}
