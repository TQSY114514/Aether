'use strict'

// ─────────────────────────────────────────────────────────────────────────────
// providerTopology.js — Provider Endpoint Classification, Topology Snapshot
// and Active Streaming TTFT Latency Probing (Milestone 3: Features 17–19)
//
// Electron-Free Boundary: Plain CommonJS module. Zero 'electron' imports.
// ─────────────────────────────────────────────────────────────────────────────

// In-memory runtime probe cache: Map<`${providerId}::${modelId}`, ProbeResult>
const runtimeProbeCache = new Map()

/**
 * Classifies an LLM endpoint based on baseUrl and providerName.
 * @param {string} [baseUrlInput=''] - Target API endpoint URL.
 * @param {string} [providerNameInput=''] - Configured name of the provider.
 * @returns {{
 *   endpointKind: 'local_engine' | 'official_direct' | 'major_aggregator' | 'third_party_relay',
 *   stabilityHint: 'high_local_zero_cost' | 'tier1_official_sla' | 'tier2_commercial_gateway' | 'volatile_relay_probe_recommended',
 *   concurrencyHint: 'serial_gpu_bound' | 'high_concurrency_supported' | 'moderate_watch_for_429_or_stall',
 *   privacyLevel: 'local_strictly_private' | 'official_enterprise_policy' | 'routed_multi_upstream' | 'third_party_proxy',
 *   description: string
 * }}
 */
function classifyProviderEndpoint(baseUrlInput = '', providerNameInput = '') {
  const pName = String(providerNameInput || '').trim().toLowerCase()
  const rawUrl = String(baseUrlInput || '').trim()

  // 1. Check for local engine indicators
  const isLocalName = /ollama|lm[\s_-]?studio|local|vllm|text[\s_-]?generation/i.test(pName)
  if (!rawUrl) {
    return {
      endpointKind: 'local_engine',
      stabilityHint: 'high_local_zero_cost',
      concurrencyHint: 'serial_gpu_bound',
      privacyLevel: 'local_strictly_private',
      description: 'Local engine running on user hardware (zero cost, private, concurrency limited by VRAM)',
    }
  }

  let host = ''
  let port = ''
  try {
    const parsed = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `http://${rawUrl}`)
    host = (parsed.hostname || '').toLowerCase()
    port = parsed.port || ''
  } catch {
    host = rawUrl.toLowerCase()
  }

  // Strip IPv6 brackets '[::1]' -> '::1' if present (WHATWG URL.hostname retains brackets per RFC 3986)
  const cleanHost = host.replace(/^\[|\]$/g, '')

  const isLocalHost =
    cleanHost === 'localhost' ||
    cleanHost === '127.0.0.1' ||
    cleanHost === '0.0.0.0' ||
    cleanHost === '::1' ||
    cleanHost === '::' ||
    /^127(?:\.\d{1,3}){3}$/.test(cleanHost) ||
    cleanHost.endsWith('.local')

  if (isLocalHost || (isLocalName && (port === '11434' || port === '1234' || !cleanHost))) {
    return {
      endpointKind: 'local_engine',
      stabilityHint: 'high_local_zero_cost',
      concurrencyHint: 'serial_gpu_bound',
      privacyLevel: 'local_strictly_private',
      description: 'Local engine running on user hardware (zero cost, private, concurrency limited by VRAM)',
    }
  }

  // Helper: Match domain exact or valid subdomains (e.g. api.openai.com, custom.api.openai.com)
  const matchesDomain = (targetDomain) => {
    return cleanHost === targetDomain || cleanHost.endsWith('.' + targetDomain)
  }

  // 2. Official Direct Tier-1 Endpoints
  const officialDomains = [
    'openai.com',
    'anthropic.com',
    'googleapis.com',
    'deepseek.com',
    'aliyuncs.com',
    'bigmodel.cn',
    'moonshot.cn',
    'minimaxi.chat',
    'minimax.chat',
    'x.ai',
    'mistral.ai',
    'cohere.com',
    'cohere.ai',
  ]
  if (officialDomains.some(matchesDomain)) {
    return {
      endpointKind: 'official_direct',
      stabilityHint: 'tier1_official_sla',
      concurrencyHint: 'high_concurrency_supported',
      privacyLevel: 'official_enterprise_policy',
      description: 'First-party official API with dedicated SLA, low latency, and native caching',
    }
  }

  // 3. Major Commercial Aggregators
  const aggregatorDomains = [
    'openrouter.ai',
    'aihubmix.com',
    'siliconflow.cn',
    'together.xyz',
    'together.ai',
    'fireworks.ai',
    'groq.com',
    'deepinfra.com',
    'perplexity.ai',
  ]
  if (aggregatorDomains.some(matchesDomain)) {
    return {
      endpointKind: 'major_aggregator',
      stabilityHint: 'tier2_commercial_gateway',
      concurrencyHint: 'high_concurrency_supported',
      privacyLevel: 'routed_multi_upstream',
      description: 'Commercial multi-provider routing platform with unified billing and broad model availability',
    }
  }

  // 4. Third-Party Relay Fallback
  return {
    endpointKind: 'third_party_relay',
    stabilityHint: 'volatile_relay_probe_recommended',
    concurrencyHint: 'moderate_watch_for_429_or_stall',
    privacyLevel: 'third_party_proxy',
    description: 'Third-party proxy or community relay (variable uptime and rate limits, probing strongly recommended)',
  }
}

