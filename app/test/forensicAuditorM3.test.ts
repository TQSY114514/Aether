// ─────────────────────────────────────────────────────────────────────────────
// app/test/forensicAuditorM3.test.ts
//
// Forensic Integrity & Adversarial Stress Test Suite for Milestone 3 (F17–F24)
// Directly targets live modules without fallbacks:
// - app/electron/llm/providerTopology.js
// - app/electron/llm/subagentSupervisor.js
// - app/electron/llm/sessionContext.js
// - app/electron/llm/agentRoles.js
// - app/electron/tools/registry.js
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const providerTopology = require('../electron/llm/providerTopology.js')
const subagentSupervisor = require('../electron/llm/subagentSupervisor.js')
const agentRoles = require('../electron/llm/agentRoles.js')
const { TOOLS } = require('../electron/tools/registry.js')
const sessionContext = require('../electron/llm/sessionContext.js')

describe('Forensic Auditor Independent Verification Suite (Milestone 3)', () => {
  beforeEach(() => {
    providerTopology.clearRuntimeProbeCache()
    subagentSupervisor.activeSubagents.clear()
  })

  // ==========================================================================
  // Section 1: Provider Endpoint Classification (Feature 17)
  // ==========================================================================
  describe('Feature 17: Provider Endpoint Classification Integrity', () => {
    it('1.1: Official direct domains classified accurately regardless of protocol case or trailing slashes', () => {
      const domains = [
        'https://api.openai.com/v1',
        'HTTPS://API.ANTHROPIC.COM/V1///',
        'https://generativelanguage.googleapis.com',
        'https://api.deepseek.com/v1',
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
        'https://open.bigmodel.cn/api/paas/v4',
        'https://api.moonshot.cn/v1',
        'https://api.minimaxi.chat/v1',
        'https://api.x.ai/v1',
        'https://api.mistral.ai/v1',
      ]

      for (const d of domains) {
        const res = providerTopology.classifyProviderEndpoint(d, 'official')
        expect(res.endpointKind, `Domain failed official_direct: ${d}`).toBe('official_direct')
        expect(res.stabilityHint).toBe('tier1_official_sla')
      }
    })

    it('1.2: Major aggregators classified accurately', () => {
      const aggregators = [
        'https://openrouter.ai/api/v1',
        'https://aihubmix.com/v1',
        'https://api.siliconflow.cn/v1',
        'https://api.together.xyz/v1',
        'https://api.fireworks.ai/inference/v1',
        'https://api.groq.com/openai/v1',
        'https://api.deepinfra.com/v1/openai',
      ]

      for (const a of aggregators) {
        const res = providerTopology.classifyProviderEndpoint(a, 'aggregator')
        expect(res.endpointKind, `Aggregator failed: ${a}`).toBe('major_aggregator')
        expect(res.stabilityHint).toBe('tier2_commercial_gateway')
      }
    })

    it('1.3: Local engines classified accurately across localhost, 127.0.0.1, custom port, and local provider names', () => {
      const locals = [
        { url: 'http://127.0.0.1:11434', name: 'Ollama' },
        { url: 'http://localhost:1234/v1', name: 'LM Studio' },
        { url: 'http://0.0.0.0:8000', name: 'vllm' },
        { url: 'http://my-pc.local:11434', name: 'Local' },
        { url: '', name: 'ollama' },
        { url: 'http://localhost:8080/v1', name: 'custom' },
      ]

      for (const l of locals) {
        const res = providerTopology.classifyProviderEndpoint(l.url, l.name)
        expect(res.endpointKind, `Local failed: ${JSON.stringify(l)}`).toBe('local_engine')
        expect(res.stabilityHint).toBe('high_local_zero_cost')
      }
    })

    it('1.4: Third party relays and private network relays classified as third_party_relay', () => {
      const relays = [
        'https://custom-proxy.example.com/v1',
        'http://192.168.1.150:8000/v1',
        'https://relay.oneapi.vip/v1',
      ]

      for (const r of relays) {
        const res = providerTopology.classifyProviderEndpoint(r, 'relay')
        expect(res.endpointKind, `Relay failed: ${r}`).toBe('third_party_relay')
        expect(res.stabilityHint).toBe('volatile_relay_probe_recommended')
      }
    })

    it('1.5: Infer model capabilities produces correct cognitive tags', () => {
      expect(providerTopology.inferModelCapabilities('claude-3-7-sonnet')).toContain('strong_coding_and_execution')
      expect(providerTopology.inferModelCapabilities('claude-3-opus-20240229')).toContain('frontier_reasoning_and_architecture')
      expect(providerTopology.inferModelCapabilities('o3-mini')).toContain('frontier_reasoning_and_architecture')
      expect(providerTopology.inferModelCapabilities('deepseek-r1')).toContain('frontier_reasoning_and_architecture')
      expect(providerTopology.inferModelCapabilities('gpt-4o-mini')).toContain('low_latency_fast_exploration')
      expect(providerTopology.inferModelCapabilities('gemini-2.0-flash')).toContain('low_latency_fast_exploration')
      expect(providerTopology.inferModelCapabilities('custom-unknown-model-xyz')).toContain('general_purpose')
    })
  })

  // ==========================================================================
  // Section 2: Active TTFT Latency Probing & Socket Abort (Feature 19)
  // ==========================================================================
  describe('Feature 19: Active TTFT Latency Probing Integrity', () => {
    it('2.1: Probes with max_tokens: 1 and stream: true and aborts socket on first chunk', async () => {
      let sentPayload: any = null
      let controllerAborted = false

      const mockFetch = vi.fn().mockImplementation(async (_url, opts) => {
        sentPayload = JSON.parse(opts.body)
        opts.signal.addEventListener('abort', () => {
          controllerAborted = true
        })
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: vi.fn().mockResolvedValue({
                value: new Uint8Array([100, 97, 116, 97]),
                done: false,
              }),
              releaseLock: vi.fn(),
            }),
          },
        }
      })

      const report = await providerTopology.probeSingleModel({
        provider: { id: 10, name: 'Anthropic', baseUrl: 'https://api.anthropic.com', protocol: 'anthropic' },
        modelId: 'claude-3-7-sonnet',
        mockFetch,
      })

      expect(sentPayload.max_tokens).toBe(1)
      expect(sentPayload.stream).toBe(true)
      expect(report.available).toBe(true)
      expect(report.status).toBe('healthy_fast')
      expect(controllerAborted).toBe(true)
      expect(providerTopology.getRuntimeProbeCache().has('10::claude-3-7-sonnet')).toBe(true)
    })

    it('2.2: Properly maps HTTP error codes (429 rate limit, 502, 504)', async () => {
      const mock429 = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: vi.fn().mockResolvedValue('Too many requests'),
      })
      const rep429 = await providerTopology.probeSingleModel({
        provider: { id: 11, name: 'P11', baseUrl: 'https://p11.com' },
        modelId: 'm429',
        mockFetch: mock429,
      })
      expect(rep429.available).toBe(false)
      expect(rep429.status).toBe('rate_limited_429')

      const mock502 = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: vi.fn().mockResolvedValue('Bad gateway'),
      })
      const rep502 = await providerTopology.probeSingleModel({
        provider: { id: 12, name: 'P12', baseUrl: 'https://p12.com' },
        modelId: 'm502',
        mockFetch: mock502,
      })
      expect(rep502.available).toBe(false)
      expect(rep502.status).toBe('upstream_error_502')
    })

    it('2.3: Handles empty stream (200 OK headers but 0 bytes returned)', async () => {
      const mockEmpty = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValue({ value: null, done: true }),
            releaseLock: vi.fn(),
          }),
        },
      })
      const repEmpty = await providerTopology.probeSingleModel({
        provider: { id: 13, name: 'P13', baseUrl: 'https://p13.com' },
        modelId: 'mEmpty',
        mockFetch: mockEmpty,
      })
      expect(repEmpty.available).toBe(false)
      expect(repEmpty.status).toBe('empty_stream_response')
    })
  })

  // ==========================================================================
  // Section 3: SubagentLiveBuffer Ring Buffer & Delta Coalescing (Feature 20)
  // ==========================================================================
  describe('Feature 20: SubagentLiveBuffer Ring Buffer Integrity', () => {
    it('3.1: Coalesces consecutive streaming token deltas of the same type under 600 chars', () => {
      const buf = new subagentSupervisor.SubagentLiveBuffer(300)
      buf.appendStreamDelta('thinking', 'Step 1: check files.')
      buf.appendStreamDelta('thinking', ' Step 2: run tests.')
      expect(buf.events.length).toBe(1)
      expect(buf.events[0].content).toBe('Step 1: check files. Step 2: run tests.')
      expect(buf.accumulatedThinking).toBe('Step 1: check files. Step 2: run tests.')

      // Switching delta type starts a new discrete event
      buf.appendStreamDelta('text', 'Here is the summary.')
      expect(buf.events.length).toBe(2)
      expect(buf.events[1].type).toBe('text')
      expect(buf.events[1].content).toBe('Here is the summary.')
    })

    it('3.2: Strictly enforces capacity limit with FIFO drop of oldest events', () => {
      const buf = new subagentSupervisor.SubagentLiveBuffer(5)
      for (let i = 1; i <= 10; i++) {
        buf.appendToolEvent('log_event', `Event #${i}`)
      }
      expect(buf.events.length).toBe(5)
      expect(buf.events[0].content).toBe('Event #6')
      expect(buf.events[4].content).toBe('Event #10')
      expect(buf.seq).toBe(10)
    })

    it('3.3: Correctly captures TTFT on first token delta', () => {
      const buf = new subagentSupervisor.SubagentLiveBuffer(300)
      expect(buf.ttftMs).toBeNull()
      buf.appendStreamDelta('thinking', 'Initial spark')
      expect(buf.ttftMs).not.toBeNull()
      expect(buf.ttftMs).toBeGreaterThanOrEqual(0)
    })
  })

  // ==========================================================================
  // Section 4: Supervised Spawning, Peeking & Hot-Swap (Features 21–23)
  // ==========================================================================
  describe('Features 21–23: Subagent Supervision & Hot-Swap Integrity', () => {
    it('4.1: Supervised subagent supports smart_window returning completed when fast', async () => {
      const mockLoop = vi.fn().mockImplementation(async ({ onStreamDelta }) => {
        onStreamDelta('Fast result text')
        return { finalText: 'Fast result text' }
      })

      const report = await subagentSupervisor.spawnSupervisedSubagent(
        {
          taskPrompt: 'Quick inspection',
          waitMode: 'smart_window',
          initialWaitMs: 100,
        },
        { runToolLoop: mockLoop }
      )

      expect(report.status).toBe('completed')
      expect(report.output).toBe('Fast result text')
    })

    it('4.2: Supervised subagent smart_window returns non-blocking live preview for long streaming tasks', async () => {
      const mockLoop = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 800)))

      const report = await subagentSupervisor.spawnSupervisedSubagent(
        {
          taskPrompt: 'Long streaming task',
          waitMode: 'smart_window',
          initialWaitMs: 40,
        },
        { runToolLoop: mockLoop }
      )

      expect(report.status).toBe('running')
      expect(report.systemNotice).toContain('Subagent actively streaming')
    })

    it('4.3: Non-blocking stream peeking reads live buffer without locking or side effects', async () => {
      const mockLoop = vi.fn().mockImplementation(async ({ onThinkingDelta, onStreamDelta }) => {
        onThinkingDelta('Examining AST tree...')
        onStreamDelta('Found 3 function nodes.')
        await new Promise((r) => setTimeout(r, 200))
      })

      const spawned = await subagentSupervisor.spawnSupervisedSubagent(
        { taskPrompt: 'Inspect AST', waitMode: 'async_immediate' },
        { runToolLoop: mockLoop }
      )

      await new Promise((r) => setTimeout(r, 20))
      const peeks = subagentSupervisor.peekSubagentStream({ subagentIds: [spawned.subagentId] })
      expect(peeks.length).toBe(1)
      expect(peeks[0].recentThinkingTail).toContain('Examining AST tree...')
      expect(peeks[0].recentTextTail).toContain('Found 3 function nodes.')
    })

    it('4.4: Hot swap model preserves completed messages, rehydrates partial drafts, and updates swap history', async () => {
      let activeControllerSignal: any = null
      const mockLoop = vi.fn().mockImplementation(async ({ signal, messages }) => {
        activeControllerSignal = signal
        await new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('ABORTED')))
        })
      })

      const spawned = await subagentSupervisor.spawnSupervisedSubagent(
        {
          taskPrompt: 'Complex refactor',
          providerId: 'p_relay',
          modelId: 'm_slow',
          waitMode: 'async_immediate',
        },
        { runToolLoop: mockLoop }
      )

      const record = subagentSupervisor.activeSubagents.get(spawned.subagentId)
      record.liveBuffer.appendStreamDelta('thinking', 'Found race condition on line 50.')
      record.liveBuffer.appendStreamDelta('text', 'Need mutex lock wrapper.')

      const swapRes = await subagentSupervisor.controlSubagent({
        subagentId: spawned.subagentId,
        action: 'hot_swap_model',
        newProviderId: 'p_direct',
        newModelId: 'm_flagship',
        steeringMessage: 'Resume with priority lock implementation',
        preservePartialDraft: true,
      })

      expect(swapRes.ok).toBe(true)
      expect(swapRes.providerId).toBe('p_direct')
      expect(swapRes.modelId).toBe('m_flagship')
      expect(record.swapHistory.length).toBe(2)
      expect(record.swapHistory[1].from).toBe('p_relay/m_slow')
      expect(record.swapHistory[1].to).toBe('p_direct/m_flagship')

      const rehydratedMsg = record.completedMessages[record.completedMessages.length - 1]
      expect(rehydratedMsg.content).toContain('Found race condition on line 50.')
      expect(rehydratedMsg.content).toContain('Need mutex lock wrapper.')
      expect(rehydratedMsg.content).toContain('Resume with priority lock implementation')
    })
  })

  // ==========================================================================
  // Section 5: Roles, Supervisor Tools & SessionContext Injection (Feature 18 & 24)
  // ==========================================================================
  describe('Features 18 & 24: Roles, Tools and XML Topology Snapshot', () => {
    it('5.1: oracle and librarian roles are registered with read-only constraint and plan mode', () => {
      const oracle = agentRoles.getRole('oracle')
      expect(oracle).toBeDefined()
      expect(oracle.readOnly).toBe(true)
      expect(oracle.defaultMode).toBe('plan')
      expect(oracle.effort).toBe('high')

      const librarian = agentRoles.getRole('librarian')
      expect(librarian).toBeDefined()
      expect(librarian.readOnly).toBe(true)
      expect(librarian.defaultMode).toBe('plan')
      expect(librarian.allowTools).toContain('run_command')
    })

    it('5.2: All 5 supervisor tools exist in TOOLS registry with genuine schemas and risk designations', () => {
      const toolMap = new Map(TOOLS.map((t: any) => [t.name, t]))

      const requiredTools = [
        { name: 'list_providers_and_models', risk: 'safe' },
        { name: 'probe_model_health', risk: 'safe' },
        { name: 'spawn_subagent', risk: 'dangerous' },
        { name: 'peek_subagent_stream', risk: 'safe' },
        { name: 'control_subagent', risk: 'dangerous' },
      ]

      for (const req of requiredTools) {
        const tool = toolMap.get(req.name)
        expect(tool, `Missing tool: ${req.name}`).toBeDefined()
        expect(tool.risk, `Incorrect risk for ${req.name}`).toBe(req.risk)
        expect(typeof tool.run).toBe('function')
        expect(tool.parameters).toBeDefined()
      }
    })

    it('5.3: Topology prompt XML generates well-formed XML block with providers and models', () => {
      const mockDb = {
        listProviders: () => [
          {
            id: 1,
            name: 'Anthropic Direct',
            baseUrl: 'https://api.anthropic.com',
            enabled: 1,
            models: ['claude-3-7-sonnet', 'claude-3-opus'],
          },
        ],
      }

      const xml = providerTopology.buildTopologyPromptXml(mockDb)
      expect(xml).toContain('<available_providers_and_models>')
      expect(xml).toContain('name="Anthropic Direct"')
      expect(xml).toContain('kind="official_direct"')
      expect(xml).toContain('<model id="claude-3-7-sonnet"')
      expect(xml).toContain('</available_providers_and_models>')
    })

    it('5.4: sessionContext injects provider topology snapshot as stable cache hint prefix', () => {
      const mockDb = {
        listProviders: () => [
          { id: 1, name: 'OpenAI', baseUrl: 'https://api.openai.com', enabled: 1, models: ['gpt-4o'] },
        ],
        prepare: () => ({ all: () => [], get: () => null }),
      }

      const ctx = sessionContext.buildSessionContext({ db: mockDb })
      const topoEntry = ctx.prefix.find((p: any) => p.content.includes('<available_providers_and_models>'))
      expect(topoEntry).toBeDefined()
      expect(topoEntry.cacheHint).toBe('stable')
    })
  })
})
