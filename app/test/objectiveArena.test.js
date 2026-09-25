// ─── Objective Arena unit tests ─────────────────────────────────────────────
// Validates isolated workspace patching, command verification runner,
// objective candidate comparison, and automated ELO score updates.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  runVerifyCommandDetailed,
  extractAndApplyPatches,
  runObjectiveEvaluation,
} from '../electron/llm/objectiveArena'

// Mock providerAdapter's completeChatMessage
vi.mock('../electron/llm/providerAdapter', () => ({
  completeChatMessage: vi.fn(),
  normalizeUsage: vi.fn((usage) => usage || { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }),
}))

import { completeChatMessage } from '../electron/llm/providerAdapter'

let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obj-arena-test-'))
})

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  vi.clearAllMocks()
})

describe('runVerifyCommandDetailed', () => {
  it('executes command successfully when exit code is 0', async () => {
    const cmd = process.platform === 'win32' ? 'cmd /c exit 0' : 'exit 0'
    const res = await runVerifyCommandDetailed(cmd, tmpDir)
    expect(res.ok).toBe(true)
    expect(res.exitCode).toBe(0)
    expect(res.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('fails when exit code is non-zero', async () => {
    const cmd = process.platform === 'win32' ? 'cmd /c exit 1' : 'exit 1'
    const res = await runVerifyCommandDetailed(cmd, tmpDir)
    expect(res.ok).toBe(false)
    expect(res.exitCode).toBe(1)
  })
})

describe('extractAndApplyPatches', () => {
  const SEARCH_HEAD = `${'<'.repeat(7)} SEARCH`
  const DIVIDER = '='.repeat(7)
  const REPLACE_TAIL = `${'>'.repeat(7)} REPLACE`

  it('applies SEARCH/REPLACE blocks with file path header', () => {
    const mathFile = path.join(tmpDir, 'calc.js')
    fs.writeFileSync(mathFile, 'function add(a, b) {\n  return a - b // bug\n}\n', 'utf8')

    const patchText = [
      'Here is the fix for the bug in calc.js:',
      '',
      'File: calc.js',
      SEARCH_HEAD,
      'function add(a, b) {',
      '  return a - b // bug',
      '}',
      DIVIDER,
      'function add(a, b) {',
      '  return a + b',
      '}',
      REPLACE_TAIL,
    ].join('\n')
    const res = extractAndApplyPatches(tmpDir, patchText)
    expect(res.appliedCount).toBe(1)
    expect(res.filesModified).toContain('calc.js')
    const updated = fs.readFileSync(mathFile, 'utf8')
    expect(updated).toContain('return a + b')
  })

  it('applies unified diff format', () => {
    const greetingFile = path.join(tmpDir, 'greet.txt')
    fs.writeFileSync(greetingFile, 'Hello world\n', 'utf8')

    const diffText = `
--- a/greet.txt
+++ b/greet.txt
@@ -1,1 +1,1 @@
-Hello world
+Hello Aether
`
    const res = extractAndApplyPatches(tmpDir, diffText)
    expect(res.appliedCount).toBe(1)
    const updated = fs.readFileSync(greetingFile, 'utf8')
    expect(updated).toContain('Hello Aether')
  })

  it('resets currentFile when encountering an invalid File header instead of modifying the previous file', () => {
    const validFile = path.join(tmpDir, 'valid.txt')
    fs.writeFileSync(validFile, 'line1\nline2\n', 'utf8')

    const patchText = [
      'File: valid.txt',
      SEARCH_HEAD,
      'line1',
      DIVIDER,
      'line1_ok',
      REPLACE_TAIL,
      'File: ../outside_escape.txt',
      SEARCH_HEAD,
      'line2',
      DIVIDER,
      'line2_tampered',
      REPLACE_TAIL,
    ].join('\n')

    const res = extractAndApplyPatches(tmpDir, patchText)
    expect(res.ok).toBe(false)
    expect(res.appliedCount).toBe(1)
    const updated = fs.readFileSync(validFile, 'utf8')
    expect(updated).toBe('line1_ok\nline2\n')
  })

  it('applies pure insertion hunks at start, middle, and end of file', () => {
    const { applyAnyPatch } = require('../electron/tools/patchEngine')
    const base = 'a\nb\nc\nd\n'
    const startRes = applyAnyPatch(base, '@@ -0,0 +1,1 @@\n+HEAD')
    expect(startRes.applied).toBe(1)
    expect(startRes.content).toBe('HEAD\na\nb\nc\nd\n')

    const midRes = applyAnyPatch(base, '@@ -2,0 +3,1 @@\n+MID')
    expect(midRes.applied).toBe(1)
    expect(midRes.content).toBe('a\nb\nMID\nc\nd\n')

    const endRes = applyAnyPatch(base, '@@ -4,0 +4,1 @@\n+NEW')
    expect(endRes.applied).toBe(1)
    expect(endRes.content).toBe('a\nb\nc\nd\nNEW\n')
  })

  it('routes general chat intent to a recommended model in routeWithExplanation', () => {
    const { routeWithExplanation } = require('../electron/llm/modelAdvisor')
    const routed = routeWithExplanation({
      allModels: [{ id: 1, model_name: 'gpt-4o', provider_id: 1 }],
      userMessage: '今天天气怎么样',
      intent: 'general',
    })
    expect(routed).not.toBeNull()
    expect(routed.model.model_name).toBe('gpt-4o')
  })
})

describe('runObjectiveEvaluation', () => {
  const SEARCH_HEAD = `${'<'.repeat(7)} SEARCH`
  const DIVIDER = '='.repeat(7)
  const REPLACE_TAIL = `${'>'.repeat(7)} REPLACE`

  it('evaluates candidate models and records winner ELO objectively', async () => {
    // Setup a tiny codebase with a broken file and a node test script
    const appFile = path.join(tmpDir, 'app.js')
    fs.writeFileSync(appFile, 'module.exports = { status: "broken" }\n', 'utf8')

    const testFile = path.join(tmpDir, 'test.js')
    fs.writeFileSync(testFile, `
      const app = require('./app')
      if (app.status !== 'ok') {
        process.exit(1)
      }
      process.exit(0)
    `, 'utf8')

    // Candidate models
    const mockModels = [
      { id: 101, model_name: 'model-fixing', provider_id: 1, provider_name: 'provA' },
      { id: 102, model_name: 'model-failing', provider_id: 2, provider_name: 'provB' },
    ]

    // Model 101 outputs working patch
    // Model 102 outputs wrong patch or no patch
    completeChatMessage.mockImplementation(async ({ model }) => {
      if (model.id === 101) {
        return {
          content: [
            'File: app.js',
            SEARCH_HEAD,
            'module.exports = { status: "broken" }',
            DIVIDER,
            'module.exports = { status: "ok" }',
            REPLACE_TAIL,
          ].join('\n'),
          usage: { prompt_tokens: 150, completion_tokens: 80, total_tokens: 230 },
        }
      }
      return {
        content: `I am sorry, I cannot fix this.`,
        usage: { prompt_tokens: 150, completion_tokens: 20, total_tokens: 170 },
      }
    })

    const mockDb = {
      recordArenaVote: vi.fn(),
    }

    const verifyCmd = `node test.js`
    const result = await runObjectiveEvaluation({
      db: mockDb,
      models: mockModels,
      prompt: 'Fix app.js to have status ok',
      verifyCommand: verifyCmd,
      cwd: tmpDir,
      updateScores: true,
      completeChatMessageFn: completeChatMessage,
    })
    expect(result).not.toBeNull()
    expect(result.winnerId).toBe(101)
    expect(result.winnerName).toBe('model-fixing')
    expect(result.eloUpdated).toBe(true)

    // Check individual model results
    const m1 = result.models.find(m => m.modelId === 101)
    const m2 = result.models.find(m => m.modelId === 102)
    expect(m1.passed).toBe(true)
    expect(m1.patchApplied).toBe(true)
    expect(m2.passed).toBe(false)

    // Check DB ELO update was called with correct winner & loser
    expect(mockDb.recordArenaVote).toHaveBeenCalledTimes(1)
    expect(mockDb.recordArenaVote).toHaveBeenCalledWith(expect.objectContaining({
      winnerModelId: 101,
      loserModelIds: [102],
      intent: 'coding',
    }))
  })
})
