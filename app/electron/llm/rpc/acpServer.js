// ─────────────────────────────────────────────────────────────────────────────
// rpc/acpServer.js — Standard Agent Client Protocol (ACP) JSON-RPC 2.0 Server.
//
// Conforms to the ACP specification (used by Zed, Neovim, and modern editors).
// Runs over stdin/stdout (or any duplex stream) exchanging JSON-RPC 2.0 frames:
//
// Methods:
//   initialize      → handshake (protocolVersion, serverInfo, capabilities)
//   ping            → liveness check ({ pong: true })
//   models/list     → returns available models from Aether database
//   tools/list      → returns registered tool definitions
//   session/new     → creates a new session in Aether ({ sessionId })
//   session/prompt  → runs agent with streaming notifications ({ sessionId, status: 'completed' })
//   session/cancel  → cancels a running session prompt
//
// Notifications sent to client during session/prompt:
//   session/update  → { sessionId, delta: { type: 'text'|'tool_start'|'tool_end'|'status'|'plan', ... } }
// ─────────────────────────────────────────────────────────────────────────────

const readline = require('node:readline')
const agentCore = require('../agentCore')
const { TOOLS } = require('../../tools/registry')
const { taskDbAdapter } = require('../taskDbAdapter')

const ACP_PROTOCOL_VERSION = '0.1.0'
const SERVER_INFO = {
  name: 'aetherai',
  version: '0.9.1',
}

// Active prompt cancellation controllers: sessionId -> AbortController
const _activeControllers = new Map()

function jsonRpcResult(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result })
}

function jsonRpcError(id, code, message, data) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message, data } })
}

function jsonRpcNotification(method, params) {
  return JSON.stringify({ jsonrpc: '2.0', method, params })
}

/**
 * Creates an ACP JSON-RPC 2.0 server instance.
 * @param {{ db: object, deps?: object }} options
 */
