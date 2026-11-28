import { describe, it, expect } from 'vitest'
import {
  formatElapsed,
  deriveStepVisualState,
  deriveActivityDurationMs,
  deriveLiveFocusLabel,
  buildTimelineNodes,
  detectCommandFailure,
  formatToolLabel,
  type ToolEntry,
  type TodoItem,
  type PlanStep,
} from './timelineHelpers'

const mockT = (key: string) => {
  const dict: Record<string, string> = {
    'tool.read_file': 'Reading',
    'tool.run_command': 'Running',
    'tool.git_status': 'Checking git status',
  }
  return dict[key] || key
}

describe('timelineHelpers', () => {
  describe('formatElapsed', () => {
    it('formats 0, sub-second, seconds, exact minutes, and mixed minutes/seconds', () => {
      expect(formatElapsed(0)).toBe('0s')
      expect(formatElapsed(-500)).toBe('0s')
      expect(formatElapsed(Number.NaN)).toBe('0s')
      expect(formatElapsed(400)).toBe('1s')
      expect(formatElapsed(45_200)).toBe('45s')
      expect(formatElapsed(180_000)).toBe('3m')
      expect(formatElapsed(213_000)).toBe('3m 33s')
    })
  })

  describe('deriveStepVisualState', () => {
    it('maps completed, active, paused, and pending accurately', () => {
      expect(deriveStepVisualState({ status: 'completed' }, true)).toBe('completed')
      expect(deriveStepVisualState({ status: 'completed' }, false)).toBe('completed')
      expect(deriveStepVisualState({ status: 'in_progress' }, true)).toBe('in_progress')
      expect(deriveStepVisualState({ status: 'in_progress' }, false)).toBe('paused')
      expect(deriveStepVisualState({ status: 'pending' }, true)).toBe('pending')
      expect(deriveStepVisualState({ status: 'pending' }, false)).toBe('pending')
    })
  })

  describe('deriveActivityDurationMs', () => {
    it('computes live elapsed time from earliest timestamp during streaming', () => {
      const toolCalls: ToolEntry[] = [
        { name: 'read_file', args: {}, result: 'ok', error: null, startedAt: 10_500 },
        { name: 'run_command', args: {}, result: null, error: null, startedAt: 12_000 },
      ]
      expect(
        deriveActivityDurationMs({
          toolCalls,
          thinkingStartedAt: 10_200,
          turnStartedAt: 10_000,
          now: 25_000,
          streaming: true,
        })
      ).toBe(15_000)
    })

    it('prefers message latencyMs when settled, otherwise sums tool and thinking durations', () => {
      const toolCalls: ToolEntry[] = [
        { name: 'read_file', args: {}, result: 'ok', error: null, latencyMs: 1200 },
        { name: 'run_command', args: {}, result: 'ok', error: null, latencyMs: 3800 },
      ]
      expect(
        deriveActivityDurationMs({
          toolCalls,
          thinkingDuration: 2.5,
          latencyMs: 180_000,
          streaming: false,
        })
      ).toBe(180_000)

      expect(
        deriveActivityDurationMs({
          toolCalls,
          thinkingDuration: 2.5,
          latencyMs: null,
          streaming: false,
        })
      ).toBe(7500)

      expect(
        deriveActivityDurationMs({
          toolCalls: [],
          thinkingDuration: 4,
          streaming: false,
        })
      ).toBe(4000)

      expect(deriveActivityDurationMs({ streaming: false })).toBeNull()
    })
  })

  describe('deriveLiveFocusLabel', () => {
    it('prioritizes running tool > active todo activeForm/content > statusLines > last tool', () => {
      const todos: TodoItem[] = [
        { content: 'Verify build', status: 'in_progress', activeForm: 'Verifying static checks' },
      ]
      const runningTools: ToolEntry[] = [
        { name: 'read_file', args: { path: 'a/b.ts' }, result: 'ok', error: null },
        { name: 'run_command', args: { command: 'npm run check' }, result: null, error: null },
      ]

      expect(
        deriveLiveFocusLabel({
          toolCalls: runningTools,
          todos,
          statusLines: ['Step 2'],
          tFn: mockT,
        })
      ).toBe('Running npm run check')

      const finishedTools: ToolEntry[] = [
        { name: 'read_file', args: { path: 'a/b.ts' }, result: 'ok', error: null },
      ]
      expect(
        deriveLiveFocusLabel({
          toolCalls: finishedTools,
          todos,
          statusLines: ['Step 2'],
          tFn: mockT,
        })
      ).toBe('Verifying static checks')

      expect(
        deriveLiveFocusLabel({
          toolCalls: finishedTools,
          todos: [{ content: 'Fallback todo', status: 'pending' }],
          statusLines: ['Running checks...'],
          tFn: mockT,
        })
      ).toBe('Running checks...')

      expect(
        deriveLiveFocusLabel({
          toolCalls: finishedTools,
          todos: [],
          statusLines: [],
          tFn: mockT,
        })
      ).toBe('Reading b.ts')

      expect(deriveLiveFocusLabel({ tFn: mockT })).toBeNull()
    })
  })

  describe('detectCommandFailure & formatToolLabel', () => {
    it('extracts exit codes and formats tool labels', () => {
      expect(
        detectCommandFailure({ name: 'run_command', exitCode: 1, error: null, result: 'err' })
      ).toEqual({ failed: true, exitCode: 1, reason: 'exit 1' })
      expect(
        detectCommandFailure({ name: 'run_command', exitCode: null, error: null, result: '[FAILED: exit 2]' })
      ).toEqual({ failed: true, exitCode: 2, reason: 'exit 2' })
      expect(formatToolLabel({ name: 'git_status', args: {} }, mockT)).toBe('Checking git status')
    })
  })

  describe('buildTimelineNodes', () => {
    it('interleaves planSteps and toolCalls by depth when depths exist', () => {
      const steps: PlanStep[] = [
        { step: 0, depth: 0, assistantText: 'Plan A', kind: 'plan' },
        { step: 1, depth: 0, assistantText: 'Obs A', kind: 'observe' },
        { step: 2, depth: 1, assistantText: 'Plan B', kind: 'plan' },
      ]
      const tools: ToolEntry[] = [
        { name: 'read_file', args: {}, result: 'ok', error: null, depth: 0 },
        { name: 'run_command', args: {}, result: 'ok', error: null, depth: 1 },
      ]
      const nodes = buildTimelineNodes(steps, tools)
      expect(nodes.map((n) => n.kind)).toEqual(['step', 'tool', 'step', 'step', 'tool'])
    })

    it('falls back to sequential interleaving when depth metadata is absent', () => {
      const steps = [{ step: 0, assistantText: 'Think' }] as PlanStep[]
      const tools: ToolEntry[] = [{ name: 'git_status', args: {}, result: 'ok', error: null }]
      const nodes = buildTimelineNodes(steps, tools)
      expect(nodes.map((n) => n.kind)).toEqual(['step', 'tool'])
    })
  })
})