/**
 * Infers model capability tags from model identifier string.
 * @param {string} [modelId='']
 * @returns {Array<'frontier_reasoning_and_architecture' | 'strong_coding_and_execution' | 'low_latency_fast_exploration' | 'general_purpose'>}
 */
function inferModelCapabilities(modelId = '') {
  const m = String(modelId || '').trim()
  const tags = []

  if (/opus|gpt-5|o3|o1|o4|deepseek-r1|deepseek-reasoner|qwq|gemini-2\.5-pro|gemini-3|claude-4|sonnet-4|glm-5/i.test(m)) {
    tags.push('frontier_reasoning_and_architecture')
  }
  if (/sonnet|gpt-4\.1|gpt-4o|deepseek-chat|deepseek-v3|qwen-?2\.5-?coder|qwen3|codestral|kimi-k2/i.test(m)) {
    tags.push('strong_coding_and_execution')
  }
  if (/haiku|mini|nano|flash|turbo|7b|8b|14b/i.test(m)) {
    tags.push('low_latency_fast_exploration')
  }
  if (tags.length === 0) {
    tags.push('general_purpose')
  }
  return tags
}

/**
 * Resolves probe target URL.
 */
function resolveProbeUrl(provider) {
  const protocol = (provider.api_format || provider.protocol || provider.type || 'openai').toLowerCase()
  const raw = (provider.api_url || provider.baseUrl || provider.base_url || '').replace(/\/+$/, '')
  if (protocol === 'anthropic' || raw.includes('anthropic.com')) {
    if (raw.endsWith('/messages')) return raw
    if (raw.endsWith('/v1')) return `${raw}/messages`
    return `${raw}/v1/messages`
  }
  if (raw.endsWith('/chat/completions')) return raw
  if (raw.endsWith('/v1')) return `${raw}/chat/completions`
  return `${raw}/v1/chat/completions`
}

/**
 * Resolves probe HTTP headers.
 */
function resolveProbeHeaders(provider) {
  const protocol = (provider.api_format || provider.protocol || provider.type || 'openai').toLowerCase()
  const apiKey = provider.api_key || provider.apiKey || ''
  const isAnthropic = protocol === 'anthropic' || String(provider.api_url || provider.baseUrl || '').includes('anthropic.com')

  const hdrs = { 'Content-Type': 'application/json' }
  if (isAnthropic) {
    if (apiKey) hdrs['x-api-key'] = apiKey
    hdrs['anthropic-version'] = '2023-06-01'
    if (apiKey) hdrs['Authorization'] = `Bearer ${apiKey}`
  } else {
    if (apiKey) hdrs['Authorization'] = `Bearer ${apiKey}`
  }
  return hdrs
}

