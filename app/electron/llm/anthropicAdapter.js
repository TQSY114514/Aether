// ───────────────────────────────────────────────────────────────────────────
// Anthropic Messages API adapter.
//
// For providers that speak the native Claude protocol: POST /messages with
// x-api-key + anthropic-version headers, system as a top-level field, and a
// messages array of {role, content} where content may be string or blocks.
//
// We translate the OpenAI-style message shape AetherAI uses internally into
// Anthropic's shape, and translate the streaming SSE events back into deltas.
// ───────────────────────────────────────────────────────────────────────────

const ANTHROPIC_VERSION = '2023-06-01'

function baseUrl(provider) {
  return (provider.api_url || '').replace(/\/+$/, '')
}

function headers(provider) {
  // Anthropic uses x-api-key + anthropic-version, NOT Bearer.
  return {
    'Content-Type': 'application/json',
    'x-api-key': pickKey(provider),
    'anthropic-version': ANTHROPIC_VERSION,
  }
}

// Obtain the best API key (credential pool first, then legacy api_key).
function pickKey(provider) {
  if (provider.id != null) {
    try {
      const credential = require('./credentialPool').pickCredential(provider.id)
      if (credential && credential.api_key) return credential.api_key
    } catch {}
  }
  return provider.api_key || ''
}

// Convert OpenAI-style messages → Anthropic shape.
// - system messages are hoisted to a top-level `system` field (concatenated).
// - tool results (role 'tool') become user messages with tool_result blocks.
// - assistant tool_calls become assistant messages with tool_use blocks.
// - everything else: { role, content } (string or multimodal parts normalized
//   to Anthropic content blocks: text → {type:'text'}, image_url → {type:'image', source:{...}}).
function toAnthropicMessages(messages) {
  let system = ''
  const out = []
  for (const m of messages) {
    if (m.role === 'system') {
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')
      system += (system ? '\n\n' : '') + text
      continue
    }
    if (m.role === 'tool') {
      // tool result → user message with a tool_result block
      out.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
      })
      continue
    }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length) {
      const blocks = []
      if (m.content) blocks.push({ type: 'text', text: String(m.content) })
      for (const tc of m.tool_calls) {
        const fn = tc.function || {}
        let input = {}
        try { input = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : (fn.arguments || {}) } catch {}
        blocks.push({ type: 'tool_use', id: tc.id, name: fn.name, input })
      }
      out.push({ role: 'assistant', content: blocks })
      continue
    }
    // plain user/assistant
    out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: normalizeContent(m.content) })
  }
  return { system, messages: out }
}

// Normalize content into Anthropic blocks. String → [{type:'text',text}].
// OpenAI image_url parts → Anthropic image blocks (base64 only; URL images
// aren't supported by the Messages API without fetching).
function normalizeContent(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const blocks = []
    for (const part of content) {
      if (part && typeof part.text === 'string') blocks.push({ type: 'text', text: part.text })
      else if (part && part.type === 'image_url' && part.image_url) {
        const url = part.image_url.url || ''
        const m = /^data:([^;]+);base64,(.*)$/s.exec(url)
        if (m) {
          const media = m[1].split('/')[1] || 'png'
          blocks.push({ type: 'image', source: { type: 'base64', media_type: media, data: m[2] } })
        }
      }
    }
    return blocks.length ? blocks : ''
  }
  return ''
}

// Parse a tool_use block from an Anthropic content_block event stream into the
// OpenAI tool_calls shape (so the tool loop in toolLoop.js works unchanged).
function parseToolUses(content) {
  const tool_calls = []
  let text = ''
  if (!Array.isArray(content)) return { text: typeof content === 'string' ? content : '', tool_calls: undefined }
  for (const block of content) {
    if (block.type === 'text') text += block.text || ''
    else if (block.type === 'tool_use') {
      tool_calls.push({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input || {}) } })
    }
  }
  return { text, tool_calls: tool_calls.length ? tool_calls : undefined }
}

