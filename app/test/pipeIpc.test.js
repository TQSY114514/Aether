import { describe, it, expect, afterEach } from 'vitest'
import {
  createPipeServer,
  createPipeClient,
  isValidA2AMessage,
  getPipePath
} from '../electron/llm/rpc/pipeIpc.js'

describe('Windows Named Pipe Cluster IPC & A2A (P2-3)', () => {
  let server = null
  let client1 = null
  let client2 = null

  afterEach(async () => {
    if (client1) { client1.close(); client1 = null }
    if (client2) { client2.close(); client2 = null }
    if (server) { await server.close(); server = null }
  })

  it('generates platform-appropriate pipe paths', () => {
    const pipe = getPipePath('cluster-test')
    if (process.platform === 'win32') {
      expect(pipe).toContain('\\\\.\\pipe\\aetherai-cluster-test')
    } else {
      expect(pipe).toContain('/tmp/aetherai-cluster-test.sock')
    }
  })

  it('establishes connection and sends one-way message', async () => {
    const pipeName = `test_msg_${Date.now()}`
    const received = []

    server = createPipeServer({ name: pipeName })
    server.on('message', (msg) => {
      received.push(msg)
    })
    await server.start()

    client1 = createPipeClient({ name: pipeName })
    await client1.connect()

    client1.send({ type: 'ping', payload: 'hello pipe' })

    // Wait for message transmission
    await new Promise(r => setTimeout(r, 50))

    expect(received.length).toBe(1)
    expect(received[0].type).toBe('ping')
    expect(received[0].payload).toBe('hello pipe')
  })

  it('handles request-response cycle across pipe', async () => {
    const pipeName = `test_req_${Date.now()}`

    server = createPipeServer({
      name: pipeName,
      onRequest: async (req) => {
        if (req.action === 'add') {
          return { sum: req.a + req.b }
        }
        throw new Error('Unknown action')
      }
    })
    await server.start()

    client1 = createPipeClient({ name: pipeName })
    await client1.connect()

    const res = await client1.request({ action: 'add', a: 15, b: 27 })
    expect(res).toEqual({ sum: 42 })

    // Verify error response
    await expect(client1.request({ action: 'invalid' })).rejects.toThrow('Unknown action')
  })

  it('supports A2A task delegation and protocol validation', async () => {
    const pipeName = `test_a2a_${Date.now()}`

    server = createPipeServer({
      name: pipeName,
      onRequest: async (msg) => {
        expect(isValidA2AMessage(msg)).toBe(true)
        if (msg.type === 'task_delegate') {
          return {
            status: 'accepted',
            taskId: 'task_sub_101',
            receivedInstruction: msg.payload.instruction
          }
        }
        throw new Error('Unexpected A2A message')
      }
    })
    await server.start()

    client1 = createPipeClient({ name: pipeName })
    await client1.connect()

    const delegationResult = await client1.delegateTask('agent-desktop', 'Analyze repo memory', { model: 'gpt-4o' })
    expect(delegationResult.status).toBe('accepted')
    expect(delegationResult.taskId).toBe('task_sub_101')
    expect(delegationResult.receivedInstruction).toBe('Analyze repo memory')
  })

  it('broadcasts messages to multiple connected clients', async () => {
    const pipeName = `test_bcast_${Date.now()}`
    const client1Msgs = []
    const client2Msgs = []

    server = createPipeServer({ name: pipeName })
    await server.start()

    client1 = createPipeClient({ name: pipeName })
    client1.on('message', m => client1Msgs.push(m))
    await client1.connect()

    client2 = createPipeClient({ name: pipeName })
    client2.on('message', m => client2Msgs.push(m))
    await client2.connect()

    await new Promise(r => setTimeout(r, 50))

    server.broadcast({ event: 'agent_status_update', activeCount: 3 })

    await new Promise(r => setTimeout(r, 50))

    expect(client1Msgs.length).toBe(1)
    expect(client1Msgs[0].event).toBe('agent_status_update')
    expect(client2Msgs.length).toBe(1)
    expect(client2Msgs[0].activeCount).toBe(3)
  })
})
