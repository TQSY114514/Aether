// ───────────────────────────────────────────────────────────────────────────
// MCP server manager.
//
// Owns the live McpClient instances. On startup (or when the user adds a
// server via settings), it connects to each configured MCP server, collects its
// tools, and merges them with the built-in tools. The tool loop calls
// `getMergedTools(mode)` / `getMergedTool(name)` which transparently include
// both built-ins and MCP tools — so the agent can use external tools (file
// systems, databases, browsers, anything with an MCP server) with no special
// handling, and the permission gate applies uniformly.
// ───────────────────────────────────────────────────────────────────────────

const { McpClient } = require('./client')
const builtin = require('../tools/registry')

const clients = new Map() // name -> McpClient
const mergedTools = new Map() // tool name -> tool object (built-ins + MCP)

// Seed with built-in tools on first use.
function ensureSeeded() {
  if (mergedTools.size === 0) {
    for (const t of builtin.TOOLS) mergedTools.set(t.name, t)
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
    const tools = await client.connect()
    for (const t of tools) mergedTools.set(t.name, t)
    clients.set(cfg.name, client)
    return tools
  } catch (e) {
    console.warn(`[MCP] ${cfg.name} connect failed:`, e.message)
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
function getMergedToolsPayload(mode) {
  ensureSeeded()
  const list = mode === 'plan'
    ? [...mergedTools.values()].filter(t => t.risk === 'safe')
    : [...mergedTools.values()]
  return list.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
}

// Which servers are currently connected (for the settings UI).
function connectedServers() {
  return [...clients.keys()]
}

module.exports = {
  connectServer, connectAll, disconnectServer, disconnectAll,
  getMergedTool, getMergedToolsPayload, connectedServers,
}
