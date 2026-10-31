import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Module, { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEmptyDatabase } from '../electron/db/schema.js'

const require = createRequire(import.meta.url)

// Setup Module._load hook for toolLoop and sandbox
const runToolLoopMock = vi.fn()
class IterationBudget { constructor(n) { this.n = n } }
const mockedToolLoop = { runToolLoop: runToolLoopMock, IterationBudget }
const mockedSandbox = {
  getWorkspaceRoot: vi.fn(() => 'D:\\Aether'),
  setWorkspaceRootForSession: vi.fn(),
}

const origLoad = Module._load
Module._load = function (request, ...args) {
  if (request === './toolLoop' || request === '../electron/llm/toolLoop') return mockedToolLoop
  if (request === '../tools/sandbox' || request === './sandbox') return mockedSandbox
  return origLoad.apply(this, [request, ...args])
}

const backgroundTasks = require('../electron/llm/backgroundTasks.js')
const subAgent = require('../electron/llm/subAgent.js')

let tmpDir = null
let rawDb = null
let dbAdapter = null
let updateAgentTaskCalls = []

function setupTestDb() {
  tmpDir = mkdtempSync(join(tmpdir(), 'challenger-subagent-'))
  const dbPath = join(tmpDir, 'test.db')
  rawDb = createEmptyDatabase(dbPath)
  updateAgentTaskCalls = []

  dbAdapter = {
    db: rawDb,
    createSession: (opts) => {
      const stmt = rawDb.prepare(`
        INSERT INTO session (title, persona_id, parent_session_id, config, session_kind, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `)
      const res = stmt.run(
        opts.title,
        opts.persona_id || null,
        opts.parentSessionId || null,
        opts.config ? JSON.stringify(opts.config) : null,
        opts.session_kind || 'chat'
      )
      return { lastInsertRowid: Number(res.lastInsertRowid) }
    },
    updateSession: (id, patch) => {
      const sets = []
      const vals = []
      if (patch.title !== undefined) { sets.push('title = ?'); vals.push(patch.title) }
      if (patch.status !== undefined) { sets.push('status = ?'); vals.push(patch.status) }
      if (sets.length) {
        rawDb.prepare(`UPDATE session SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...vals, id)
      }
    },
    deleteSession: (id) => {
      rawDb.prepare('DELETE FROM session WHERE id = ?').run(id)
    },
    addMessage: ({ session_id, role, content, thinking_content, thinking_duration_ms }) => {
      const stmt = rawDb.prepare(`
        INSERT INTO message (session_id, role, content, thinking_content, thinking_duration_ms, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `)
      const res = stmt.run(session_id, role, content, thinking_content || null, thinking_duration_ms || null)
      return { lastInsertRowid: Number(res.lastInsertRowid) }
    },
    createAgentTask: ({
      session_id,
      parent_session_id = null,
      title,
      content,
      model_id = null,
      agent_mode = 'ask',
      priority = 0,
      max_retry = 2,
      kind = 'subagent',
      status = 'running',
    }) => {
      const stmt = rawDb.prepare(`
        INSERT INTO agent_task (session_id, parent_session_id, title, content, model_id, agent_mode, priority, max_retry, kind, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `)
      const res = stmt.run(session_id, parent_session_id, title, content, model_id, agent_mode, priority, max_retry, kind, status)
      return Number(res.lastInsertRowid)
    },
    updateAgentTask: (id, patch) => {
      updateAgentTaskCalls.push({ id, patch: { ...patch } })
      const cols = Object.keys(patch || {})
      if (!cols.length) return
      const sets = cols.map((k) => `${k} = ?`).join(', ')
      const vals = cols.map((k) => patch[k])
      rawDb.prepare(`UPDATE agent_task SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...vals, id)
    },
    getAgentTask: (id) => {
      const row = rawDb.prepare('SELECT * FROM agent_task WHERE id = ?').get(id)
      if (!row) return null
      return {
        ...row,
        id: Number(row.id),
        session_id: row.session_id ? Number(row.session_id) : null,
        model_id: row.model_id ? Number(row.model_id) : null,
      }
    },
    getModel: (id) => ({ id: 1, provider_id: 1, model_name: 'test-model' }),
    getProvider: (id) => ({ id: 1, api_format: 'openai', api_key: 'test', endpoint: 'http://localhost' }),
  }

  backgroundTasks.initBackgroundTasks({
    getWebContents: () => null,
    db: dbAdapter,
  })

  return { rawDb, dbAdapter }
}

describe('Adversarial Stress Test: Subagent Telemetry, Cancellation & Concurrency', () => {
  beforeEach(() => {
    runToolLoopMock.mockReset()
    setupTestDb()
  })

  afterEach(() => {
    if (rawDb) {
      try { rawDb.close() } catch {}
    }
    if (tmpDir) {
      try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    }
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Subagent Telemetry Stream Under High-Frequency Tool Calls
  // ───────────────────────────────────────────────────────────────────────────
  describe('Challenge 1: Telemetry Stream Durability under High-Frequency Tool Calls', () => {
    it('handles 500 rapid-fire tool call events without dropping data or crashing state', () => {
      const messageId = 101
      const subagentsByMessage = {}

      const handleSubagentEvent = (event) => {
        const existing = subagentsByMessage[messageId] || []
        const idx = existing.findIndex((sa) => sa.id === event.id)
        const prev = idx >= 0 ? existing[idx] : null
        const currentTool = event.tool ? (event.tool.name || event.tool) : (event.status === 'done' || event.status === 'error' ? undefined : prev?.currentTool)
        const currentStatus = event.text || prev?.currentStatus
        const entry = {
          id: event.id,
          name: event.name || (event.index != null ? `子代理 ${event.index + 1}` : prev?.name || '子代理'),
          task: event.task || prev?.task || '',
          status: event.status || prev?.status || 'running',
          latencyMs: event.latencyMs,
          startedAt: event.startedAt,
          output: event.output,
          error: event.error,
          taskId: event.taskId ?? prev?.taskId,
          currentTool,
          currentStatus,
        }
        let nextList = [...existing]
        if (idx >= 0) {
          nextList[idx] = { ...nextList[idx], ...entry }
        } else {
          nextList.push(entry)
        }
        subagentsByMessage[messageId] = nextList
      }

      handleSubagentEvent({
        type: 'start',
        id: 'sub-1',
        taskId: 501,
        task: 'Stress testing telemetry',
        status: 'running',
        startedAt: Date.now(),
      })

      const toolNames = ['read_file', 'write_file', 'grep_search', 'run_command', 'ast_search']
      for (let i = 0; i < 500; i++) {
        const toolName = toolNames[i % toolNames.length]
        handleSubagentEvent({
          type: 'tool_call',
          id: 'sub-1',
          taskId: 501,
          tool: { name: toolName, args: { index: i } },
        })
        handleSubagentEvent({
          type: 'status',
          id: 'sub-1',
          taskId: 501,
          text: `Executing tool step ${i}`,
        })
      }

      handleSubagentEvent({
        type: 'done',
        id: 'sub-1',
        taskId: 501,
        status: 'done',
        output: 'Completed 500 tool calls successfully',
      })

      const subList = subagentsByMessage[messageId]
      expect(subList).toHaveLength(1)
      expect(subList[0].status).toBe('done')
      expect(subList[0].taskId).toBe(501)
      expect(subList[0].output).toBe('Completed 500 tool calls successfully')
      expect(subList[0].currentStatus).toBe('Executing tool step 499')
      expect(subList[0].currentTool).toBeUndefined()
    })

    it('probes potential React render crashes when event.tool is a non-standard object', () => {
      const eventWithNestedTool = {
        type: 'tool_call',
        id: 'sub-react-test',
        tool: { function: { name: 'bash' }, id: 'call_1' },
      }

      const prev = null
      const currentTool = eventWithNestedTool.tool
        ? (eventWithNestedTool.tool.name || eventWithNestedTool.tool)
        : (eventWithNestedTool.status === 'done' ? undefined : prev?.currentTool)

      // Finding: currentTool is an Object instead of a string
      expect(typeof currentTool).toBe('object')
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Subagent Cancellation at Various Lifecycle States
  // ───────────────────────────────────────────────────────────────────────────
  describe('Challenge 2: Subagent Cancellation Lifecycle States & Status Integrity', () => {
    it('State A (Pre-start cancellation): cancels non-existent or un-started taskId safely', () => {
      const nonExistentTaskId = 999999
      let handled = false
      expect(() => {
        handled = backgroundTasks.cancelTask(nonExistentTaskId)
      }).not.toThrow()
      expect(handled).toBe(false)
    })

    it('State B (Mid-flight cancellation): verifies agent_task status is cancelled and no unhandled rejections', async () => {
      let toolLoopStarted = false

      runToolLoopMock.mockImplementation(async (params) => {
        toolLoopStarted = true
        return new Promise((resolve, reject) => {
          const onAbort = () => {
            const err = new Error('abort')
            err.name = 'AbortError'
            reject(err)
          }
          if (params.signal?.aborted) return onAbort()
          params.signal?.addEventListener('abort', onAbort)
        })
      })

      const provider = { id: 1, api_format: 'openai' }
      const model = { id: 1, model_name: 'test-model' }

      let activeTaskId = null
      const subagentPromise = subAgent.runSubagent({
        db: dbAdapter,
        parentSessionId: 1,
        provider,
        model,
        prompt: 'Simulated long running subagent',
        callbacks: {
          onSubagentEvent: (evt) => {
            if (evt.taskId) activeTaskId = evt.taskId
          },
        },
      })

      while (!toolLoopStarted || !activeTaskId) {
        await new Promise((r) => setTimeout(r, 10))
      }

      expect(activeTaskId).toBeGreaterThan(0)

      let taskRow = dbAdapter.getAgentTask(activeTaskId)
      expect(taskRow.status).toBe('running')

      // CANCEL THE TASK MID-FLIGHT
      const cancelResult = backgroundTasks.cancelTask(activeTaskId)
      expect(cancelResult).toBe(true)

      // Subagent run finishes without unhandled rejections
      const res = await subagentPromise
      expect(res).toBeDefined()

      taskRow = dbAdapter.getAgentTask(activeTaskId)
      expect(taskRow.status).toBe('cancelled')
    })

    it('State C (Post-completion cancellation): does not mutate already-completed task to cancelled', async () => {
      runToolLoopMock.mockResolvedValue('Instant result')

      const provider = { id: 1, api_format: 'openai' }
      const model = { id: 1, model_name: 'test-model' }

      let completedTaskId = null
      const res = await subAgent.runSubagent({
        db: dbAdapter,
        parentSessionId: 1,
        provider,
        model,
        prompt: 'Quick task',
        callbacks: {
          onSubagentEvent: (evt) => {
            if (evt.taskId) completedTaskId = evt.taskId
          },
        },
      })

      expect(res.content).toBe('Instant result')
      expect(completedTaskId).toBeGreaterThan(0)

      let taskRow = dbAdapter.getAgentTask(completedTaskId)
      expect(taskRow.status).toBe('done')

      // Attempt to cancel after completion
      const cancelHandled = backgroundTasks.cancelTask(completedTaskId)
      expect(cancelHandled).toBe(false)

      taskRow = dbAdapter.getAgentTask(completedTaskId)
      expect(taskRow.status).toBe('done')
    })

    it('Bug Discovery (Real Timeout Schema Incompatibility): subAgent attempts to set status="timeout" which violates CHECK constraint', async () => {
      // Simulate real wall-clock timeout (not user cancellation)
      runToolLoopMock.mockImplementation(async (params) => {
        return new Promise((resolve, reject) => {
          const onAbort = () => {
            const err = new Error('abort')
            err.name = 'AbortError'
            reject(err)
          }
          if (params.signal?.aborted) return onAbort()
          params.signal?.addEventListener('abort', onAbort)
        })
      })

      const provider = { id: 1, api_format: 'openai' }
      const model = { id: 1, model_name: 'test-model' }

      let timedOutTaskId = null
      const res = await subAgent.runSubagent({
        db: dbAdapter,
        parentSessionId: 1,
        provider,
        model,
        prompt: 'Timeout task',
        config: { timeoutMs: 50 }, // 50ms quick timeout
        callbacks: {
          onSubagentEvent: (evt) => {
            if (evt.taskId) timedOutTaskId = evt.taskId
          },
        },
      })

      expect(res.wasTimeout).toBe(true)
      expect(timedOutTaskId).toBeGreaterThan(0)

      // Check what status was attempted in updateAgentTaskCalls
      const timeoutAttempt = updateAgentTaskCalls.find((c) => c.id === timedOutTaskId)
      expect(timeoutAttempt?.patch?.status).toBe('timeout')

      // But agent_task table in DB has CHECK(status IN ('pending','queued','running','plan','paused','done','cancelled','error'))!
      // So status 'timeout' was rejected by SQLite and the row remains 'running'!
      const taskRow = dbAdapter.getAgentTask(timedOutTaskId)
      console.log('Task status after genuine timeout:', taskRow.status)
      // EMPIRICAL BUG CONFIRMATION: task stays in 'running' because 'timeout' is rejected by DB CHECK constraint!
      expect(taskRow.status).toBe('running')
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Concurrent Subagent Execution Safety
  // ───────────────────────────────────────────────────────────────────────────
  describe('Challenge 3: Concurrent Subagent Execution Safety', () => {
    it('manages 3 concurrent subagents and cancels one without affecting the others', async () => {
      runToolLoopMock.mockImplementation(async (params) => {
        const prompt = params.messages?.find((m) => m.role === 'user')?.content || ''
        if (prompt.includes('Task 2')) {
          return new Promise((resolve, reject) => {
            const onAbort = () => {
              const err = new Error('abort')
              err.name = 'AbortError'
              reject(err)
            }
            if (params.signal?.aborted) return onAbort()
            params.signal?.addEventListener('abort', onAbort)
          })
        }
        await new Promise((r) => setTimeout(r, 50))
        return `Result for ${prompt}`
      })

      const tasks = [
        { task: 'Task 1: Read files', write_paths: ['src/a.ts'] },
        { task: 'Task 2: Long analysis', write_paths: ['src/b.ts'] },
        { task: 'Task 3: Run diagnostics', write_paths: ['src/c.ts'] },
      ]

      const subagentTaskIds = []
      const events = []
      const parallelPromise = subAgent.runParallel(tasks, {
        db: dbAdapter,
        parentSessionId: 1,
        provider: { id: 1, api_format: 'openai' },
        model: { id: 1, model_name: 'test-model' },
        onSubagentEvent: (evt) => {
          events.push(evt)
          if (evt.taskId && !subagentTaskIds.includes(evt.taskId)) {
            subagentTaskIds.push(evt.taskId)
          }
        },
      })

      while (subagentTaskIds.length < 3) {
        await new Promise((r) => setTimeout(r, 10))
      }

      const task2Event = events.find((e) => e.task?.includes('Task 2') && e.taskId)
      const task2Id = task2Event?.taskId
      expect(task2Id).toBeDefined()

      const cancelOk = backgroundTasks.cancelTask(task2Id)
      expect(cancelOk).toBe(true)

      const results = await parallelPromise
      expect(results).toHaveLength(3)

      expect(results[0].success).toBe(true)
      expect(results[0].output).toContain('Task 1')

      expect(results[1].success).toBe(false)

      expect(results[2].success).toBe(true)
      expect(results[2].output).toContain('Task 3')
    })

    it('enforces fail-closed safety on overlapping write paths among parallel subagents', async () => {
      const conflictingTasks = [
        { task: 'Task A', write_paths: ['src/components/chat'] },
        { task: 'Task B', write_paths: ['src/components/chat/SubagentDeck.tsx'] },
      ]

      await expect(
        subAgent.runParallel(conflictingTasks, {
          db: dbAdapter,
          parentSessionId: 1,
          provider: { id: 1 },
          model: { id: 1 },
        })
      ).rejects.toThrow(/Parallel write preflight failed/)
    })
  })
})
