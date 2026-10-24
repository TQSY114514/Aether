import { describe, it, expect } from 'vitest'
import {
  computeLineHash,
  formatWithHashlines,
  parseHashlineBlocks,
  applyHashlinePatch,
  applyAnyPatch,
} from '../electron/tools/patchEngine.js'

describe('oh-my-pi Inspired Hashline / Hash-Anchored Edits (patchEngine.js)', () => {
  const sampleCode = [
    'function calculateTotal(items) {',
    '  let sum = 0',
    '  for (const item of items) {',
    '    sum += item.price',
    '  }',
    '  return sum',
    '}',
  ].join('\n')

  describe('computeLineHash & formatWithHashlines', () => {
    it('produces deterministic 4-character hex hashes', () => {
      const h1 = computeLineHash('  let sum = 0  ')
      const h2 = computeLineHash('let sum = 0')
      expect(h1).toHaveLength(4)
      expect(h1).toBe(h2) // trimmed whitespace invariance
    })

    it('returns 0000 for empty or whitespace-only lines', () => {
      expect(computeLineHash('')).toBe('0000')
      expect(computeLineHash('   ')).toBe('0000')
    })

    it('annotates each line with [#hash]', () => {
      const annotated = formatWithHashlines(sampleCode)
      const lines = annotated.split('\n')
      expect(lines).toHaveLength(7)
      expect(lines[0]).toMatch(/^\[#[0-9a-f]{4}\] function calculateTotal/)
      expect(lines[1]).toMatch(/^\[#[0-9a-f]{4}\]   let sum = 0/)
    })
  })

  describe('parseHashlineBlocks', () => {
    it('parses <<<<<<< HASH start..end blocks', () => {
      const patch = `
<<<<<<< HASH a1b2..c3d4
  let sum = 0
  let tax = 0.1
>>>>>>>
`
      const blocks = parseHashlineBlocks(patch)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].startHash).toBe('a1b2')
      expect(blocks[0].endHash).toBe('c3d4')
      expect(blocks[0].replace).toBe('  let sum = 0\n  let tax = 0.1')
    })

    it('parses single-line <<<<<<< HASH start blocks', () => {
      const patch = `
<<<<<<< HASH e5f6
  return Math.round(sum)
>>>>>>>
`
      const blocks = parseHashlineBlocks(patch)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].startHash).toBe('e5f6')
      expect(blocks[0].endHash).toBe('e5f6')
      expect(blocks[0].replace).toBe('  return Math.round(sum)')
    })

    it('parses @@ #start..#end @@ hunk format', () => {
      const patch = `
@@ #1234..#5678 @@
  const total = items.reduce((acc, x) => acc + x.price, 0)
`
      const blocks = parseHashlineBlocks(patch)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].startHash).toBe('1234')
      expect(blocks[0].endHash).toBe('5678')
      expect(blocks[0].replace).toBe('  const total = items.reduce((acc, x) => acc + x.price, 0)')
    })
  })

  describe('applyHashlinePatch', () => {
    it('replaces a targeted range using stable hash anchors', () => {
      const sumHash = computeLineHash('  let sum = 0')
      const returnHash = computeLineHash('  return sum')

      const blocks = [
        {
          startHash: sumHash,
          endHash: sumHash,
          replace: '  let sum = 0\n  const currency = "USD"',
        },
      ]

      const res = applyHashlinePatch(sampleCode, blocks)
      expect(res.applied).toBe(1)
      expect(res.conflicts).toHaveLength(0)
      expect(res.content).toContain('const currency = "USD"')
      expect(res.content).toContain('return sum')
    })

    it('remains resilient to line number drift caused by previous edits', () => {
      // Prepend 10 new lines at top of file, shifting line numbers
      const shiftedCode = '/* line 1 */\n/* line 2 */\n/* line 3 */\n' + sampleCode
      const returnHash = computeLineHash('  return sum')

      const blocks = [
        {
          startHash: returnHash,
          endHash: returnHash,
          replace: '  return Number(sum.toFixed(2))',
        },
      ]

      const res = applyHashlinePatch(shiftedCode, blocks)
      expect(res.applied).toBe(1)
      expect(res.conflicts).toHaveLength(0)
      expect(res.content).toContain('return Number(sum.toFixed(2))')
      expect(res.content).toContain('/* line 1 */')
    })

    it('reports conflict fail-fast when start hash is not found', () => {
      const blocks = [
        {
          startHash: 'ffff',
          endHash: 'ffff',
          replace: 'does not matter',
        },
      ]

      const res = applyHashlinePatch(sampleCode, blocks)
      expect(res.applied).toBe(0)
      expect(res.conflicts).toHaveLength(1)
      expect(res.conflicts[0]).toContain('Hashline start anchor [#ffff] not found')
    })
  })

  describe('applyAnyPatch dispatch', () => {
    it('automatically detects and applies hashline patch format', () => {
      const sumHash = computeLineHash('  let sum = 0')
      const patchText = `
<<<<<<< HASH ${sumHash}
  let sum = 100 // starting bonus
>>>>>>>
`
      const res = applyAnyPatch(sampleCode, patchText)
      expect(res.format).toBe('hashline')
      expect(res.applied).toBe(1)
      expect(res.conflicts).toHaveLength(0)
      expect(res.content).toContain('let sum = 100 // starting bonus')
    })
  })
})
