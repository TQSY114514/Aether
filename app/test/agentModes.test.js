// ─────────────────────────────────────────────────────────────────────────────
// app/test/agentModes.test.js
//
// Unit and integration test suite for Milestone 2:
// R2: 4-Tier Agent Operating Modes
//
// Tiers:
//   1. 'explore' (仅查看): Read-only exploration and inspection; strictly blocks file edits and destructive shell commands.
//   2. 'workspace' (工作区内修改 - default): Controlled workspace mutations with inline Diff preview and explicit confirmation on external shell commands.
//   3. 'auto_review' (自动审查): Supervised TDD loop; automatically mutates code, runs tests/checks, and triggers debugAgent self-healing on failure (bounded to max 3 attempts).
//   4. 'unrestricted' (完全权限): Autonomous execution in sandbox with background safety boundaries and zero popups.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import Module from 'node:module'

const origLoad = Module._load
const testUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-modes-userdata-'))
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: { getPath: () => testUserDataDir },
      safeStorage: { isEncryptionAvailable: () => false },
      ipcMain: { handle: () => {}, on: () => {} },
    }
  }
  return origLoad.apply(this, arguments)
}

const providerAdapter = require('../electron/llm/providerAdapter')
const origCompleteChatMessage = providerAdapter.completeChatMessage
let activeMockCompleteChatMessage = null

providerAdapter.completeChatMessage = async function dynamicCompleteChatMessage(...args) {
  if (typeof activeMockCompleteChatMessage === 'function') {
    return activeMockCompleteChatMessage(...args)
  }
  return origCompleteChatMessage.apply(this, args)
}

delete require.cache[require.resolve('../electron/llm/toolLoop')]
try {
  delete require.cache[require.resolve('../electron/llm/toolLoop/runtime')]
} catch {}

import {
  normalizeAgentMode,
  agentModeToPermissionMode,
  TIER_CANONICAL_MAP,
  MAX_AUTO_REVIEW_TDD,
  READ_TOOLS,
  WRITE_TOOLS,
  classifyToolError,
} from '../electron/llm/toolLoopUtils'
import { PermissionMode } from '../electron/llm/permissions'
import trustEngine from '../electron/tools/trustEngine'

// Mock db for trustEngine session queries
function createMockDb(initialTrust = 50, updatedAt = null) {
  let score = initialTrust
  let updated = updatedAt || new Date().toISOString()
  return {
    prepare: (sql) => ({
      get: (id) => {
        if (/SELECT trust_score/i.test(sql)) {
          return { trust_score: score, updated_at: updated }
        }
        return undefined
      },
      all: () => {
        if (/PRAGMA table_info/i.test(sql)) {
          return [{ name: 'trust_score' }, { name: 'updated_at' }]
        }
        return []
      },
      run: (...params) => {
        if (/UPDATE session/i.test(sql)) {
          score = params[0]
          updated = new Date().toISOString()
        }
      },
    }),
  }
}

