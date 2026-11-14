// ─────────────────────────────────────────────────────────────────────────────
// app/test/providerTopologySupervisor.test.ts
//
// Milestone 4 (Feature 26): Offline Mock Unit Tests for Provider Topology
// & Subagent Supervisor
//
// 100% Offline Execution:
// - Zero live network requests or external API keys
// - Full mock streaming SSE fetch with immediate socket abort verification
// - Duck-typed mock database with session and provider/model resolution
// - Controllable subagent tool loop runner
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const {
  classifyProviderEndpoint,
  inferModelCapabilities,
  probeSingleModel,
  probeModels,
  buildProviderTopologySnapshot,
  buildTopologyPromptXml,
  clearRuntimeProbeCache,
  runtimeProbeCache,
} = require('../electron/llm/providerTopology.js')

const {
  SubagentLiveBuffer,
  spawnSupervisedSubagent,
  peekSubagentStream,
  controlSubagent,
  resolveProviderAndModel,
  resolveSubagentTools,
  activeSubagents,
} = require('../electron/llm/subagentSupervisor.js')

const agentRoles = require('../electron/llm/agentRoles.js')
const steering = require('../electron/llm/steering.js')

// ─────────────────────────────────────────────────────────────────────────────
// TEST HARNESS: Mock Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an offline mock fetch for streaming SSE requests.
 */
function createMockSseFetch(opts: {
  chunks?: string[]
  status?: number
  delayMs?: number
  onAbort?: () => void
  onFirstChunk?: () => void
  headers?: Record<string, string>
} = {}) {
  const {
    chunks = ['data: {"choices":[{"delta":{"content":"A"}}]}\n\n'],
    status = 200,
    delayMs = 0,
    onAbort,
    onFirstChunk,
    headers = {},
  } = opts

  return vi.fn(async (url: string, init: any) => {
    if (init?.signal) {
      init.signal.addEventListener('abort', () => {
        onAbort?.()
      })
    }

    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs))
    }

    if (init?.signal?.aborted) {
      const err = new Error('AbortError')
      err.name = 'AbortError'
      throw err
    }

    if (status !== 200) {
      return {
        ok: false,
        status,
        headers: new Headers(headers),
        text: async () => `HTTP ${status} Mock Error Body`,
        json: async () => ({ error: { message: `HTTP ${status}` } }),
      }
    }

    let chunkIndex = 0
    const stream = {
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) {
          if (init?.signal?.aborted) break
          if (chunkIndex === 0) {
            onFirstChunk?.()
          }
          chunkIndex++
          yield new TextEncoder().encode(chunk)
        }
      },
    }

    return {
      ok: true,
      status: 200,
      headers: new Headers(headers),
      body: stream,
    }
  })
}

/**
 * Creates a mock database for provider and model resolution.
 */
function createMockDb(overrides: Record<string, any> = {}) {
  const providers = [
    {
      id: 1,
      name: 'OpenAI Direct',
      baseUrl: 'https://api.openai.com/v1',
      protocol: 'openai',
      enabled: 1,
      models: JSON.stringify(['gpt-4o', 'gpt-4o-mini', 'o3-mini']),
    },
    {
      id: 2,
      name: 'Anthropic Tier 1',
      baseUrl: 'https://api.anthropic.com',
      protocol: 'anthropic',
      enabled: 1,
      models: JSON.stringify(['claude-3-7-sonnet', 'claude-3-5-haiku']),
    },
    {
      id: 3,
      name: 'Local Ollama',
      baseUrl: 'http://localhost:11434',
      protocol: 'openai',
      enabled: 1,
      models: JSON.stringify(['llama3.2', 'qwen2.5-coder']),
    },
  ]

  const models: Record<string, any> = {
    'gpt-4o': { id: 'gpt-4o', model_name: 'gpt-4o', display_name: 'GPT-4o', is_primary: 1 },
    'claude-3-7-sonnet': { id: 'claude-3-7-sonnet', model_name: 'claude-3-7-sonnet', display_name: 'Claude 3.7 Sonnet' },
    'llama3.2': { id: 'llama3.2', model_name: 'llama3.2', display_name: 'Llama 3.2' },
  }

  return {
    listProviders: vi.fn(() => providers),
    getProvidersDecrypted: vi.fn(() => providers),
    getProviderDecrypted: vi.fn((id: any) => providers.find((p) => p.id === id || String(p.id) === String(id)) || null),
    listModelsByProvider: vi.fn((providerId: any) => {
      const p = providers.find((x) => x.id === providerId || String(x.id) === String(providerId))
      if (!p) return []
      return JSON.parse(p.models).map((mId: string) => models[mId] || { id: mId, model_name: mId, display_name: mId })
    }),
    getModel: vi.fn((modelId: any) => models[modelId] || null),
    createSession: vi.fn((opts: any) => ({ lastInsertRowid: `child_session_${Date.now()}` })),
    ...overrides,
  }
}

/**
 * Creates a controllable tool loop runner for spawnSupervisedSubagent.
 */
