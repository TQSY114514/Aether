import { describe, it, expect, vi } from 'vitest'
import {
  classifyProviderEndpoint,
  probeSingleModel,
  inferModelCapabilities,
  buildProviderTopologySnapshot,
} from '../electron/llm/providerTopology'
import {
  SubagentLiveBuffer,
  spawnSupervisedSubagent,
  peekSubagentStream,
  controlSubagent,
} from '../electron/llm/subagentSupervisor'

describe('Challenger M3 Stress Suite — Features 17–20', () => {
  describe('Challenge 1: Endpoint Classification Spoofing & Boundaries (Feature 17)', () => {
    it('C1.1: Blocks subdomain spoofing attempts from masquerading as official_direct', () => {
      const spoofUrls = [
        'https://api.openai.com.attacker.com',
        'https://api.openai.com.phishing.org/v1',
        'https://api.anthropic.com.attacker.com',
        'https://api.deepseek.com.evil-relay.xyz/v1',
        'https://openai.com.attacker.com',
        'https://attacker-openai.com',
        'https://not-really-anthropic.com',
        'https://fake-deepseek.com',
      ]

      for (const url of spoofUrls) {
        const result = classifyProviderEndpoint(url, 'OpenAI')
        expect(result.endpointKind).not.toBe('official_direct')
        expect(result.endpointKind).toBe('third_party_relay')
      }
    })

    it('C1.2: Classifies exact official domains and valid subdomains as official_direct', () => {
      const officialCases = [
        'https://api.openai.com/v1',
        'https://api.anthropic.com',
        'https://api.deepseek.com',
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
        'https://open.bigmodel.cn/api/paas/v4',
        'https://api.moonshot.cn/v1',
        'https://api.minimax.chat/v1',
        'https://api.x.ai/v1',
        'https://api.mistral.ai/v1',
        'https://api.cohere.com/v1',
      ]

      for (const url of officialCases) {
        const result = classifyProviderEndpoint(url)
        expect(result.endpointKind).toBe('official_direct')
        expect(result.stabilityHint).toBe('tier1_official_sla')
        expect(result.concurrencyHint).toBe('high_concurrency_supported')
        expect(result.privacyLevel).toBe('official_enterprise_policy')
      }
    })

    it('C1.3: Classifies major commercial aggregators accurately', () => {
      const aggregatorCases = [
        'https://openrouter.ai/api/v1',
        'https://api.siliconflow.cn',
        'https://api.groq.com/openai/v1',
        'https://api.together.xyz/v1',
        'https://api.fireworks.ai/inference/v1',
        'https://api.deepinfra.com/v1',
      ]

      for (const url of aggregatorCases) {
        const result = classifyProviderEndpoint(url)
        expect(result.endpointKind).toBe('major_aggregator')
        expect(result.stabilityHint).toBe('tier2_commercial_gateway')
        expect(result.privacyLevel).toBe('routed_multi_upstream')
      }
    })

    it('C1.4: Classifies third party relays and private proxies accurately', () => {
      const relayCases = [
        'https://my-custom-newapi.xyz/v1',
        'https://community-one-api.net',
        'http://192.168.1.50:8000/v1',
        'http://10.0.0.1:11434',
      ]

      for (const url of relayCases) {
        const result = classifyProviderEndpoint(url)
        expect(result.endpointKind).toBe('third_party_relay')
        expect(result.stabilityHint).toBe('volatile_relay_probe_recommended')
        expect(result.privacyLevel).toBe('third_party_proxy')
      }
    })

    it('C1.5: [CHALLENGE REMEDIATED] IPv6 loopback http://[::1]:8000 is correctly classified as local_engine', () => {
      expect(classifyProviderEndpoint('http://localhost:11434').endpointKind).toBe('local_engine')
      expect(classifyProviderEndpoint('http://127.0.0.1:1234').endpointKind).toBe('local_engine')
      expect(classifyProviderEndpoint('http://0.0.0.0:8000').endpointKind).toBe('local_engine')
      expect(classifyProviderEndpoint('http://local-ollama.local:11434').endpointKind).toBe('local_engine')
      expect(classifyProviderEndpoint('http://[::1]:8000').endpointKind).toBe('local_engine')
      expect(classifyProviderEndpoint('http://[::]:8000').endpointKind).toBe('local_engine')
      expect(classifyProviderEndpoint('http://127.0.0.2:8000').endpointKind).toBe('local_engine')
    })

    it('C1.6: [DESIRED SPEC - PASSES] http://[::1]:8000 must be classified as local_engine', () => {
      const ipv6Result = classifyProviderEndpoint('http://[::1]:8000')
      expect(ipv6Result.endpointKind).toBe('local_engine')
      expect(ipv6Result.privacyLevel).toBe('local_strictly_private')
    })
  })

  describe('Challenge 2: Active TTFT Latency Probing & Socket Abortion (Feature 19)', () => {
    it('C2.1: Aborts socket immediately on first non-empty chunk without consuming extra stream tokens', async () => {
      let chunkCount = 0
      let socketAborted = false

      // Mock streaming body with multiple chunks
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          chunkCount++
          yield new TextEncoder().encode('data: {"choices":[{"delta":{"content":"A"}}]}\n\n')
          chunkCount++
          yield new TextEncoder().encode('data: {"choices":[{"delta":{"content":"B"}}]}\n\n')
          chunkCount++
          yield new TextEncoder().encode('data: {"choices":[{"delta":{"content":"C"}}]}\n\n')
        },
      }

      const mockFetch = vi.fn(async (url, init) => {
        init.signal.addEventListener('abort', () => {
          socketAborted = true
        })
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          body: mockStream,
        }
      })

      const probeResult = await probeSingleModel({
        provider: { id: 1, name: 'MockProvider', baseUrl: 'https://api.mock.com' },
        modelId: 'mock-model',
        timeoutMs: 5000,
        mockFetch,
      })

      expect(probeResult.available).toBe(true)
      expect(probeResult.status).toBe('healthy_fast')
      expect(typeof probeResult.ttftMs).toBe('number')
      expect(probeResult.ttftMs).toBeGreaterThanOrEqual(0)

      // CRITICAL ASSERTION: Socket must be aborted immediately upon receiving the first chunk
      expect(socketAborted).toBe(true)
      // Only 1 chunk should have been pulled by probeSingleModel
      expect(chunkCount).toBe(1)
    })

    it('C2.2: Aborts socket and returns timeout_stalled when request exceeds timeoutMs', async () => {
      let abortedSignalReason: any = null

      const mockFetch = vi.fn(async (url, init) => {
        return new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            abortedSignalReason = init.signal.reason
            const err = new Error('AbortError')
            err.name = 'AbortError'
            reject(err)
          })
          // Intentionally do not resolve to simulate upstream stall
        })
      })

      const probeResult = await probeSingleModel({
        provider: { id: 2, name: 'StalledProvider', baseUrl: 'https://api.stalled.com' },
        modelId: 'stalled-model',
        timeoutMs: 60,
        mockFetch,
      })

      expect(probeResult.available).toBe(false)
      expect(probeResult.status).toBe('timeout_stalled')
      expect(probeResult.ttftMs).toBeNull()
      expect(probeResult.errorDetail).toContain('Probe timed out after 60ms')
      expect(abortedSignalReason).toBeDefined()
    })

    it('C2.3: Handles empty stream response gracefully', async () => {
      const emptyStream = {
        async *[Symbol.asyncIterator]() {
          // Empty stream yields nothing
        },
      }

      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        body: emptyStream,
      }))

      const probeResult = await probeSingleModel({
        provider: { id: 3, name: 'EmptyProvider', baseUrl: 'https://api.empty.com' },
        modelId: 'empty-model',
        mockFetch,
      })

      expect(probeResult.available).toBe(false)
      expect(probeResult.status).toBe('empty_stream_response')
      expect(probeResult.errorDetail).toContain('closed stream with 0 bytes')
    })
  })

  describe('Challenge 3: Ring Buffer Capacity, Pruning & Delta Coalescing (Feature 20)', () => {
    it('C3.1: Enforces exact capacity 300, pruning oldest 50 events when 350 events are pushed', () => {
      const buffer = new SubagentLiveBuffer(300)

      // Push 350 distinct tool events
      for (let i = 1; i <= 350; i++) {
        buffer.appendToolEvent('tool_call_start', { toolName: `tool_${i}`, step: i })
      }

      expect(buffer.events.length).toBe(300)
      expect(buffer.seq).toBe(350)

      // First retained event must be event 51 (oldest 50 pruned)
      expect(buffer.events[0].seq).toBe(51)
      expect(JSON.parse(buffer.events[0].content).step).toBe(51)

      // Last retained event must be event 350
      expect(buffer.events[299].seq).toBe(350)
      expect(JSON.parse(buffer.events[299].content).step).toBe(350)

      const snap = buffer.snapshot({ tailCount: 50 })
      expect(snap.bufferedCount).toBe(300)
      expect(snap.latestSeq).toBe(350)
      expect(snap.streamEvents.length).toBe(50)
      expect(snap.streamEvents[0].seq).toBe(301)
    })

    it('C3.2: Coalesces 10 consecutive single-character thinking deltas into a single discrete event', () => {
      const buffer = new SubagentLiveBuffer(300)

      for (let i = 0; i < 10; i++) {
        buffer.appendStreamDelta('thinking', String(i))
      }

      expect(buffer.events.length).toBe(1)
      expect(buffer.seq).toBe(1)
      expect(buffer.events[0].type).toBe('thinking')
      expect(buffer.events[0].content).toBe('0123456789')
      expect(buffer.accumulatedThinking).toBe('0123456789')
    })

    it('C3.3: Spawns new event when coalesced delta exceeds 600 characters boundary', () => {
      const buffer = new SubagentLiveBuffer(300)

      // Push 500 chars -> event 1 created
      const chunk500 = 'A'.repeat(500)
      buffer.appendStreamDelta('text', chunk500)
      expect(buffer.events.length).toBe(1)
      expect(buffer.events[0].content.length).toBe(500)

      // Push 100 chars -> coalesced into event 1 (500 + 100 = 600)
      const chunk100 = 'B'.repeat(100)
      buffer.appendStreamDelta('text', chunk100)
      expect(buffer.events.length).toBe(1)
      expect(buffer.events[0].content.length).toBe(600)
      expect(buffer.seq).toBe(1)

      // Push 1 char -> 600 + 1 > 600, must spawn event 2
      buffer.appendStreamDelta('text', 'C')
      expect(buffer.events.length).toBe(2)
      expect(buffer.seq).toBe(2)
      expect(buffer.events[1].content).toBe('C')

      // Total accumulated text must match exact concatenation
      expect(buffer.accumulatedText.length).toBe(601)
      expect(buffer.accumulatedText).toBe(chunk500 + chunk100 + 'C')
    })

    it('C3.4: Does not coalesce across different event types (thinking vs text vs tool)', () => {
      const buffer = new SubagentLiveBuffer(300)

      buffer.appendStreamDelta('thinking', 'Thinking step')
      buffer.appendStreamDelta('text', 'Output step')
      buffer.appendToolEvent('tool_start', { name: 'run_cmd' })
      buffer.appendStreamDelta('text', 'Resuming text')

      expect(buffer.events.length).toBe(4)
      expect(buffer.events.map(e => e.type)).toEqual([
        'thinking',
        'text',
        'tool_start',
        'text',
      ])
    })
  })
})
