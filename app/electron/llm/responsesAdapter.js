// ───────────────────────────────────────────────────────────────────────────
// OpenAI Responses API adapter.
//
// Implements the newer OpenAI Responses protocol (POST /responses via SSE)
// as a standalone provider format. Registered in providerAdapter.js under
// `api_format: 'responses'`. It exposes the same surface as openaiAdapter.js
// so the handlers and tool loop work unchanged:
//   streamChat / completeChat / completeChatMessage / listModels / testConnection
//   + the *WithRetry wrappers (shared retryStream / retryPromise).
//
// Wire differences vs /chat/completions:
//   - body uses `input` (an array of message / function_call_output items)
//     instead of `messages`.
//   - tool calls on assistant items appear as `output` of type function_call.
//   - tool results are `{ type: 'function_call_output', call_id, output }`.
//   - SSE deltas come via `response.output_text.delta` events; usage arrives
//     on `response.completed` in `response.usage`.
// ───────────────────────────────────────────────────────────────────────────

const { baseUrl, normalizeUsage } = require('../utils/llmShared')
const { retryPromise, retryStream } = require('../utils/retry')
const _credentialPool = require('./credentialPool')

function pickKey(provider) {
  if (provider.id != null) {
    const credential = _credentialPool.pickCredential(provider.id)
    if (credential && credential.api_key) return credential.api_key
  }
  return provider.api_key || ''
}

function headers(provider) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${pickKey(provider)}` }
}

// Convert AetherAI's OpenAI-style message array into Responses API `input` items.
//   - system / user / assistant (no tool_calls): { role, content }
//   - assistant with tool_calls: { role, content, output: [function_call, ...] }
//   - tool-role results: { type: 'function_call_output', call_id, output }
function toResponsesInput(messages) {
  const input = []
  for (const m of messages) {
    if (m.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: m.tool_call_id,
        output: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })
      continue
    }
    const item = { role: m.role === 'assistant' ? 'assistant' : (m.role === 'system' ? 'system' : 'user'), content: m.content }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length) {
      item.output = m.tool_calls.map(tc => {
        const fn = tc.function || {}
        const args = typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments || {})
        return { type: 'function_call', call_id: tc.id, name: fn.name, arguments: args }
      })
    }
    input.push(item)
  }
  return input
}

// Concatenate the output text from a Responses API `output` array.
function extractText(output) {
  if (!Array.isArray(output)) return ''
  let text = ''
  for (const item of output) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const part of item.content) if (part.type === 'output_text' && part.text) text += part.text
    }
  }
  return text
}

// Extract reasoning text (thinking) from a `output` array.
function extractReasoning(output) {
  if (!Array.isArray(output)) return ''
  let reasoning = ''
  for (const item of output) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part.type === 'reasoning') {
          if (part.text) reasoning += part.text
          else if (Array.isArray(part.summary)) reasoning += part.summary.map(s => s.text || '').join('')
        }
      }
    }
  }
  return reasoning
}

// Convert Responses API function_call items into the OpenAI chat `tool_calls`
// shape the tool loop expects. Handles top-level items and nested message.output.
function extractToolCalls(output) {
  const calls = []
  const collect = (list) => {
    if (!Array.isArray(list)) return
    for (const item of list) {
      if (item.type === 'function_call') {
        let args = item.arguments
        if (typeof args !== 'string') { try { args = JSON.stringify(args || {}) } catch { args = '{}' } }
        calls.push({ id: item.call_id, type: 'function', function: { name: item.name, arguments: args } })
      } else if (Array.isArray(item.output)) collect(item.output)
    }
  }
  collect(output)
  return calls.length ? calls : undefined
}

// Responses SSE: each `data:` line is a JSON object with a `type` field
// (e.g. response.output_text.delta, response.completed). No `event:` prefix.
function parseSSEEvent(line) {
  if (!line.startsWith('data: ')) return null
  const data = line.slice(6).trim()
  if (!data || data === '[DONE]') return null
  try {
    const parsed = JSON.parse(data)
    if (!parsed || typeof parsed.type !== 'string') return null
    return parsed
  } catch { return null }
}

// 请求总超时: API 挂起时显式中止(与 openaiAdapter 同策略)
const REQUEST_TIMEOUT_MS = 120000

function withTimeout(signal) {
  const t = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, t]) : t
}

async function* streamChat({ provider, model, messages, signal, options = {} }) {
  const onThinking = typeof options?.onThinkingDelta === 'function' ? options.onThinkingDelta : null
  const res = await fetch(`${baseUrl(provider)}/responses`, {
    method: 'POST',
    headers: headers(provider),
    body: JSON.stringify({ model: model.model_name, input: toResponsesInput(messages), stream: true, ...options }),
    signal: withTimeout(signal),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    const err = new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`)
    err.status = res.status
    if (err.status === 429 && provider.id != null) {
      try { _credentialPool.markCooldownForProvider(provider.id) } catch {}
    }
    throw err
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  streamChat.usage = null
  let _thinkingText = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const evt = parseSSEEvent(line)
      if (!evt) continue
      if (evt.type === 'response.output_text.delta' && evt.delta != null) {
        yield evt.delta
      } else if (evt.type === 'response.completed') {
        streamChat.usage = evt.response?.usage ? normalizeUsage(evt.response.usage) : null
      } else if ((evt.type === 'response.reasoning_summary_text.delta' || evt.type === 'response.reasoning_text.delta') && evt.delta != null) {
        _thinkingText += evt.delta
        try { onThinking?.(_thinkingText) } catch {}
      } else if (evt.type === 'response.failed') {
        const msg = evt.response?.error?.message || 'Responses API request failed'
        const err = new Error(msg)
        err.status = 500
        throw err
      }
    }
  }
}

