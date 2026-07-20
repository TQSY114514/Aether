// ───────────────────────────────────────────────────────────────────────────
// MCP (Model Context Protocol) stdio client.
//
// One McpClient wraps a single MCP server process spawned via stdio. It speaks
// JSON-RPC 2.0 over the child's stdin/stdout: initialize handshake → list tools
// → call tool. Each client exposes its tools as plain {name, description,
// parameters, risk, run} objects that the tool registry merges with the
// built-ins, so the tool loop and permission gate work uniformly.
//
// Reference: https://modelcontextprotocol.io spec (stdio transport).
// We implement the subset needed for tool discovery + invocation.
// ───────────────────────────────────────────────────────────────────────────

const { spawn } = require('child_process')
const EventEmitter = require('events')

class McpClient extends EventEmitter {
  constructor({ name, command, args = [], env = {} }) {
    super()
    this.name = name
    this.command = command
    this.args = Array.isArray(args) ? args : (args ? String(args).split(/\s+/).filter(Boolean) : [])
    this.env = env || {}
    this.proc = null
    this.nextId = 1
    this.pending = new Map() // id -> {resolve, reject}
    this.buffer = ''
    this.tools = []
    this.ready = false
    this.shuttingDown = false
  }

  // Spawn the server, run the initialize handshake, then list tools.
  // Resolves to the tool list; rejects on spawn/handshake failure.
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.proc = spawn(this.command, this.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...this.env },
        })
      } catch (e) {
        return reject(new Error(`spawn failed: ${e.message}`))
      }
      this.proc.once('error', (e) => {
        if (!this.ready) reject(new Error(`spawn error: ${e.message}`))
        this.emit('error', e)
      })
      this.proc.once('exit', (code) => {
        if (!this.ready) reject(new Error(`server exited before handshake (code ${code})`))
        this.emit('exit', code)
      })
      this.proc.stdout.on('data', (chunk) => this.onStdout(chunk))
      this.proc.stderr.on('data', (chunk) => {
        // MCP servers log to stderr; surface for debugging but don't fail.
        this.emit('log', chunk.toString('utf-8'))
      })

      // Handshake: initialize, then notifications/initialized, then tools/list.
      this.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'AetherAI', version: '0.1' },
      })
        .then(async (init) => {
          this.notify('notifications/initialized', {})
          const list = await this.request('tools/list', {})
          this.tools = (list.tools || []).map(t => this.adaptTool(t))
          this.ready = true
          resolve(this.tools)
        })
        .catch((e) => reject(new Error(`handshake failed: ${e.message}`)))
    })
  }

  // Send a JSON-RPC request and await the response (matched by id).
  request(method, params) {
    const id = this.nextId++
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params })
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try {
        this.proc.stdin.write(msg + '\n')
      } catch (e) {
        this.pending.delete(id)
        reject(new Error(`write failed: ${e.message}`))
      }
      // Timeout so a hung server doesn't block the loop forever.
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`request timed out: ${method}`))
        }
      }, 30000)
    })
  }

  // Send a JSON-RPC notification (no response expected).
  notify(method, params) {
    try {
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
    } catch {}
  }

  // Parse newline-delimited JSON-RPC messages from stdout and resolve pending
  // requests. Notifications/results without a pending id are emitted as events.
  onStdout(chunk) {
    this.buffer += chunk.toString('utf-8')
    let idx
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (!line) continue
      let msg
      try { msg = JSON.parse(line) } catch { continue }
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message || 'rpc error'))
        else resolve(msg.result)
      } else if (msg.method) {
        this.emit('notification', msg)
      }
    }
  }

  // Convert an MCP tool descriptor to our internal tool shape. MCP tools are
  // remote, so we can't statically know their risk — default to 'dangerous'
  // (permission gate will prompt) unless the tool name matches a known-safe
  // pattern (read/list/search/get). The user can always approve/deny.
  adaptTool(t) {
    const name = `${this.name}__${t.name}`
    const lower = String(t.name).toLowerCase()
    const risk = /read|list|search|get|fetch|grep|glob|status|diff/.test(lower) ? 'safe' : 'dangerous'
    return {
      name,
      description: `[MCP:${this.name}] ${t.description || t.name}`,
      risk,
      parameters: t.inputSchema || { type: 'object', properties: {} },
      run: async (args) => {
        const result = await this.request('tools/call', { name: t.name, arguments: args })
        // MCP returns { content: [{ type: 'text', text }] } — flatten to text.
        if (result && Array.isArray(result.content)) {
          return result.content.map(c => c.text || '').join('\n')
        }
        return JSON.stringify(result ?? '')
      },
    }
  }

  // Gracefully shut down the server process.
  async close() {
    this.shuttingDown = true
    try { await this.request('shutdown', {}).catch(() => {}) } catch {}
    try { this.proc.stdin.end() } catch {}
    try { this.proc.kill() } catch {}
  }
}

module.exports = { McpClient }