function createAcpServer({ db, deps = {} }) {
  const runAgentImpl = deps.runAgentImpl || agentCore.runAgent

  const routes = {
    async initialize(params) {
      return {
        protocolVersion: ACP_PROTOCOL_VERSION,
        serverInfo: SERVER_INFO,
        capabilities: {
          sessions: true,
          prompt: true,
          tools: true,
          cancel: true,
          models: true,
        },
      }
    },

    async ping() {
      return { pong: true, timestamp: Date.now() }
    },

    async 'models/list'() {
      const models = agentCore.listModels(db) || []
      const providers = agentCore.listProviders(db) || []
      return { models, providers }
    },

    async 'tools/list'() {
      const tools = TOOLS || []
      return {
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
          risk: t.risk || 'safe',
        })),
      }
    },

    async 'session/new'(params) {
      const title = params.title || (params.workspaceUri ? `Workspace: ${params.workspaceUri}` : 'ACP Session')
      const adapter = taskDbAdapter(db)
      const res = adapter.createSession({ title })
      const sessionId = String(res.lastInsertRowid || res)
      return { sessionId }
    },

    async 'session/prompt'(params, notify) {
      const sessionId = String(params.sessionId || '')
      let prompt
      if (Array.isArray(params.prompt)) {
        const blocks = params.prompt
        if (blocks.some(b => !b || b.type !== 'text' || typeof b.text !== 'string')) {
          throw { code: -32602, message: 'prompt contains unsupported content block' }
        }
        prompt = blocks.map(b => b.text).join(' ').trim()
      } else {
        prompt = String(params.prompt || '').trim()
      }
      if (!prompt) {
        throw { code: -32602, message: 'prompt is required in session/prompt params' }
      }

      let provider = params.provider
      let model = params.model
      if (!provider || !model) {
        const resolved = agentCore.resolveProviderModel(db, {
          providerName: params.providerName,
          modelName: params.modelName,
        })
        if (!resolved) {
          throw { code: -32603, message: 'No enabled model found in Aether. Configure one in app or pass provider/model.' }
        }
        provider = provider || resolved.provider
        model = model || resolved.model
      }

      const controller = new AbortController()
      if (sessionId) {
        _activeControllers.set(sessionId, controller)
      }

      const workspace = params.workspace || (params.workspaceUri ? params.workspaceUri.replace(/^file:\/\//, '') : process.cwd())

      try {
        const result = await runAgentImpl({
          prompt,
          provider,
          model,
          messages: params.messages,
          agentMode: ['auto', 'plan', 'ask', 'yolo'].includes(params.agentMode) ? params.agentMode : 'auto',
          maxIterations: params.maxIterations || 25,
          workspace,
          signal: controller.signal,
          onText: (chunk) => {
            notify('session/update', {
              sessionId,
              delta: { type: 'text', text: chunk.text, done: !!chunk.done },
            })
          },
          onToolCall: (entry) => {
            const isStart = entry && !entry.result && !entry.error
            notify('session/update', {
              sessionId,
              delta: {
                type: isStart ? 'tool_start' : 'tool_end',
                tool: entry.name,
                callId: entry.id,
                args: entry.args,
                result: entry.result,
                error: entry.error,
              },
            })
          },
          onStatus: (s) => {
            notify('session/update', {
              sessionId,
              delta: { type: 'status', kind: s.kind, text: s.text },
            })
          },
          onPlanStep: (step) => {
            notify('session/update', {
              sessionId,
              delta: { type: 'plan', step },
            })
          },
        })

        return {
          sessionId,
          status: 'completed',
          response: result.text || '',
          toolCalls: result.toolCalls || [],
          iterations: result.iterations || 1,
        }
      } finally {
        if (sessionId) {
          _activeControllers.delete(sessionId)
        }
      }
    },

    async 'session/cancel'(params) {
      const sessionId = String(params.sessionId || '')
      const controller = _activeControllers.get(sessionId)
      if (controller) {
        controller.abort()
        _activeControllers.delete(sessionId)
        return { sessionId, cancelled: true }
      }
      return { sessionId, cancelled: false, note: 'session not currently executing' }
    },
  }

  /**
   * Handle an incoming raw JSON-RPC 2.0 message.
   * @param {string|object} raw
   * @param {(frame: string) => void} emit
   */
  async function handleMessage(raw, emit) {
    let msg
    if (typeof raw === 'string') {
      try {
        msg = JSON.parse(raw)
      } catch (err) {
        emit(jsonRpcError(null, -32700, 'Parse error: invalid JSON'))
        return
      }
    } else {
      msg = raw
    }

    if (!msg || typeof msg !== 'object') {
      emit(jsonRpcError(null, -32600, 'Invalid Request: expected JSON object'))
      return
    }

    const { id, method, params = {} } = msg

    // Notifications (no id) are not responded to unless handler errors
    const isNotification = id === undefined || id === null

    const handler = routes[method]
    if (!handler) {
      if (!isNotification) {
        emit(jsonRpcError(id, -32601, `Method not found: ${method}`))
      }
      return
    }

    const notify = (notifMethod, notifParams) => {
      emit(jsonRpcNotification(notifMethod, notifParams))
    }

    try {
      const result = await handler(params, notify)
      if (!isNotification) {
        emit(jsonRpcResult(id, result))
      }
    } catch (e) {
      if (!isNotification) {
        const code = (e && typeof e.code === 'number') ? e.code : -32603
        const message = (e && e.message) ? e.message : String(e)
        emit(jsonRpcError(id, code, message, e && e.data))
      }
    }
  }

  return { handleMessage, routes }
}

/**
 * Main ACP CLI entrypoint: reads stdin line-by-line JSON-RPC, writes to stdout.
 * @param {{ db?: string, deps?: object }} opts
 * @returns {Promise<number>}
 */
async function main({ db: dbPath, deps = {} } = {}) {
  const db = agentCore.openDatabase(dbPath)
  if (!db) {
    process.stdout.write(jsonRpcError(null, -32603, 'Database unavailable') + '\n')
    return 1
  }

  const server = createAcpServer({ db, deps })
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
  const emit = (str) => process.stdout.write(str + '\n')

  try {
    for await (const line of rl) {
      const trimmed = line.trim()
      if (!trimmed) continue
      // Do not block stdin dispatch while a prompt is running; cancellation
      // requests must reach the active controller immediately.
      server.handleMessage(trimmed, emit).catch((e) => {
        emit(jsonRpcError(null, -32603, `ACP request error: ${e && e.message ? e.message : String(e)}`))
      })
    }
  } catch (e) {
    emit(jsonRpcError(null, -32603, `ACP server error: ${e && e.message ? e.message : String(e)}`))
    return 1
  }
  return 0
}

module.exports = {
  createAcpServer,
  main,
  ACP_PROTOCOL_VERSION,
  SERVER_INFO,
}
