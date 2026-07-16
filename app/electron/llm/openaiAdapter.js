// ───────────────────────────────────────────────────────────────────────────
// OpenAI-compatible adapter
//
// Covers OpenAI itself and any proxy that speaks the /chat/completions +
// /models protocol (OpenRouter, Together, DeepSeek, local LM Studio / Ollama's
// OpenAI shim, etc.). This is the format AetherAI has always used; this file
// extracts that logic out of the handlers so it lives in one place.
// ───────────────────────────────────────────────────────────────────────────

// Strip trailing slashes so `${base}/chat/completions` never doubles up.
function baseUrl(provider) {
  return (provider.api_url || '').replace(/\/+$/, '')
}

// Obtain the best API key for the provider. Tries the credential pool first
// (multi-key rotation + backoff), falls back to the legacy provider.api_key.
function pickKey(provider) {
  if (provider.id != null) {
    const credential = require('./credentialPool').pickCredential(provider.id)
    if (credential && credential.api_key) return credential.api_key
  }
  return provider.api_key || ''
}

// Build the standard auth headers for an OpenAI-compatible endpoint.
function headers(provider) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${pickKey(provider)}` }
}

// Normalize messages for the wire. OpenAI accepts content as a string or as a
// multimodal parts array. Crucially, preserve tool_calls (on assistant messages
// that requested tools) and tool_call_id + name (on tool-role result messages)
// — dropping either makes the provider 400 on the second round of a tool loop.
function normalizeMessages(messages) {
  return messages.map(m => {
    const out = { role: m.role, content: m.content }
    if (m.tool_calls) out.tool_calls = m.tool_calls
    if (m.tool_call_id) out.tool_call_id = m.tool_call_id
    if (m.name) out.name = m.name
    return out
  })
}

// Stream a completion. Yields delta strings. Throws on non-2xx so the caller
// can decide whether to fall back to the next model.
// NOTE: we deliberately do NOT send `stream_options:{include_usage:true}`.
// Many OpenAI-compatible relays (hcnsec, some OpenRouter mirrors) don't
// support it and either drop the stream or return empty — which surfaced as
// "blank output" for the main reply while non-streaming calls (title, arena)
// worked fine. Usage stats are collected on the non-streaming paths instead.
async function* streamChat({ provider, model, messages, signal, options = {} }) {
  const gen = streamChatInner({ provider, model, messages, signal, options })
  const wrapper = (async function* () {
    for await (const d of gen) yield d
    wrapper.usage = gen.usage
  })()
  wrapper.usage = null
  return wrapper
}

async function* streamChatInner({ provider, model, messages, signal, options = {} }) {
  const res = await fetch(`${baseUrl(provider)}/chat/completions`, {
    method: 'POST',
    headers: headers(provider),
    body: JSON.stringify({ model: model.model_name, messages: normalizeMessages(messages), stream: true, ...options }),
    signal,
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    const err = new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`)
    err.status = res.status
    // On 429, mark the current credential as cooling down so the fallback
    // loop can retry with a different key if the provider has a multi-key pool.
    if (err.status === 429 && provider.id != null) {
      try { require('./credentialPool').markCooldownForProvider(provider.id) } catch {}
    }
    throw err
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  streamChatInner.usage = null
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || '' // keep the partial last line
    for (const line of lines) {
      const { delta, usage } = parseSSELine(line)
      if (usage) streamChatInner.usage = usage
      if (delta) yield delta
    }
  }
  // Flush any trailing buffered line.
  if (buffer.startsWith('data: ')) {
    const { delta, usage } = parseSSELine(buffer)
    if (usage) streamChatInner.usage = usage
    if (delta) yield delta
  }
}

// Parse one SSE `data:` line into { delta, usage }. delta is the content
// string (or '' / null); usage is set when the chunk carries token usage
// (the final chunk when stream_options.include_usage is on).
function parseSSELine(line) {
  if (!line.startsWith('data: ')) return {}
  const data = line.slice(6).trim()
  if (data === '[DONE]' || data === '') return {}
  try {
    const parsed = JSON.parse(data)
    return {
      delta: parsed.choices?.[0]?.delta?.content || '',
      usage: parsed.usage ? normalizeUsage(parsed.usage) : null,
    }
  } catch {
    return {} // malformed SSE line — ignore
  }
}

