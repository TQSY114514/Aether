// ─── Code Understanding unit tests ──────────────────────────────────────────
// Tests for electron/context/codeUnderstanding.js: repo → kg graph builder +
// kg_nodes / kg_edges persistence.
//
// Uses a temp source tree as the repo and a fake db whose kg_* surfaces are
// in-memory maps mirroring the real tables.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import codeUnderstanding from '../electron/context/codeUnderstanding'

const {
  listSourceFiles, extractModuleSpecs, extractSymbols, moduleImports,
  resolveImportTarget, buildGraphUnderstanding, buildCodeUnderstanding,
  writeCodeUnderstanding,
} = codeUnderstanding

// ─── Fake db (kg_nodes / kg_edges as in-memory arrays) ──────────────────────
function mkDb() {
  const db = {
    nodes: [],
    edges: [],
    nodeId: 1,
    edgeId: 1,
    run(sql, params = []) {
      if (sql.includes('INSERT INTO kg_nodes')) {
        db.nodes.push({ id: db.nodeId++, entity: params[0], type: params[1] })
      } else if (sql.includes('UPDATE kg_nodes')) {
        const n = db.nodes.find(x => x.id === params[1])
        if (n) n.type = params[0]
      } else if (sql.includes('INSERT OR REPLACE INTO kg_edges')) {
        const idx = db.edges.findIndex(e => e.from === params[0] && e.to === params[1] && e.relation === params[2])
        if (idx >= 0) db.edges[idx] = { id: db.edgeId++, from: params[0], to: params[1], relation: params[2], confidence: params[3] }
        else db.edges.push({ id: db.edgeId++, from: params[0], to: params[1], relation: params[2], confidence: params[3] })
      }
    },
    allRows(sql, params = []) {
      if (sql.includes('SELECT id FROM kg_nodes')) {
        return db.nodes.filter(n => n.entity === params[0]).map(n => ({ id: n.id }))
      }
      return []
    },
  }
  return db
}

// ─── Temp repo helpers ──────────────────────────────────────────────────────
let tmpRoot
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codeUnderstanding-'))
})
afterEach(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch {}
})

function writeSrc(file, content) {
  const abs = path.join(tmpRoot, file)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
}

// ─── listSourceFiles ────────────────────────────────────────────────────────

describe('listSourceFiles', () => {
  it('collects source files recursively and skips ignored dirs', () => {
    writeSrc('src/a.js', '')
    writeSrc('src/nested/b.ts', '')
    writeSrc('node_modules/x.js', '')
    writeSrc('.git/config', '')
    writeSrc('readme.md', '')
    const files = listSourceFiles(tmpRoot).map(f => path.relative(tmpRoot, f).replace(/\\/g, '/'))
    expect(files).toContain('src/a.js')
    expect(files).toContain('src/nested/b.ts')
    expect(files).not.toContain('node_modules/x.js')
    expect(files).not.toContain('.git/config')
    expect(files).not.toContain('readme.md') // not a source extension
  })

  it('respects maxFiles and depth limits', () => {
    for (let i = 0; i < 5; i++) writeSrc(`f${i}.js`, '')
    const capped = listSourceFiles(tmpRoot, { maxFiles: 2 })
    expect(capped.length).toBe(2)
    writeSrc('deep/a/b/c.js', '')
    const shallow = listSourceFiles(tmpRoot, { depth: 1 })
    expect(shallow.map(f => path.relative(tmpRoot, f).replace(/\\/g, '/'))).not.toContain('deep/a/b/c.js')
  })
})

// ─── extractors ─────────────────────────────────────────────────────────────

describe('extractModuleSpecs', () => {
  it('pulls import/require specs and drops bare package names', () => {
    const content = `
import { foo } from './local/mod'
import bar from '../other'
import path from 'node:path'
const x = require('../../shared/utils')
const y = require('lodash')
`
    const specs = extractModuleSpecs(content)
    expect(specs).toContain('./local/mod'.replace(/^\.{1,2}[\\/]/, ''))
    expect(specs).toContain('../other'.replace(/^\.{1,2}[\\/]/, ''))
    expect(specs).toContain('node:path')
    expect(specs).toContain('../../shared/utils'.replace(/^\.{1,2}[\\/]/, ''))
    expect(specs).not.toContain('lodash')
  })

  it('extracts python imports via moduleImports', () => {
    const py = `from package.core import thing
import utils.helpers`
    const specs = moduleImports(py, '.py')
    expect(specs).toContain('package/core')
    expect(specs).toContain('utils/helpers')
  })
})

