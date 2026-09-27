// ─────────────────────────────────────────────────────────────────────────────
// electron/llm/rpc/pipeIpc.js — Windows Named Pipe Cluster IPC & A2A Communication
//
// Enables high-throughput, microsecond-latency IPC between Desktop instances,
// TUI terminals, and background daemons using Windows Named Pipes (\\.\pipe\aetherai-*)
// with POSIX domain socket fallback.
// ─────────────────────────────────────────────────────────────────────────────

const net = require('net')
const EventEmitter = require('events')
const fs = require('fs')
const log = require('../../logger')
const {
  isValidA2AMessage,
  createDelegation,
  createStateSync,
  createInterrupt,
} = require('./a2aProtocol')

/**
 * Resolve system-level named pipe / domain socket path.
 * @param {string} name
 * @returns {string}
 */
function getPipePath(name = 'default') {
  const safeName = String(name).replace(/[^a-zA-Z0-9_-]/g, '_')
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\aetherai-${safeName}`
    : `/tmp/aetherai-${safeName}.sock`
}

/**
 * Pipe Server hosting A2A and RPC cluster connections.
 */
class PipeServer extends EventEmitter {
  constructor(options = {}) {
    super()
    this.name = options.name || 'default'
    this.pipePath = options.pipePath || getPipePath(this.name)
    this.onRequest = options.onRequest || null
    this.clients = new Set()
    this.server = null
    this._listening = false
  }

  /**
   * Start listening on the named pipe.
   * @returns {Promise<void>}
   */
  start() {
    return new Promise((resolve, reject) => {
      // Clean up stale socket file on non-Windows platforms
      if (process.platform !== 'win32' && fs.existsSync(this.pipePath)) {
        try { fs.unlinkSync(this.pipePath) } catch {}
      }

      this.server = net.createServer((socket) => {
        this.clients.add(socket)
        this.emit('client_connected', socket)

        let buffer = ''
        const MAX_FRAME_SIZE = 1024 * 1024
        socket.on('data', async (chunk) => {
          if (buffer.length + chunk.length > MAX_FRAME_SIZE) {
            socket.destroy()
            return
          }
          buffer += chunk.toString('utf8')
          if (buffer.length > MAX_FRAME_SIZE) {
            socket.destroy()
            return
          }
          let idx
          while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, idx).trim()
            buffer = buffer.slice(idx + 1)
            if (!line) continue

            try {
              const msg = JSON.parse(line)
              this.emit('message', msg, socket)

              // If message is a request (has `id`), dispatch to onRequest if defined
              if (msg && msg.id != null && typeof this.onRequest === 'function') {
                try {
                  const result = await this.onRequest(msg, socket)
                  if (!socket.destroyed) {
                    socket.write(JSON.stringify({ id: msg.id, result, error: null }) + '\n')
                  }
                } catch (err) {
                  if (!socket.destroyed) {
                    socket.write(JSON.stringify({
                      id: msg.id,
                      result: null,
                      error: err && err.message ? err.message : String(err)
                    }) + '\n')
                  }
                }
              }
            } catch (err) {
              log.warn(`[pipeIpc:server] Error parsing frame: ${err.message}`)
            }
          }
        })

        socket.on('close', () => {
          this.clients.delete(socket)
          this.emit('client_disconnected', socket)
        })

        socket.on('error', (err) => {
          log.warn(`[pipeIpc:server] Socket error: ${err.message}`)
        })
      })

      this.server.on('error', (err) => {
        log.error(`[pipeIpc:server] Server error on ${this.pipePath}: ${err.message}`)
        this.emit('error', err)
        reject(err)
      })

      this.server.listen(this.pipePath, () => {
        this._listening = true
        log.info(`[pipeIpc:server] Listening on ${this.pipePath}`)
        resolve()
      })
    })
  }

  /**
   * Broadcast a message to all connected clients.
   * @param {Object} msg
   */
  broadcast(msg) {
    const payload = JSON.stringify(msg) + '\n'
    for (const socket of this.clients) {
      if (!socket.destroyed) {
        socket.write(payload)
      }
    }
  }

  /**
   * Close server and disconnect all clients.
   * @returns {Promise<void>}
   */
  close() {
    return new Promise((resolve) => {
      for (const socket of this.clients) {
        try { socket.destroy() } catch {}
      }
      this.clients.clear()

      if (this.server) {
        this.server.close(() => {
          this._listening = false
          if (process.platform !== 'win32' && fs.existsSync(this.pipePath)) {
            try { fs.unlinkSync(this.pipePath) } catch {}
          }
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}

/**
 * Pipe Client connecting to a Named Pipe Server.
 */
class PipeClient extends EventEmitter {
  constructor(options = {}) {
    super()
    this.name = options.name || 'default'
    this.pipePath = options.pipePath || getPipePath(this.name)
    this.timeout = options.timeout || 5000
    this.socket = null
    this.pendingRequests = new Map() // id -> { resolve, reject, timer }
    this._reqSeq = 0
  }

  /**
   * Connect to the named pipe server.
   * @returns {Promise<void>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      const socket = net.connect(this.pipePath, () => {
        this.socket = socket
        resolve()
      })

      let buffer = ''
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8')
        let idx
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)
          if (!line) continue

          try {
            const msg = JSON.parse(line)

            // If response to a pending request
            if (msg && msg.id != null && this.pendingRequests.has(msg.id)) {
              const pending = this.pendingRequests.get(msg.id)
              this.pendingRequests.delete(msg.id)
              clearTimeout(pending.timer)
              if (msg.error) {
                pending.reject(new Error(msg.error))
              } else {
                pending.resolve(msg.result)
              }
            } else {
              this.emit('message', msg)
            }
          } catch (err) {
            log.warn(`[pipeIpc:client] Error parsing frame: ${err.message}`)
          }
        }
      })

      socket.on('error', (err) => {
        this.emit('error', err)
        reject(err)
      })

      socket.on('close', () => {
        // Reject all pending requests
        for (const [id, req] of this.pendingRequests) {
          clearTimeout(req.timer)
          req.reject(new Error('Connection closed before response received'))
        }
        this.pendingRequests.clear()
        this.emit('close')
      })
    })
  }

  /**
   * Send a one-way notification frame.
   * @param {Object} message
   */
  send(message) {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('PipeClient is not connected')
    }
    this.socket.write(JSON.stringify(message) + '\n')
  }

  /**
   * Send a request and wait for a response.
   * @param {Object} payload
   * @param {number} [timeoutMs]
   * @returns {Promise<any>}
   */
  request(payload, timeoutMs = this.timeout) {
    if (!this.socket || this.socket.destroyed) {
      return Promise.reject(new Error('PipeClient is not connected'))
    }

    const id = `req_${Date.now()}_${++this._reqSeq}`
    const frame = { id, ...payload }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Pipe request timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pendingRequests.set(id, { resolve, reject, timer })
      try {
        this.socket.write(JSON.stringify(frame) + '\n')
      } catch (err) {
        clearTimeout(timer)
        this.pendingRequests.delete(id)
        reject(err)
      }
    })
  }

  /**
   * A2A Helper: Delegate a task to peer agent.
   * @param {string} sender
   * @param {string} instruction
   * @param {Object} [context]
   */
  delegateTask(sender, instruction, context = {}) {
    const msg = createDelegation(sender, instruction, context)
    return this.request(msg)
  }

  /**
   * A2A Helper: Synchronize state with peer agent.
   * @param {string} sender
   * @param {Object} state
   */
  syncState(sender, state) {
    const msg = createStateSync(sender, state)
    this.send(msg)
  }

  /**
   * A2A Helper: Interrupt peer agent execution.
   * @param {string} sender
   * @param {string} [reason]
   */
  interrupt(sender, reason = '') {
    const msg = createInterrupt(sender, reason)
    this.send(msg)
  }

  /**
   * Close client connection.
   */
  close() {
    if (this.socket) {
      try { this.socket.destroy() } catch {}
      this.socket = null
    }
    for (const [id, req] of this.pendingRequests) {
      clearTimeout(req.timer)
      req.reject(new Error('PipeClient closed'))
    }
    this.pendingRequests.clear()
  }
}

/**
 * Factory functions
 */
function createPipeServer(options = {}) {
  return new PipeServer(options)
}

function createPipeClient(options = {}) {
  return new PipeClient(options)
}

module.exports = {
  getPipePath,
  PipeServer,
  PipeClient,
  createPipeServer,
  createPipeClient,
  isValidA2AMessage,
  createDelegation,
  createStateSync,
  createInterrupt,
}
