import { describe, it, expect } from 'vitest'
import {
  computeGhostCompletion,
  parseSlashArgumentContext,
  extractRecentUserPrompts,
  canRequestIdlePrediction,
  resolveEffectiveGhostSuffix,
  type GhostCommandLike,
} from './ghostCompletion'

const SAMPLE_COMMANDS: GhostCommandLike[] = [
  { id: 'mode', name: 'Run Mode', argOptions: ['plan', 'act'] },
  { id: 'effort', name: 'Thinking Effort', argOptions: ['minimal', 'low', 'medium', 'high', 'max', 'off'] },
  { id: 'compact', name: 'Compact' },
  { id: 'clear', name: 'Clear' },
  { id: 'quit', name: 'Quit' },
]

describe('ghostCompletion engine', () => {
  it('completes slash command name prefix based on selected command', () => {
    const res = computeGhostCompletion({
      input: '/comp',
      cursorPos: 5,
      slashCommands: SAMPLE_COMMANDS,
      slashResults: [SAMPLE_COMMANDS[2]],
      slashSelectedIndex: 0,
    })
    expect(res.source).toBe('slash-cmd')
    expect(res.ghostSuffix).toBe('act')
  })

  it('chains discrete slash argument options and ghost suffix after /mode ', () => {
    const emptyArg = computeGhostCompletion({
      input: '/mode ',
      cursorPos: 6,
      slashCommands: SAMPLE_COMMANDS,
      slashSelectedIndex: 0,
    })
    expect(emptyArg.source).toBe('slash-arg')
    expect(emptyArg.activeSlashCommandId).toBe('mode')
    expect(emptyArg.slashArgCandidates.map((c) => c.value)).toEqual(['plan', 'act'])
    expect(emptyArg.ghostSuffix).toBe('plan')

    const partialArg = computeGhostCompletion({
      input: '/mode a',
      cursorPos: 7,
      slashCommands: SAMPLE_COMMANDS,
      slashSelectedIndex: 0,
    })
    expect(partialArg.source).toBe('slash-arg')
    expect(partialArg.slashArgCandidates.map((c) => c.value)).toEqual(['act'])
    expect(partialArg.ghostSuffix).toBe('ct')
  })

  it('prevents omp #4808: never falls back to file/history completions for slash commands without argOptions', () => {
    const res = computeGhostCompletion({
      input: '/quit ',
      cursorPos: 6,
      slashCommands: SAMPLE_COMMANDS,
      activeReference: {
        prefix: '@',
        query: '',
        displayText: 'src/index.ts',
        replacement: 'src/index.ts',
      },
      recentUserPrompts: ['/quit now please'],
    })
    expect(res.source).toBe('none')
    expect(res.ghostSuffix).toBe('')
    expect(res.slashArgCandidates).toEqual([])
  })

  it('prevents omp #4809: slices @reference suffix against live cursor token despite stale debounced query', () => {
    const res = computeGhostCompletion({
      input: 'Check @app/src/ut',
      cursorPos: 17,
      activeReference: {
        prefix: '@',
        query: 'app/src/u',
        displayText: 'app/src/utils/',
        replacement: 'D:/Aether/app/src/utils/',
      },
    })
    expect(res.source).toBe('reference')
    expect(res.ghostSuffix).toBe('ils/')

    const mismatched = computeGhostCompletion({
      input: 'Check @app/src/xyz',
      cursorPos: 18,
      activeReference: {
        prefix: '@',
        query: 'app/src/u',
        displayText: 'app/src/utils/',
        replacement: 'D:/Aether/app/src/utils/',
      },
    })
    expect(mismatched.source).toBe('none')
    expect(mismatched.ghostSuffix).toBe('')
  })

  it('matches session user-history prefix when idle at end of single-line input (>= 2 chars, non-slash)', () => {
    const res = computeGhostCompletion({
      input: 'exp',
      cursorPos: 3,
      recentUserPrompts: [
        'Explain how the tool loop handles compaction',
        'Explain something older',
      ],
    })
    expect(res.source).toBe('history')
    expect(res.ghostSuffix).toBe('lain how the tool loop handles compaction')

    const tooShort = computeGhostCompletion({
      input: 'e',
      cursorPos: 1,
      recentUserPrompts: ['Explain how the tool loop handles compaction'],
    })
    expect(tooShort.ghostSuffix).toBe('')
  })

  it('suppresses ghost text when composing (IME), dismissed, or cursor not at end', () => {
    const composing = computeGhostCompletion({
      input: '/comp',
      cursorPos: 5,
      isComposing: true,
      slashCommands: SAMPLE_COMMANDS,
      slashResults: [SAMPLE_COMMANDS[2]],
    })
    expect(composing.ghostSuffix).toBe('')

    const dismissed = computeGhostCompletion({
      input: '/comp',
      cursorPos: 5,
      dismissed: true,
      slashCommands: SAMPLE_COMMANDS,
      slashResults: [SAMPLE_COMMANDS[2]],
    })
    expect(dismissed.ghostSuffix).toBe('')

    const midCursor = computeGhostCompletion({
      input: '/comp',
      cursorPos: 3,
      selectionEnd: 3,
      slashCommands: SAMPLE_COMMANDS,
      slashResults: [SAMPLE_COMMANDS[2]],
    })
    expect(midCursor.ghostSuffix).toBe('')

    const selectionRange = computeGhostCompletion({
      input: '/comp',
      cursorPos: 2,
      selectionEnd: 5,
      slashCommands: SAMPLE_COMMANDS,
      slashResults: [SAMPLE_COMMANDS[2]],
    })
    expect(selectionRange.ghostSuffix).toBe('')
  })

  it('parseSlashArgumentContext stops offering discrete candidates after second whitespace', () => {
    const ctx = parseSlashArgumentContext('/mode plan extra', SAMPLE_COMMANDS)
    expect(ctx.candidates).toEqual([])
  })

  it('canRequestIdlePrediction gates on feature flag, empty input, idle state, and completed assistant turn', () => {
    const validMsgs = [
      { id: 1, role: 'user', content: 'Hello', status: 'success' },
      { id: 2, role: 'assistant', content: 'Hi there!', status: 'success' },
    ]
    expect(
      canRequestIdlePrediction({
        enabled: false,
        input: '',
        isStreaming: false,
        isArenaRunning: false,
        sessionId: 1,
        modelId: 10,
        messages: validMsgs,
      }).ok
    ).toBe(false)

    expect(
      canRequestIdlePrediction({
        enabled: true,
        input: 'draft',
        isStreaming: false,
        isArenaRunning: false,
        sessionId: 1,
        modelId: 10,
        messages: validMsgs,
      }).ok
    ).toBe(false)

    expect(
      canRequestIdlePrediction({
        enabled: true,
        input: '',
        isStreaming: true,
        isArenaRunning: false,
        sessionId: 1,
        modelId: 10,
        messages: validMsgs,
      }).ok
    ).toBe(false)

    expect(
      canRequestIdlePrediction({
        enabled: true,
        input: '',
        isStreaming: false,
        isArenaRunning: false,
        sessionId: 1,
        modelId: 10,
        messages: [{ id: 1, role: 'user', content: 'Hello', status: 'success' }],
      }).ok
    ).toBe(false)

    const ok = canRequestIdlePrediction({
      enabled: true,
      input: '',
      isStreaming: false,
      isArenaRunning: false,
      sessionId: 1,
      modelId: 10,
      messages: validMsgs,
    })
    expect(ok).toEqual({ ok: true, anchorKey: '1:2' })
  })

  it('resolveEffectiveGhostSuffix shows idle prediction only when empty, idle, non-composing, and not dismissed', () => {
    expect(
      resolveEffectiveGhostSuffix({
        input: '',
        deterministicGhost: '',
        idlePrediction: 'Run unit tests next',
        isComposing: false,
        dismissed: false,
        cursorAtEnd: true,
      })
    ).toBe('Run unit tests next')

    expect(
      resolveEffectiveGhostSuffix({
        input: 'a',
        deterministicGhost: '',
        idlePrediction: 'Run unit tests next',
        isComposing: false,
        dismissed: false,
        cursorAtEnd: true,
      })
    ).toBe('')

    expect(
      resolveEffectiveGhostSuffix({
        input: '',
        deterministicGhost: '',
        idlePrediction: 'Run unit tests next',
        isComposing: false,
        dismissed: true,
        cursorAtEnd: true,
      })
    ).toBe('')
  })

  it('extractRecentUserPrompts deduplicates most-recent-first and skips slash/attachment blocks', () => {
    const out = extractRecentUserPrompts([
      { role: 'user', content: 'First prompt' },
      { role: 'user', content: '/mode plan' },
      { role: 'user', content: '[File: foo.ts]:\n```\nx\n```' },
      { role: 'assistant', content: 'Assistant line' },
      { role: 'user', content: 'First prompt' },
      { role: 'user', content: 'Latest prompt' },
    ])
    expect(out).toEqual(['Latest prompt', 'First prompt'])
  })
})