/**
 * Probes a single model on a provider for TTFT and availability.
 * @param {object} opts
 * @param {object} opts.provider - Provider record.
 * @param {string} opts.modelId - Model identifier string.
 * @param {number} [opts.timeoutMs=6000] - Probe timeout in milliseconds.
 * @param {Function} [opts.mockFetch] - Optional mock fetch implementation for offline testing.
 * @returns {Promise<{
 *   providerId: number|string,
 *   providerName: string,
 *   baseUrl: string,
 *   modelId: string,
 *   available: boolean,
 *   status: 'healthy_fast' | 'healthy_normal' | 'healthy_slow' | 'rate_limited_429' | 'upstream_error_5xx' | 'http_error_xxx' | 'empty_stream_response' | 'timeout_stalled' | 'network_unreachable',
 *   ttftMs: number | null,
 *   headerLatencyMs: number,
 *   errorDetail: string | null,
 *   checkedAt: string
 * }>}
 */
async function probeSingleModel(opts = {}) {
  const { provider, modelId, timeoutMs = 6000, mockFetch } = opts
  if (!provider) {
    throw new Error('probeSingleModel requires a provider object')
  }

  const cleanBase = (provider.api_url || provider.baseUrl || provider.base_url || '').replace(/\/+$/, '')
  const targetUrl = resolveProbeUrl(provider)
  const headers = resolveProbeHeaders(provider)
  const fetchFn = mockFetch || globalThis.fetch

  const payload = {
    model: modelId,
    messages: [{ role: 'user', content: '1' }],
    max_tokens: 1,
    stream: true,
  }

  const controller = new AbortController()
  let timeoutId = null
  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      try { controller.abort(new Error('TIMEOUT')) } catch {}
    }, timeoutMs)
  }

  const startMs = performance.now()
  let headerLatencyMs = 0
  let ttftMs = null
  let firstChunkReceived = false

  try {
    const res = await fetchFn(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    headerLatencyMs = Math.round(performance.now() - startMs)

    if (!res.ok) {
      if (timeoutId) clearTimeout(timeoutId)
      let detail = `HTTP ${res.status}`
      try {
        const errText = typeof res.text === 'function' ? await res.text() : ''
        if (errText) detail = String(errText).slice(0, 240)
      } catch {}

      let status = `http_error_${res.status}`
      if (res.status === 429) status = 'rate_limited_429'
      else if (res.status >= 500) status = `upstream_error_${res.status}`

      const report = {
        providerId: provider.id,
        providerName: provider.name || '',
        baseUrl: cleanBase,
        modelId,
        available: false,
        status,
        ttftMs: null,
        headerLatencyMs,
        errorDetail: detail,
        checkedAt: new Date().toISOString(),
      }
      runtimeProbeCache.set(`${provider.id}::${modelId}`, report)
      return report
    }

    // Read the first stream chunk
    if (res.body) {
      if (typeof res.body.getReader === 'function') {
        const reader = res.body.getReader()
        try {
          const { done, value } = await reader.read()
          if (!done && value && value.length > 0) {
            firstChunkReceived = true
          }
        } finally {
          try { reader.releaseLock?.() } catch {}
        }
      } else if (res.body[Symbol.asyncIterator]) {
        for await (const chunk of res.body) {
          if (chunk && chunk.length > 0) {
            firstChunkReceived = true
            break
          }
        }
      }
    }

    if (firstChunkReceived) {
      ttftMs = Math.round(performance.now() - startMs)
      try { controller.abort('PROBE_COMPLETE') } catch {}
      if (timeoutId) clearTimeout(timeoutId)

      let status = 'healthy_normal'
      if (ttftMs < 1500) status = 'healthy_fast'
      else if (ttftMs >= 4000) status = 'healthy_slow'

      const report = {
        providerId: provider.id,
        providerName: provider.name || '',
        baseUrl: cleanBase,
        modelId,
        available: true,
        status,
        ttftMs,
        headerLatencyMs,
        errorDetail: null,
        checkedAt: new Date().toISOString(),
      }
      runtimeProbeCache.set(`${provider.id}::${modelId}`, report)
      return report
    } else {
      if (timeoutId) clearTimeout(timeoutId)
      const report = {
        providerId: provider.id,
        providerName: provider.name || '',
        baseUrl: cleanBase,
        modelId,
        available: false,
        status: 'empty_stream_response',
        ttftMs: null,
        headerLatencyMs,
        errorDetail: 'Server returned 200 OK headers but closed stream with 0 bytes',
        checkedAt: new Date().toISOString(),
      }
      runtimeProbeCache.set(`${provider.id}::${modelId}`, report)
      return report
    }
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId)

    if (firstChunkReceived) {
      ttftMs = Math.round(performance.now() - startMs)
      let status = 'healthy_normal'
      if (ttftMs < 1500) status = 'healthy_fast'
      else if (ttftMs >= 4000) status = 'healthy_slow'

      const report = {
        providerId: provider.id,
        providerName: provider.name || '',
        baseUrl: cleanBase,
        modelId,
        available: true,
        status,
        ttftMs,
        headerLatencyMs,
        errorDetail: null,
        checkedAt: new Date().toISOString(),
      }
      runtimeProbeCache.set(`${provider.id}::${modelId}`, report)
      return report
    }

    const isTimeout =
      controller.signal.aborted ||
      err?.name === 'AbortError' ||
      err === 'TIMEOUT' ||
      String(err?.message || '').includes('TIMEOUT')

    const status = isTimeout ? 'timeout_stalled' : 'network_unreachable'
    const detail = isTimeout
      ? `Probe timed out after ${timeoutMs}ms without first token`
      : (err?.message || String(err))

    const report = {
      providerId: provider.id,
      providerName: provider.name || '',
      baseUrl: cleanBase,
      modelId,
      available: false,
      status,
      ttftMs: null,
      headerLatencyMs: headerLatencyMs || Math.round(performance.now() - startMs),
      errorDetail: detail,
      checkedAt: new Date().toISOString(),
    }
    runtimeProbeCache.set(`${provider.id}::${modelId}`, report)
    return report
  }
}

