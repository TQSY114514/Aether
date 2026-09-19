// ─── Tool State Machine unit tests ───────────────────────────────────────────
// Tests for StepScheduler, state transitions, and ToolStateMachine.

import { describe, it, expect, vi } from 'vitest'
import {
  StepScheduler,
  LoopPhase,
  ToolStateMachine,
} from '../electron/llm/toolLoop/index'

describe('StepScheduler', () => {
  it('initializes to ACT phase for normal agent execution', () => {
    const scheduler = new StepScheduler({ planningMode: false })
    const state = scheduler.createInitialState('Fix a bug')
    expect(state.phase).toBe(LoopPhase.ACT)
    expect(state.depth).toBe(0)
    expect(state.isDone).toBe(false)
  })

  it('transitions to ACT when LLM returns tool_calls', () => {
    const scheduler = new StepScheduler()
    const state0 = scheduler.createInitialState('Read file')
    const state1 = scheduler.step(state0, {
      type: 'LLM_RESPONSE',
      payload: {
        role: 'assistant',
        tool_calls: [{ id: 'tc1', function: { name: 'read_file' } }],
      },
    })
    expect(state1.phase).toBe(LoopPhase.ACT)
    expect(state1.depth).toBe(1)
    expect(state1.toolCallsPending.length).toBe(1)
    expect(state1.isDone).toBe(false)
  })

  it('transitions to OBSERVE when tool results are applied', () => {
    const scheduler = new StepScheduler()
    const state0 = scheduler.createInitialState()
    const state1 = scheduler.step(state0, {
      type: 'TOOL_RESULTS_APPLIED',
      payload: { results: [{ tool: 'read_file', output: 'content' }] },
    })
    expect(state1.phase).toBe(LoopPhase.OBSERVE)
    expect(state1.toolResults.length).toBe(1)
  })

  it('transitions to COMPLETE when LLM returns final answer without tool calls', () => {
    const scheduler = new StepScheduler()
    const state0 = scheduler.createInitialState()
    const state1 = scheduler.step(state0, {
      type: 'LLM_RESPONSE',
      payload: {
        role: 'assistant',
        content: 'I have fixed the issue.',
      },
    })
    expect(state1.phase).toBe(LoopPhase.COMPLETE)
    expect(state1.isDone).toBe(true)
    expect(state1.finalResult).toBe('I have fixed the issue.')
  })

  it('handles verification failure by transitioning back to ACT', () => {
    const scheduler = new StepScheduler()
    const state0 = {
      ...scheduler.createInitialState(),
      phase: LoopPhase.VERIFY,
      verificationNeeded: true,
    }
    const state1 = scheduler.step(state0, { type: 'VERIFICATION_FAILED' })
    expect(state1.phase).toBe(LoopPhase.ACT)
    expect(state1.isDone).toBe(false)
  })
})

describe('ToolStateMachine', () => {
  it('drives execution to completion using mocked runtime', async () => {
    const mockRuntime = {
      next: vi.fn().mockResolvedValue({
        role: 'assistant',
        content: 'Task done.',
      }),
    }

    const sm = new ToolStateMachine({ runtime: mockRuntime })
    const res = await sm.run({
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(res.isDone).toBe(true)
    expect(res.result).toBe('Task done.')
    expect(mockRuntime.next).toHaveBeenCalledTimes(1)
  })
})