// Non-streaming completion. Returns the full text content string.
async function completeChat({ provider, model, messages, signal, options = {} }) {
  const res = await fetch(`${baseUrl(provider)}/responses`, {
    method: 'POST',
    headers: headers(provider),
    body: JSON.stringify({ model: model.model_name, input: toResponsesInput(messages), stream: false, ...options }),
    signal: withTimeout(signal),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    const err = new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  const data = await res.json()
  return extractText(data.output) || ''
}

// Non-streaming returning { content, tool_calls, usage, reasoning } so the tool
// loop can inspect tool_calls AND log real server-reported token usage.
async function completeChatMessage({ provider, model, messages, signal, options = {} }) {
  const res = await fetch(`${baseUrl(provider)}/responses`, {
    method: 'POST',
    headers: headers(provider),
    body: JSON.stringify({ model: model.model_name, input: toResponsesInput(messages), stream: false, ...options }),
    signal: withTimeout(signal),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    const err = new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  const data = await res.json()
  const output = data.output || []
  return {
    content: extractText(output),
    tool_calls: extractToolCalls(output),
    usage: data.usage ? normalizeUsage(data.usage) : null,
    reasoning: extractReasoning(output),
  }
}

// List model ids via GET /models. Returns [] on any failure.
async function listModels({ provider, signal }) {
  const res = await fetch(`${baseUrl(provider)}/models`, { headers: headers(provider), signal })
  if (!res.ok) return []
  const data = await res.json()
  return (data.data || []).map(m => m.id || m.name).filter(Boolean)
}

// Connectivity probe: try /models first; if 404 fall back to a 1-token
// /responses ping. Reports auth errors specifically.
async function testConnection({ provider }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  const start = Date.now()
  try {
    const res = await fetch(`${baseUrl(provider)}/models`, { headers: headers(provider), signal: controller.signal })
    clearTimeout(timeout)
    if (res.ok) return { success: true, latencyMs: Date.now() - start }
    if (res.status === 404) {
      const res2 = await fetch(`${baseUrl(provider)}/responses`, {
        method: 'POST', headers: headers(provider),
        body: JSON.stringify({ model: 'gpt-4o-mini', input: 'ping' }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
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

// ─── Credential-rotation retry wrappers ─────────────────────────────────────
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
  toResponsesInput, extractText, extractReasoning, extractToolCalls, parseSSEEvent,
  streamChatWithRetry, completeChatWithRetry, completeChatMessageWithRetry,
}

