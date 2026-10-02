import { describe, it, expect, vi } from 'vitest'
import { hashToolArgs } from '../electron/llm/toolResultHash.js'

describe('P1-4: Task Journaling & Idempotent Crash Recovery', () => {
  it('hashToolArgs produces stable hashes regardless of object key order', () => {
    const argsA = { path: 'src/main.js', content: 'hello', overwrite: false }
    const argsB = { overwrite: false, content: 'hello', path: 'src/main.js' }
    const hashA = hashToolArgs('write_file', argsA)
    const hashB = hashToolArgs('write_file', argsB)
    expect(hashA).toBe(hashB)
    expect(hashA.startsWith('write_file:')).toBe(true)

    // Different args produce different hashes
    const argsC = { path: 'src/main.js', content: 'hello world', overwrite: false }
    expect(hashToolArgs('write_file', argsC)).not.toBe(hashA)
  })

  it('backgroundTasks serializes toolJournal to DB and rehydrates it upon recovery', async () => {
    const agentTasks = new Map()
    let nextId = 1
    const fakeDb = {
      getSetting: () => '1',
      createSession: () => ({ lastInsertRowid: nextId++ }),
      addMessage: () => ({ lastInsertRowid: 100 + nextId }),
      updateMessage: () => {},
      addAuditLog: () => {},
      getModel: () => ({ id: 1, provider_id: 1, model_name: 'test' }),
      getProvider: () => ({ id: 1, api_url: 'http://localhost', api_format: 'openai' }),
      createAgentTask: (data) => {
        const id = nextId++
        agentTasks.set(id, {
          id,
          session_id: data.session_id,
          title: data.title,
          content: data.content,
          model_id: data.model_id,
          agent_mode: data.agent_mode,
          status: 'running',
          priority: data.priority,
          max_retry: data.max_retry,
          attempts: 0,
          error: null,
          result: null,
          tool_journal: null,
          created_at: new Date().toISOString(),
        })
        return id
      },
      updateAgentTask: (id, patch) => {
        const row = agentTasks.get(id)
        if (row) Object.assign(row, patch)
      },
      getAgentTask: (id) => agentTasks.get(id) || null,
      listAgentTasks: () => Array.from(agentTasks.values()),
    }

    // Dynamic import to get fresh module
    const bt = await import('../electron/llm/backgroundTasks.js')
    bt.initBackgroundTasks({
      db: fakeDb,
      getWebContents: () => null,
      runToolLoop: async ({ toolJournal, onJournalEntry }) => {
        // Record a tool execution into journal
        onJournalEntry({
          tool: 'write_file',
          argsHash: 'hash1234',
          result: 'file written',
          success: true,
          timestamp: Date.now(),
        })
        return 'done'
      },
    })

    const emit = vi.fn()
    const { taskId } = await bt.startTask({
      db: fakeDb,
      title: 'Journal Task',
      content: 'Do something',
      modelId: 1,
      agentMode: 'ask',
      priority: 5,
      emit,
    })

    // Wait for the task to complete
    let waited = 0
    while (!emit.mock.calls.some(c => c[1]?.type === 'done') && waited < 2000) {
      await new Promise(r => setTimeout(r, 20))
      waited += 20
    }

    const updatedRow = fakeDb.getAgentTask(taskId)
    expect(updatedRow).toBeDefined()
    expect(updatedRow.tool_journal).toBeDefined()
    const journalEntries = JSON.parse(updatedRow.tool_journal)
    expect(journalEntries.length).toBe(1)
    expect(journalEntries[0].tool).toBe('write_file')
    expect(journalEntries[0].argsHash).toBe('hash1234')

    // Simulate crash recovery: reset modules as on process restart
    vi.resetModules()
    updatedRow.status = 'running'
    let receivedJournal = null
    const btRestarted = await import('../electron/llm/backgroundTasks.js')
    btRestarted.initBackgroundTasks({
      db: fakeDb,
      getWebContents: () => null,
      runToolLoop: async ({ toolJournal }) => {
        receivedJournal = toolJournal
        return 'recovered answer'
      },
    })
    btRestarted.restorePendingTasks(fakeDb)

    let resumeWaited = 0
    while (!receivedJournal && resumeWaited < 2000) {
      await new Promise(r => setTimeout(r, 20))
      resumeWaited += 20
    }

    expect(receivedJournal).toBeDefined()
    expect(receivedJournal.length).toBe(1)
    expect(receivedJournal[0].tool).toBe('write_file')
    expect(receivedJournal[0].argsHash).toBe('hash1234')
  })
})
