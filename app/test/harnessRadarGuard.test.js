import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('Harness Phase 1 & 2: Semantic Radar & Fast Syntax Guard', () => {
  let tmpDir
  const sid = 'harness-radar-guard-test'

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-harness-'))
    const { setWorkspaceRootForSession } = require('../electron/tools/sandbox')
    setWorkspaceRootForSession(sid, tmpDir)
    const lsp = require('../electron/context/lspClient')
    lsp.disposeAll()
    // Ensure no real LSP binary is picked up so fallback & fast-guard paths are deterministic
    lsp.configureServer('javascript', { command: '__nonexistent_lsp_bin__', args: [] })
  })

  afterEach(() => {
    const lsp = require('../electron/context/lspClient')
    lsp.configureServer('javascript', null)
    lsp.disposeAll()
    const { clearSessionWorkspaces } = require('../electron/tools/sandbox')
    clearSessionWorkspaces(sid)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('lsp.full defaults to true in featureFlags', () => {
    const featureFlags = require('../electron/featureFlags')
    expect(featureFlags.isEnabled(null, 'lsp.full')).toBe(true)
  })

  it('write_file catches JS and JSON syntax errors immediately via [Harness Syntax Guard]', async () => {
    const { getTool } = require('../electron/tools/registry')
    const writeTool = getTool('write_file')

    const brokenJs = path.join(tmpDir, 'broken.js')
    const resJs = await writeTool.run(
      { path: brokenJs, content: 'function broken( {\n  return 1\n}\n' },
      { sessionId: sid, agentMode: 'act', lspWaitMs: 50, lspDeadlineMs: 80 }
    )
    expect(resJs).toContain('wrote ')
    expect(resJs).toContain('[Harness Syntax Guard] broken.js')
    expect(resJs).toContain('[SyntaxError]')

    const cleanJs = path.join(tmpDir, 'clean.js')
    const resClean = await writeTool.run(
      { path: cleanJs, content: 'function ok(x) {\n  return x + 1\n}\n' },
      { sessionId: sid, agentMode: 'act', lspWaitMs: 50, lspDeadlineMs: 80 }
    )
    expect(resClean).toContain('wrote ')
    expect(resClean).not.toContain('[Harness Syntax Guard]')

    const brokenJson = path.join(tmpDir, 'bad.json')
    const resJson = await writeTool.run(
      { path: brokenJson, content: '{ "a": }' },
      { sessionId: sid, agentMode: 'act' }
    )
    expect(resJson).toContain('[Harness Syntax Guard] bad.json')
    expect(resJson).toContain('[SyntaxError]')

    // JSONC tsconfig with comments & trailing comma (both before and after comment) passes; broken tsconfig fails
    const validTsconfig = path.join(tmpDir, 'tsconfig.json')
    const resValidTsconfig = await writeTool.run(
      { path: validTsconfig, content: '{\n  // comment\n  "compilerOptions": { "strict": true, /* inline */ },\n}\n' },
      { sessionId: sid, agentMode: 'act' }
    )
    expect(resValidTsconfig).not.toContain('[Harness Syntax Guard]')

    const badTsconfig = path.join(tmpDir, 'tsconfig.bad.json')
    const resBadTsconfig = await writeTool.run(
      { path: badTsconfig, content: '{\n  // comment\n  "compilerOptions": }\n' },
      { sessionId: sid, agentMode: 'act' }
    )
    expect(resBadTsconfig).toContain('[Harness Syntax Guard] tsconfig.bad.json')

    // Valid TS enum, valid CJS top-level return, valid ESM import.meta/await should NOT false-positive
    const enumTs = path.join(tmpDir, 'types.ts')
    const resEnum = await writeTool.run(
      { path: enumTs, content: 'export enum State { Ready = 1 }\n' },
      { sessionId: sid, agentMode: 'act', lspWaitMs: 50, lspDeadlineMs: 80 }
    )
    expect(resEnum).not.toContain('[Harness Syntax Guard]')

    const cjsFile = path.join(tmpDir, 'guard.cjs')
    const resCjs = await writeTool.run(
      { path: cjsFile, content: 'if (!process.env.ENABLED) return;\nmodule.exports = {}\n' },
      { sessionId: sid, agentMode: 'act', lspWaitMs: 50, lspDeadlineMs: 80 }
    )
    expect(resCjs).not.toContain('[Harness Syntax Guard]')

    const mjsOk = path.join(tmpDir, 'mod.mjs')
    const resMjsOk = await writeTool.run(
      { path: mjsOk, content: 'import path from "node:path";\nconsole.log(import.meta.url);\nawait Promise.resolve(1);\n' },
      { sessionId: sid, agentMode: 'act', lspWaitMs: 50, lspDeadlineMs: 80 }
    )
    expect(resMjsOk).not.toContain('[Harness Syntax Guard]')

    const mjsBad = path.join(tmpDir, 'bad.mjs')
    const resMjsBad = await writeTool.run(
      { path: mjsBad, content: 'import path from "node:path";\nconst broken = (;\n' },
      { sessionId: sid, agentMode: 'act', lspWaitMs: 50, lspDeadlineMs: 80 }
    )
    expect(resMjsBad).toContain('[Harness Syntax Guard] bad.mjs')
  })

  it('lsp_diagnostics falls back to fast syntax check when LSP server is unavailable', async () => {
    const { getTool } = require('../electron/tools/registry')
    const { setWorkspaceRootForSession, clearSessionWorkspaces } = require('../electron/tools/sandbox')
    const diagSid = `${sid}-diag`
    setWorkspaceRootForSession(diagSid, tmpDir)
    const badFile = path.join(tmpDir, 'diag.js')
    fs.writeFileSync(badFile, 'const x = (\n', 'utf8')

    const statuses = []
    try {
      const out = await getTool('lsp_diagnostics').run(
        { file: 'diag.js' },
        { sessionId: diagSid, onStatus: (s) => statuses.push(s) }
      )
      expect(out).toContain('[Harness Syntax Guard] diag.js')
      expect(statuses.some((s) => s.kind === 'lsp_degraded')).toBe(true)
    } finally {
      clearSessionWorkspaces(diagSid)
    }
  })

  it('lsp_definition and lsp_references return real file:line fallback matches and emit lsp_degraded', async () => {
    const { getTool } = require('../electron/tools/registry')
    const { setWorkspaceRootForSession, clearSessionWorkspaces } = require('../electron/tools/sandbox')
    const defSid = `${sid}-def`
    setWorkspaceRootForSession(defSid, tmpDir)
    const srcFile = path.join(tmpDir, 'sample.js')
    fs.writeFileSync(srcFile, 'function computeMagicValue() { return 42 }\nconst y = computeMagicValue()\n', 'utf8')

    const statuses = []
    try {
      const defOut = await getTool('lsp_definition').run(
        { file: 'sample.js', line: 2, character: 12 },
        { sessionId: defSid, onStatus: (s) => statuses.push(s) }
      )
      expect(defOut).not.toContain('is not a function')
      expect(defOut).toContain('sample.js:1:')
      expect(defOut).toContain('function computeMagicValue()')
      expect(statuses.some((s) => s.kind === 'lsp_degraded')).toBe(true)

      const refOut = await getTool('lsp_references').run(
        { file: 'sample.js', line: 1, character: 10 },
        { sessionId: defSid }
      )
      expect(refOut).not.toContain('is not a function')
      expect(refOut).toContain('sample.js:1:')
      expect(refOut).toContain('sample.js:2:')
    } finally {
      clearSessionWorkspaces(defSid)
    }
  })
})
