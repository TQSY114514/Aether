// ─── MCP market hardening unit tests (spec P0-C3 / P1-H3 / P2-M1) ───────────
// Tests for the MCP install defenses:
//   1. market.buildConfig — runtime whitelist (npx/uvx/dotnet/go/node/python):
//      cmd / powershell / absolute paths are structurally rejected, never
//      default-allowed; package identifiers must match the scoped/bare npm-ish
//      shape (no shell metacharacters, no traversal, no uppercase).
//   2. market.validateInstallConfig — main-process re-validation of the entry
//      round-tripped through the renderer (npx/uvx first non-flag arg must be
//      a well-formed package identifier).
//   3. McpClient.adaptTool — every MCP tool is 'dangerous' regardless of a
//      benign-looking name (get_browser_cookies must NOT farm a safe rating).
//   4. mcp.handler — mcp:create / mcp:market:install show a native warning
//      dialog (command + args + env KEYS only) before any DB write or spawn;
//      cancel is the default button and cancels the whole flow.
//
// electron.dialog and mcp/manager are mocked via Module._load — the repo's
// established pattern (see autoMemoryOrigin.test.js): nested CJS require()
// calls run through Node's native loader, so vi.mock never reaches them.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import Module from 'node:module'

// ── Fakes ───────────────────────────────────────────────────────────────────
const dialogState = { response: 0, calls: [] }
const fakeDialog = {
  showMessageBox: async (opts) => {
    dialogState.calls.push(opts)
    return { response: dialogState.response }
  },
}

const managerState = { connect: [], disconnect: [] }
const fakeManager = {
  connectServer: async (cfg) => { managerState.connect.push(cfg); return [] },
  disconnectServer: async (name) => { managerState.disconnect.push(name) },
}

const origLoad = Module._load
Module._load = function (request, ...args) {
  if (request === 'electron') return { dialog: fakeDialog }
  if (request === '../mcp/manager' || request === '../electron/mcp/manager') return fakeManager
  return origLoad.apply(this, [request, ...args])
}
afterAll(() => { Module._load = origLoad })

let market
let clientMod
let handlerMod

beforeEach(async () => {
  vi.resetModules()
  dialogState.response = 0
  dialogState.calls.length = 0
  managerState.connect.length = 0
  managerState.disconnect.length = 0
  market = await import('../electron/mcp/market')
  clientMod = await import('../electron/mcp/client')
  handlerMod = await import('../electron/ipc/mcp.handler')
})

// ── market.buildConfig: runtime whitelist ───────────────────────────────────
describe('buildConfig runtime whitelist (P0-C3)', () => {
  const stdPkg = { registryType: 'npm', identifier: '@modelcontextprotocol/server-filesystem', runtimeArguments: [], environmentVariables: [] }

  it('rejects runtimeHint cmd', () => {
    const r = market.buildConfig('evil', { ...stdPkg, runtimeHint: 'cmd' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not allowed/)
    expect(r.config).toBeUndefined()
  })

  it('rejects runtimeHint powershell (and .exe variant)', () => {
    for (const hint of ['powershell', 'powershell.exe', 'pwsh']) {
      const r = market.buildConfig('evil', { ...stdPkg, runtimeHint: hint })
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/not allowed/)
    }
  })

  it('rejects absolute-path runtimeHints (win + posix)', () => {
    for (const hint of ['C:\\tools\\x.exe', '/usr/bin/sh', '/bin/bash', 'C:/tools/x.exe']) {
      const r = market.buildConfig('evil', { ...stdPkg, runtimeHint: hint })
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/not allowed/)
    }
  })

  it('rejects runtimeHints with padding or junk variants', () => {
    // exact-match whitelist: padded/case/extension variants don't sneak in
    for (const hint of ['  cmd  ', 'CMD', 'Npx', 'npx.exe', 'node ']) {
      const r = market.buildConfig('evil', { ...stdPkg, runtimeHint: hint })
      expect(r.ok).toBe(false)
    }
  })

  it('allows whitelisted npx runtime and produces config', () => {
    const r = market.buildConfig('fs', { ...stdPkg, runtimeHint: 'npx' })
    expect(r.ok).toBe(true)
    expect(r.config.command).toBe('npx')
    expect(r.config.args).toContain('@modelcontextprotocol/server-filesystem')
  })

  it('allows every whitelisted runtime', () => {
    for (const rt of ['npx', 'uvx', 'dotnet', 'go', 'node', 'python']) {
      const r = market.buildConfig('s', { ...stdPkg, runtimeHint: rt })
      expect(r.ok).toBe(true)
      expect(r.config.command).toBe(rt)
    }
  })

  it('defaults registryType pypi→uvx and npm→npx (both whitelisted)', () => {
    expect(market.buildConfig('a', { registryType: 'pypi', identifier: 'mcp-server-fetch' }).config.command).toBe('uvx')
    expect(market.buildConfig('a', { registryType: 'npm', identifier: 'mcp-server-fetch' }).config.command).toBe('npx')
  })
})

