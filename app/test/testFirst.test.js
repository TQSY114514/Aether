// ─── testFirst (RED→GREEN) unit tests ───────────────────────────────────────
// Tests the decoupled helper logic in electron/llm/testFirst.js. The full
// runTestFirst loop needs a live model + workspace, so here we:
//   - verify the module imports and exposes runTestFirst,
//   - verify the pure parseFileList / suggestTestPath helpers,
//   - verify runTestFirst returns { skipped: true, reason: 'no test framework' }
//     quickly when the workspace has no recognizable test framework (via a temp
//     dir with no package.json — the model must never be invoked).
//
// testFirst.js requires ../tools/sandbox which pulls in electron, so we mock
// 'electron' via Module._load (same pattern as toolLoop.test.js) and use the
// real modules otherwise.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import Module from 'module'
import os from 'os'
import fs from 'fs'
import path from 'path'

// testFirst.js reads completeChatMessage via CJS require('./providerAdapter'),
// so a vi.spyOn on the ESM namespace would NOT reach it, and a vi.mock factory
// output is not what a native CJS require resolves to. Mock the whole module at
// the CJS layer instead (through Module._load, like the electron mock below) so
// the test's require and testFirst's require both see the SAME wrapped instance.

const fakeApp = { getPath: () => path.join(os.tmpdir(), 'aether-test') }

let sandbox, providerAdapter, testFirst
let tempDir

beforeAll(() => {
  const origLoad = Module._load
  const reqFromApp = Module.createRequire(path.join(process.cwd(), 'package.json'))

  // Mock 'electron' first so requiring the real providerAdapter (which pulls in
  // electron transitively) works.
  Module._load = function (request, ...args) {
    if (request === 'electron') return { app: fakeApp }
    return origLoad.apply(this, [request, ...args])
  }

  const mockedProviderAdapter = {
    ...reqFromApp('./electron/llm/providerAdapter'),
    completeChatMessage: vi.fn().mockResolvedValue({ content: '' }),
  }

  // Route every providerAdapter require (ours and testFirst's
  // require('./providerAdapter')) to the same mocked instance.
  Module._load = function (request, ...args) {
    if (request === 'electron') return { app: fakeApp }
    if (request === './providerAdapter' || request === './electron/llm/providerAdapter') return mockedProviderAdapter
    return origLoad.apply(this, [request, ...args])
  }

  // Load all under-test modules via CJS so they share one sandbox instance
  // (its workspace root) and one providerAdapter mock — testFirst.js requires
  // sandbox via CJS too, and writeFiles uses that instance's root.
  sandbox = reqFromApp('./electron/tools/sandbox')
  providerAdapter = reqFromApp('./electron/llm/providerAdapter')
  testFirst = reqFromApp('./electron/llm/testFirst')

  // A workspace with no recognizable test framework (no package.json, etc.).
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-test-first-'))
  sandbox.setWorkspaceRoot(tempDir)
})

afterAll(() => {
  try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
})

describe('testFirst module', () => {
  it('imports and exposes runTestFirst plus the decoupled helpers', () => {
    expect(typeof testFirst.runTestFirst).toBe('function')
    expect(typeof testFirst.parseFileList).toBe('function')
    expect(typeof testFirst.suggestTestPath).toBe('function')
    expect(typeof testFirst.writeFiles).toBe('function')
  })

  it('returns skipped quickly when there is no test framework', async () => {
    const result = await testFirst.runTestFirst({ provider: {}, model: {}, db: {}, goal: 'implement x' })
    expect(result.skipped).toBe(true)
    expect(result.reason).toMatch(/no test framework/i)
    // Skipped before any model call or test command run.
    expect(providerAdapter.completeChatMessage).not.toHaveBeenCalled()
  })

  it('returns success immediately when the RED test already passes', async () => {
    // A node workspace so detectProjectType resolves; the test command is a
    // harmless node one-liner that exits 0 (not blocked by the sandbox guard).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-test-first-green-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't', version: '1.0.0' }))
    sandbox.setWorkspaceRoot(dir)
    // RED: model returns a parseable test file; runOne(exit 0) => ok => early success.
    providerAdapter.completeChatMessage.mockResolvedValueOnce({ content: '[{"path":"tmp.test.js","content":"it(\\"x\\",()=>{})"}]' })
    const db = { getSetting: () => 'node -e "console.log(1)"' }
    const result = await testFirst.runTestFirst({ provider: {}, model: {}, db, goal: 'x' })
    expect(result.success).toBe(true)
    expect(result.cycles).toBe(0)
    sandbox.setWorkspaceRoot(tempDir)
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  })
})