// Stream. Yields text deltas. Throws on non-2xx.
async function* streamChat({ provider, model, messages, signal, options = {} }) {
  const { system, messages: aMsgs } = toAnthropicMessages(messages)
  const body = {
    model: model.model_name,
    messages: aMsgs,
    max_tokens: options.max_tokens || 4096,
    stream: true,
  }
  if (system) body.system = system
  if (options.temperature != null) body.temperature = options.temperature
  if (options.top_p != null) body.top_p = options.top_p
  // Claude thinking: relay reasoning_effort → thinking.budget_tokens.
  if (options.reasoning_effort) {
    const budgets = { low: 1280, medium: 4096, high: 16000 }
    const b = budgets[options.reasoning_effort]
    if (b) { body.thinking = { type: 'enabled', budget_tokens: b }; body.temperature = 1 }
  }

  const res = await fetch(`${baseUrl(provider)}/messages`, {
    method: 'POST',
    headers: headers(provider),
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    const err = new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`)
    err.status = res.status
    if (res.status === 429 && provider.id != null) { try { require('./credentialPool').markCooldownForProvider(provider.id) } catch {} }
    throw err
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const delta = parseSSELine(line)
      if (delta) yield delta
    }
  }
}

// Anthropic SSE: `event: <type>` then `data: {json}`. We only care about
// content_block_delta (text deltas) and ignore the rest.
function parseSSELine(line) {
  if (!line.startsWith('data: ')) return null
  const data = line.slice(6).trim()
  if (!data || data === '[DONE]') return null
  try {
    const parsed = JSON.parse(data)
    if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
      return parsed.delta.text || ''
    }
  } catch {}
  return null
}

// Non-streaming. Returns the full text content string.
async function completeChat({ provider, model, messages, signal, options = {} }) {
  const { system, messages: aMsgs } = toAnthropicMessages(messages)
  const body = {
    model: model.model_name,
    messages: aMsgs,
    max_tokens: options.max_tokens || 4096,
  }
  if (system) body.system = system
  if (options.temperature != null) body.temperature = options.temperature
  if (options.top_p != null) body.top_p = options.top_p
  const res = await fetch(`${baseUrl(provider)}/messages`, {
    method: 'POST', headers: headers(provider), body: JSON.stringify(body), signal,
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    const err = new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  const data = await res.json()
  // Anthropic returns content as an array of blocks; concatenate text blocks.
  if (Array.isArray(data.content)) {
    return data.content.filter(b => b.type === 'text').map(b => b.text || '').join('')
  }
  return ''
}

// Non-streaming returning { content, tool_calls, usage }.
async function completeChatMessage({ provider, model, messages, signal, options = {} }) {
  const { system, messages: aMsgs } = toAnthropicMessages(messages)
  const body = {
    model: model.model_name,
    messages: aMsgs,
    max_tokens: options.max_tokens || 4096,
  }
  if (system) body.system = system
  if (options.temperature != null) body.temperature = options.temperature
  if (options.top_p != null) body.top_p = options.top_p
  const res = await fetch(`${baseUrl(provider)}/messages`, {
    method: 'POST', headers: headers(provider), body: JSON.stringify(body), signal,
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    const err = new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  const data = await res.json()
  const { text, tool_calls } = parseToolUses(data.content)
  const usage = data.usage ? {
    prompt_tokens: data.usage.input_tokens || 0,
    completion_tokens: data.usage.output_tokens || 0,
    total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
    cache_read_tokens: data.usage.cache_read_input_tokens || 0,
    cache_creation_tokens: data.usage.cache_creation_input_tokens || 0,
  } : null
  return { content: text, tool_calls, usage }
}

// Anthropic has no /models endpoint; return [] (the user configures model names).
async function listModels() { return [] }

// Connectivity probe: a minimal /messages request with max_tokens:1.
async function testConnection({ provider }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  const start = Date.now()
  try {
    const res = await fetch(`${baseUrl(provider)}/messages`, {
      method: 'POST', headers: headers(provider),
      body: JSON.stringify({ model: 'claude-3-5-haiku-20241022', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (res.ok) return { success: true, latencyMs: Date.now() - start }
    const e = await res.text().catch(() => '')
    if (res.status === 401 || res.status === 403) return { success: false, errorMessage: 'API Key 无效' }
    return { success: false, errorMessage: `HTTP ${res.status}: ${e.slice(0, 200)}` }
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') return { success: false, errorMessage: '连接超时（10秒）' }
    return { success: false, errorMessage: `网络错误: ${err.message}` }
  }
}

module.exports = { streamChat, completeChat, completeChatMessage, listModels, testConnection }
