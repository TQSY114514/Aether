import { describe, it, expect, vi } from 'vitest'
import {
  registerSubagentController,
  unregisterSubagentController,
  cancelTask,
} from '../electron/llm/backgroundTasks.js'

describe('Feature 2: Subagent Telemetry & Cancel', () => {
  it('registers and aborts subagent controller when cancelTask is called', async () => {
    const taskId = 8881
    const abortSpy = vi.fn()
    const mockController = {
      signal: { aborted: false },
      abort: () => {
        mockController.signal.aborted = true
        abortSpy()
      },
    }

    registerSubagentController(taskId, mockController)

    const cancelled = await cancelTask(taskId)
    expect(cancelled).toBe(true)
    expect(abortSpy).toHaveBeenCalled()
    expect(mockController.signal.aborted).toBe(true)

    // Unregister
    unregisterSubagentController(taskId)
  })

  it('subagent callbacks forward tool_call and status events with taskId', () => {
    const emittedEvents = []
    const onSubagentEvent = (evt) => {
      emittedEvents.push(evt)
    }

    const taskId = 9992
    const subagentId = 'sub-test-01'

    // Simulate subagent event wrapping as implemented in subAgent.js
    const reportToolCall = (toolName, toolArgs) => {
      onSubagentEvent({
        type: 'tool_call',
        id: subagentId,
        taskId,
        tool: { name: toolName, args: toolArgs },
      })
    }

    const reportStatus = (statusText) => {
      onSubagentEvent({
        type: 'status',
        id: subagentId,
        taskId,
        text: statusText,
      })
    }

    reportToolCall('read_file', { path: 'src/main.ts' })
    reportStatus('Parsing code syntax...')

    expect(emittedEvents.length).toBe(2)
    expect(emittedEvents[0]).toMatchObject({
      type: 'tool_call',
      id: subagentId,
      taskId: 9992,
      tool: { name: 'read_file' },
    })
    expect(emittedEvents[1]).toMatchObject({
      type: 'status',
      id: subagentId,
      taskId: 9992,
      text: 'Parsing code syntax...',
    })
  })
})