describe('parseFileList', () => {
  it('extracts files from a JSON array wrapped in a markdown fence', () => {
    const text = '```json\n[{"path":"a.js","content":"x"},{"path":"b.js","content":"y"}]\n```'
    const files = testFirst.parseFileList(text)
    expect(files).toHaveLength(2)
    expect(files[0].path).toBe('a.js')
    expect(files[0].content).toBe('x')
    expect(files[1].path).toBe('b.js')
  })

  it('accepts a bare object and a { files: [...] } wrapper', () => {
    expect(testFirst.parseFileList('{"path":"a","content":"c"}')).toEqual([{ path: 'a', content: 'c' }])
    expect(testFirst.parseFileList('{"files":[{"path":"b","content":"d"}]}')).toEqual([{ path: 'b', content: 'd' }])
  })

  it('returns [] for non-parseable or non-file text', () => {
    expect(testFirst.parseFileList('no json here')).toEqual([])
    expect(testFirst.parseFileList('{"path":123}')).toEqual([])
    expect(testFirst.parseFileList('')).toEqual([])
  })
})

describe('suggestTestPath', () => {
  it('returns a project-appropriate test path', () => {
    expect(testFirst.suggestTestPath('/r', 'node')).toMatch(/test_first_tmp\.test\.js$/)
    expect(testFirst.suggestTestPath('/r', 'python')).toMatch(/test_first_tmp\.py$/)
    expect(testFirst.suggestTestPath('/r', 'go')).toMatch(/test_first_tmp_test\.go$/)
  })

  it('uses .test.ts for node projects with tsconfig.json', () => {
    // mock fs.existsSync for this test to see the TS path
    const oldExists = fs.existsSync
    fs.existsSync = (p) => p.endsWith('tsconfig.json') ? true : oldExists(p)
    expect(testFirst.suggestTestPath('/r', 'node')).toMatch(/test_first_tmp\.test\.ts$/)
    fs.existsSync = oldExists
  })
})

describe('writeFiles', () => {
  it('writes files inside the workspace root', () => {
    const files = [{ path: 'src/write-me.js', content: 'export default 1' }]
    const written = testFirst.writeFiles(tempDir, files, undefined)
    expect(written).toEqual([{ path: 'src/write-me.js', ok: true }])
    const abs = path.join(tempDir, 'src', 'write-me.js')
    expect(fs.existsSync(abs)).toBe(true)
    expect(fs.readFileSync(abs, 'utf-8')).toBe('export default 1')
  })

  it('skips files present in the skip set without writing them', () => {
    const target = path.join(tempDir, 'skip-me.js')
    const skip = new Set([path.normalize(target)])
    const written = testFirst.writeFiles(tempDir, [{ path: 'skip-me.js', content: 'x' }], undefined, skip)
    expect(written).toEqual([{ path: 'skip-me.js', skipped: true }])
    expect(fs.existsSync(target)).toBe(false)
  })

  it('rejects absolute paths outside the workspace root', () => {
    const outside = path.join(os.tmpdir(), 'aether-test-first-outside', 'evil.js')
    const written = testFirst.writeFiles(tempDir, [{ path: outside, content: 'x' }], undefined)
    expect(written).toEqual([{ path: outside, error: 'path outside workspace' }])
    expect(fs.existsSync(outside)).toBe(false)
  })
})