// Non-streaming completion. Returns the full message content string (empty on
// no-content). Throws on non-2xx.
async function completeChat({ provider, model, messages, signal, options = {} }) {
  const res = await fetch(`${baseUrl(provider)}/chat/completions`, {
    method: 'POST',
    headers: headers(provider),
    body: JSON.stringify({ model: model.model_name, messages: normalizeMessages(messages), stream: false, ...options }),
    signal,
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    const err = new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

// Non-streaming completion returning the full assistant message object
// ({ content, tool_calls, usage }) so callers (the tool loop) can inspect
// tool_calls AND log real server-reported token usage. `tool_calls`/`usage`
// are undefined when the model didn't request any / the provider didn't report.
async function completeChatMessage({ provider, model, messages, signal, options = {} }) {
  const res = await fetch(`${baseUrl(provider)}/chat/completions`, {
    method: 'POST',
    headers: headers(provider),
    body: JSON.stringify({ model: model.model_name, messages: normalizeMessages(messages), stream: false, ...options }),
    signal,
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    const err = new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  const data = await res.json()
  const msg = data.choices?.[0]?.message || {}
  return { content: msg.content || '', tool_calls: msg.tool_calls, usage: data.usage }
}

// Extract a normalized usage shape from a provider response `usage` object.
// Returns null if none. Captures prompt/completion/total tokens + cache stats
// (OpenAI: prompt_tokens_details.cached_tokens; Anthropic: cache_read_input_tokens
// / cache_creation_input_tokens — some relays surface these in usage too).
function normalizeUsage(u) {
  if (!u || typeof u !== 'object') return null
  const num = (v) => (typeof v === 'number' ? v : 0)
  return {
    prompt_tokens: num(u.prompt_tokens),
    completion_tokens: num(u.completion_tokens),
    total_tokens: num(u.total_tokens),
    cache_read_tokens: num(u.cache_read_input_tokens) || num(u.prompt_tokens_details?.cached_tokens) || 0,
    cache_creation_tokens: num(u.cache_creation_input_tokens) || num(u.cache_creation_tokens) || 0,
  }
}


// List model ids via GET /models. Returns [] on any failure (handlers treat
// an empty list as "couldn't fetch" rather than crashing).
async function listModels({ provider, signal }) {
  const res = await fetch(`${baseUrl(provider)}/models`, { headers: headers(provider), signal })
  if (!res.ok) return []
  const data = await res.json()
  return (data.data || []).map(m => m.id || m.name).filter(Boolean)
}

// Connectivity probe: try /models first; if 404 (proxy without /models), fall
// back to a 1-token chat ping. Reports auth errors specifically.
async function testConnection({ provider }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  const start = Date.now()
  try {
    const res = await fetch(`${baseUrl(provider)}/models`, { headers: headers(provider), signal: controller.signal })
    clearTimeout(timeout)
    if (res.ok) return { success: true, latencyMs: Date.now() - start }
    if (res.status === 404) {
      // Some proxies only implement /chat/completions. Ping with a 1-token request.
      const res2 = await fetch(`${baseUrl(provider)}/chat/completions`, {
        method: 'POST', headers: headers(provider),
        body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
        signal: controller.signal,
      })
      if (res2.ok) return { success: true, latencyMs: Date.now() - start }
      const e2 = await res2.text().catch(() => '')
      if (res2.status === 401 || res2.status === 403) return { success: false, errorMessage: 'API Key 无效' }
      return { success: false, errorMessage: `HTTP ${res2.status}: ${e2.slice(0, 200)}` }
    }
    const e1 = await res.text().catch(() => '')
    if (res.status === 401 || res.status === 403) return { success: false, errorMessage: 'API Key 无效' }
    return { success: false, errorMessage: `HTTP ${res.status}: ${e1.slice(0, 200)}` }
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') return { success: false, errorMessage: '连接超时（10秒）' }
    return { success: false, errorMessage: `网络错误: ${err.message}` }
  }
}

module.exports = { streamChat, completeChat, completeChatMessage, listModels, testConnection, normalizeUsage }
