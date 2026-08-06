// ─── find_symbol / symbol location extraction tests ─────────────────────────
// Covers the LSP-lite block-level symbol scanning in symbolExtractor.js:
// multi-line function/class/arrow-function declarations get a locStart/locEnd
// via brace balancing, while `symbols` stays an array of plain string names.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { extractFile } from '../electron/context/symbolExtractor'

let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-symbol-test-'))
})

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

function write(name, content) {
  const abs = path.join(tmpDir, name)
  fs.writeFileSync(abs, content)
  return abs
}

describe('extractFile symbol locations (LSP-lite)', () => {
  it('records block-level locations for multi-line function, class, and arrow function', () => {
    const content = `function foo(a, b) {
  return a + b
}

class Bar {
  greet() {
    return 'hi'
  }
}

const baz = () => {
  const n = 42
  return n
}
`
    const abs = write('sample.js', content)
    const result = extractFile(abs, content)

    // symbols stays an array of plain string names.
    expect(Array.isArray(result.symbols)).toBe(true)
    expect(result.symbols).toContain('foo')
    expect(result.symbols).toContain('Bar')
    expect(result.symbols).toContain('baz')
    for (const s of result.symbols) {
      expect(typeof s).toBe('string')
    }

    // symbolLocs has the same length and lockstep order.
    expect(result.symbols.length).toBe(result.symbolLocs.length)

    // Build a name -> loc map.
    const byName = new Map(result.symbolLocs.map(l => [l.name, l]))

    const foo = byName.get('foo')
    expect(foo.locStart).toBe(1)
    expect(foo.locEnd).toBe(3) // closing brace of foo

    const bar = byName.get('Bar')
    expect(bar.locStart).toBe(5)
    expect(bar.locEnd).toBe(9) // closing brace of class Bar

    const baz = byName.get('baz')
    expect(baz.locStart).toBe(11)
    expect(baz.locEnd).toBe(14) // closing brace of baz
  })

  it('keeps symbols as plain strings even with mixed single-line and multi-line declarations', () => {
    const content = `export function one() { return 1

function two(
  arg
) {
  return arg
}
`
    const abs = write('mixed.js', content)
    const result = extractFile(abs, content)

    expect(result.symbols).toEqual(expect.arrayContaining(['one', 'two']))
    for (const s of result.symbols) {
      expect(typeof s).toBe('string')
    }
    expect(result.symbols.length).toBe(result.symbolLocs.length)

    const byName = new Map(result.symbolLocs.map(l => [l.name, l]))
    // one starts on line 1; two starts on line 3 (body brace on a later line).
    expect(byName.get('one').locStart).toBe(1)
    expect(byName.get('two').locStart).toBe(3)
    expect(byName.get('two').locEnd).toBe(7)
  })
})