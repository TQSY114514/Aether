// ───────────────────────────────────────────────────────────────────────────
// Anthropic Messages API adapter.
//
// For providers that speak the native Claude protocol: POST /messages with
// x-api-key + anthropic-version headers, system as a top-level field, and a
// messages array of {role, content} where content may be string or blocks.
//
// We translate the OpenAI-style message shape Aether uses internally into
// Anthropic's shape, and translate the streaming SSE events back into deltas.
// ───────────────────────────────────────────────────────────────────────────

const ANTHROPIC_VERSION = '2023-06-01'
const _credentialPool = require('./credentialPool')
const { baseUrl, normalizeUsage: _nu } = require('../utils/llmShared')

// 请求总超时: API 挂起时显式中止(与 openaiAdapter/responsesAdapter 同策略)
const REQUEST_TIMEOUT_MS = 120000

function withTimeout(signal) {
  const t = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, t]) : t
}
const { retryPromise, retryStream } = require('../utils/retry')
const { applyAnthropicCache } = require('./cachePolicy')

function headers(provider) {
  // Anthropic uses x-api-key + anthropic-version, NOT Bearer.
  return {
    'Content-Type': 'application/json',
    'x-api-key': _credentialPool.pickCredential(provider.id)?.api_key || provider.api_key || '',
    'anthropic-version': ANTHROPIC_VERSION,
  }
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

// Stream. Yields delta strings (text_delta) and thinking block objects
// ({ type: 'thinking', text } for thinking_delta). On content_block_start for
// a thinking block, yields a sentinel { type: 'thinking_start' } so the caller
// can surface a "thinking…" indicator. Throws on non-2xx.
//
// Returns an async generator. Assembled state (thinking blocks and the full
// tool_use array) is attached to the generator INSTANCE so consumers can read
// `stream.thinkingBlocks` / `stream.toolCalls` after the loop. (A generator
// body cannot reference its own instance via `this`, so we build the generator
// here and attach the properties to it — the fetch runs on first iteration.)
function streamChat({ provider, model, messages, signal, options = {} }) {
  const { system, messages: aMsgs } = toAnthropicMessages(messages)
  const body = {
    model: model.model_name,
    messages: aMsgs,
    max_tokens: options.max_tokens || 4096,
    stream: true,
  }
  if (system) body.system = system
  applyAnthropicCache(body)
  if (options.temperature != null) body.temperature = options.temperature
  if (options.top_p != null) body.top_p = options.top_p
  // Claude thinking: relay reasoning_effort → thinking.budget_tokens.
  if (options.reasoning_effort) {
    const budgets = { low: 1280, medium: 4096, high: 16000 }
    const b = budgets[options.reasoning_effort]
    if (b) { body.thinking = { type: 'enabled', budget_tokens: b }; body.temperature = 1 }
  }

  const gen = (async function* () {
    const res = await fetch(`${baseUrl(provider)}/messages`, {
      method: 'POST',
      headers: headers(provider),
      body: JSON.stringify(body),
      signal: withTimeout(signal),
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      const err = new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`)
      err.status = res.status
      if (res.status === 429 && provider.id != null) { try { _credentialPool.markCooldownForProvider(provider.id) } catch {} }
      throw err
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let _thinkingText = ''
    let _thinkingIndex = -1
    // Per-block accumulator keyed by content_block index. A tool_use block's
    // name + id arrive at content_block_start, its input arrives as fragments
    // via input_json_delta, and it is only complete at content_block_stop.
    const _toolBlocks = new Map() // index -> { id, name, inputJson }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const evt = parseSSELine(line)
        if (!evt) continue
        // content_block_start → begin accumulating a block.
        if (evt.type === 'content_block_start') {
          const block = evt.block || {}
          if (block.type === 'thinking') _thinkingIndex = evt.index
          else if (block.type === 'tool_use') {
            _toolBlocks.set(evt.index, { id: block.id, name: block.name, inputJson: '' })
          }
          continue
        }
        // content_block_delta → append the fragment to the active block.
        if (evt.type === 'content_block_delta') {
          const d = evt.delta || {}
          if (d.type === 'thinking_delta') {
            _thinkingText += d.thinking || ''
            gen.thinkingBlocks = [{ text: _thinkingText, ts: Date.now() }]
            // Forward accumulated thinking so the renderer can display it live
            // (chat.handler slices by lastThinkingLen to emit only new text).
            if (typeof options?.onThinkingDelta === 'function') {
              try { options.onThinkingDelta(d.thinking || '') } catch {}
            }
          } else if (d.type === 'text_delta') {
            // Only yield content strings so the plain-chat streaming path (which
            // concatenates deltas) doesn't get "[object Object]".
            yield d.text || ''
          } else if (d.type === 'input_json_delta') {
            // Append partial JSON to the active tool block. Never overwrite —
            // fragments MUST be concatenated in order or arguments are lost.
            const tb = _toolBlocks.get(evt.index)
            if (tb) tb.inputJson += d.partial_json || ''
          }
          continue
        }
        // content_block_stop → the block is complete; assemble the full tool_use.
        if (evt.type === 'content_block_stop') {
          if (evt.index === _thinkingIndex) { _thinkingIndex = -1; continue }
          const tb = _toolBlocks.get(evt.index)
          if (tb) {
            _toolBlocks.delete(evt.index)
            let input = {}
            try { input = tb.inputJson ? JSON.parse(tb.inputJson) : {} } catch {}
            gen.toolCalls = gen.toolCalls || []
            gen.toolCalls.push({ id: tb.id, type: 'function', function: { name: tb.name, arguments: JSON.stringify(input) } })
          }
          continue
        }
        // message_start / other events — no content to yield.
      }
    }
  })()

  // Attach accumulated state to the generator instance so consumers reading
  // `stream.thinkingBlocks` / `stream.toolCalls` can see them after the loop.
  gen.thinkingBlocks = null
  gen.toolCalls = null
  return gen
}

// Anthropic SSE: `event: <type>` then `data: {json}`.
// Returns a structured event so the caller can maintain the content_block
// state machine (start → delta → stop):
//   { type:'content_block_start', index, block }   block = parsed.content_block
//   { type:'content_block_delta', index, delta }   delta = parsed.delta
//   { type:'content_block_stop', index }
//   { type:'message_start', usage }
// Returns null for non-data lines, '[DONE]', or malformed JSON.
function parseSSELine(line) {
  if (!line.startsWith('data: ')) return null
  const data = line.slice(6).trim()
  if (!data || data === '[DONE]') return null
  try {
    const parsed = JSON.parse(data)
    const idx = parsed.index != null ? parsed.index : -1
    if (parsed.type === 'content_block_start') {
      return { type: 'content_block_start', index: idx, block: parsed.content_block || {} }
    }
    if (parsed.type === 'content_block_delta') {
      return { type: 'content_block_delta', index: idx, delta: parsed.delta || {} }
    }
    if (parsed.type === 'content_block_stop') {
      return { type: 'content_block_stop', index: idx }
    }
    if (parsed.type === 'message_start') {
      return { type: 'message_start', usage: parsed.message?.usage || parsed.usage }
    }
    if (parsed.type === 'message_delta') {
      return { type: 'message_delta', usage: parsed.usage }
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
  applyAnthropicCache(body)
  if (options.temperature != null) body.temperature = options.temperature
  if (options.top_p != null) body.top_p = options.top_p
  const res = await fetch(`${baseUrl(provider)}/messages`, {
    method: 'POST', headers: headers(provider), body: JSON.stringify(body), signal: withTimeout(signal),
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

// Streaming-backed completion returning { content, tool_calls, usage, reasoning }
// while streaming deltas in real time via options.onThinkingDelta and options.onStreamDelta.
async function completeChatMessage({ provider, model, messages, signal, options = {} }) {
  const onThinking = typeof options?.onThinkingDelta === 'function' ? options.onThinkingDelta : null
  const onStream = typeof options?.onStreamDelta === 'function' ? options.onStreamDelta : null
  const { system, messages: aMsgs } = toAnthropicMessages(messages)
  const useStream = options.stream !== false
  const body = {
    model: model.model_name,
    messages: aMsgs,
    max_tokens: options.max_tokens || 4096,
    stream: useStream,
  }
  if (system) body.system = system
  applyAnthropicCache(body)
  if (options.temperature != null) body.temperature = options.temperature
  if (options.top_p != null) body.top_p = options.top_p
  if (options.reasoning_effort) {
    const budgets = { low: 1280, medium: 4096, high: 16000 }
    const b = budgets[options.reasoning_effort]
    if (b) { body.thinking = { type: 'enabled', budget_tokens: b }; body.temperature = 1 }
  }

  const res = await fetch(`${baseUrl(provider)}/messages`, {
    method: 'POST', headers: headers(provider), body: JSON.stringify(body), signal: withTimeout(signal),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    const err = new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`)
    err.status = res.status
    throw err
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase()
  const isSSE = contentType.includes('text/event-stream')

  if (!useStream || !isSSE) {
    const data = await res.json()
    const { text, tool_calls } = parseToolUses(data.content)
    const usage = data.usage ? _nu(data.usage) : null
    const reasoning = (data.content || [])
      .filter(b => b.type === 'thinking' && b.thinking)
      .map(b => b.thinking)
      .join('')
    if (reasoning) { try { onThinking?.(reasoning) } catch {} }
    if (text) { try { onStream?.(text) } catch {} }
    return { content: text, tool_calls, usage, reasoning }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''
  let fullReasoning = ''
  let initialUsage = null
  let deltaUsage = null
  const _toolBlocks = new Map()
  const toolCalls = []
  let _thinkingIndex = -1

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const evt = parseSSELine(line)
      if (!evt) continue
      if (evt.type === 'message_start' && evt.usage) initialUsage = evt.usage
      if (evt.type === 'message_delta' && evt.usage) deltaUsage = evt.usage
      if (evt.type === 'content_block_start') {
        const block = evt.block || {}
        if (block.type === 'thinking') _thinkingIndex = evt.index
        else if (block.type === 'tool_use') {
          _toolBlocks.set(evt.index, { id: block.id, name: block.name, inputJson: '' })
        }
        continue
      }
      if (evt.type === 'content_block_delta') {
        const d = evt.delta || {}
        if (d.type === 'thinking_delta') {
          fullReasoning += d.thinking || ''
          try { onThinking?.(d.thinking || '') } catch {}
        } else if (d.type === 'text_delta') {
          fullContent += d.text || ''
          try { onStream?.(d.text || '') } catch {}
        } else if (d.type === 'input_json_delta') {
          const tb = _toolBlocks.get(evt.index)
          if (tb) tb.inputJson += d.partial_json || ''
        }
        continue
      }
      if (evt.type === 'content_block_stop') {
        if (evt.index === _thinkingIndex) { _thinkingIndex = -1; continue }
        const tb = _toolBlocks.get(evt.index)
        if (tb) {
          _toolBlocks.delete(evt.index)
          let input = {}
          try { input = tb.inputJson ? JSON.parse(tb.inputJson) : {} } catch {}
          toolCalls.push({ id: tb.id, type: 'function', function: { name: tb.name, arguments: JSON.stringify(input) } })
        }
        continue
      }
    }
  }

  const rawUsage = (initialUsage || deltaUsage) ? {
    input_tokens: (initialUsage?.input_tokens || 0),
    output_tokens: (deltaUsage?.output_tokens || initialUsage?.output_tokens || 0),
    cache_read_input_tokens: initialUsage?.cache_read_input_tokens || 0,
    cache_creation_input_tokens: initialUsage?.cache_creation_input_tokens || 0,
  } : null

  return {
    content: fullContent,
    tool_calls: toolCalls.length ? toolCalls : undefined,
    usage: rawUsage ? _nu(rawUsage) : null,
    reasoning: fullReasoning,
  }
}

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

// ─── Credential-rotation retry wrappers ──────────────────────────────────────
// Uses shared retryStream / retryPromise from utils/retry.js. The retry loop
// logic (MAX_CRED_RETRIES, retryable error detection, cooldown on 429) is
// centralized there.
// ───────────────────────────────────────────────────────────────────────────

async function* streamChatWithRetry({ provider, model, messages, signal, options = {} }) {
  yield* retryStream(
    () => streamChat({ provider, model, messages, signal, options }),
    () => { try { _credentialPool.markCooldownForProvider(provider.id) } catch {} }
  )
}

async function completeChatWithRetry({ provider, model, messages, signal, options = {} }) {
  return retryPromise(
    () => completeChat({ provider, model, messages, signal, options }),
    () => { try { _credentialPool.markCooldownForProvider(provider.id) } catch {} }
  )
}

async function completeChatMessageWithRetry({ provider, model, messages, signal, options = {} }) {
  return retryPromise(
    () => completeChatMessage({ provider, model, messages, signal, options }),
    () => { try { _credentialPool.markCooldownForProvider(provider.id) } catch {} }
  )
}

module.exports = {
  streamChat, completeChat, completeChatMessage, listModels, testConnection,
  toAnthropicMessages, parseToolUses, parseSSELine,
  streamChatWithRetry, completeChatWithRetry, completeChatMessageWithRetry,
}



