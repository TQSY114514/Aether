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

describe('extractFile additional languages (C/C++/C#/PHP/Ruby)', () => {
  it('extracts C/C++ includes, types and function definitions', () => {
    const content = `#include <stdio.h>
#include "local.h"

struct Point {
  int x, y;
};

static int add(int a, int b) {
  return a + b;
}

int main(int argc, char** argv) {
  return 0;
}
`
    const abs = write('sample.cpp', content)
    const result = extractFile(abs, content)
    expect(result.language).toBe('cpp')
    expect(result.imports).toContain('stdio.h')
    expect(result.imports).toContain('local.h')
    expect(result.symbols).toEqual(expect.arrayContaining(['Point', 'add', 'main']))
    expect(result.symbols.length).toBe(result.symbolLocs.length)
  })

  it('extracts C# usings, types and methods', () => {
    const content = `using System;
using System.Collections.Generic;

namespace App {
  public class Greeter {
    public string Greet(string name) {
      return "hi " + name;
    }
  }
}
`
    const abs = write('Sample.cs', content)
    const result = extractFile(abs, content)
    expect(result.language).toBe('csharp')
    expect(result.imports).toContain('System')
    expect(result.symbols).toEqual(expect.arrayContaining(['Greeter', 'Greet']))
  })

  it('extracts PHP use/class/function', () => {
    const content = `<?php
use App\\Service\\Mailer;

abstract class Controller {
  public function handle($req) {
    return $req;
  }
}

function helper($x) { return $x; }
`
    const abs = write('sample.php', content)
    const result = extractFile(abs, content)
    expect(result.language).toBe('php')
    expect(result.imports).toContain('Mailer')
    expect(result.symbols).toEqual(expect.arrayContaining(['Controller', 'handle', 'helper']))
  })

  it('extracts Ruby require/class/module/def', () => {
    const content = `require 'json'
require_relative './helper'

module Util
  class Parser
    def parse(str)
      str
    end
  end
end
`
    const abs = write('sample.rb', content)
    const result = extractFile(abs, content)
    expect(result.language).toBe('ruby')
    expect(result.imports).toContain('json')
    expect(result.imports).toContain('./helper')
    expect(result.symbols).toEqual(expect.arrayContaining(['Util', 'Parser', 'parse']))
  })
})