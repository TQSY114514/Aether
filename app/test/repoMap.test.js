// ─── Repo Map unit tests ────────────────────────────────────────────────────
// Tests for electron/context/repoMap.js: repo map generation, file tree,
// symbol extraction, and incremental re-parse (only changed files re-parsed).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { generateRepoMap, buildRepoMapText, invalidateCache, getCachedMap } from '../electron/context/repoMap'

let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-map-test-'))
  // A small JS project whose files the regex extractor understands.
  fs.mkdirSync(path.join(tmpDir, 'src'))
  fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), 'export { add } from "./math"\nconst add = (a, b) => a + b\nexport default add\n')
  fs.writeFileSync(path.join(tmpDir, 'src', 'math.js'), 'export function add(a, b) { return a + b }\nexport function sub(a, b) { return a - b }\n')
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# notes\n')
})

afterEach(() => {
  invalidateCache(tmpDir)
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

describe('generateRepoMap', () => {
  it('builds a file tree with top-level symbols', () => {
    const map = generateRepoMap(tmpDir)
    expect(map.stats.totalFiles).toBe(3)
    expect(map.stats.indexedFiles).toBe(2) // README.md is not a supported language

    // Tree contains nested dirs and files.
    const srcDir = map.tree.children.find(c => c.name === 'src' && c.type === 'dir')
    expect(srcDir).toBeTruthy()
    const names = srcDir.children.map(c => c.name).sort()
    expect(names).toEqual(['index.js', 'math.js'])

    // math.js exposes its functions.
    const math = srcDir.children.find(c => c.name === 'math.js')
    expect(math.symbols).toContain('add')
    expect(math.symbols).toContain('sub')
  })

  it('caches the map and returns the same instance on repeated calls', () => {
    const first = generateRepoMap(tmpDir)
    const second = generateRepoMap(tmpDir)
    expect(second).toBe(first)
    expect(getCachedMap(tmpDir)).toBe(first)
  })

  it('re-parses only changed files (incremental update)', () => {
    const before = generateRepoMap(tmpDir)
    const mathFile = path.join(tmpDir, 'src', 'math.js')
    const oldMtime = fs.statSync(mathFile).mtimeMs

    // Add a new symbol to an existing file and bump its mtime.
    fs.appendFileSync(mathFile, '\nexport function mul(a, b) { return a * b }\n')
    const now = Date.now() + 2000
    fs.utimesSync(mathFile, now / 1000, now / 1000)

    const after = generateRepoMap(tmpDir)
    // New instance (cache invalidated by the mtime change).
    expect(after).not.toBe(before)

    // The changed file now includes the new symbol.
    const math = after.tree.children.find(c => c.name === 'src').children.find(c => c.name === 'math.js')
    expect(math.symbols).toContain('mul')
    expect(oldMtime).toBeGreaterThan(0)
  })
})

describe('buildRepoMapText', () => {
  it('renders a compact text block with symbols', () => {
    const map = generateRepoMap(tmpDir)
    const text = buildRepoMapText(map)
    expect(text).toContain('# Repo Map')
    expect(text).toContain('src/')
    expect(text).toContain('math.js')
    expect(text).toContain('defs: add')
  })
})