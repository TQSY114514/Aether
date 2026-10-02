import { describe, it, expect, vi } from 'vitest'
import { createAcpServer, ACP_PROTOCOL_VERSION } from '../electron/llm/rpc/acpServer.js'

describe('acpServer (Agent Client Protocol)', () => {
  const mockDb = {
    prepare: vi.fn(() => ({
      all: vi.fn(() => [{ id: 1, model_name: 'claude-3-5-sonnet', provider_name: 'anthropic', is_primary: 1 }]),
      get: vi.fn(() => ({ id: 1, name: 'anthropic', api_format: 'anthropic', api_url: 'https://api.anthropic.com' })),
      run: vi.fn(() => ({ lastInsertRowid: 42 })),
    })),
  }

  it('handles initialize handshake', async () => {
    const server = createAcpServer({ db: mockDb })
    const responses = []
    await server.handleMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { clientInfo: { name: 'zed', version: '0.150.0' } },
      }),
      (msg) => responses.push(JSON.parse(msg))
    )

    expect(responses).toHaveLength(1)
    expect(responses[0]).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: ACP_PROTOCOL_VERSION,
        serverInfo: { name: 'aetherai' },
        capabilities: {
          sessions: true,
          prompt: true,
          tools: true,
          cancel: true,
        },
      },
    })
  })

  it('handles ping request', async () => {
    const server = createAcpServer({ db: mockDb })
    const responses = []
    await server.handleMessage(
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }),
      (msg) => responses.push(JSON.parse(msg))
    )

    expect(responses[0]).toMatchObject({
      jsonrpc: '2.0',
      id: 2,
      result: { pong: true },
    })
  })

  it('handles tools/list', async () => {
    const server = createAcpServer({ db: mockDb })
    const responses = []
    await server.handleMessage(
      JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }),
      (msg) => responses.push(JSON.parse(msg))
    )

    expect(responses[0].result).toBeDefined()
    expect(Array.isArray(responses[0].result.tools)).toBe(true)
    expect(responses[0].result.tools.some((t) => t.name === 'read_file')).toBe(true)
  })

  it('handles session/new', async () => {
    const server = createAcpServer({ db: mockDb })
    const responses = []
    await server.handleMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'session/new',
        params: { title: 'Test Workspace', workspaceUri: 'file:///d:/test' },
      }),
      (msg) => responses.push(JSON.parse(msg))
    )

    expect(responses[0]).toMatchObject({
      jsonrpc: '2.0',
      id: 4,
      result: { sessionId: '42' },
    })
  })

  it('handles session/prompt with notifications and completion', async () => {
    const mockRunAgent = vi.fn(async ({ onText, onToolCall, onStatus }) => {
      onStatus({ kind: 'thinking', text: 'Analyzing requirements...' })
      onText({ text: 'I will inspect the files.', done: false })
      onToolCall({ name: 'read_file', id: 'call_1', args: { path: 'index.js' } })
      onToolCall({ name: 'read_file', id: 'call_1', result: 'console.log("hello")' })
      onText({ text: ' Done!', done: true })
      return {
        text: 'I will inspect the files. Done!',
        toolCalls: [{ name: 'read_file', result: 'console.log("hello")' }],
        iterations: 1,
      }
    })

    const server = createAcpServer({
      db: mockDb,
      deps: { runAgentImpl: mockRunAgent },
    })

    const notifications = []
    let finalResult = null

    await server.handleMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'session/prompt',
        params: {
          sessionId: '42',
          prompt: 'Refactor index.js',
          provider: { name: 'test', api_url: 'http://test', api_key: 'sk-test' },
          model: { id: 1, model_name: 'test-model' },
        },
      }),
      (msg) => {
        const parsed = JSON.parse(msg)
        if (parsed.method === 'session/update') {
          notifications.push(parsed.params)
        } else if (parsed.id === 5) {
          finalResult = parsed.result
        }
      }
    )

    expect(notifications.length).toBeGreaterThanOrEqual(4)
    expect(notifications.some((n) => n.delta.type === 'status')).toBe(true)
    expect(notifications.some((n) => n.delta.type === 'text')).toBe(true)
    expect(notifications.some((n) => n.delta.type === 'tool_start')).toBe(true)
    expect(notifications.some((n) => n.delta.type === 'tool_end')).toBe(true)

    expect(finalResult).toMatchObject({
      sessionId: '42',
      status: 'completed',
      response: 'I will inspect the files. Done!',
    })
  })

  it('handles session/cancel', async () => {
    let capturedSignal
    const mockRunAgent = vi.fn(async ({ signal }) => {
      capturedSignal = signal
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    })

    const server = createAcpServer({
      db: mockDb,
      deps: { runAgentImpl: mockRunAgent },
    })

    // Start long prompt
    const promptPromise = server.handleMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method: 'session/prompt',
        params: {
          sessionId: 'sess-cancel',
          prompt: 'Slow task',
          provider: { name: 'test', api_url: 'http://test', api_key: 'sk-test' },
          model: { id: 1, model_name: 'test-model' },
        },
      }),
      () => {}
    )

    // Give it a tick to register controller
    await new Promise((r) => setTimeout(r, 10))

    const cancelResponses = []
    await server.handleMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 11,
        method: 'session/cancel',
        params: { sessionId: 'sess-cancel' },
      }),
      (msg) => cancelResponses.push(JSON.parse(msg))
    )

    expect(cancelResponses[0]).toMatchObject({
      jsonrpc: '2.0',
      id: 11,
      result: { sessionId: 'sess-cancel', cancelled: true },
    })

    expect(capturedSignal?.aborted).toBe(true)
    await promptPromise
  })

  it('returns standard JSON-RPC 2.0 errors for invalid requests', async () => {
    const server = createAcpServer({ db: mockDb })

    const errors = []
    // 1. Invalid JSON
    await server.handleMessage('not json', (msg) => errors.push(JSON.parse(msg)))
    expect(errors[0].error.code).toBe(-32700)

    // 2. Unknown method
    await server.handleMessage(
      JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'unknown_method' }),
      (msg) => errors.push(JSON.parse(msg))
    )
    expect(errors[1].error.code).toBe(-32601)

    // 3. Invalid params
    await server.handleMessage(
      JSON.stringify({ jsonrpc: '2.0', id: 100, method: 'session/prompt', params: {} }),
      (msg) => errors.push(JSON.parse(msg))
    )
    expect(errors[2].error.code).toBe(-32602)
  })
})