describe('extractSymbols', () => {
  it('returns capitalized identifiers seen at least twice', () => {
    const content = 'Foo.bar() calls Foo again, then Widget(); Widget();'
    const syms = extractSymbols(content)
    expect(syms).toContain('Foo')
    expect(syms).toContain('Widget')
    expect(syms.length).toBeLessThanOrEqual(2)
  })
})

// ─── resolveImportTarget ────────────────────────────────────────────────────

describe('resolveImportTarget', () => {
  const fileList = ['src/a.js', 'src/mod.js', 'src/util/index.js']

  it('resolves relative specs against the file list', () => {
    expect(resolveImportTarget(fileList, 'src', './mod')).toBe('src/mod.js')
    expect(resolveImportTarget(fileList, 'src', '../src/mod')).toBe('src/mod.js')
  })

  it('resolves directory imports to index files', () => {
    expect(resolveImportTarget(fileList, 'src', './util')).toBe('src/util/index.js')
  })

  it('returns null when nothing matches', () => {
    expect(resolveImportTarget(fileList, 'src', './nope')).toBeNull()
  })
})

// ─── buildGraphUnderstanding ────────────────────────────────────────────────

describe('buildGraphUnderstanding', () => {
  it('creates file nodes and import edges', () => {
    writeSrc('src/a.js', `import { x } from './b'\n`)
    writeSrc('src/b.js', `export const x = 1\n`)
    const graph = buildGraphUnderstanding(null, tmpRoot)
    expect(graph.fileCount).toBe(2)
    const relNodes = graph.nodes.filter(n => n.type === 'file').map(n => n.entity)
    expect(relNodes).toContain('src/a.js'.toLowerCase())
    expect(relNodes).toContain('src/b.js'.toLowerCase())
    const importEdges = graph.edges.filter(e => e.relation === 'imports')
    expect(importEdges.length).toBeGreaterThanOrEqual(1)
  })

  it('deduplicates nodes and skips self-edges', () => {
    writeSrc('src/a.js', `import { x } from './a'\n`)
    const graph = buildGraphUnderstanding(null, tmpRoot)
    const aNodes = graph.nodes.filter(n => n.entity === 'src/a.js'.toLowerCase())
    expect(aNodes.length).toBe(1)
    expect(graph.edges.filter(e => e.from === e.to).length).toBe(0)
  })

  it('buildCodeUnderstanding is an alias of buildGraphUnderstanding', () => {
    expect(buildCodeUnderstanding).toBe(buildGraphUnderstanding)
  })
})

// ─── writeCodeUnderstanding ─────────────────────────────────────────────────

describe('writeCodeUnderstanding', () => {
  it('upserts nodes and edges into the fake kg tables', () => {
    const db = mkDb()
    const graph = {
      nodes: [
        { entity: 'src/a.js', type: 'file' },
        { entity: 'Widget', type: 'symbol' },
      ],
      edges: [
        { from: 'src/a.js', to: 'src/b.js', relation: 'imports', confidence: 0.9 },
      ],
    }
    const written = writeCodeUnderstanding(db, graph)
    expect(written.nodes).toBe(2)
    expect(written.edges).toBe(1)
    expect(db.nodes.map(n => n.entity)).toContain('src/a.js')
    expect(db.edges[0].relation).toBe('imports')
  })

  it('is idempotent on re-write (update not duplicate)', () => {
    const db = mkDb()
    const graph = {
      nodes: [{ entity: 'x.js', type: 'file' }],
      edges: [{ from: 'x.js', to: 'y.js', relation: 'imports' }],
    }
    writeCodeUnderstanding(db, graph)
    writeCodeUnderstanding(db, graph)
    expect(db.nodes.filter(n => n.entity === 'x.js').length).toBe(1)
    expect(db.edges.length).toBe(1)
  })

  it('tolerates a null db', () => {
    expect(writeCodeUnderstanding(null, { nodes: [], edges: [] })).toEqual({ nodes: 0, edges: 0 })
  })
})

// ─── end-to-end: build + write + query ──────────────────────────────────────

describe('end-to-end', () => {
  it('builds a repo graph and persists it into kg tables', () => {
    writeSrc('src/main.js', `import { helper } from './lib/helper'\nHelper.run(); Helper.run();\n`)
    writeSrc('src/lib/helper.js', `export function helper() { return 1 }\n`)
    const db = mkDb()
    const graph = buildGraphUnderstanding(db, tmpRoot)
    writeCodeUnderstanding(db, graph)
    expect(db.nodes.length).toBeGreaterThanOrEqual(3) // 2 files + 1 symbol (Helper)
    expect(db.edges.length).toBeGreaterThanOrEqual(1)
    const importEdges = db.edges.filter(e => e.relation === 'imports')
    expect(importEdges.length).toBeGreaterThanOrEqual(1)
  })
})
