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
  })

  it('lsp_diagnostics falls back to fast syntax check when LSP server is unavailable', async () => {
    const { getTool } = require('../electron/tools/registry')
    const badFile = path.join(tmpDir, 'diag.js')
    fs.writeFileSync(badFile, 'const x = (\n', 'utf8')

    const out = await getTool('lsp_diagnostics').run(
      { file: 'diag.js' },
      { sessionId: sid }
    )
    expect(out).toContain('[Harness Syntax Guard] diag.js')
  })

  it('lsp_definition and lsp_references degrade cleanly instead of throwing is not a function', async () => {
    const { getTool } = require('../electron/tools/registry')
    const srcFile = path.join(tmpDir, 'sample.js')
    fs.writeFileSync(srcFile, 'function computeMagicValue() { return 42 }\nconst y = computeMagicValue()\n', 'utf8')

    const defOut = await getTool('lsp_definition').run(
      { file: 'sample.js', line: 2, character: 12 },
      { sessionId: sid }
    )
    expect(defOut).not.toContain('is not a function')
    expect(defOut).toContain('computeMagicValue')

    const refOut = await getTool('lsp_references').run(
      { file: 'sample.js', line: 1, character: 10 },
      { sessionId: sid }
    )
    expect(refOut).not.toContain('is not a function')
    expect(refOut).toContain('computeMagicValue')
  })
})