/**
 * Concurrently probes multiple targets.
 */
async function probeModels(targets = [], { timeoutMs = 6000, mockFetch } = {}) {
  if (!Array.isArray(targets) || targets.length === 0) return []
  return Promise.all(
    targets.map(t => probeSingleModel({ provider: t.provider, modelId: t.modelId, timeoutMs, mockFetch }))
  )
}

/**
 * Extracts providers from db supporting both real better-sqlite3 and mock DBs.
 */
function getActiveProviders(db, includeInactive = false) {
  if (!db) return []
  let rows = []

  if (typeof db.listProviders === 'function') {
    try {
      rows = db.listProviders()
    } catch {}
  } else if (typeof db.getProvidersDecrypted === 'function') {
    try {
      rows = db.getProvidersDecrypted()
    } catch {}
  } else if (typeof db.getProviders === 'function') {
    try {
      rows = db.getProviders()
    } catch {}
  } else if (typeof db.prepare === 'function') {
    try {
      rows = db.prepare('SELECT * FROM provider ORDER BY id').all()
      if (typeof db.decryptKey === 'function') {
        rows = rows.map(r => ({ ...r, api_key: db.decryptKey(r.api_key) }))
      }
    } catch {}
  }

  if (!Array.isArray(rows)) return []

  if (includeInactive) return rows
  return rows.filter(p => p && (p.enabled == null || p.enabled === 1 || p.enabled === true || p.enabled === '1'))
}

/**
 * Extracts models for a provider supporting mock and real db representations.
 */
function getModelsForProvider(db, provider) {
  if (!provider) return []
  if (Array.isArray(provider.models)) {
    return provider.models
  }
  if (typeof provider.models === 'string') {
    try {
      const parsed = JSON.parse(provider.models)
      if (Array.isArray(parsed)) return parsed
    } catch {
      return []
    }
  }

  if (db) {
    if (typeof db.listModelsByProvider === 'function') {
      try {
        const list = db.listModelsByProvider(provider.id)
        if (Array.isArray(list)) return list
      } catch {}
    }
    if (typeof db.getModels === 'function') {
      try {
        const list = db.getModels(provider.id)
        if (Array.isArray(list)) return list
      } catch {}
    }
    if (typeof db.prepare === 'function') {
      try {
        const rows = db.prepare('SELECT * FROM model WHERE provider_id = ? ORDER BY fallback_order ASC, id ASC').all(provider.id)
        if (Array.isArray(rows)) return rows
      } catch {}
    }
  }

  return []
}

