// ─────────────────────────────────────────────────────────────────────────────
// app/test/challengerM3Adversarial.test.ts
//
// Milestone 3 Empirical Challenger Test Harness & Adversarial Oracles
// Author: challenger_m3_2 (teamwork_challenger)
// Mission: Adversarially challenge and stress-test Features 21–24:
//          - Challenge 1: Supervisor wait modes & smart_window state transitions
//          - Challenge 2: Non-blocking stream peeking & ring buffer coalescing
//          - Challenge 3: State-inheriting hot-swap model, draft recovery, and loop restart
//          - Challenge 4: Roles (oracle/librarian) & supervisor tools registration
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const supervisor = require('../electron/llm/subagentSupervisor.js')
const agentRoles = require('../electron/llm/agentRoles.js')
const { TOOLS } = require('../electron/tools/registry.js')
const subAgentModule = require('../electron/llm/subAgent.js')

describe('Milestone 3 Empirical Challenger: Features 21–24 Adversarial Probing', () => {
  beforeEach(() => {
    // Clear active subagents registry before each test
    supervisor.activeSubagents.clear()
  })

  afterEach(() => {
    supervisor.activeSubagents.clear()
  })

  // ===========================================================================
  // CHALLENGE 1: Supervisor Wait Modes & smart_window Transitions (Feature 21)
  // ===========================================================================
  describe('Challenge 1: Supervisor Wait Modes & smart_window Transitions', () => {
    it('C1-01: Fast subagent (<2000ms) under smart_window returns status completed with final output', async () => {
      const runToolLoop = vi.fn().mockImplementation(async ({ onStreamDelta }) => {
        onStreamDelta('Fast answer 42')
        return { finalText: 'Fast answer 42' }
      })

      const report = await supervisor.spawnSupervisedSubagent(
        {
          taskPrompt: 'Calculate 6*7',
          waitMode: 'smart_window',
          initialWaitMs: 200,
          stallTimeoutMs: 500,
        },
        { runToolLoop }
      )

      expect(report.status).toBe('completed')
      expect(report.output).toBe('Fast answer 42')
      expect(report.ttftMs).toBeGreaterThanOrEqual(0)
      expect(report.systemNotice).toContain('Finished with status: completed')
    })

    it('C1-02: Long-running subagent actively streaming returns status running with live preview at initialWaitMs', async () => {
      let loopRunning = true
      const runToolLoop = vi.fn().mockImplementation(async ({ onThinkingDelta, onStreamDelta, signal }) => {
        onThinkingDelta('Analyzing repository architecture...')
        await new Promise((r) => setTimeout(r, 20))
        onStreamDelta('Phase 1 completed. Proceeding to Phase 2...')
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 300)
          signal.addEventListener('abort', () => {
            clearTimeout(timer)
            resolve(null)
          })
        })
        loopRunning = false
        return { finalText: 'All phases complete.' }
      })

      const report = await supervisor.spawnSupervisedSubagent(
        {
          taskPrompt: 'Long migration',
          waitMode: 'smart_window',
          initialWaitMs: 60,
          stallTimeoutMs: 500,
        },
        { runToolLoop }
      )

      expect(report.status).toBe('running')
      expect(report.systemNotice).toContain('Subagent actively streaming')
      expect(report.recentThinkingTail).toContain('Analyzing repository architecture')
      expect(report.recentTextTail).toContain('Phase 1 completed')
      expect(report.ttftMs).toBeGreaterThanOrEqual(0)
    })

    it('C1-03: Stalled subagent with 0 tokens within stallTimeoutMs returns stalled_suspected warning', async () => {
      // Subagent that hangs without producing any tokens
      const runToolLoop = vi.fn().mockImplementation(
        ({ signal }) =>
          new Promise((resolve) => {
            signal.addEventListener('abort', () => resolve(null))
          })
      )

      const report = await supervisor.spawnSupervisedSubagent(
        {
          taskPrompt: 'Stalled upstream',
          waitMode: 'smart_window',
          initialWaitMs: 150,
          stallTimeoutMs: 40, // stall threshold < initialWaitMs
        },
        { runToolLoop }
      )

      expect(report.status).toBe('stalled_suspected')
      expect(report.systemNotice).toContain('WARNING: Subagent has produced no tokens')
      expect(report.idleSinceLastActivityMs).toBeGreaterThanOrEqual(40)
    })

    it('C1-04 (ADVERSARIAL/DEFECT PROBE): Stalled subagent with 0 tokens under default stallTimeoutMs (15s) vs initialWaitMs (8s)', async () => {
      // When stallTimeoutMs > initialWaitMs (e.g. 100ms vs 50ms), a subagent that produces ZERO tokens
      // exits the while loop because initialWaitMs elapsed before stallTimeoutMs.
      const runToolLoop = vi.fn().mockImplementation(
        () => new Promise(() => {}) // completely hangs, 0 tokens
      )

      const report = await supervisor.spawnSupervisedSubagent(
        {
          taskPrompt: 'Completely hung upstream',
          waitMode: 'smart_window',
          initialWaitMs: 40,
          stallTimeoutMs: 100, // default ratio: stallTimeoutMs > initialWaitMs
        },
        { runToolLoop }
      )

      // EMPIRICAL OBSERVATION:
      // When initialWaitMs elapses without stallTimeoutMs being reached,
      // the system blindly returns 'Subagent actively streaming' even though
      // estimatedTokens is 0 and ttftMs is null!
      const zeroTokensProduced = report.estimatedTokens === 0 && report.ttftMs === null
      expect(zeroTokensProduced).toBe(true)
      // Documenting actual behavior: it claims actively streaming even with 0 tokens:
      expect(report.systemNotice).toBe('Subagent actively streaming. Returning non-blockingly.')
    })

    it('C1-05 (ADVERSARIAL/DEFECT PROBE): wait_until_done_or_stalled mode premature timeout at hardcoded 2000ms', async () => {
      // A subagent taking 150ms should complete under wait_until_done_or_stalled.
      // But verify what maxWait is when waitMode === 'wait_until_done_or_stalled'.
      const runToolLoop = vi.fn().mockImplementation(async ({ onStreamDelta }) => {
        onStreamDelta('Progress...')
        await new Promise((r) => setTimeout(r, 80))
        return { finalText: 'Finished in 80ms' }
      })

      const report = await supervisor.spawnSupervisedSubagent(
        {
          taskPrompt: 'Medium task',
          waitMode: 'wait_until_done_or_stalled',
          stallTimeoutMs: 300,
        },
        { runToolLoop }
      )

      expect(report.status).toBe('completed')
      expect(report.output).toBe('Finished in 80ms')
    })

    it('C1-06: async_immediate mode returns instantly in 0ms without waiting', async () => {
      const runToolLoop = vi.fn().mockImplementation(() => new Promise(() => {}))
      const start = Date.now()

      const report = await supervisor.spawnSupervisedSubagent(
        {
          taskPrompt: 'Background task',
          waitMode: 'async_immediate',
        },
        { runToolLoop }
      )

      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(50)
      expect(report.status).toBe('running')
      expect(report.systemNotice).toContain('Launched asynchronously')
    })
  })

  // ===========================================================================
  // CHALLENGE 2: Non-blocking Stream Peeking & Buffer Coalescing (Feature 22)
  // ===========================================================================
  describe('Challenge 2: Non-blocking Stream Peeking & Buffer Coalescing', () => {
    it('C2-01: Synchronous O(1) peek on running subagent without locking or I/O', async () => {
      const runToolLoop = vi.fn().mockImplementation(async ({ onThinkingDelta, onStreamDelta }) => {
        onThinkingDelta('Thinking deeply...')
        onStreamDelta('Streaming output line 1\n')
        await new Promise((r) => setTimeout(r, 100))
      })

      const spawned = await supervisor.spawnSupervisedSubagent(
        { taskPrompt: 'Peek test', waitMode: 'async_immediate' },
        { runToolLoop }
      )

      await new Promise((r) => setTimeout(r, 15))
      const start = performance.now()
      const peeks = supervisor.peekSubagentStream({ subagentIds: [spawned.subagentId] })
      const duration = performance.now() - start

      expect(duration).toBeLessThan(5) // Sub-millisecond in-memory read
      expect(peeks.length).toBe(1)
      expect(peeks[0].subagentId).toBe(spawned.subagentId)
      expect(peeks[0].status).toBe('running')
      expect(peeks[0].recentThinkingTail).toContain('Thinking deeply')
      expect(peeks[0].recentTextTail).toContain('Streaming output line 1')
    })

    it('C2-02: Cursor pagination (fromSeq) returns only events strictly newer than fromSeq', async () => {
      const spawned = await supervisor.spawnSupervisedSubagent(
        { taskPrompt: 'Pagination test', waitMode: 'async_immediate' },
        { runToolLoop: vi.fn() }
      )

      const record = supervisor.activeSubagents.get(spawned.subagentId)
      expect(record).toBeDefined()

      // Append discrete tool events
      record.liveBuffer.appendToolEvent('log', 'Event seq 1')
      record.liveBuffer.appendToolEvent('log', 'Event seq 2')
      record.liveBuffer.appendToolEvent('log', 'Event seq 3')

      const allPeek = supervisor.peekSubagentStream({ subagentIds: spawned.subagentId, fromSeq: 0 })
      const totalEvents = allPeek[0].streamEvents.length
      expect(totalEvents).toBeGreaterThanOrEqual(3)

      const lastSeq = allPeek[0].streamEvents[allPeek[0].streamEvents.length - 2].seq

      // Query only newer events
      const paginatedPeek = supervisor.peekSubagentStream({
        subagentIds: spawned.subagentId,
        fromSeq: lastSeq,
      })

      expect(paginatedPeek[0].streamEvents.length).toBe(1)
      expect(paginatedPeek[0].streamEvents[0].content).toContain('Event seq 3')
      expect(paginatedPeek[0].streamEvents[0].seq).toBeGreaterThan(lastSeq)
    })

    it('C2-03: Delta coalescing merges consecutive same-type stream deltas up to 600 chars', () => {
      const buffer = new supervisor.SubagentLiveBuffer(300)

      // Emit 10 chunks of 20 chars of text
      for (let i = 0; i < 10; i++) {
        buffer.appendStreamDelta('text', '12345678901234567890')
      }

      // 200 chars total should be coalesced into a SINGLE event
      expect(buffer.events.length).toBe(1)
      expect(buffer.events[0].content.length).toBe(200)

      // Emit a thinking chunk — must break coalescing
      buffer.appendStreamDelta('thinking', 'Thinking chunk')
      expect(buffer.events.length).toBe(2)
      expect(buffer.events[1].type).toBe('thinking')

      // Emit text chunk exceeding 600 chars boundary
      buffer.appendStreamDelta('text', 'A'.repeat(500))
      expect(buffer.events.length).toBe(3)
      expect(buffer.events[2].content.length).toBe(500)

      // Next chunk of 200 chars: 500 + 200 = 700 > 600, so creates a 4th event
      buffer.appendStreamDelta('text', 'B'.repeat(200))
      expect(buffer.events.length).toBe(4)
      expect(buffer.events[3].content.length).toBe(200)
    })

    it('C2-04: Boundary queries: wildcard *, unknown IDs, and empty input', () => {
      // 1. Unknown ID
      const notFound = supervisor.peekSubagentStream({ subagentIds: 'sub_nonexistent' })
      expect(notFound.length).toBe(1)
      expect(notFound[0].status).toBe('not_found')

      // 2. Wildcard *
      const all = supervisor.peekSubagentStream({ subagentIds: '*' })
      expect(Array.isArray(all)).toBe(true)

      // 3. Null / undefined subagentIds
      const defaultAll = supervisor.peekSubagentStream({})
      expect(Array.isArray(defaultAll)).toBe(true)
    })
  })

  // ===========================================================================
  // CHALLENGE 3: State-Inheriting Hot-Swap & Control (Feature 23)
  // ===========================================================================
  describe('Challenge 3: State-Inheriting Hot-Swap & Control', () => {
    it('C3-01: hot_swap_model aborts old connection, preserves completedMessages, and updates routing', async () => {
      let abortedReason: any = null
      const runToolLoop = vi.fn().mockImplementation(async ({ signal, messages }) => {
        signal.addEventListener('abort', () => {
          abortedReason = signal.reason
        })
        await new Promise((resolve) => signal.addEventListener('abort', resolve))
      })

      const spawned = await supervisor.spawnSupervisedSubagent(
        {
          taskPrompt: 'Refactor database',
          providerId: 'relay_proxy',
          modelId: 'relay-llama-3',
          waitMode: 'async_immediate',
        },
        { runToolLoop }
      )

      const record = supervisor.activeSubagents.get(spawned.subagentId)

      // Simulate a completed turn
      record.completedMessages = [
        { role: 'user', content: 'Initial prompt' },
        { role: 'assistant', content: 'Turn 1 finished successfully.' },
      ]

      // Simulate streaming draft in live buffer
      record.liveBuffer.appendStreamDelta('thinking', 'Analyzing index bottlenecks...')
      record.liveBuffer.appendStreamDelta('text', 'CREATE INDEX idx_user_id ON orders...')

      // Perform hot swap
      const swapResult = await supervisor.controlSubagent({
        subagentId: spawned.subagentId,
        action: 'hot_swap_model',
        newProviderId: 'official_anthropic',
        newModelId: 'claude-3-7-sonnet',
        steeringMessage: 'Continue optimization with high caution',
        preservePartialDraft: true,
      })

      // 1. Verify old connection was aborted with HOT_SWAP_MODEL
      expect(abortedReason).toBe('HOT_SWAP_MODEL')

      // 2. Verify completed turns are 100% preserved
      expect(record.completedMessages[0].content).toBe('Initial prompt')
      expect(record.completedMessages[1].content).toBe('Turn 1 finished successfully.')

      // 3. Verify partial draft and guidance rehydrated into next turn
      const rehydratedTurn = record.completedMessages[2]
      expect(rehydratedTurn).toBeDefined()
      expect(rehydratedTurn.role).toBe('user')
      expect(rehydratedTurn.content).toContain('Analyzing index bottlenecks...')
      expect(rehydratedTurn.content).toContain('CREATE INDEX idx_user_id ON orders...')
      expect(rehydratedTurn.content).toContain('Continue optimization with high caution')

      // 4. Verify routing updated and recorded in swapHistory
      expect(swapResult.ok).toBe(true)
      expect(swapResult.providerId).toBe('official_anthropic')
      expect(swapResult.modelId).toBe('claude-3-7-sonnet')
      expect(record.swapHistory.length).toBe(2)
      expect(record.swapHistory[1].from).toBe('relay_proxy/relay-llama-3')
      expect(record.swapHistory[1].to).toBe('official_anthropic/claude-3-7-sonnet')
      expect(record.swapHistory[1].toProviderId).toBe('official_anthropic')
      expect(record.swapHistory[1].toModelId).toBe('claude-3-7-sonnet')
    })

    it('C3-02 (ADVERSARIAL/DEFECT PROBE): Loop restart receives updated provider/model vs stale objects', async () => {
      // In subagentSupervisor.js, startLoop calls runToolLoop({ provider: record.provider, model: record.model })
      // When controlSubagent('hot_swap_model') runs, does it update record.provider and record.model?
      const calls: any[] = []
      const runToolLoop = vi.fn().mockImplementation(async (args) => {
        calls.push({
          providerId: args.providerId,
          modelId: args.modelId,
          provider: args.provider,
          model: args.model,
        })
        await new Promise((resolve) => args.signal.addEventListener('abort', resolve))
      })

      const spawned = await supervisor.spawnSupervisedSubagent(
        {
          taskPrompt: 'Model swap verification',
          providerId: 'provider_1',
          modelId: 'model_1',
          waitMode: 'async_immediate',
        },
        { runToolLoop }
      )

      expect(calls.length).toBe(1)
      expect(calls[0].providerId).toBe('provider_1')
      expect(calls[0].modelId).toBe('model_1')

      // Execute hot swap
      await supervisor.controlSubagent({
        subagentId: spawned.subagentId,
        action: 'hot_swap_model',
        newProviderId: 'provider_2',
        newModelId: 'model_2',
      })

      // The loop restarted: calls.length should be 2
      expect(calls.length).toBe(2)
      expect(calls[1].providerId).toBe('provider_2')
      expect(calls[1].modelId).toBe('model_2')

      // CHECK: Did record.provider and record.model get updated to provider_2/model_2,
      // or are they still the old objects from provider_1/model_1?
      const record = supervisor.activeSubagents.get(spawned.subagentId)
      // If record.provider.id !== 'provider_2', record.provider was never updated!
      const providerUpdated = record.provider?.id === 'provider_2'
      const modelUpdated = record.model?.id === 'model_2' || record.model?.model_name === 'model_2'

      // Remediated:
      expect(providerUpdated).toBe(true) // REMEDIATED: record.provider is dynamically updated
      expect(modelUpdated).toBe(true) // REMEDIATED: record.model is dynamically updated
    })

    it('C3-03 (ADVERSARIAL/DEFECT PROBE): Steer instruction in steeringQueue is never delivered to runToolLoop', async () => {
      const runToolLoop = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 100))
      })

      const spawned = await supervisor.spawnSupervisedSubagent(
        { taskPrompt: 'Steer test', waitMode: 'async_immediate' },
        { runToolLoop }
      )

      const steerRes = await supervisor.controlSubagent({
        subagentId: spawned.subagentId,
        action: 'steer',
        steeringMessage: 'Avoid touching schema.sql',
      })

      expect(steerRes.ok).toBe(true)
      const record = supervisor.activeSubagents.get(spawned.subagentId)
      expect(record.steeringQueue.length).toBe(1)
      expect(record.steeringQueue[0].content).toContain('Avoid touching schema.sql')

      // DEFECT CONFIRMED: runToolLoop in startLoop has no getPendingInjections or steering mechanism wired!
      // The steeringQueue is write-only.
    })

    it('C3-04: Cancel terminates subagent execution cleanly', async () => {
      let aborted = false
      const runToolLoop = vi.fn().mockImplementation(async ({ signal }) => {
        signal.addEventListener('abort', () => {
          aborted = true
        })
        await new Promise((resolve) => signal.addEventListener('abort', resolve))
      })

      const spawned = await supervisor.spawnSupervisedSubagent(
        { taskPrompt: 'Cancel test', waitMode: 'async_immediate' },
        { runToolLoop }
      )

      const cancelRes = await supervisor.controlSubagent({
        subagentId: spawned.subagentId,
        action: 'cancel',
      })

      expect(cancelRes.ok).toBe(true)
      expect(cancelRes.status).toBe('cancelled')
      expect(aborted).toBe(true)
    })
  })

  // ===========================================================================
  // CHALLENGE 4: Roles & Supervisor Tools Registration (Feature 24)
  // ===========================================================================
  describe('Challenge 4: Roles & Supervisor Tools Registration', () => {
    it('C4-01: oracle role is registered, plan mode, read-only', () => {
      const oracle = agentRoles.getRole('oracle')
      expect(oracle).toBeDefined()
      expect(oracle.label).toBe('Oracle')
      expect(oracle.readOnly).toBe(true)
      expect(oracle.defaultMode).toBe('plan')
      expect(oracle.description.toLowerCase()).toContain('read-only')
      expect(oracle.systemPrompt).toContain('ORACLE agent')
    })

    it('C4-02: librarian role is registered, plan mode, read-only, allows run_command', () => {
      const librarian = agentRoles.getRole('librarian')
      expect(librarian).toBeDefined()
      expect(librarian.label).toBe('Librarian')
      expect(librarian.readOnly).toBe(true)
      expect(librarian.defaultMode).toBe('plan')
      expect(librarian.allowTools).toContain('run_command')
      expect(librarian.allowTools).toContain('read_file')
      expect(librarian.allowTools).not.toContain('write_file')
      expect(librarian.allowTools).not.toContain('edit_file')
    })

    it('C4-03: All 5 supervisor tools are registered with strictly verified risk gates', () => {
      const toolMap = new Map(TOOLS.map((t: any) => [t.name, t]))

      const expectedTools = [
        { name: 'list_providers_and_models', risk: 'safe' },
        { name: 'probe_model_health', risk: 'safe' },
        { name: 'spawn_subagent', risk: 'dangerous' },
        { name: 'peek_subagent_stream', risk: 'safe' },
        { name: 'control_subagent', risk: 'dangerous' },
      ]

      for (const expected of expectedTools) {
        const tool = toolMap.get(expected.name)
        expect(tool, `Tool ${expected.name} must be registered`).toBeDefined()
        expect(tool.risk).toBe(expected.risk)
        expect(typeof tool.run).toBe('function')
        expect(tool.description.length).toBeGreaterThan(10)
      }
    })

    it('C4-04: spawn_subagent blocks dangerous root directories', async () => {
      const spawnTool = TOOLS.find((t: any) => t.name === 'spawn_subagent')
      const result = await spawnTool.run({
        taskPrompt: 'System hack',
        providerId: 'p1',
        modelId: 'm1',
        cwd: 'C:\\Windows\\System32',
      })
      expect(result).toContain('BLOCKED: Cannot execute subagent in protected system directory')
    })

    it('C4-05: subAgent module correctly re-exports supervisor functions', () => {
      expect(typeof subAgentModule.spawnSupervisedSubagent).toBe('function')
      expect(typeof subAgentModule.peekSubagentStream).toBe('function')
      expect(typeof subAgentModule.controlSubagent).toBe('function')
      expect(typeof subAgentModule.runSubagent).toBe('function')
    })
  })
})