describe('R2: 4-Tier Agent Operating Modes', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // 1. normalizeAgentMode and Legacy Alias Mapping
  // ───────────────────────────────────────────────────────────────────────────
  describe('normalizeAgentMode & Canonical Mapping', () => {
    it('preserves all 4 canonical mode identifiers directly', () => {
      expect(normalizeAgentMode('explore')).toBe('explore')
      expect(normalizeAgentMode('workspace')).toBe('workspace')
      expect(normalizeAgentMode('auto_review')).toBe('auto_review')
      expect(normalizeAgentMode('unrestricted')).toBe('unrestricted')
    })

    it('maps legacy "plan" and read-only aliases to canonical "explore"', () => {
      expect(normalizeAgentMode('plan')).toBe('explore')
      expect(normalizeAgentMode('read_only')).toBe('explore')
      expect(normalizeAgentMode('PLAN')).toBe('explore')
      expect(normalizeAgentMode('  plan  ')).toBe('explore')
    })

    it('maps legacy "ask" and manual aliases to canonical "workspace"', () => {
      expect(normalizeAgentMode('ask')).toBe('workspace')
      expect(normalizeAgentMode('manual')).toBe('workspace')
      expect(normalizeAgentMode('ASK')).toBe('workspace')
      expect(normalizeAgentMode('  ask  ')).toBe('workspace')
    })

    it('maps legacy "auto" and "auto_confirm" aliases to canonical "auto_review"', () => {
      expect(normalizeAgentMode('auto')).toBe('auto_review')
      expect(normalizeAgentMode('auto_confirm')).toBe('auto_review')
      expect(normalizeAgentMode('tdd')).toBe('auto_review')
      expect(normalizeAgentMode('AUTO')).toBe('auto_review')
      expect(normalizeAgentMode('  auto_confirm  ')).toBe('auto_review')
    })

    it('maps legacy "yolo" alias to canonical "unrestricted"', () => {
      expect(normalizeAgentMode('yolo')).toBe('unrestricted')
      expect(normalizeAgentMode('YOLO')).toBe('unrestricted')
      expect(normalizeAgentMode('  yolo  ')).toBe('unrestricted')
    })

    it('falls back safely to default "workspace" mode on invalid or missing inputs', () => {
      expect(normalizeAgentMode(undefined)).toBe('workspace')
      expect(normalizeAgentMode(null)).toBe('workspace')
      expect(normalizeAgentMode('')).toBe('workspace')
      expect(normalizeAgentMode('   ')).toBe('workspace')
      expect(normalizeAgentMode('invalid_random_mode')).toBe('workspace')
      expect(normalizeAgentMode(12345)).toBe('workspace')
      expect(normalizeAgentMode({})).toBe('workspace')
    })

    it('preserves special passthrough modes: custom and off', () => {
      expect(normalizeAgentMode('custom')).toBe('custom')
      expect(normalizeAgentMode('off')).toBe('off')
    })

    it('exposes TIER_CANONICAL_MAP with complete mappings', () => {
      expect(TIER_CANONICAL_MAP.explore).toBe('explore')
      expect(TIER_CANONICAL_MAP.plan).toBe('explore')
      expect(TIER_CANONICAL_MAP.workspace).toBe('workspace')
      expect(TIER_CANONICAL_MAP.ask).toBe('workspace')
      expect(TIER_CANONICAL_MAP.auto_review).toBe('auto_review')
      expect(TIER_CANONICAL_MAP.auto).toBe('auto_review')
      expect(TIER_CANONICAL_MAP.unrestricted).toBe('unrestricted')
      expect(TIER_CANONICAL_MAP.yolo).toBe('unrestricted')
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 2. agentModeToPermissionMode Mapping
  // ───────────────────────────────────────────────────────────────────────────
  describe('agentModeToPermissionMode', () => {
    it('maps explore mode to PermissionMode.ReadOnly (0)', () => {
      expect(agentModeToPermissionMode('explore')).toBe('ReadOnly')
      expect(PermissionMode[agentModeToPermissionMode('explore')]).toBe(PermissionMode.ReadOnly)
      expect(agentModeToPermissionMode('plan')).toBe('ReadOnly')
      expect(agentModeToPermissionMode('read_only')).toBe('ReadOnly')
    })

    it('maps workspace mode to PermissionMode.Prompt (3)', () => {
      expect(agentModeToPermissionMode('workspace')).toBe('Prompt')
      expect(PermissionMode[agentModeToPermissionMode('workspace')]).toBe(PermissionMode.Prompt)
      expect(agentModeToPermissionMode('ask')).toBe('Prompt')
      expect(agentModeToPermissionMode('manual')).toBe('Prompt')
    })

    it('maps auto_review mode to PermissionMode.WorkspaceWrite (1)', () => {
      expect(agentModeToPermissionMode('auto_review')).toBe('WorkspaceWrite')
      expect(PermissionMode[agentModeToPermissionMode('auto_review')]).toBe(PermissionMode.WorkspaceWrite)
      expect(agentModeToPermissionMode('auto')).toBe('WorkspaceWrite')
      expect(agentModeToPermissionMode('auto_confirm')).toBe('WorkspaceWrite')
      expect(agentModeToPermissionMode('tdd')).toBe('WorkspaceWrite')
    })

    it('maps unrestricted mode to PermissionMode.Allow (4)', () => {
      expect(agentModeToPermissionMode('unrestricted')).toBe('Allow')
      expect(PermissionMode[agentModeToPermissionMode('unrestricted')]).toBe(PermissionMode.Allow)
      expect(agentModeToPermissionMode('yolo')).toBe('Allow')
    })

    it('handles special modes and fallback gracefully', () => {
      expect(agentModeToPermissionMode('custom')).toBe('Prompt')
      expect(agentModeToPermissionMode('off')).toBe('ReadOnly')
      expect(agentModeToPermissionMode(null)).toBe('Prompt') // default workspace -> Prompt
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Tool Gating in Explore Mode (Read-Only Guarantee)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Explore Mode Strict Read-Only Gating', () => {
    it('allows all read inspection tools in explore mode', () => {
      const readToolsList = ['read_file', 'list_dir', 'grep_search', 'glob_find', 'web_search', 'web_fetch']
      for (const tool of readToolsList) {
        const check = trustEngine.checkToolAllowed(tool, 'explore')
        expect(check.allowed).toBe(true)
        expect(check.requiresPrompt).toBe(false)
      }
    })

    it('strictly forbids file mutating tools in explore mode', () => {
      const mutatingTools = ['write_file', 'edit_file', 'delete_file', 'apply_patch', 'create_or_update_file']
      for (const tool of mutatingTools) {
        const check = trustEngine.checkToolAllowed(tool, 'explore')
        expect(check.allowed).toBe(false)
        expect(check.reason).toContain('forbidden in read-only explore mode')
      }
    })

    it('strictly forbids shell command execution in explore mode', () => {
      const cmdCheck = trustEngine.checkToolAllowed('run_command', 'explore', { command: 'ls -la' })
      expect(cmdCheck.allowed).toBe(false)
      expect(cmdCheck.reason).toContain('forbidden in read-only explore mode')

      const execCheck = trustEngine.checkToolAllowed('exec', 'explore', { cmd: 'cat file.txt' })
      expect(execCheck.allowed).toBe(false)
      expect(execCheck.reason).toContain('forbidden in read-only explore mode')
    })

    it('strictly maintains disjoint READ_TOOLS and WRITE_TOOLS sets', () => {
      for (const r of READ_TOOLS) {
        expect(WRITE_TOOLS.has(r)).toBe(false)
      }
      for (const w of WRITE_TOOLS) {
        expect(READ_TOOLS.has(w)).toBe(false)
      }
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Workspace Mode: Controlled Mutations & External Shell Confirmations
  // ───────────────────────────────────────────────────────────────────────────
  describe('Workspace Mode Behavior', () => {
    it('permits workspace file mutations', () => {
      const check = trustEngine.checkToolAllowed('write_file', 'workspace', { path: 'src/index.ts', content: 'hello' })
      expect(check.allowed).toBe(true)
    })

    it('allows benign safe read shell commands without prompt', () => {
      const check = trustEngine.checkToolAllowed('run_command', 'workspace', { command: 'git status' })
      expect(check.allowed).toBe(true)
      expect(check.requiresPrompt).toBe(false)
    })

    it('requires confirmation prompt on external or potentially mutating shell commands', () => {
      const check = trustEngine.checkToolAllowed('run_command', 'workspace', { command: 'npm install lodash' })
      expect(check.allowed).toBe(true)
      expect(check.requiresPrompt).toBe(true)
    })

    it('detects destructive shell commands in workspace mode and requires explicit confirmation', () => {
      const destructiveCheck = trustEngine.evaluateShellSafety('rm -rf node_modules', 'workspace')
      expect(destructiveCheck.allowed).toBe(true)
      expect(destructiveCheck.requiresPrompt).toBe(true)
      expect(destructiveCheck.isDestructive).toBe(true)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Auto Review Mode: Supervised TDD Loop & Self-Healing
  // ───────────────────────────────────────────────────────────────────────────
  describe('Auto Review Mode Behavior', () => {
    it('permits mutations without prompt popups in auto_review mode', () => {
      const check = trustEngine.checkToolAllowed('write_file', 'auto_review')
      expect(check.allowed).toBe(true)
      expect(check.requiresPrompt).toBe(false)
    })

    it('allows test execution shell commands without confirmation prompt', () => {
      const check = trustEngine.checkToolAllowed('run_command', 'auto_review', { command: 'npm test' })
      expect(check.allowed).toBe(true)
      expect(check.requiresPrompt).toBe(false)
    })

    it('classifies test failures with appropriate recovery actions', () => {
      const errOutput = 'FAIL test/math.test.js > AssertionError: expected 4 to deeply equal 5'
      const classification = classifyToolError(errOutput)
      expect(classification.kind).toBe('test_failure')
      expect(classification.recover).toBeDefined()
    })

    it('executes supervised TDD self-healing loop in auto_review mode on test failure', async () => {
      const toolLoop = require('../electron/llm/toolLoop')
      const lintTestRepair = require('../electron/llm/lintTestRepair')
      const debugAgent = require('../electron/llm/debugAgent')
      const sandbox = require('../electron/tools/sandbox')

      const sessionId = 'test-session-agent-modes-tdd-1'
      const tmpWs = path.join(os.tmpdir(), `aether-tdd-test-${Date.now()}`)
      fs.mkdirSync(tmpWs, { recursive: true })
      sandbox.setWorkspaceRootForSession(sessionId, tmpWs)

      const origRunProjectTest = lintTestRepair.runProjectTest
      const origRunDebugLoop = debugAgent.runDebugLoop

      let round = 0
      let debugAgentCalled = 0
      let testRunCount = 0
      const statusList = []

      activeMockCompleteChatMessage = async () => {
        round++
        if (round === 1) {
          return {
            content: 'Writing initial broken code',
            tool_calls: [{
              id: 'c1',
              function: {
                name: 'write_file',
                arguments: JSON.stringify({ path: path.join(tmpWs, 'math.js'), content: 'module.exports = 1 + 2' })
              }
            }]
          }
        }
        if (round === 2) {
          return {
            content: 'Writing fixed code based on TDD prompt',
            tool_calls: [{
              id: 'c2',
              function: {
                name: 'write_file',
                arguments: JSON.stringify({ path: path.join(tmpWs, 'math.js'), content: 'module.exports = 4' })
              }
            }]
          }
        }
        return { content: 'Fixed and verified', tool_calls: [] }
      }

      lintTestRepair.runProjectTest = async () => {
        testRunCount++
        if (testRunCount === 1) {
          return {
            ok: false,
            passed: false,
            command: 'npm test',
            output: 'FAIL: math assertion failed',
            suggestedRepairPrompt: 'Fix math to return 4'
          }
        }
        return { ok: true, passed: true, command: 'npm test', output: 'All tests passed' }
      }

      debugAgent.runDebugLoop = async ({ onFix }) => {
        debugAgentCalled++
        onFix?.({ cycle: 1, description: 'Fix return value to 4', files: ['math.js'] })
        return { success: false, cycles: 1, summary: 'debug analysis emitted' }
      }

      try {
        const finalContent = await toolLoop.runToolLoop({
          provider: { id: 'p', name: 'MockProvider' },
          model: { id: 'm', model_name: 'MockModel' },
          messages: [{ role: 'user', content: 'Implement math module' }],
          tools: true,
          agentMode: 'auto_review',
          sessionId,
          maxIterations: 5,
          onStatus: (st) => statusList.push(st),
        })

        // Verify genuine TDD execution:
        // 1. Initial write_file succeeded (no permission escalation error)
        expect(fs.existsSync(path.join(tmpWs, 'math.js'))).toBe(true)
        // 2. Project test ran twice (first failed, second passed)
        expect(testRunCount).toBe(2)
        // 3. debugAgent was called on the first test failure
        expect(debugAgentCalled).toBe(1)
        // 4. Status emitted tdd_check, tdd_failure, and tdd_pass
        expect(statusList.some(s => s.kind === 'tdd_check')).toBe(true)
        expect(statusList.some(s => s.kind === 'tdd_failure')).toBe(true)
        expect(statusList.some(s => s.kind === 'tdd_pass')).toBe(true)
        expect(finalContent).toBe('Fixed and verified')
      } finally {
        activeMockCompleteChatMessage = null
        lintTestRepair.runProjectTest = origRunProjectTest
        debugAgent.runDebugLoop = origRunDebugLoop
        try { fs.rmSync(tmpWs, { recursive: true, force: true }) } catch {}
      }
    })

    it('strictly bounds supervised TDD self-healing loop to MAX_AUTO_REVIEW_TDD = 3 attempts', async () => {
      const toolLoop = require('../electron/llm/toolLoop')
      const lintTestRepair = require('../electron/llm/lintTestRepair')
      const debugAgent = require('../electron/llm/debugAgent')
      const sandbox = require('../electron/tools/sandbox')

      expect(toolLoop.MAX_AUTO_REVIEW_TDD).toBe(3)
      expect(MAX_AUTO_REVIEW_TDD).toBe(3)

      const sessionId = 'test-session-agent-modes-tdd-bound'
      const tmpWs = path.join(os.tmpdir(), `aether-tdd-bound-${Date.now()}`)
      fs.mkdirSync(tmpWs, { recursive: true })
      sandbox.setWorkspaceRootForSession(sessionId, tmpWs)

      const origRunProjectTest = lintTestRepair.runProjectTest
      const origRunDebugLoop = debugAgent.runDebugLoop

      let round = 0
      let testRunCount = 0
      let debugAgentCallCount = 0

      activeMockCompleteChatMessage = async () => {
        round++
        if (round <= 6) {
          return {
            content: `Fix attempt ${round}`,
            tool_calls: [{
              id: `c_${round}`,
              function: {
                name: 'write_file',
                arguments: JSON.stringify({ path: path.join(tmpWs, 'code.js'), content: `// attempt ${round}` })
              }
            }]
          }
        }
        return { content: 'Terminated', tool_calls: [] }
      }

      // Continuous failure
      lintTestRepair.runProjectTest = async () => {
        testRunCount++
        return {
          ok: false,
          passed: false,
          command: 'npm test',
          output: `FAIL on attempt ${testRunCount}`,
          suggestedRepairPrompt: 'Still failing'
        }
      }

      debugAgent.runDebugLoop = async ({ onFix }) => {
        debugAgentCallCount++
        onFix?.({ cycle: 1, description: 'Continuous error analysis' })
        return { success: false, cycles: 1 }
      }

      try {
        await toolLoop.runToolLoop({
          provider: { id: 'p', name: 'MockProvider' },
          model: { id: 'm', model_name: 'MockModel' },
          messages: [{ role: 'user', content: 'Fix stubborn bug' }],
          tools: true,
          agentMode: 'auto_review',
          sessionId,
          maxIterations: 8,
        })

        // Must run exactly 3 times (MAX_AUTO_REVIEW_TDD = 3), then stop running tests on attempts 4+
        expect(testRunCount).toBe(3)
        expect(debugAgentCallCount).toBe(3)
      } finally {
        activeMockCompleteChatMessage = null
        lintTestRepair.runProjectTest = origRunProjectTest
        debugAgent.runDebugLoop = origRunDebugLoop
        try { fs.rmSync(tmpWs, { recursive: true, force: true }) } catch {}
      }
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Unrestricted Mode: Autonomous Execution with Safety Guards
  // ───────────────────────────────────────────────────────────────────────────
  describe('Unrestricted Mode Behavior', () => {
    it('allows mutating tools with zero prompts', () => {
      const check = trustEngine.checkToolAllowed('write_file', 'unrestricted')
      expect(check.allowed).toBe(true)
      expect(check.requiresPrompt).toBe(false)
    })

    it('allows shell commands with zero prompts', () => {
      const check = trustEngine.checkToolAllowed('run_command', 'unrestricted', { command: 'cargo build' })
      expect(check.allowed).toBe(true)
      expect(check.requiresPrompt).toBe(false)
    })

    it('blocks critical root wipe commands even in unrestricted mode', () => {
      const safety = trustEngine.evaluateShellSafety('rm -rf /', 'unrestricted')
      expect(safety.allowed).toBe(false)
      expect(safety.reason).toContain('Critical system destructive command blocked')
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Destructive Command Detection Engine
  // ───────────────────────────────────────────────────────────────────────────
  describe('Destructive Command Detection', () => {
    it('detects rm -rf and recursive deletions', () => {
      expect(trustEngine.isDestructiveCommand('rm -rf /var/data')).toBe(true)
      expect(trustEngine.isDestructiveCommand('rm -r dist')).toBe(true)
      expect(trustEngine.isDestructiveCommand('del /f /s /q temp')).toBe(true)
      expect(trustEngine.isDestructiveCommand('rd /s /q build')).toBe(true)
    })

    it('detects disk format and partition destructive patterns', () => {
      expect(trustEngine.isDestructiveCommand('format c: /fs:ntfs')).toBe(true)
      expect(trustEngine.isDestructiveCommand('mkfs.ext4 /dev/sda1')).toBe(true)
      expect(trustEngine.isDestructiveCommand('dd if=/dev/zero of=/dev/sda')).toBe(true)
    })

    it('detects database wipe commands', () => {
      expect(trustEngine.isDestructiveCommand('DROP DATABASE production;')).toBe(true)
      expect(trustEngine.isDestructiveCommand('DROP TABLE users;')).toBe(true)
      expect(trustEngine.isDestructiveCommand('TRUNCATE TABLE logs;')).toBe(true)
    })

    it('does not flag benign developer commands', () => {
      expect(trustEngine.isDestructiveCommand('git status')).toBe(false)
      expect(trustEngine.isDestructiveCommand('git diff')).toBe(false)
      expect(trustEngine.isDestructiveCommand('npm test')).toBe(false)
      expect(trustEngine.isDestructiveCommand('ls -la')).toBe(false)
      expect(trustEngine.isDestructiveCommand('cat package.json')).toBe(false)
      expect(trustEngine.isDestructiveCommand('cargo check')).toBe(false)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Trust Engine Dynamic Session Scoring
  // ───────────────────────────────────────────────────────────────────────────
  describe('Trust Engine Session Scoring', () => {
    it('provides baseline trust score of 50', () => {
      const mockDb = createMockDb(50)
      const score = trustEngine.getTrustScore(mockDb, 1)
      expect(score).toBe(50)
    })

    it('adjusts score positively on user approval and caps at 100', () => {
      const mockDb = createMockDb(95)
      const newScore = trustEngine.adjustTrust(mockDb, 1, 10, 'write_file')
      expect(newScore).toBe(100)
    })

    it('adjusts score negatively on tool error or denial and floors at 0', () => {
      const mockDb = createMockDb(5)
      const newScore = trustEngine.adjustTrust(mockDb, 1, -10, 'write_file')
      expect(newScore).toBe(0)
    })

    it('computes trust badge correctly according to score thresholds', () => {
      expect(trustEngine.getTrustBadge(85).level).toBe('high')
      expect(trustEngine.getTrustBadge(60).level).toBe('normal')
      expect(trustEngine.getTrustBadge(30).level).toBe('low')
    })
  })
})