/**
 * Builds a complete provider topology snapshot from database and cached probe metrics.
 * @param {object} db - SQLite database instance or mock db
 * @param {object} [opts]
 * @param {boolean} [opts.includeInactive=false]
 * @returns {Array<object>}
 */
function buildProviderTopologySnapshot(db, { includeInactive = false } = {}) {
  const providers = getActiveProviders(db, includeInactive)
  if (!providers || providers.length === 0) return []

  const snapshot = []
  for (const p of providers) {
    const cleanUrl = (p.api_url || p.baseUrl || p.base_url || '').replace(/\/+$/, '')
    const meta = classifyProviderEndpoint(cleanUrl, p.name)
    const rawModels = getModelsForProvider(db, p)

    const models = rawModels.map(m => {
      const modelId = typeof m === 'string' ? m : (m.model_name || m.id || m.modelId || m.name)
      const cacheKey = `${p.id}::${modelId}`
      const cached = runtimeProbeCache.get(cacheKey) || null
      return {
        modelId,
        displayName: typeof m === 'object' ? (m.display_name || modelId) : modelId,
        isPrimary: typeof m === 'object' ? Boolean(m.is_primary) : false,
        capabilityHints: inferModelCapabilities(modelId),
        lastProbe: cached
          ? {
              available: cached.available,
              status: cached.status,
              ttftMs: cached.ttftMs,
              checkedAt: cached.checkedAt,
            }
          : { status: 'untested' },
      }
    })

    snapshot.push({
      providerId: p.id,
      providerName: p.name || `Provider ${p.id}`,
      protocol: p.api_format || p.protocol || p.type || 'openai',
      baseUrl: cleanUrl,
      endpointKind: meta.endpointKind,
      stabilityHint: meta.stabilityHint,
      concurrencyHint: meta.concurrencyHint,
      privacyLevel: meta.privacyLevel,
      endpointDescription: meta.description,
      models,
    })
  }

  return snapshot
}

function escapeXml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Formats provider topology snapshot into an XML block for system prompt injection.
 * @param {object} db - SQLite database instance
 * @returns {string} XML string or empty string if no providers
 */
function buildTopologyPromptXml(db) {
  const snapshot = buildProviderTopologySnapshot(db)
  if (!snapshot || snapshot.length === 0) return ''

  const lines = ['<available_providers_and_models>']
  for (const p of snapshot) {
    const pAttrs = [
      `id="${p.providerId}"`,
      `name="${escapeXml(p.providerName)}"`,
      `kind="${p.endpointKind}"`,
      `stability="${p.stabilityHint}"`,
      `url="${escapeXml(p.baseUrl)}"`,
    ].join(' ')
    lines.push(`  <provider ${pAttrs}>`)

    for (const m of p.models) {
      const tier = m.capabilityHints && m.capabilityHints.length > 0 ? m.capabilityHints[0] : 'general_purpose'
      const status = m.lastProbe?.status || 'untested'
      let mAttrs = `id="${escapeXml(m.modelId)}" tier="${tier}" status="${status}"`
      if (m.lastProbe?.ttftMs != null) {
        mAttrs += ` ttft="${m.lastProbe.ttftMs}ms"`
      }
      lines.push(`    <model ${mAttrs} />`)
    }
    lines.push('  </provider>')
  }
  lines.push('</available_providers_and_models>')
  return lines.join('\n')
}

function getRuntimeProbeCache() {
  return runtimeProbeCache
}

function clearRuntimeProbeCache() {
  runtimeProbeCache.clear()
}

module.exports = {
  classifyProviderEndpoint,
  inferModelCapabilities,
  probeSingleModel,
  probeModels,
  buildProviderTopologySnapshot,
  buildTopologyPromptXml,
  getRuntimeProbeCache,
  clearRuntimeProbeCache,
  runtimeProbeCache,
}
