import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const {
  findEditMatch,
  normalizeReplacementForMatch,
  preserveQuoteStyle,
  recordReadFileState,
  findLatestReadFileState,
  checkStaleReadBeforeEdit,
  clearReadFileState,
} = require('../electron/tools/editMatchers')

const {
  MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE,
  maybeLocalMicrocompactMessages,
  orderSystemMessagesForCache,
  evaluateToolBoundaryAllowlist,
} = require('../electron/llm/microcompact')

const {
  getBranchGeneration,
  bumpBranchGeneration,
  enqueueTaskNotification,
  dequeueCompletedBatch,
  formatNotificationBatch,
} = require('../electron/llm/backgroundTasks')

const { scanUiTokens } = require('../scripts/check-ui-tokens')
const { getTool } = require('../electron/tools/registry')

describe('ZCode / Paperclip / Search Architectural Evolution Suite', () => {
  describe('1. 8-Tier Cascading Edit Matchers & Curly Quote Preservation', () => {
    it('matches exact and quote_normalized while preserving curly quote style', () => {
      const content = 'const greeting = \u201CHello World\u201D;\nconst single = \u2018It\u2019s fine\u2019;'
      const match = findEditMatch({
        content,
        search: 'const greeting = "Hello World";',
        replaceAll: false,
      })
      expect(match.status).toBe('matched')
      expect(match.strategy).toBe('quote_normalized')
      expect(match.actualString).toBe('const greeting = \u201CHello World\u201D;')

      const preserved = preserveQuoteStyle(
        'const greeting = "Hello World";',
        match.actualString,
        'const greeting = "Hello Aether";'
      )
      expect(preserved).toBe('const greeting = \u201CHello Aether\u201D;')
    })

    it('strips read_file line number prefixes (123: and 123\\t)', () => {
      const content = 'function add(a, b) {\n  return a + b;\n}\n'
      const searchWithLineNumbers = '10: function add(a, b) {\n11:   return a + b;\n12: }'
      const match = findEditMatch({
        content,
        search: searchWithLineNumbers,
        replaceAll: false,
      })
      expect(match.status).toBe('matched')
      expect(match.strategy).toBe('line_number_prefix_stripped')
      expect(match.actualString).toBe('function add(a, b) {\n  return a + b;\n}')

      const normNew = normalizeReplacementForMatch(
        match.strategy,
        '10: function add(a, b) {\n11:   return a + b + 1;\n12: }'
      )
      expect(normNew).toBe('function add(a, b) {\n  return a + b + 1;\n}')
    })

    it('matches unicode_escape_normalized and indentation_flexible and block_anchor', () => {
      const content = '    if (ready) {\n      console.log("中文测试");\n      doWork();\n    }'
      // Unicode escape test
      const unicodeMatch = findEditMatch({
        content,
        search: 'console.log("\\u4e2d\\u6587\\u6d4b\\u8bd5");',
        replaceAll: false,
      })
      expect(unicodeMatch.status).toBe('matched')
      expect(unicodeMatch.strategy).toBe('unicode_escape_normalized')

      // Indentation flexible test (uniform shift preserving relative indent: 0/2 spaces vs 4/6 spaces)
      const indentMatch = findEditMatch({
        content,
        search: 'if (ready) {\n  console.log("中文测试");\n  doWork();\n}',
        replaceAll: false,
      })
      expect(indentMatch.status).toBe('matched')
      expect(indentMatch.strategy).toBe('indentation_flexible')

      // Line trimmed test (non-uniform indent shift: 0/4 spaces vs 4/6 spaces)
      const trimmedMatch = findEditMatch({
        content,
        search: 'if (ready) {\n    console.log("中文测试");\n    doWork();\n}',
        replaceAll: false,
      })
      expect(trimmedMatch.status).toBe('matched')
      expect(trimmedMatch.strategy).toBe('line_trimmed')

      // Block anchor test (minor middle line difference >= 0.8 similarity)
      const anchorMatch = findEditMatch({
        content,
        search: 'if (ready) {\n  console.log("中文测试!");\n  doWork();\n}',
        replaceAll: false,
      })
      expect(anchorMatch.status).toBe('matched')
      expect(anchorMatch.strategy).toBe('block_anchor')
    })

    it('blocks broad matchers when replaceAll is true and flags ambiguous candidates', () => {
      const content = '  const x = 1;\n  const y = 2;\n\n    const x = 1;\n    const y = 2;'
      const broadBlocked = findEditMatch({
        content,
        search: 'const x = 1;\nconst y = 2;',
        replaceAll: true,
      })
      expect(broadBlocked.status).toBe('not_found')

      const ambiguousSingle = findEditMatch({
        content: 'const a = 1;\nconst a = 1;',
        search: 'const a = 1;',
        replaceAll: false,
      })
      expect(ambiguousSingle.status).toBe('ambiguous')
    })
  })

  describe('2. ReadFileState Mtime Guard & Latest-Slice Range Read Semantics', () => {
    beforeEach(() => {
      clearReadFileState()
    })

    it('detects external file modification after full read, and clears staleness after partial range re-read', () => {
      const sid = 'sess-mtime-1'
      const filePath = path.join(os.tmpdir(), 'aether-read-state-test.js')

      // 1. Full read at t=1000, mtime=1000
      recordReadFileState(sid, filePath, { offset: 1, mtimeMs: 1000, readAt: 1000 })
      expect(checkStaleReadBeforeEdit(sid, filePath, 1000).ok).toBe(true)

      // 2. External formatter modifies file on disk (mtime=2500)
      const stale = checkStaleReadBeforeEdit(sid, filePath, 2500)
      expect(stale.ok).toBe(false)
      expect(stale.stale).toBe(true)

      // 3. Model performs a partial range Read (offset=20, limit=10) at t=3000 seeing mtime=2500
      recordReadFileState(sid, filePath, { offset: 20, limit: 10, mtimeMs: 2500, readAt: 3000 })
      const latest = findLatestReadFileState(sid, filePath)
      expect(latest.offset).toBe(20)
      expect(latest.mtimeMs).toBe(2500)

      // 4. Subsequent Edit check uses latest readAt (2500) instead of stale full read (1000)
      expect(checkStaleReadBeforeEdit(sid, filePath, 2500).ok).toBe(true)
    })

    it('integrates end-to-end with read_file and edit_file in registry.js', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-edit-e2e-'))
      const targetFile = path.join(tmpDir, 'sample.ts')
      fs.writeFileSync(targetFile, 'export function greet() {\n  return \u201Chello\u201D;\n}\n', 'utf8')

      const readTool = getTool('read_file')
      const editTool = getTool('edit_file')
      const ctx = { sessionId: 'e2e-sess', agentMode: 'yolo' }

      readTool.run({ path: targetFile }, ctx)

      // Edit with line-number prefixes copied from Read output
      await editTool.run(
        {
          path: targetFile,
          old_string: '1: export function greet() {\n2:   return \u201Chello\u201D;\n3: }',
          new_string: '1: export function greet() {\n2:   return \u201Cworld\u201D;\n3: }',
        },
        ctx
      )

      const updated = fs.readFileSync(targetFile, 'utf8')
      expect(updated).toContain('return \u201Cworld\u201D;')
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })
  })

  describe('3. Zero-LLM-Cost Local Microcompact & Prompt Cache Ordering', () => {
    function buildToolConversation(groupCount, payloadSize = 800) {
      const messages = [{ role: 'system', content: 'Core system prompt' }]
      for (let i = 1; i <= groupCount; i += 1) {
        messages.push({
          role: 'assistant',
          content: '',
          tool_calls: [{ id: `tc_${i}`, function: { name: 'read_file', arguments: '{"path":"a.js"}' } }],
        })
        messages.push({
          role: 'tool',
          tool_call_id: `tc_${i}`,
          name: 'read_file',
          content: `File content chunk #${i}: ` + 'x'.repeat(payloadSize),
        })
      }
      return messages
    }

    it('clears tool outputs older than keepRecentToolResults=5 on token pressure or >60min cache-TTL idle', () => {
      const msgs = buildToolConversation(8, 600)

      // 1. Not triggered when tokens are low and idle < 60 min
      const noTrigger = maybeLocalMicrocompactMessages({
        messages: msgs,
        lastAssistantCompletedAtMs: Date.now() - 5 * 60_000,
        nowMs: Date.now(),
        config: { thresholdTokens: 50_000 },
      })
      expect(noTrigger.decision.reason).toBe('not_triggered')

      // 2. Triggered by >60 min cache-TTL idle expiry even below token threshold
      const idleTriggered = maybeLocalMicrocompactMessages({
        messages: msgs,
        lastAssistantCompletedAtMs: Date.now() - 65 * 60_000,
        nowMs: Date.now(),
        config: { thresholdTokens: 50_000, keepRecentToolResults: 5, minTokenSavings: 100 },
      })
      expect(idleTriggered.decision.reason).toBe('applied')
      expect(idleTriggered.payload.trigger).toBe('time_based')
      expect(idleTriggered.payload.clearedMessageCount).toBe(3) // 8 groups - 5 kept = 3 cleared

      const toolMsgs = idleTriggered.messages.filter((m) => m.role === 'tool')
      expect(toolMsgs[0].content).toBe(MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE)
      expect(toolMsgs[1].content).toBe(MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE)
      expect(toolMsgs[2].content).toBe(MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE)
      expect(toolMsgs[3].content).toContain('File content chunk #4:')
      expect(toolMsgs[7].content).toContain('File content chunk #8:')
    })

    it('orders stable system messages before dynamic blocks and enforces subagent tool-boundary allowlist', () => {
      const unordered = [
        { role: 'system', content: '<relevant_memories>\n- user likes dark mode\n</relevant_memories>' },
        { role: 'system', content: 'You are Aether core agent.', cacheHint: 'stable' },
        { role: 'system', content: '[Workspace Context: AGENTS.md]\nHard rules...', cacheHint: 'stable' },
        { role: 'user', content: 'hi' },
      ]
      const ordered = orderSystemMessagesForCache(unordered)
      expect(ordered[0].content).toBe('You are Aether core agent.')
      expect(ordered[1].content).toContain('[Workspace Context: AGENTS.md]')
      expect(ordered[2].content).toContain('<relevant_memories>')
      expect(ordered[3].role).toBe('user')

      expect(evaluateToolBoundaryAllowlist('read_file', ['read_file', 'grep_search']).allowed).toBe(true)
      const denied = evaluateToolBoundaryAllowlist('run_command', ['read_file', 'grep_search'])
      expect(denied.allowed).toBe(false)
      expect(denied.reason).toContain('<tool_use_error>')
    })
  })

  describe('4. Background Task branchGeneration Rollback Guard & Notification Coalescing', () => {
    it('coalesces multiple same-priority task notifications and discards stale branchGeneration items on rollback', () => {
      const sid = 'sess-branch-test'
      const gen0 = getBranchGeneration(sid)

      enqueueTaskNotification({
        taskId: 101,
        parentSessionId: sid,
        priority: 1,
        branchGeneration: gen0,
        status: 'done',
        title: 'Scan repo A',
        finalContent: 'Found 3 files',
      })
      enqueueTaskNotification({
        taskId: 102,
        parentSessionId: sid,
        priority: 1,
        branchGeneration: gen0,
        status: 'done',
        title: 'Scan repo B',
        finalContent: 'Found 5 files',
      })

      const batch = dequeueCompletedBatch(sid)
      expect(batch.length).toBe(2)
      const formatted = formatNotificationBatch(batch)
      expect(formatted).toContain('2 coalesced')
      expect(formatted).toContain('Task #101')
      expect(formatted).toContain('Task #102')

      // Enqueue an in-flight notification at gen0, then simulate user rollback (bumpBranchGeneration)
      enqueueTaskNotification({
        taskId: 103,
        parentSessionId: sid,
        priority: 1,
        branchGeneration: gen0,
        status: 'done',
        title: 'Stale task before rollback',
        finalContent: 'Should be purged',
      })
      const gen1 = bumpBranchGeneration(sid)
      expect(gen1).toBe(gen0 + 1)

      // Late-arriving notification from gen0 is rejected
      const accepted = enqueueTaskNotification({
        taskId: 104,
        parentSessionId: sid,
        priority: 1,
        branchGeneration: gen0,
        status: 'done',
        title: 'Late ghost task',
      })
      expect(accepted).toBe(false)
      expect(dequeueCompletedBatch(sid).length).toBe(0)
    })
  })

  describe('5. Paperclip + ZCode UI Design & Architecture Gate (check-ui-tokens.js)', () => {
    it('passes all 3 UI token & line-count ratchet gates across app/src', () => {
      const result = scanUiTokens()
      expect(result.filesScanned).toBeGreaterThan(50)
      expect(result.totalViolations).toBe(0)
    })
  })

  describe('6. Plan Auto-Progression & Stream Completion Finalization (planning.js)', () => {
    it('automatically advances steps across tool rounds and finalizes all remaining tasks upon completion', () => {
      const planning = require('../electron/llm/planning')
      const plan = {
        id: 'plan_test',
        description: 'Multi-step refactor',
        tasks: [
          { id: '1', description: 'Read source files', status: 'in_progress', result: null },
          { id: '2', description: 'Edit target module', status: 'pending', result: null },
          { id: '3', description: 'Run unit tests', status: 'pending', result: null },
        ],
      }

      // Round 1 tool execution (without explicit plan_progress call) -> Task 1 completed, Task 2 in_progress
      const advanced1 = planning.advancePlanOnToolRound(plan, [
        { entry: { name: 'read_file', error: null } },
      ])
      expect(advanced1).toBe(true)
      expect(plan.tasks[0].status).toBe('completed')
      expect(plan.tasks[1].status).toBe('in_progress')
      expect(plan.tasks[2].status).toBe('pending')

      // Round 2 tool execution -> Task 2 completed, Task 3 in_progress
      const advanced2 = planning.advancePlanOnToolRound(plan, [
        { entry: { name: 'edit_file', error: null } },
      ])
      expect(advanced2).toBe(true)
      expect(plan.tasks[1].status).toBe('completed')
      expect(plan.tasks[2].status).toBe('in_progress')

      // Finalize on completion -> all tasks completed (never stuck on step 1)
      const finalized = planning.finalizePlanOnComplete(plan)
      expect(finalized).toBe(true)
      expect(plan.tasks.every((t) => t.status === 'completed')).toBe(true)
    })
  })
})

