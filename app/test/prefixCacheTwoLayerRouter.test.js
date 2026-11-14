import { describe, it, expect, afterAll } from 'vitest'
import { createRequire } from 'module'
import Module from 'module'
import os from 'os'
import path from 'path'
import fs from 'fs'

const require = createRequire(import.meta.url)
const capturedRequests = []
let mockTurnHandler = null

const origLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { app: { getPath: () => os.tmpdir() } }
  }
  if (request.endsWith('providerAdapter') || request.endsWith('providerAdapter.js')) {
    return {
      completeChatMessage: async (req) => {
        capturedRequests.push({
          messages: JSON.parse(JSON.stringify(req.messages || [])),
          tools: JSON.parse(JSON.stringify((req.options && req.options.tools) || [])),
        })
        if (typeof mockTurnHandler === 'function') {
          return mockTurnHandler(capturedRequests.length - 1, req)
        }
        return { role: 'assistant', content: 'done', usage: { prompt_tokens: 50, completion_tokens: 10 } }
      },
    }
  }
  return origLoad.apply(this, arguments)
}

const {
  CORE_10_TOOLS,
  STAGE_TOOL_POOLS,
  getStageToolPool,
  getFixedCorePayload,
  buildExtendedToolIndex,
} = require('../electron/llm/toolRouter')
const registry = require('../electron/tools/registry')
const agentRoles = require('../electron/llm/agentRoles')
const toolCallRepair = require('../electron/llm/toolCallRepair')
const { healOrphanToolCalls } = require('../electron/llm/toolLoopUtils')
const { runToolLoop } = require('../electron/llm/toolLoop')

afterAll(() => {
  Module._load = origLoad
})

