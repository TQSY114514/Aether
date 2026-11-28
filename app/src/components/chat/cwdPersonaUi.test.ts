import { describe, expect, it } from 'vitest'
import { computePopoverPosition, samePath } from './CwdNavigator'
import { resolvePersonaListKey } from './input/PersonaSelector'
import { applyReferenceReplacement } from './ChatInput'

describe('CwdNavigator positioning & path comparison', () => {
  it('uses left-0 when left alignment fits inside viewport', () => {
    expect(computePopoverPosition({ left: 20, right: 140 }, 1000)).toEqual({
      alignRight: false,
      clampedLeft: null,
    })
  })

  it('uses right-0 when left overflows and right alignment fits', () => {
    expect(computePopoverPosition({ left: 800, right: 930 }, 1000)).toEqual({
      alignRight: true,
      clampedLeft: null,
    })
  })

  it('clamps popover inside viewport when neither left-0 nor right-0 fits', () => {
    // Viewport 400px -> popW=368, margin=16 -> valid viewport range [16, 384]
    // Container at [200, 260]: left-0 gives [200, 568] (overflows right), right-0 gives [-108, 260] (overflows left)
    const pos = computePopoverPosition({ left: 200, right: 260 }, 400)
    expect(pos.clampedLeft).toBe(-184) // 200 + (-184) = 16
  })

  it('respects case sensitivity flag in samePath and ignores trailing slashes', () => {
    expect(samePath('/work/Repo', '/work/repo', false)).toBe(false)
    expect(samePath('/work/repo/', '/work/repo', false)).toBe(true)
    expect(samePath('C:\\Work\\Repo\\', 'c:\\work\\repo', true)).toBe(true)
  })
})

describe('PersonaSelector keyboard navigation', () => {
  const options = [
    { id: -1, domId: 'persona-opt-soul' },
    { id: 0, domId: 'persona-opt-none' },
    { id: 7, domId: 'persona-opt-7' },
  ]

  it('commits activeIndex when Enter or Space is pressed from trigger or listbox', () => {
    expect(
      resolvePersonaListKey({
        key: 'Enter',
        optionIds: options,
        activeIndex: 2,
        disabled: false,
        activeRole: null,
        activeDomId: null,
        isKnownHostElement: true,
      }),
    ).toEqual({ type: 'select', personaId: 7, returnFocusToTrigger: false })
  })

  it('does not hijack Enter or Space on inner non-option buttons like Manage personas', () => {
    expect(
      resolvePersonaListKey({
        key: 'Enter',
        optionIds: options,
        activeIndex: 0,
        disabled: false,
        activeRole: null,
        activeDomId: null,
        isKnownHostElement: false,
      }),
    ).toEqual({ type: 'passthrough' })

    expect(
      resolvePersonaListKey({
        key: ' ',
        optionIds: options,
        activeIndex: 0,
        disabled: false,
        activeRole: null,
        activeDomId: null,
        isKnownHostElement: false,
      }),
    ).toEqual({ type: 'passthrough' })
  })

  it('selects the focused option button even if activeIndex differed', () => {
    expect(
      resolvePersonaListKey({
        key: 'Enter',
        optionIds: options,
        activeIndex: 0,
        disabled: false,
        activeRole: 'option',
        activeDomId: 'persona-opt-none',
        isKnownHostElement: false,
      }),
    ).toEqual({ type: 'select', personaId: 0, returnFocusToTrigger: true })
  })

  it('wraps ArrowUp/ArrowDown and handles Home/End', () => {
    expect(
      resolvePersonaListKey({
        key: 'ArrowUp',
        optionIds: options,
        activeIndex: 0,
        disabled: false,
        activeRole: null,
        activeDomId: null,
        isKnownHostElement: true,
      }),
    ).toEqual({ type: 'move', nextIndex: 2 })

    expect(
      resolvePersonaListKey({
        key: 'End',
        optionIds: options,
        activeIndex: 0,
        disabled: false,
        activeRole: null,
        activeDomId: null,
        isKnownHostElement: true,
      }),
    ).toEqual({ type: 'move', nextIndex: 2 })
  })
})

describe('ChatInput quoted reference replacement', () => {
  it('does not strip an unrelated quote after an unquoted reference', () => {
    const input = '@foo"说明"'
    const res = applyReferenceReplacement(input, 4, { prefix: '@', replacement: '"foo bar.txt"' })
    expect(res?.next).toBe('@"foo bar.txt""说明"')
  })

  it('strips the closing quote when replacing inside an existing quoted reference', () => {
    const input = '@"docs/my fi"'
    const res = applyReferenceReplacement(input, 12, { prefix: '@', replacement: '"docs/my file.txt"' })
    expect(res?.next).toBe('@"docs/my file.txt"')
  })

  it('preserves the closing quote when completing an open-quoted directory', () => {
    const input = '@"docs/my d"'
    const res = applyReferenceReplacement(input, 11, { prefix: '@', replacement: '"docs/my dir/' })
    expect(res?.next).toBe('@"docs/my dir/"')
  })
})