// ── market.buildConfig: package identifier validation ───────────────────────
describe('buildConfig package identifier validation (P0-C3)', () => {
  const base = { registryType: 'npm', runtimeHint: 'npx', runtimeArguments: [], environmentVariables: [] }

  it('rejects shell injection in identifier', () => {
    for (const ident of ['evil; rm -rf', 'evil && calc', 'x$(whoami)', 'a|b', 'a`b`']) {
      const r = market.buildConfig('evil', { ...base, identifier: ident })
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/identifier/)
    }
  })

  it('rejects path traversal in identifier', () => {
    for (const ident of ['../x', '..\\x', './x', '/etc/passwd', 'a/b']) {
      expect(market.buildConfig('evil', { ...base, identifier: ident }).ok).toBe(false)
    }
  })

  it('rejects empty / missing identifier', () => {
    for (const ident of ['', undefined, null]) {
      const r = market.buildConfig('evil', { ...base, identifier: ident })
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/identifier/)
    }
  })

  it('rejects uppercase identifiers (A_B_C and scoped variants)', () => {
    for (const ident of ['A_B_C', 'MyServer', '@Scope/name', '@scope/Name', '@scope/name.js']) {
      expect(market.buildConfig('evil', { ...base, identifier: ident }).ok).toBe(false)
    }
  })

  it('accepts well-formed bare and scoped identifiers', () => {
    for (const ident of ['mcp-server-fetch', 'mcp.server_fetch', 'server1', 'a', '@modelcontextprotocol/server-filesystem', '@modelcontextprotocol/server-everything']) {
      const r = market.buildConfig('ok', { ...base, identifier: ident })
      expect(r.ok).toBe(true)
      expect(r.config.args).toContain(ident)
    }
  })

  it('rejects identifiers whose head char is not [a-z0-9-]', () => {
    for (const ident of ['.hidden', '_private', 'élève']) {
      expect(market.buildConfig('evil', { ...base, identifier: ident }).ok).toBe(false)
    }
    // digits and hyphens ARE allowed in the head
    expect(market.buildConfig('ok', { ...base, identifier: '7zip-mcp' }).ok).toBe(true)
    expect(market.buildConfig('ok', { ...base, identifier: '-weird-but-shape-legal' }).ok).toBe(true)
  })
})

// ── market.validateInstallConfig: renderer-roundtrip re-validation ──────────
describe('validateInstallConfig (defense in depth)', () => {
  it('rejects non-whitelisted commands outright', () => {
    for (const command of ['cmd', 'cmd.exe', 'powershell', 'C:\\tools\\x.exe', '/usr/bin/sh', '', 'npx.exe']) {
      const r = market.validateInstallConfig({ name: 's', command, args: ['-y', '@modelcontextprotocol/server-filesystem'] })
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/not allowed/)
    }
  })

  it('rejects missing name', () => {
    expect(market.validateInstallConfig({ command: 'npx', args: ['-y', 'mcp-server-fetch'] }).ok).toBe(false)
    expect(market.validateInstallConfig(null).ok).toBe(false)
  })

  it('npx/uvx require a well-formed package identifier as first non-flag arg', () => {
    expect(market.validateInstallConfig({ name: 's', command: 'npx', args: ['-y'] }).ok).toBe(false)
    expect(market.validateInstallConfig({ name: 's', command: 'npx', args: ['-y', 'evil; rm -rf'] }).ok).toBe(false)
    expect(market.validateInstallConfig({ name: 's', command: 'npx', args: ['-y', '../x'] }).ok).toBe(false)
    expect(market.validateInstallConfig({ name: 's', command: 'npx', args: ['-y', 'A_B_C'] }).ok).toBe(false)
    expect(market.validateInstallConfig({ name: 's', command: 'uvx', args: ['mcp-server-fetch'] }).ok).toBe(true)
  })

  it('accepts the curated filesystem config shape', () => {
    const r = market.validateInstallConfig({ name: 'filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/'], env: {} })
    expect(r.ok).toBe(true)
  })
})

// ── McpClient.adaptTool: always dangerous (P2-M1) ───────────────────────────
describe('McpClient.adaptTool risk assignment (P2-M1)', () => {
  function mk() { return new clientMod.McpClient({ name: 'demo', command: 'npx', args: [] }) }

  it('benign-looking names are dangerous too — no name-regex safe ratings', () => {
    const c = mk()
    for (const name of ['get_browser_cookies', 'read_file', 'list_files', 'search_web', 'get_status', 'fetch_url', 'grep_logs', 'diff_changes']) {
      const tool = c.adaptTool({ name, description: 'x', inputSchema: { type: 'object' } })
      expect(tool.risk).toBe('dangerous')
      expect(tool.name).toBe(`demo__${name}`)
    }
  })

  it('tool shape keeps description/schema and namespaced name', () => {
    const c = mk()
    const tool = c.adaptTool({ name: 'query', description: 'run a query', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } })
    expect(tool.name).toBe('demo__query')
    expect(tool.description).toBe('[MCP:demo] run a query')
    expect(tool.parameters.properties.q).toBeDefined()
    expect(typeof tool.run).toBe('function')
  })
})

