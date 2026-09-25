import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const modelRouter = require('../electron/llm/modelRouter')
const toolCallRepair = require('../electron/llm/toolCallRepair')
const workflow = require('../electron/llm/workflow')
const agentRoles = require('../electron/llm/agentRoles')
const subAgent = require('../electron/llm/subAgent')

describe('P1 Optimizations (P1-1, P1-2, P1-3, P1-4)', () => {
  beforeEach(() => {
    modelRouter.clearEscalationAuditLog()
  })

  describe('P1-1: Auxiliary Calls Flash-First & Visible Escalation', () => {
    it('routes auxiliary calls (compaction / autoMemory / title_gen) to FAST_RE model when available', () => {
      const fakeDb = {
        getSetting: () => null,
        listProviders: () => [{ id: 1, name: 'TestProv', enabled: 1 }],
        listModels: () => [
          { id: 10, provider_id: 1, model_name: 'claude-opus-4', enabled: 1 },
          { id: 11, provider_id: 1, model_name: 'gemini-2.5-flash', enabled: 1 },
        ],
      }
      const fallbackProvider = { id: 1, name: 'TestProv' }
      const fallbackModel = { id: 10, provider_id: 1, model_name: 'claude-opus-4' }
      const onEscalation = vi.fn()

      const target = modelRouter.resolveAuxiliaryTarget(
        fakeDb,
        fallbackProvider,
        fallbackModel,
        'compaction',
        onEscalation
      )

      expect(target.tier).toBe('fast')
      expect(target.escalated).toBe(false)
      expect(target.model.model_name).toBe('gemini-2.5-flash')
      expect(onEscalation).not.toHaveBeenCalled()
    })

    it('records visible escalation audit & triggers UI callback when no FAST_RE model exists', () => {
      const fakeDb = {
        getSetting: () => null,
        listProviders: () => [{ id: 1, name: 'TestProv', enabled: 1 }],
        listModels: () => [
          { id: 10, provider_id: 1, model_name: 'claude-opus-4', enabled: 1 },
        ],
      }
      const fallbackProvider = { id: 1, name: 'TestProv' }
      const fallbackModel = { id: 10, provider_id: 1, model_name: 'claude-opus-4' }
      const onEscalation = vi.fn()

      const target = modelRouter.resolveAuxiliaryTarget(
        fakeDb,
        fallbackProvider,
        fallbackModel,
        'title_gen',
        onEscalation
      )

      expect(target.escalated).toBe(true)
      expect(target.model.model_name).toBe('claude-opus-4')
      expect(onEscalation).toHaveBeenCalledTimes(1)
      expect(onEscalation.mock.calls[0][0]).toMatchObject({
        taskKind: 'title_gen',
        fromModel: 'fast-tier (unavailable)',
        toModel: 'claude-opus-4',
        reason: 'no_fast_model_in_pool',
      })

      const auditLog = modelRouter.getEscalationAuditLog()
      expect(auditLog.length).toBeGreaterThanOrEqual(1)
      expect(auditLog[auditLog.length - 1].taskKind).toBe('title_gen')
    })
  })

  describe('P1-2: toolCallRepair Scavenger & Truncated JSON Continuation', () => {
    it('scavenges tool calls leaked into reasoning_content (fenced JSON and <tool_call> tags)', () => {
      const msg = {
        content: 'I will check the file.',
        tool_calls: [],
        reasoning_content: `Let me inspect package.json first.\n\`\`\`json\n{"name": "read_file", "arguments": {"path": "package.json"}}\n\`\`\`\nAnd also <tool_call>{"name": "list_dir", "arguments": {"path": "src"}}</tool_call>`,
      }

      const res = toolCallRepair.scavengeToolCallsFromReasoning(msg, ['read_file', 'list_dir', 'write_file'])
      expect(res.scavengedCount).toBe(2)
      expect(res.tool_calls).toHaveLength(2)
      expect(res.tool_calls[0].function.name).toBe('read_file')
      expect(JSON.parse(res.tool_calls[0].function.arguments)).toEqual({ path: 'package.json' })
      expect(res.tool_calls[1].function.name).toBe('list_dir')
      expect(JSON.parse(res.tool_calls[1].function.arguments)).toEqual({ path: 'src' })
    })

    it('continues truncated JSON tool call arguments when finish_reason === "length"', async () => {
      const msg = {
        content: '',
        finish_reason: 'length',
        tool_calls: [
          {
            id: 'call_trunc_1',
            type: 'function',
            function: {
              name: 'write_file',
              arguments: '{"path":"src/hello.js","content":"console.log(1',
            },
          },
        ],
      }

      const completeFn = vi.fn().mockResolvedValue({
        content: ');"}',
      })

      const res = await toolCallRepair.continueTruncatedToolCalls(msg, {
        completeFn,
        provider: { id: 1 },
        model: { model_name: 'test-model' },
      })

      expect(res.continuedCount).toBe(1)
      expect(completeFn).toHaveBeenCalledTimes(1)
      const parsed = JSON.parse(msg.tool_calls[0].function.arguments)
      expect(parsed).toEqual({ path: 'src/hello.js', content: 'console.log(1);' })
    })

    it('closes truncated JSON via structural balance when continuation call is unavailable', async () => {
      const closed = toolCallRepair.closeTruncatedJson('{"path":"src/app.js","lines":["a","b')
      expect(JSON.parse(closed)).toEqual({ path: 'src/app.js', lines: ['a', 'b'] })
    })
  })

  describe('P1-3: Declarative Workflows (.aether/workflows/*.json) + broadcast & cycle', () => {
    it('loads externalized workflows from .aether/workflows/*.json', () => {
      const templates = workflow.loadWorkflowsFromDisk()
      expect(templates.feature).toBeDefined()
      expect(templates.bugfix).toBeDefined()
      expect(templates.refactor).toBeDefined()
      expect(templates.explore).toBeDefined()
      expect(templates['broadcast-review']).toBeDefined()
      expect(templates['tdd-cycle']).toBeDefined()
    })

    it('executes broadcast step concurrently via subAgent.runParallel and cycle step until completion condition matches', async () => {
      const parallelSpy = vi.spyOn(subAgent, 'runParallel').mockResolvedValue([
        { content: 'Explore perspective: architecture is clean.', childSessionId: 'c1', wasTimeout: false },
        { content: 'Review perspective: no critical issues.', childSessionId: 'c2', wasTimeout: false },
        { content: 'Debug perspective: edge cases handled.', childSessionId: 'c3', wasTimeout: false },
      ])

      let subagentCallCount = 0
      const subagentSpy = vi.spyOn(subAgent, 'runSubagent').mockImplementation(async () => {
        subagentCallCount++
        // On the 3rd subagent call (Diagnose=1, Cycle1.fix=2, Cycle1.verify=3), emit VERIFIED_OK so cycle finishes in 1 cycle instead of 3!
        const text = subagentCallCount >= 3
          ? 'All checks passed. VERIFIED_OK'
          : `Step output #${subagentCallCount}`
        return { content: text, childSessionId: `sub_${subagentCallCount}`, wasTimeout: false }
      })

      const bcastRes = await workflow.runWorkflow({
        db: null,
        provider: { id: 1 },
        model: { model_name: 'test' },
        templateName: 'broadcast-review',
        userRequest: 'Audit auth module',
      })

      expect(bcastRes.ok).toBe(true)
      expect(parallelSpy).toHaveBeenCalledTimes(1)
      expect(bcastRes.trace[0].kind).toBe('broadcast')
      expect(bcastRes.trace[0].output).toContain('Broadcast Role: explore')
      expect(bcastRes.trace[0].output).toContain('Broadcast Role: review')

      subagentCallCount = 0
      const cycleRes = await workflow.runWorkflow({
        db: null,
        provider: { id: 1 },
        model: { model_name: 'test' },
        templateName: 'tdd-cycle',
        userRequest: 'Fix parser bug',
      })

      expect(cycleRes.ok).toBe(true)
      const cycleStepTrace = cycleRes.trace[1]
      expect(cycleStepTrace.kind).toBe('cycle')
      expect(cycleStepTrace.conditionMet).toBe(true)
      expect(cycleStepTrace.cyclesUsed).toBe(1) // Early exit after Cycle 1 met VERIFIED_OK!

      parallelSpy.mockRestore()
      subagentSpy.mockRestore()
    })
  })

  describe('P1-4: Externalized Agent Roles (.aether/agents/*.md) with Frontmatter', () => {
    it('loads .aether/agents/*.md and parses model, effort, readOnly, and allowTools', () => {
      const diskRoles = agentRoles.loadRolesFromDisk()
      expect(diskRoles.explore).toBeDefined()
      expect(diskRoles.explore.readOnly).toBe(true)
      expect(diskRoles.explore.defaultMode).toBe('plan')
      expect(diskRoles.explore.model).toBe('fast')
      expect(diskRoles.explore.effort).toBe('low')
      expect(diskRoles.explore.allowTools).toContain('read_file')

      expect(diskRoles.build).toBeDefined()
      expect(diskRoles.build.readOnly).toBe(false)
      expect(diskRoles.build.defaultMode).toBe('auto')
      expect(diskRoles.build.allowTools).toBeNull()

      expect(diskRoles.review).toBeDefined()
      expect(diskRoles.review.readOnly).toBe(true)
      expect(diskRoles.review.effort).toBe('high')
    })
  })
})