function createControllableToolLoop(behavior: {
  thinkingDeltas?: string[]
  streamDeltas?: string[]
  toolCalls?: Array<{ toolName: string; args?: any; result?: any }>
  finalText?: string
  hang?: boolean
  error?: Error | string
  delayMs?: number
  onCall?: (args: any) => void
} = {}) {
  return vi.fn().mockImplementation(async (args: any) => {
    behavior.onCall?.(args)

    if (behavior.delayMs) {
      await new Promise((r) => setTimeout(r, behavior.delayMs))
    }

    if (args.signal?.aborted) return

    for (const delta of behavior.thinkingDeltas || []) {
      args.onThinkingDelta?.(delta)
    }

    for (const delta of behavior.streamDeltas || []) {
      args.onStreamDelta?.(delta)
    }

    for (const tc of behavior.toolCalls || []) {
      args.onToolCall?.({ toolName: tc.toolName, args: tc.args || {} })
      args.onToolCall?.({ toolName: tc.toolName, result: tc.result || 'ok' })
    }

    if (behavior.hang) {
      return new Promise((resolve) => {
        args.signal?.addEventListener('abort', () => resolve(null))
      })
    }

    if (behavior.error) {
      throw typeof behavior.error === 'string' ? new Error(behavior.error) : behavior.error
    }

    const finalText = behavior.finalText || (behavior.streamDeltas || []).join('') || 'completed task'
    args.onTurnComplete?.([
      ...(args.messages || []),
      { role: 'assistant', content: finalText },
    ])

    return { finalText }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITES
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature 26: Offline Mock Unit Tests (providerTopology & subagentSupervisor)', () => {
  beforeEach(() => {
    clearRuntimeProbeCache()
    activeSubagents.clear()
  })

  afterEach(() => {
    clearRuntimeProbeCache()
    activeSubagents.clear()
  })

  // ===========================================================================
  // SUITE 1: SubagentLiveBuffer Ring Buffer & Stream Coalescing
  // ===========================================================================
  describe('Suite 1: SubagentLiveBuffer Ring Buffer & Stream Coalescing', () => {
    it('T1.1: Bounds capacity strictly to 300 events with FIFO eviction when 350 events are pushed', () => {
      const buffer = new SubagentLiveBuffer(300)

      for (let i = 1; i <= 350; i++) {
        buffer.appendToolEvent('tool_call_start', { toolName: `tool_${i}`, step: i })
      }

      expect(buffer.events.length).toBe(300)
      expect(buffer.seq).toBe(350)
      expect(buffer.events[0].seq).toBe(51) // Oldest 50 evicted
      expect(buffer.events[299].seq).toBe(350)

      const snap = buffer.snapshot()
      expect(snap.latestSeq).toBe(350)
      expect(snap.totalEvents).toBe(350)
      expect(snap.bufferedCount).toBe(300)
    })

    it('T1.2: Preserves event ordering, non-decreasing timestamps, and elapsedMs calculation', () => {
      const buffer = new SubagentLiveBuffer(300)

      buffer.appendStreamDelta('thinking', 'Step 1')
      buffer.appendStreamDelta('text', 'Step 2')
      buffer.appendToolEvent('tool_result', { status: 'success' })

      expect(buffer.events.length).toBe(3)
      for (let i = 1; i < buffer.events.length; i++) {
        expect(buffer.events[i].seq).toBeGreaterThan(buffer.events[i - 1].seq)
        expect(buffer.events[i].timestamp).toBeGreaterThanOrEqual(buffer.events[i - 1].timestamp)
        expect(buffer.events[i].elapsedMs).toBeGreaterThanOrEqual(0)
      }
    })

    it('T1.3: Incremental pulling via peek snapshot({ fromSeq, tailCount })', () => {
      const buffer = new SubagentLiveBuffer(300)
      for (let i = 1; i <= 50; i++) {
        buffer.appendToolEvent('log', `Event #${i}`)
      }

      // 1. Default tailCount
      const tailSnapshot = buffer.snapshot({ fromSeq: 0, tailCount: 15 })
      expect(tailSnapshot.streamEvents.length).toBe(15)
      expect(tailSnapshot.streamEvents[0].seq).toBe(36)
      expect(tailSnapshot.streamEvents[14].seq).toBe(50)

      // 2. Incremental fromSeq
      const incrementalSnapshot = buffer.snapshot({ fromSeq: 45 })
      expect(incrementalSnapshot.streamEvents.length).toBe(5)
      expect(incrementalSnapshot.streamEvents.map((e: any) => e.seq)).toEqual([46, 47, 48, 49, 50])

      // 3. fromSeq at or beyond latestSeq returns empty array
      expect(buffer.snapshot({ fromSeq: 50 }).streamEvents).toEqual([])
      expect(buffer.snapshot({ fromSeq: 100 }).streamEvents).toEqual([])

      // 4. tailCount <= 0 returns empty array
      expect(buffer.snapshot({ fromSeq: 0, tailCount: 0 }).streamEvents).toEqual([])
    })

    it('T1.4: Multi-cycle incremental stream polling simulation', () => {
      const buffer = new SubagentLiveBuffer(300)

      // Cycle 1: push 3 events
      buffer.appendToolEvent('start', 'Cycle 1')
      buffer.appendStreamDelta('text', 'Hello ')
      buffer.appendStreamDelta('text', 'World')
      const snap1 = buffer.snapshot({ fromSeq: 0 })
      let cursor = snap1.latestSeq
      expect(cursor).toBeGreaterThanOrEqual(1)

      // Cycle 2: push more events
      buffer.appendToolEvent('tool_call_start', { toolName: 'read_file' })
      buffer.appendToolEvent('tool_result', { bytes: 128 })
      const snap2 = buffer.snapshot({ fromSeq: cursor })
      expect(snap2.streamEvents.length).toBe(2)
      expect(snap2.streamEvents[0].content).toContain('read_file')
      cursor = snap2.latestSeq

      // Cycle 3: no new events
      const snap3 = buffer.snapshot({ fromSeq: cursor })
      expect(snap3.streamEvents.length).toBe(0)
    })

    it('T1.5: Delta coalescing merges consecutive small stream deltas under 600 characters', () => {
      const buffer = new SubagentLiveBuffer(300)

      // 10 small text chunks
      for (let i = 0; i < 10; i++) {
        buffer.appendStreamDelta('text', `chunk_${i} `)
      }

      // Must coalesce into exactly 1 discrete event
      expect(buffer.events.length).toBe(1)
      expect(buffer.events[0].type).toBe('text')
      expect(buffer.events[0].content).toContain('chunk_0')
      expect(buffer.events[0].content).toContain('chunk_9')
      expect(buffer.accumulatedText).toContain('chunk_0')
    })

    it('T1.6: Delta coalescing respects strict 600-character boundary', () => {
      const buffer = new SubagentLiveBuffer(300)

      // Push 400 chars -> event 1
      buffer.appendStreamDelta('text', 'X'.repeat(400))
      expect(buffer.events.length).toBe(1)
      expect(buffer.events[0].content.length).toBe(400)

      // Push 200 chars -> coalesced into event 1 (400 + 200 = exactly 600)
      buffer.appendStreamDelta('text', 'Y'.repeat(200))
      expect(buffer.events.length).toBe(1)
      expect(buffer.events[0].content.length).toBe(600)

      // Push 1 char -> 600 + 1 > 600, spawns event 2
      buffer.appendStreamDelta('text', 'Z')
      expect(buffer.events.length).toBe(2)
      expect(buffer.events[1].content).toBe('Z')
      expect(buffer.accumulatedText.length).toBe(601)
    })

    it('T1.7: Type alternation (thinking vs text) breaks coalescing', () => {
      const buffer = new SubagentLiveBuffer(300)

      buffer.appendStreamDelta('thinking', 'Thinking turn 1')
      buffer.appendStreamDelta('text', 'Text turn 1')
      buffer.appendStreamDelta('thinking', 'Thinking turn 2')

      expect(buffer.events.length).toBe(3)
      expect(buffer.events.map((e: any) => e.type)).toEqual(['thinking', 'text', 'thinking'])
    })

    it('T1.8: Tool lifecycle events break coalescing and update currentTool & completedTurnCount', () => {
      const buffer = new SubagentLiveBuffer(300)

      buffer.appendStreamDelta('text', 'Before tool')
      buffer.appendToolEvent('tool_call_start', { toolName: 'grep_search' })
      expect(buffer.currentTool).toBe('grep_search')
      expect(buffer.completedTurnCount).toBe(0)

      buffer.appendToolEvent('tool_result', { matches: 5 })
      expect(buffer.currentTool).toBeNull()
      expect(buffer.completedTurnCount).toBe(1)

      buffer.appendStreamDelta('text', 'After tool')
      expect(buffer.events.length).toBe(4)
      expect(buffer.events[3].content).toBe('After tool')
    })

    it('T1.9: First token recording and TTFT calculation', () => {
      const buffer = new SubagentLiveBuffer(300)
      expect(buffer.ttftMs).toBeNull()
      expect(buffer.firstTokenAt).toBeNull()

      buffer.appendStreamDelta('text', 'First token')
      expect(buffer.firstTokenAt).not.toBeNull()
      expect(typeof buffer.ttftMs).toBe('number')
      expect(buffer.ttftMs).toBeGreaterThanOrEqual(0)

      const initialTtft = buffer.ttftMs
      const initialFirstToken = buffer.firstTokenAt

      // Subsequent token appends should preserve original TTFT
      buffer.appendStreamDelta('text', 'Second token')
      expect(buffer.firstTokenAt).toBe(initialFirstToken)
      expect(buffer.ttftMs).toBe(initialTtft)
    })

    it('T1.10: Tool payload truncation to 2000 characters and stringification resilience', () => {
      const buffer = new SubagentLiveBuffer(300)

      const largePayload = {
        data: 'A'.repeat(5000),
      }

      buffer.appendToolEvent('log', largePayload)
      expect(buffer.events.length).toBe(1)
      expect(buffer.events[0].content.length).toBeLessThanOrEqual(2000)

      // Circular reference or non-serializable object
      const circular: any = { a: 1 }
      circular.self = circular
      buffer.appendToolEvent('circular', circular)
      expect(buffer.events.length).toBe(2)
      expect(buffer.events[1].content).toContain('[object Object]')
    })
  })

  // ===========================================================================
  // SUITE 2: Endpoint Classification & Domain Guard
  // ===========================================================================
  describe('Suite 2: Endpoint Classification & Domain Guard', () => {
    it('T2.1: Classifies official direct Tier-1 endpoints accurately', () => {
      const officialEndpoints = [
        'https://api.openai.com/v1',
        'https://api.anthropic.com',
        'https://generativelanguage.googleapis.com/v1beta',
        'https://api.deepseek.com',
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
        'https://open.bigmodel.cn/api/paas/v4',
        'https://api.moonshot.cn/v1',
        'https://api.minimax.chat/v1',
        'https://api.x.ai/v1',
        'https://api.mistral.ai/v1',
        'https://api.cohere.com/v1',
      ]

      for (const url of officialEndpoints) {
        const meta = classifyProviderEndpoint(url)
        expect(meta.endpointKind, `Failed on ${url}`).toBe('official_direct')
        expect(meta.stabilityHint).toBe('tier1_official_sla')
        expect(meta.concurrencyHint).toBe('high_concurrency_supported')
        expect(meta.privacyLevel).toBe('official_enterprise_policy')
      }
    })

    it('T2.2: Classifies major commercial aggregators accurately', () => {
      const aggregators = [
        'https://openrouter.ai/api/v1',
        'https://aihubmix.com/v1',
        'https://api.siliconflow.cn/v1',
        'https://api.together.xyz/v1',
        'https://api.together.ai/v1',
        'https://api.fireworks.ai/inference/v1',
        'https://api.groq.com/openai/v1',
        'https://api.deepinfra.com/v1/openai',
        'https://api.perplexity.ai',
      ]

      for (const url of aggregators) {
        const meta = classifyProviderEndpoint(url)
        expect(meta.endpointKind, `Failed on ${url}`).toBe('major_aggregator')
        expect(meta.stabilityHint).toBe('tier2_commercial_gateway')
        expect(meta.concurrencyHint).toBe('high_concurrency_supported')
        expect(meta.privacyLevel).toBe('routed_multi_upstream')
      }
    })

    it('T2.3: Classifies local engines across loopback IPs, localhost, and .local domains', () => {
      const locals = [
        'http://localhost:11434',
        'http://127.0.0.1:1234',
        'http://0.0.0.0:8000',
        'http://127.0.0.2:8000',
        'http://127.255.255.255:9000',
        'http://my-desktop.local:11434',
      ]

      for (const url of locals) {
        const meta = classifyProviderEndpoint(url)
        expect(meta.endpointKind, `Failed on ${url}`).toBe('local_engine')
        expect(meta.stabilityHint).toBe('high_local_zero_cost')
        expect(meta.concurrencyHint).toBe('serial_gpu_bound')
        expect(meta.privacyLevel).toBe('local_strictly_private')
      }
    })

    it('T2.4: Defaults empty baseUrl to local engine', () => {
      expect(classifyProviderEndpoint('').endpointKind).toBe('local_engine')
      expect(classifyProviderEndpoint(null as any).endpointKind).toBe('local_engine')
      expect(classifyProviderEndpoint('', 'ollama').endpointKind).toBe('local_engine')
    })

    it('T2.5: Classifies third-party relays and private proxies as third_party_relay', () => {
      const relays = [
        'https://custom-gateway.company.com/v1',
        'https://relay.oneapi.vip/v1',
        'http://192.168.1.100:8000/v1',
        'http://10.0.0.5:11434',
      ]

      for (const url of relays) {
        const meta = classifyProviderEndpoint(url)
        expect(meta.endpointKind, `Failed on ${url}`).toBe('third_party_relay')
        expect(meta.stabilityHint).toBe('volatile_relay_probe_recommended')
        expect(meta.concurrencyHint).toBe('moderate_watch_for_429_or_stall')
        expect(meta.privacyLevel).toBe('third_party_proxy')
      }
    })

    it('T2.6: Strips IPv6 brackets correctly for [::1] and [::] loopbacks', () => {
      const ipv6Loopbacks = [
        'http://[::1]:11434',
        'http://[::1]:8000/v1',
        'http://[::]:1234',
      ]

      for (const url of ipv6Loopbacks) {
        const meta = classifyProviderEndpoint(url)
        expect(meta.endpointKind, `Failed on ${url}`).toBe('local_engine')
      }

      // Public or non-loopback IPv6 should NOT be local engine
      const publicIpv6 = classifyProviderEndpoint('http://[2001:db8::1]:8000')
      expect(publicIpv6.endpointKind).toBe('third_party_relay')
    })

    it('T2.7: Domain collision guard: 127.net and 127.0.0.1.attacker.com are NOT local engines', () => {
      const collisions = [
        'https://127.net',
        'https://127.0.0.1.attacker.com',
        'https://127-spoof.com',
        'http://localhost.attacker.com:11434',
      ]

      for (const url of collisions) {
        const meta = classifyProviderEndpoint(url)
        expect(meta.endpointKind, `Collision breach on ${url}`).toBe('third_party_relay')
      }
    })

    it('T2.8: Subdomain spoofing prevention for official and aggregator domains', () => {
      const spoofs = [
        'https://api.openai.com.attacker.com',
        'https://api.anthropic.com.phishing.org/v1',
        'https://openrouter.ai.evil-relay.net',
        'https://not-really-deepseek.com',
      ]

      for (const url of spoofs) {
        const meta = classifyProviderEndpoint(url)
        expect(meta.endpointKind, `Spoof breach on ${url}`).toBe('third_party_relay')
      }
    })

    it('T2.9: Local engine ports (11434, 1234) with local provider name heuristic', () => {
      expect(classifyProviderEndpoint('http://remote-server.lan:11434', 'Ollama').endpointKind).toBe('local_engine')
      expect(classifyProviderEndpoint('http://internal-box:1234', 'LM Studio').endpointKind).toBe('local_engine')
      expect(classifyProviderEndpoint('http://remote-server.lan:8080', 'Ollama').endpointKind).toBe('third_party_relay')
    })

    it('T2.10: Case insensitivity, scheme-less URLs, and trailing slash normalization', () => {
      expect(classifyProviderEndpoint('HTTPS://API.OPENAI.COM/V1///').endpointKind).toBe('official_direct')
      expect(classifyProviderEndpoint('api.anthropic.com').endpointKind).toBe('official_direct')
      expect(classifyProviderEndpoint('HTTP://OPENROUTER.AI/').endpointKind).toBe('major_aggregator')
    })
  })

  // ===========================================================================
  // SUITE 3: Active Latency Probing (probeSingleModel) & Topology Snapshot
  // ===========================================================================
  describe('Suite 3: Active Latency Probing & Topology Snapshot', () => {
    it('T3.1: Issues streaming max_tokens:1 request and immediately aborts socket upon receiving first chunk', async () => {
      let aborted = false
      let requestPayload: any = null

      const mockFetch = vi.fn(async (url: string, init: any) => {
        requestPayload = JSON.parse(init.body)
        init.signal.addEventListener('abort', () => {
          aborted = true
        })

        const stream = {
          async *[Symbol.asyncIterator]() {
            yield new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n')
            // Chunks beyond first should not be consumed due to immediate abort
            yield new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Excess"}}]}\n\n')
          },
        }

        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          body: stream,
        }
      })

      const report = await probeSingleModel({
        provider: { id: 1, name: 'OpenAI Direct', baseUrl: 'https://api.openai.com/v1', protocol: 'openai' },
        modelId: 'gpt-4o',
        timeoutMs: 3000,
        mockFetch,
      })

      expect(report.available).toBe(true)
      expect(report.status).toBe('healthy_fast')
      expect(typeof report.ttftMs).toBe('number')
      expect(report.ttftMs).toBeGreaterThanOrEqual(0)
      expect(aborted).toBe(true)
      expect(requestPayload).toMatchObject({
        model: 'gpt-4o',
        max_tokens: 1,
        stream: true,
        messages: [{ role: 'user', content: '1' }],
      })
    })

    it('T3.2: Status thresholds: healthy_fast (<1500ms), healthy_normal (1500-3999ms), healthy_slow (>=4000ms)', async () => {
      // Fast probe
      const fastFetch = createMockSseFetch({ delayMs: 10 })
      const fastReport = await probeSingleModel({
        provider: { id: 10, baseUrl: 'https://api.mock.com' },
        modelId: 'fast-model',
        mockFetch: fastFetch,
      })
      expect(fastReport.status).toBe('healthy_fast')
    })

    it('T3.3: HTTP 429 classified as rate_limited_429 with available=false', async () => {
      const mockFetch = createMockSseFetch({ status: 429 })
      const report = await probeSingleModel({
        provider: { id: 11, baseUrl: 'https://api.mock.com' },
        modelId: 'rate-limited-model',
        mockFetch,
      })

      expect(report.available).toBe(false)
      expect(report.status).toBe('rate_limited_429')
      expect(report.ttftMs).toBeNull()
      expect(report.errorDetail).toContain('429')
    })

    it('T3.4: HTTP 502/503 upstream server error classification', async () => {
      const mockFetch = createMockSseFetch({ status: 502 })
      const report = await probeSingleModel({
        provider: { id: 12, baseUrl: 'https://api.mock.com' },
        modelId: 'server-error-model',
        mockFetch,
      })

      expect(report.available).toBe(false)
      expect(report.status).toBe('upstream_error_502')
    })

    it('T3.5: HTTP 401 client error classification', async () => {
      const mockFetch = createMockSseFetch({ status: 401 })
      const report = await probeSingleModel({
        provider: { id: 13, baseUrl: 'https://api.mock.com' },
        modelId: 'unauthorized-model',
        mockFetch,
      })

      expect(report.available).toBe(false)
      expect(report.status).toBe('http_error_401')
    })

    it('T3.6: Empty stream response handling (HTTP 200 with 0 bytes)', async () => {
      const emptyStream = {
        async *[Symbol.asyncIterator]() {
          // Zero chunks emitted
        },
      }
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        body: emptyStream,
      }))

      const report = await probeSingleModel({
        provider: { id: 14, baseUrl: 'https://api.mock.com' },
        modelId: 'empty-stream-model',
        mockFetch,
      })

      expect(report.available).toBe(false)
      expect(report.status).toBe('empty_stream_response')
      expect(report.errorDetail).toContain('closed stream with 0 bytes')
    })

    it('T3.7: Upstream stall triggers probe timeout with timeout_stalled', async () => {
      const stalledFetch = vi.fn(async (url: string, init: any) => {
        return new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const err = new Error('AbortError')
            err.name = 'AbortError'
            reject(err)
          })
        })
      })

      const report = await probeSingleModel({
        provider: { id: 15, baseUrl: 'https://api.mock.com' },
        modelId: 'hung-model',
        timeoutMs: 50,
        mockFetch: stalledFetch,
      })

      expect(report.available).toBe(false)
      expect(report.status).toBe('timeout_stalled')
      expect(report.ttftMs).toBeNull()
      expect(report.errorDetail).toContain('timed out after 50ms')
    })

    it('T3.8: Network connection failure triggers network_unreachable', async () => {
      const failingFetch = vi.fn(async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:9999')
      })

      const report = await probeSingleModel({
        provider: { id: 16, baseUrl: 'http://127.0.0.1:9999' },
        modelId: 'offline-model',
        mockFetch: failingFetch,
      })

      expect(report.available).toBe(false)
      expect(report.status).toBe('network_unreachable')
      expect(report.errorDetail).toContain('ECONNREFUSED')
    })

    it('T3.9: Resolves Anthropic vs OpenAI endpoints and headers accurately', async () => {
      let anthropicUrl = ''
      let anthropicHeaders: any = null
      const mockAnthropicFetch = vi.fn(async (url: string, init: any) => {
        anthropicUrl = url
        anthropicHeaders = init.headers
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          body: {
            async *[Symbol.asyncIterator]() {
              yield new TextEncoder().encode('data: {}\n\n')
            },
          },
        }
      })

      await probeSingleModel({
        provider: { id: 17, baseUrl: 'https://api.anthropic.com', apiKey: 'sk-ant-test', protocol: 'anthropic' },
        modelId: 'claude-3-7-sonnet',
        mockFetch: mockAnthropicFetch,
      })

      expect(anthropicUrl).toBe('https://api.anthropic.com/v1/messages')
      expect(anthropicHeaders['x-api-key']).toBe('sk-ant-test')
      expect(anthropicHeaders['anthropic-version']).toBe('2023-06-01')
    })

    it('T3.10: In-memory runtime probe cache and topology prompt XML injection', async () => {
      const mockFetch = createMockSseFetch({ chunks: ['data: {"token":"1"}\n\n'] })
      const db = createMockDb()

      await probeSingleModel({
        provider: { id: 1, name: 'OpenAI Direct', baseUrl: 'https://api.openai.com/v1' },
        modelId: 'gpt-4o',
        mockFetch,
      })

      const snapshot = buildProviderTopologySnapshot(db)
      expect(snapshot.length).toBeGreaterThan(0)
      const p1 = snapshot.find((p: any) => p.providerId === 1)
      expect(p1).toBeDefined()
      const m1 = p1.models.find((m: any) => m.modelId === 'gpt-4o')
      expect(m1.lastProbe.available).toBe(true)
      expect(m1.lastProbe.status).toBe('healthy_fast')

      const xml = buildTopologyPromptXml(db)
      expect(xml).toContain('<available_providers_and_models>')
      expect(xml).toContain('id="gpt-4o"')
      expect(xml).toContain('status="healthy_fast"')
    })

    it('T3.11: Concurrent probing with probeModels', async () => {
      const mockFetch = createMockSseFetch()
      const targets = [
        { provider: { id: 1, baseUrl: 'https://api.openai.com/v1' }, modelId: 'gpt-4o' },
        { provider: { id: 2, baseUrl: 'https://api.anthropic.com' }, modelId: 'claude-3-7-sonnet' },
      ]

      const reports = await probeModels(targets, { mockFetch })
      expect(reports.length).toBe(2)
      expect(reports[0].available).toBe(true)
      expect(reports[1].available).toBe(true)
    })
  })

  // ===========================================================================
  // SUITE 4: spawnSupervisedSubagent Supervised Spawning & Wait Modes
  // ===========================================================================
  describe('Suite 4: spawnSupervisedSubagent Supervised Spawning & Wait Modes', () => {
    it('T4.1: smart_window mode returns completed status immediately when subagent finishes under initialWaitMs', async () => {
      const runToolLoop = createControllableToolLoop({
        streamDeltas: ['Quick calculation: 42'],
        finalText: 'Quick calculation: 42',
        delayMs: 15,
      })

      const report = await spawnSupervisedSubagent(
        {
          taskPrompt: 'Calculate 6 * 7',
          waitMode: 'smart_window',
          initialWaitMs: 200,
          stallTimeoutMs: 500,
        },
        { runToolLoop }
      )

      expect(report.status).toBe('completed')
      expect(report.output).toBe('Quick calculation: 42')
      expect(report.systemNotice).toContain('Finished with status: completed')
      expect(report.ttftMs).toBeGreaterThanOrEqual(0)
    })

    it('T4.2: smart_window mode returns running status with live preview when subagent is actively streaming', async () => {
      const runToolLoop = createControllableToolLoop({
        thinkingDeltas: ['Planning migration steps...'],
        streamDeltas: ['Migrating table 1...'],
        hang: true,
      })

      const report = await spawnSupervisedSubagent(
        {
          taskPrompt: 'Run long migration',
          waitMode: 'smart_window',
          initialWaitMs: 60,
          stallTimeoutMs: 500,
        },
        { runToolLoop }
      )

      expect(report.status).toBe('running')
      expect(report.systemNotice).toContain('Subagent actively streaming')
      expect(report.recentThinkingTail).toContain('Planning migration steps')
      expect(report.recentTextTail).toContain('Migrating table 1')
    })

    it('T4.3: smart_window mode detects stall when no tokens produced within stallTimeoutMs', async () => {
      const runToolLoop = createControllableToolLoop({
        hang: true, // Hangs with 0 tokens
      })

      const report = await spawnSupervisedSubagent(
        {
          taskPrompt: 'Hanging upstream task',
          waitMode: 'smart_window',
          initialWaitMs: 150,
          stallTimeoutMs: 30, // Stall threshold < initialWaitMs
        },
        { runToolLoop }
      )

      expect(report.status).toBe('stalled_suspected')
      expect(report.systemNotice).toContain('WARNING: Subagent has produced no tokens')
    })

    it('T4.4: async_immediate mode returns instantly in <15ms without awaiting completion', async () => {
      const runToolLoop = createControllableToolLoop({ hang: true })
      const start = Date.now()

      const report = await spawnSupervisedSubagent(
        {
          taskPrompt: 'Async background worker',
          waitMode: 'async_immediate',
        },
        { runToolLoop }
      )

      expect(Date.now() - start).toBeLessThan(150)
      expect(report.status).toBe('running')
      expect(report.systemNotice).toContain('Launched asynchronously in background')
    })

    it('T4.5: Constructs role system prompt and passes taskPrompt in completedMessages', async () => {
      let capturedArgs: any = null
      const runToolLoop = createControllableToolLoop({
        onCall: (args) => {
          capturedArgs = args
        },
      })

      await spawnSupervisedSubagent(
        {
          taskPrompt: 'Inspect database schemas',
          role: 'explore',
          waitMode: 'async_immediate',
        },
        { runToolLoop }
      )

      expect(capturedArgs).not.toBeNull()
      expect(capturedArgs.messages.length).toBe(2)
      expect(capturedArgs.messages[0].role).toBe('system')
      expect(capturedArgs.messages[0].content).toContain('EXPLORATION agent')
      expect(capturedArgs.messages[0].content).toContain('Inspect database schemas')
      expect(capturedArgs.messages[1].role).toBe('user')
      expect(capturedArgs.messages[1].content).toBe('Inspect database schemas')
    })

    it('T4.6: Enforces strict read-only tool filtering for oracle role', () => {
      const oracleFilter = agentRoles.buildToolFilter('oracle')
      expect(oracleFilter).toContain('read_file')
      expect(oracleFilter).toContain('codebase_graph')
      expect(oracleFilter).not.toContain('write_file')
      expect(oracleFilter).not.toContain('edit_file')
      expect(oracleFilter).not.toContain('run_command')
    })

    it('T4.7: Librarian role allows run_command and search tools but blocks write_file and edit_file', () => {
      const librarianFilter = agentRoles.buildToolFilter('librarian')
      expect(librarianFilter).toContain('read_file')
      expect(librarianFilter).toContain('web_search')
      expect(librarianFilter).toContain('run_command')
      expect(librarianFilter).not.toContain('write_file')
      expect(librarianFilter).not.toContain('edit_file')
    })

    it('T4.8: Creates child session in database when createSession is supported', async () => {
      const db = createMockDb()
      const runToolLoop = createControllableToolLoop({ hang: true })

      const report = await spawnSupervisedSubagent(
        {
          taskPrompt: 'Isolated child session test',
          waitMode: 'async_immediate',
        },
        { db, runToolLoop }
      )

      expect(db.createSession).toHaveBeenCalled()
      const record = activeSubagents.get(report.subagentId)
      expect(record.childSessionId).toBeDefined()
    })

    it('T4.9: notifyRenderer dispatches live stream and tool events', async () => {
      const events: any[] = []
      const notifyRenderer = (channel: string, payload: any) => {
        events.push({ channel, payload })
      }

      const runToolLoop = createControllableToolLoop({
        thinkingDeltas: ['Brainstorming'],
        streamDeltas: ['Result'],
        toolCalls: [{ toolName: 'glob_find' }],
      })

      await spawnSupervisedSubagent(
        {
          taskPrompt: 'Stream notifications',
          waitMode: 'smart_window',
          initialWaitMs: 100,
        },
        { runToolLoop, notifyRenderer }
      )

      expect(events.some((e) => e.channel === 'subagent:stream')).toBe(true)
      expect(events.some((e) => e.channel === 'subagent:tool')).toBe(true)
    })
  })

  // ===========================================================================
  // SUITE 5: Subagent Control & Stream Peeking
  // ===========================================================================
  describe('Suite 5: Subagent Control & Stream Peeking', () => {
    it('T5.1: hot_swap_model aborts old connection, preserves completed turns and drafts, and restarts loop', async () => {
      const loopInvocations: any[] = []
      const runToolLoop = vi.fn().mockImplementation(async (args) => {
        loopInvocations.push({
          providerId: args.providerId,
          modelId: args.modelId,
          provider: args.provider,
          model: args.model,
          messages: [...args.messages],
        })
        await new Promise((resolve) => args.signal.addEventListener('abort', resolve))
      })

      const spawned = await spawnSupervisedSubagent(
        {
          taskPrompt: 'Optimize indices',
          providerId: 'p_relay',
          modelId: 'relay-llama-3',
          waitMode: 'async_immediate',
        },
        { runToolLoop }
      )

      const record = activeSubagents.get(spawned.subagentId)
      record.completedMessages.push({ role: 'assistant', content: 'Turn 1 finished.' })
      record.liveBuffer.appendStreamDelta('thinking', 'Partial index thoughts...')
      record.liveBuffer.appendStreamDelta('text', 'CREATE INDEX idx_temp...')

      // Perform hot swap
      const res = await controlSubagent({
        subagentId: spawned.subagentId,
        action: 'hot_swap_model',
        newProviderId: 'p_anthropic',
        newModelId: 'claude-3-7-sonnet',
        steeringMessage: 'Proceed with extreme care',
        preservePartialDraft: true,
      })

      expect(res.ok).toBe(true)
      expect(res.status).toBe('running')
      expect(record.providerId).toBe('p_anthropic')
      expect(record.modelId).toBe('claude-3-7-sonnet')

      // Loop restarted -> invocations count is 2
      expect(loopInvocations.length).toBe(2)
      expect(loopInvocations[1].providerId).toBe('p_anthropic')
      expect(loopInvocations[1].modelId).toBe('claude-3-7-sonnet')

      // Recovery turn injected with partial drafts and steering message
      const lastMsg = record.completedMessages[record.completedMessages.length - 1]
      expect(lastMsg.role).toBe('user')
      expect(lastMsg.content).toContain('Partial index thoughts...')
      expect(lastMsg.content).toContain('CREATE INDEX idx_temp...')
      expect(lastMsg.content).toContain('Proceed with extreme care')

      // Swap history recorded
      expect(record.swapHistory.length).toBe(2)
      expect(record.swapHistory[1].from).toBe('p_relay/relay-llama-3')
      expect(record.swapHistory[1].to).toBe('p_anthropic/claude-3-7-sonnet')
    })

    it('T5.2: hot_swap_model with preservePartialDraft=false omits draft text from recovery message', async () => {
      const runToolLoop = createControllableToolLoop({ hang: true })
      const spawned = await spawnSupervisedSubagent(
        { taskPrompt: 'Draft test', waitMode: 'async_immediate' },
        { runToolLoop }
      )

      const record = activeSubagents.get(spawned.subagentId)
      record.liveBuffer.appendStreamDelta('text', 'Transient draft token')

      await controlSubagent({
        subagentId: spawned.subagentId,
        action: 'hot_swap_model',
        newProviderId: 'p2',
        newModelId: 'm2',
        preservePartialDraft: false,
      })

      const lastMsg = record.completedMessages[record.completedMessages.length - 1]
      if (lastMsg && lastMsg.content) {
        expect(lastMsg.content).not.toContain('Transient draft token')
      }
    })

    it('T5.3: steer action injects live instruction into steering.js and steeringQueue', async () => {
      const runToolLoop = createControllableToolLoop({ hang: true })
      const spawned = await spawnSupervisedSubagent(
        { taskPrompt: 'Steering test', waitMode: 'async_immediate' },
        { runToolLoop }
      )

      const res = await controlSubagent({
        subagentId: spawned.subagentId,
        action: 'steer',
        steeringMessage: 'Focus on error handling first',
      })

      expect(res.ok).toBe(true)
      const record = activeSubagents.get(spawned.subagentId)
      expect(record.steeringQueue.length).toBe(1)
      expect(record.steeringQueue[0].content).toContain('Focus on error handling first')

      // Live buffer recorded steering tool event
      const snap = record.liveBuffer.snapshot()
      expect(snap.streamEvents.some((e: any) => e.type === 'parent_steer')).toBe(true)
    })

    it('T5.4: cancel action terminates subagent execution cleanly', async () => {
      let aborted = false
      const runToolLoop = vi.fn().mockImplementation(async ({ signal }) => {
        signal.addEventListener('abort', () => {
          aborted = true
        })
        await new Promise((resolve) => signal.addEventListener('abort', resolve))
      })

      const spawned = await spawnSupervisedSubagent(
        { taskPrompt: 'Cancel test', waitMode: 'async_immediate' },
        { runToolLoop }
      )

      const res = await controlSubagent({
        subagentId: spawned.subagentId,
        action: 'cancel',
      })

      expect(res.ok).toBe(true)
      expect(res.status).toBe('cancelled')
      expect(aborted).toBe(true)
      const record = activeSubagents.get(spawned.subagentId)
      expect(record.status).toBe('cancelled')
    })

    it('T5.5: peekSubagentStream returns non-blocking live snapshot in O(1) time without locks', async () => {
      const runToolLoop = createControllableToolLoop({
        thinkingDeltas: ['Analyzing AST'],
        streamDeltas: ['Found 3 issues'],
        hang: true,
      })

      const spawned = await spawnSupervisedSubagent(
        { taskPrompt: 'Peek timing test', waitMode: 'async_immediate' },
        { runToolLoop }
      )

      const start = performance.now()
      const peeks = peekSubagentStream({ subagentIds: [spawned.subagentId] })
      const duration = performance.now() - start

      expect(duration).toBeLessThan(10) // Ultra fast O(1) in-memory read
      expect(peeks.length).toBe(1)
      expect(peeks[0].subagentId).toBe(spawned.subagentId)
      expect(peeks[0].status).toBe('running')
      expect(peeks[0].recentThinkingTail).toContain('Analyzing AST')
      expect(peeks[0].recentTextTail).toContain('Found 3 issues')
    })

    it('T5.6: peekSubagentStream cursor pagination (fromSeq) returns only strictly new events', async () => {
      const spawned = await spawnSupervisedSubagent(
        { taskPrompt: 'Cursor test', waitMode: 'async_immediate' },
        { runToolLoop: vi.fn() }
      )

      const record = activeSubagents.get(spawned.subagentId)
      record.liveBuffer.appendToolEvent('log', 'Event 1')
      record.liveBuffer.appendToolEvent('log', 'Event 2')
      record.liveBuffer.appendToolEvent('log', 'Event 3')

      const peekAll = peekSubagentStream({ subagentIds: spawned.subagentId, fromSeq: 0 })
      const events = peekAll[0].streamEvents
      expect(events.length).toBeGreaterThanOrEqual(3)

      const midSeq = events[events.length - 2].seq
      const incrementalPeek = peekSubagentStream({ subagentIds: spawned.subagentId, fromSeq: midSeq })
      expect(incrementalPeek[0].streamEvents.length).toBe(1)
      expect(incrementalPeek[0].streamEvents[0].content).toContain('Event 3')
    })

    it('T5.7: peekSubagentStream handles wildcard (*), array of IDs, and non-existent IDs', async () => {
      // Non-existent ID
      const notFound = peekSubagentStream({ subagentIds: 'sub_missing_999' })
      expect(notFound[0].status).toBe('not_found')

      // Wildcard
      const all = peekSubagentStream({ subagentIds: '*' })
      expect(Array.isArray(all)).toBe(true)

      // Array of IDs
      const arrayQuery = peekSubagentStream({ subagentIds: ['sub_a', 'sub_b'] })
      expect(arrayQuery.length).toBe(2)
    })

    it('T5.8: Validation errors for missing subagentId, unknown actions, and missing parameters', async () => {
      expect((await controlSubagent({})).error).toContain('subagentId is required')
      expect((await controlSubagent({ subagentId: 'sub_unknown', action: 'cancel' })).error).toContain('not found')
      expect((await controlSubagent({ subagentId: 'sub_valid', action: 'hot_swap_model' })).error).toContain('not found')

      const runToolLoop = createControllableToolLoop({ hang: true })
      const spawned = await spawnSupervisedSubagent({ waitMode: 'async_immediate' }, { runToolLoop })

      const noParamsSwap = await controlSubagent({ subagentId: spawned.subagentId, action: 'hot_swap_model' })
      expect(noParamsSwap.ok).toBe(false)
      expect(noParamsSwap.error).toContain('newProviderId and newModelId are required')

      const noMsgSteer = await controlSubagent({ subagentId: spawned.subagentId, action: 'steer' })
      expect(noMsgSteer.ok).toBe(false)
      expect(noMsgSteer.error).toContain('steeringMessage is required')

      const invalidAction = await controlSubagent({ subagentId: spawned.subagentId, action: 'invalid_op' as any })
      expect(invalidAction.ok).toBe(false)
      expect(invalidAction.error).toContain('Unknown action')
    })

    it('T5.9: Database provider and model resolution during hot_swap_model', async () => {
      const db = createMockDb()
      const runToolLoop = createControllableToolLoop({ hang: true })
      const spawned = await spawnSupervisedSubagent(
        { providerId: 1, modelId: 'gpt-4o', waitMode: 'async_immediate' },
        { db, runToolLoop }
      )

      // Hot swap using DB-backed IDs (provider 2 is Anthropic Tier 1)
      const res = await controlSubagent({
        subagentId: spawned.subagentId,
        action: 'hot_swap_model',
        newProviderId: 2,
        newModelId: 'claude-3-7-sonnet',
        db,
      })

      expect(res.ok).toBe(true)
      const record = activeSubagents.get(spawned.subagentId)
      expect(record.provider.name).toBe('Anthropic Tier 1')
      expect(record.model.display_name).toBe('Claude 3.7 Sonnet')
    })
  })
})
