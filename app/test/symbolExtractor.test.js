// ─── symbolExtractor multi-line extraction ──────────────────────────────────
// Verifies that extractFile records block-level locations (locStart/locEnd via
// brace balancing) for multi-line function / class / arrow-function
// declarations, while keeping imports/exports intact.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { extractFile } from '../electron/context/symbolExtractor'

let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbol-extractor-test-'))
})

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

function write(name, content) {
  const abs = path.join(tmpDir, name)
  fs.writeFileSync(abs, content)
  return abs
}

describe('extractFile multi-line extraction', () => {
  it('records locStart/locEnd spanning the correct lines for function, class, and arrow', () => {
    const content = `import React from 'react'
import { helper } from './helper'

export const util = { react: 'ok' }

function foo(a, b) {
  return a + b
}

class Bar {
  greet() {
    return 'hi'
  }
}

export { foo, Bar }

const baz = () => {
  const n = 42
  return n
}
`
    const abs = write('sample.js', content)
    const result = extractFile(abs, content)

    // symbols is a plain array of string names.
    expect(Array.isArray(result.symbols)).toBe(true)
    expect(result.symbols).toContain('foo')
    expect(result.symbols).toContain('Bar')
    expect(result.symbols).toContain('baz')
    for (const s of result.symbols) expect(typeof s).toBe('string')

    // symbolLocs is lockstep with symbols.
    expect(result.symbols.length).toBe(result.symbolLocs.length)
    const byName = new Map(result.symbolLocs.map(l => [l.name, l]))

    // foo: line 6 opener, closing brace on line 8.
    expect(byName.get('foo')).toMatchObject({ locStart: 6, locEnd: 8 })
    // Bar: line 10 opener, closing brace on line 14.
    expect(byName.get('Bar')).toMatchObject({ locStart: 10, locEnd: 14 })
    // baz: line 18 opener, closing brace on line 21.
    expect(byName.get('baz')).toMatchObject({ locStart: 18, locEnd: 21 })
  })

  it('keeps imports and exports intact alongside multi-line declarations', () => {
    const content = `import React from 'react'
import { helper } from './helper'

function foo(a, b) {
  return a + b
}

class Bar {
  greet() {
    return 'hi'
  }
}

export { foo, Bar }
`
    const abs = write('sample.js', content)
    const result = extractFile(abs, content)

    // Imports are still collected (external module kept as-is, relative kept too).
    expect(result.imports).toContain('react')
    expect(result.imports).toContain('./helper')
    // Named exports are still collected.
    expect(result.exports).toContain('foo')
    expect(result.exports).toContain('Bar')
    // And the multi-line symbols are still present with spans.
    expect(result.symbols).toEqual(expect.arrayContaining(['foo', 'Bar']))
    const byName = new Map(result.symbolLocs.map(l => [l.name, l]))
    expect(byName.get('foo').locStart).toBe(4)
    expect(byName.get('Bar').locEnd).toBe(12)
  })
})