describe('Prefix-Cache-Safe Two-Layer Tool Router', () => {
  it('fixes main-agent payload to the exact 10 core schemas in auto mode and read-only subset in plan mode', () => {
    expect(CORE_10_TOOLS).toEqual([
      'read_file',
      'edit_file',
      'write_file',
      'grep_search',
      'glob_files',
      'run_command',
      'ask_user',
      'session_plan',
      'dispatch_subagent',
      'call_extended_tool',
    ])

    const fullPayload = registry.toolsPayload('auto')
    const coreAuto = getFixedCorePayload(fullPayload, 'auto')
    expect(coreAuto.map(t => t.function.name)).toEqual([...CORE_10_TOOLS])

    const corePlan = getFixedCorePayload(fullPayload, 'plan')
    const planNames = corePlan.map(t => t.function.name)
    expect(planNames).toContain('read_file')
    expect(planNames).toContain('grep_search')
    expect(planNames).toContain('glob_files')
    expect(planNames).toContain('ask_user')
    expect(planNames).toContain('session_plan')
    expect(planNames).toContain('call_extended_tool')
    expect(planNames).not.toContain('edit_file')
    expect(planNames).not.toContain('write_file')
    expect(planNames).not.toContain('run_command')
    expect(planNames).not.toContain('dispatch_subagent')
  })

  it('builds a compact one-line extended tool index excluding the 10 core tools', () => {
    const fullPayload = registry.toolsPayload('auto')
    const indexLine = buildExtendedToolIndex(fullPayload)
    expect(indexLine).toContain('[Extended Tools via call_extended_tool(tool_name, arguments)]:')
    expect(indexLine).toContain('lsp_diagnostics')
    expect(indexLine).toContain('github_issue_list')
    expect(indexLine).not.toContain('read_file,')
    expect(indexLine).not.toContain('call_extended_tool,')
    expect(indexLine.includes('\n')).toBe(false)
  })

  it('maps stage/capability tool pools and agentRoles (explorer, implementer, hunter, verifier)', () => {
    expect(getStageToolPool('Diagnose')).toContain('lsp_diagnostics')
    expect(getStageToolPool('Search')).toContain('codebase_graph')
    expect(getStageToolPool('Edit')).toContain('apply_patch')
    expect(getStageToolPool('Verify')).toContain('review_code')
    expect(getStageToolPool('Security')).toContain('audit_agent_bundle')
    expect(getStageToolPool('Arena')).toContain('run_arena')
    expect(Object.keys(STAGE_TOOL_POOLS)).toEqual(['Diagnose', 'Search', 'Edit', 'Verify', 'Security', 'Arena'])

    for (const role of ['explore', 'explorer', 'implementer', 'hunter', 'verifier']) {
      const r = agentRoles.getRole(role)
      expect(r).toBeTruthy()
      const filter = agentRoles.buildToolFilter(role)
      expect(Array.isArray(filter)).toBe(true)
      expect(filter.length).toBeGreaterThan(0)
    }
    expect(agentRoles.getRole('explorer').readOnly).toBe(true)
    expect(agentRoles.getRole('hunter').readOnly).toBe(true)
    expect(agentRoles.getRole('verifier').readOnly).toBe(true)
    expect(agentRoles.getRole('implementer').readOnly).toBe(false)
  })

  it('call_extended_tool enforces read-only blocking in plan mode and executes safe tools with middleware', async () => {
    const gw = registry.getTool('call_extended_tool')
    expect(gw).toBeTruthy()

    const blocked = await gw.run(
      { tool_name: 'github_pr_create', arguments: { title: 'x' } },
      { agentMode: 'plan' }
    )
    expect(blocked).toContain('[BLOCKED]')

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-ext-'))
    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'world', 'utf8')
    const listed = await gw.run(
      { tool_name: 'list_dir', arguments: { path: tmpDir } },
      { agentMode: 'auto' }
    )
    expect(listed).toContain('hello.txt')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('toolCallRepair repairs malformed JSON and scavenges reasoning calls for new core-10 tools', () => {
    const repaired = toolCallRepair.repairToolCalls([
      {
        id: 'tc_1',
        type: 'function',
        function: { name: 'call_extended_tool', arguments: '{tool_name: list_dir,}' },
      },
      {
        id: 'tc_2',
        type: 'function',
        function: { name: 'glob_files', arguments: '{pattern: **/*.js,}' },
      },
    ])
    expect(repaired.length).toBe(2)
    expect(JSON.parse(repaired[0].function.arguments)).toEqual({ tool_name: 'list_dir' })
    expect(JSON.parse(repaired[1].function.arguments)).toEqual({ pattern: '**/*.js' })

    const scavenged = toolCallRepair.scavengeToolCallsFromReasoning(
      {
        reasoning_content: '<tool_call>{"name":"dispatch_subagent","arguments":{"role":"explorer","task":"find routes"}}</tool_call>',
      },
      new Set(CORE_10_TOOLS)
    )
    expect(scavenged.scavengedCount).toBe(1)
    expect(scavenged[0].function.name).toBe('dispatch_subagent')
  })

  it('healOrphanToolCalls heals unanswered assistant tool_calls and drops orphan tool results', () => {
    const valid = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'tc_ok', type: 'function', function: { name: 'read_file', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'tc_ok', content: 'ok' },
    ]
    expect(healOrphanToolCalls(valid)).toBe(valid)

    const broken = [
      { role: 'user', content: 'hi' },
      { role: 'tool', tool_call_id: 'tc_orphan_result', content: 'stray' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'tc_missing', type: 'function', function: { name: 'read_file', arguments: '{}' } }] },
      { role: 'user', content: 'continue' },
    ]
    const healed = healOrphanToolCalls(broken)
    expect(healed.some(m => m.tool_call_id === 'tc_orphan_result')).toBe(false)
    const idx = healed.findIndex(m => m.role === 'assistant')
    expect(healed[idx + 1]).toEqual({
      role: 'tool',
      tool_call_id: 'tc_missing',
      content: '[tool call interrupted — no result recorded]',
    })
  })

  it('runToolLoop keeps top-level tools fixed to 10 schemas across rounds and forwards call_extended_tool', async () => {
    capturedRequests.length = 0
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-loop-10-'))
    fs.writeFileSync(path.join(tmpDir, 'sample.txt'), 'secret_token=sk-1234567890123456789012345', 'utf8')

    mockTurnHandler = (turnIdx) => {
      if (turnIdx === 0) {
        return {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'tc_ext_1',
            type: 'function',
            function: {
              name: 'call_extended_tool',
              arguments: JSON.stringify({ tool_name: 'list_dir', arguments: { path: tmpDir } }),
            },
          }],
        }
      }
      if (turnIdx === 1) {
        return {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'tc_core_2',
            type: 'function',
            function: {
              name: 'read_file',
              arguments: JSON.stringify({ path: path.join(tmpDir, 'sample.txt') }),
            },
          }],
        }
      }
      return { role: 'assistant', content: 'Completed with 10-tool prefix cache.' }
    }

    const fakeDb = {
      getSetting: (k) => (k === 'feature_flag.agent.toolRouter' ? '1' : null),
    }

    const res = await runToolLoop({
      provider: { id: 'mock', api_format: 'openai' },
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'list directory and inspect file' }],
      agentMode: 'act',
      workspaceRoot: tmpDir,
      sessionId: 99123,
      db: fakeDb,
      maxIterations: 5,
    })

    expect(res).toContain('Completed with 10-tool prefix cache')
    expect(capturedRequests.length).toBe(3)
    for (const req of capturedRequests) {
      expect(req.tools.map(t => t.function.name)).toEqual([...CORE_10_TOOLS])
      const sysText = req.messages.filter(m => m.role === 'system').map(m => m.content).join('\n')
      expect(sysText).toContain('[Extended Tools via call_extended_tool(tool_name, arguments)]:')
    }
    // Verify toolResultMiddleware redacted the secret from read_file
    const lastToolMsgs = capturedRequests[2].messages.filter(m => m.role === 'tool')
    expect(lastToolMsgs[1].content).toContain('[REDACTED]')
    expect(lastToolMsgs[1].content).not.toContain('sk-1234567890123456789012345')

    fs.rmSync(tmpDir, { recursive: true, force: true })
  }, 15000)
})