// ── mcp.handler: native confirmation gate (P1-H3) ───────────────────────────
describe('mcp.handler confirmation gate', () => {
  function mkHarness() {
    const handlers = new Map()
    const ipcMain = { handle: (ch, fn) => handlers.set(ch, fn) }
    const dbCalls = { add: [] }
    const db = {
      getMcpServers: () => [],
      addMcpServer: (data) => { dbCalls.add.push(data); return { lastInsertRowid: 42 } },
    }
    handlerMod.registerMcpHandlers(ipcMain, db)
    return { handlers, dbCalls }
  }

  it('mcp:create confirmed → persists', async () => {
    const { handlers, dbCalls } = mkHarness()
    dialogState.response = 0 // "Add"
    const res = await handlers.get('mcp:create')(null, { name: 's', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'], env: {}, enabled: 1 })
    expect(res.lastInsertRowid).toBe(42)
    expect(dbCalls.add).toHaveLength(1)
  })

  it('mcp:create cancelled → nothing persisted, cancelled flag returned', async () => {
    const { handlers, dbCalls } = mkHarness()
    dialogState.response = 1 // "Cancel"
    const res = await handlers.get('mcp:create')(null, { name: 's', command: 'npx', args: [], env: {} })
    expect(res.cancelled).toBe(true)
    expect(res.lastInsertRowid).toBeUndefined()
    expect(dbCalls.add).toHaveLength(0)
  })

  it('mcp:create invalid input → error, no dialog, no write', async () => {
    const { handlers, dbCalls } = mkHarness()
    const res = await handlers.get('mcp:create')(null, { name: '', command: '' })
    expect(res.error).toBeDefined()
    expect(dialogState.calls).toHaveLength(0)
    expect(dbCalls.add).toHaveLength(0)
  })

  it('dialog shows full command line, env KEYS only (never values), cancel is default', async () => {
    const { handlers } = mkHarness()
    dialogState.response = 1
    await handlers.get('mcp:create')(null, {
      name: 'github', command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'super-secret-value-123' },
    })
    expect(dialogState.calls).toHaveLength(1)
    const opts = dialogState.calls[0]
    expect(opts.type).toBe('warning')
    expect(opts.defaultId).toBe(1) // cancel is the default button
    expect(opts.cancelId).toBe(1)
    expect(opts.detail).toContain('command: npx')
    expect(opts.detail).toContain('@modelcontextprotocol/server-github')
    expect(opts.detail).toContain('GITHUB_PERSONAL_ACCESS_TOKEN')
    expect(opts.detail).not.toContain('super-secret-value-123')
  })

  it('mcp:market:install rejects hostile command BEFORE any dialog or write', async () => {
    const { handlers, dbCalls } = mkHarness()
    for (const command of ['cmd', 'powershell', 'C:\\tools\\x.exe', '/usr/bin/sh']) {
      const res = await handlers.get('mcp:market:install')(null, { config: { name: 'evil', command, args: ['/c', 'calc.exe'], env: {} } })
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/not allowed/)
    }
    expect(dialogState.calls).toHaveLength(0)
    expect(dbCalls.add).toHaveLength(0)
    expect(managerState.connect).toHaveLength(0)
  })

  it('mcp:market:install rejects injected npx package names', async () => {
    const { handlers, dbCalls } = mkHarness()
    const res = await handlers.get('mcp:market:install')(null, { config: { name: 'evil', command: 'npx', args: ['-y', 'evil; rm -rf'], env: {} } })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/identifier/)
    expect(dialogState.calls).toHaveLength(0)
    expect(dbCalls.add).toHaveLength(0)
  })

  it('mcp:market:install confirmed → persists and connects', async () => {
    const { handlers, dbCalls } = mkHarness()
    dialogState.response = 0 // "Install"
    const res = await handlers.get('mcp:market:install')(null, {
      config: { name: 'filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/'], env: {} },
    })
    expect(res.success).toBe(true)
    expect(res.id).toBe(42)
    expect(dbCalls.add).toHaveLength(1)
    expect(managerState.connect).toHaveLength(1)
    expect(managerState.connect[0].command).toBe('npx')
  })

  it('mcp:market:install cancelled → no write, no connect, cancelled flag', async () => {
    const { handlers, dbCalls } = mkHarness()
    dialogState.response = 1 // "Cancel"
    const res = await handlers.get('mcp:market:install')(null, {
      config: { name: 'filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/'], env: {} },
    })
    expect(res.success).toBe(false)
    expect(res.cancelled).toBe(true)
    expect(dbCalls.add).toHaveLength(0)
    expect(managerState.connect).toHaveLength(0)
  })
})
