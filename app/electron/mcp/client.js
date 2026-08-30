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
          windowsHide: true,
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
        clientInfo: { name: 'Aether', version: '0.1' },
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
  // NOTE: the 30s timeout timer is stored alongside the pending entry and
  // cleared on settle — otherwise settled requests leak live timers that keep
  // the process's event loop alive (CLI would hang after done).
  request(method, params) {
    const id = this.nextId++
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params })
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`request timed out: ${method}`))
        }
      }, 30000)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.proc.stdin.write(msg + '\n')
      } catch (e) {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(new Error(`write failed: ${e.message}`))
      }
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
        const { resolve, reject, timer } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        clearTimeout(timer)
        if (msg.error) reject(new Error(msg.error.message || 'rpc error'))
        else resolve(msg.result)
      } else if (msg.method) {
        this.emit('notification', msg)
      }
    }
  }

  // Convert an MCP tool descriptor to our internal tool shape. MCP tools are
  // remote code we did not write — their risk can never be inferred from the
  // name (a hostile server names its cookie-stealer `get_browser_cookies` to
  // farm "safe-looking" ratings). Every MCP tool is 'dangerous' so the
  // permission gate always prompts (spec P2-M1: no name-regex risk guessing).
  adaptTool(t) {
    const name = `${this.name}__${t.name}`
    return {
      name,
      description: `[MCP:${this.name}] ${t.description || t.name}`,
      risk: 'dangerous',
      parameters: t.inputSchema || { type: 'object', properties: {} },
      run: async (args) => {
        const result = await this.request('tools/call', { name: t.name, arguments: args })
        if (result && Array.isArray(result.content)) {
          const hasImage = result.content.some(c => c.type === 'image' || c.type === 'image_url')
          if (hasImage) {
            // Multimodal result: return an array of OpenAI-compatible content parts
            return result.content.map(c => {
              if (c.type === 'image' && c.data && c.mimeType) {
                return { type: 'image_url', image_url: { url: `data:${c.mimeType};base64,${c.data}` } }
              }
              if (c.type === 'image_url') return c
              return { type: 'text', text: c.text || '' }
            })
          }
          // Text-only: flatten to string
          return result.content.map(c => c.text || '').join('\n')
        }
        return typeof result === 'string' ? result : JSON.stringify(result ?? '')
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

  // 同步强杀（todo 14：进程 exit 清理用，不等待握手）。
  killSync() {
    try { this.proc?.kill() } catch {}
  }
}

module.exports = { McpClient }
