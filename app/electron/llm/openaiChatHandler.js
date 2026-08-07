// ───────────────────────────────────────────────────────────────────────────
// OpenAI-compatible /v1/chat/completions handler for the local gateway.
//
// Pure module: no electron, no http — the HTTP layer (localGateway.js) wires
// it to the wire. It reuses the exact model/provider resolution the
// chat:complete handler uses, but answers with the OpenAI API shape so
// OpenAI-compatible clients (scripts, SDKs, tools) can talk to AetherAI.
//
// The SSE stream yields framing-ready lines (data: <json> / data: [DONE])
// WITHOUT trailing newlines; the HTTP layer is responsible for writing them.
// ───────────────────────────────────────────────────────────────────────────

const crypto = require('crypto')

const DEFAULT_TIMEOUT_MS = 120000

class HttpError extends Error {
  constructor(status, message, type = 'invalid_request_error') {
    super(message)
    this.status = status
    this.type = type
  }
}

function openAIError(status, message, type = 'invalid_request_error') {
  return { status, json: { error: { message, type, code: status } } }
}

/**
 * Validate and normalize a /v1/chat/completions request body.
 * @param {object} body
 * @returns {{ model: string, messages: Array, stream: boolean, temperature?: number, max_tokens?: number }}
 */
function parseChatCompletionsBody(body) {
  const b = body && typeof body === 'object' ? body : {}
  const model = String(b.model || '').trim()
  if (!model) throw new HttpError(400, 'model is required')
  if (!Array.isArray(b.messages)) throw new HttpError(400, 'messages must be an array')
  return {
    model,
    messages: b.messages,
    stream: !!b.stream,
    temperature: b.temperature,
    max_tokens: b.max_tokens,
  }
}

/**
 * Resolve a model (by name first, then by id) plus its provider.
 * Returns { provider, model } or null.
 */
function resolveChatModel(db, modelName) {
  if (!db || !modelName) return null
  // OpenAI semantics: clients pass the model name.
  const byName = db.getAllModels().find(m => m && m.model_name === modelName)
  let model = byName || null
  if (!model && db.getModel) {
    model = db.getModel(modelName)
    if (!model && /^\d+$/.test(modelName)) model = db.getModel(Number(modelName))
  }
  if (!model) return null
  const provider = db.getProvider(model.provider_id)
  if (!provider) return null
  return { provider, model }
}

/**
 * Build an OpenAI non-stream chat.completion response.
 * @param {{ model: string, content: string, usage?: object }} args
 */
function buildOpenAIResponse({ model, content, usage }) {
  return {
    id: `chatcmpl-${crypto.randomBytes(12).toString('hex')}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: String(content ?? '') }, finish_reason: 'stop' }],
    usage: usage || null,
  }
}

function chunk(id, created, model, delta, finish_reason) {
  return { id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta, finish_reason }] }
}

/**
 * SSE generator for stream=true. Yields framing lines (no trailing newlines):
 * role-first chunk → one content chunk per delta → finish_reason chunk → [DONE].
 */
async function* streamOpenAICompletions({ provider, model, parsed, streamChat }) {
  const name = model.model_name
  const id = `chatcmpl-${crypto.randomBytes(12).toString('hex')}`
  const created = Math.floor(Date.now() / 1000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  let roleSent = false
  try {
    for await (const delta of streamChat({
      provider, model,
      messages: parsed.messages,
      signal: controller.signal,
      options: { temperature: parsed.temperature, max_tokens: parsed.max_tokens },
    })) {
      if (!roleSent) {
        yield `data: ${JSON.stringify(chunk(id, created, name, { role: 'assistant', content: '' }, null))}`
        roleSent = true
      }
      yield `data: ${JSON.stringify(chunk(id, created, name, { content: String(delta ?? '') }, null))}`
    }
    if (!roleSent) yield `data: ${JSON.stringify(chunk(id, created, name, { role: 'assistant', content: '' }, null))}`
    yield `data: ${JSON.stringify(chunk(id, created, name, {}, 'stop'))}`
    yield 'data: [DONE]'
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Handle a /v1/chat/completions request.
 * @param {object} deps
 * @param {object} deps.db
 * @param {object} deps.body
 * @param {(args) => Promise<{ content?: string, usage?: object }>} deps.completeChatMessage
 * @param {(args) => AsyncIterable<string>} [deps.streamChat]
 * @returns {Promise<{ status: number, json?: object } | { status: 200, stream: AsyncGenerator<string> }>}
 */
async function handleChatCompletions({ db, body, completeChatMessage, streamChat }) {
  try {
    const parsed = parseChatCompletionsBody(body)
    const resolved = resolveChatModel(db, parsed.model)
    if (!resolved) throw new HttpError(400, `model not found: ${parsed.model}`, 'model_not_found')
    const { provider, model } = resolved

    if (parsed.stream) {
      if (!streamChat) throw new HttpError(400, 'streaming is not supported by the current provider setup', 'unsupported')
      return { status: 200, stream: streamOpenAICompletions({ provider, model, parsed, streamChat }) }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
    let reply
    try {
      reply = await completeChatMessage({
        provider, model, messages: parsed.messages, signal: controller.signal,
        options: { temperature: parsed.temperature, max_tokens: parsed.max_tokens },
      })
    } finally {
      clearTimeout(timer)
    }
    const content = reply && typeof reply === 'object' ? (reply.content || '') : String(reply || '')
    const usage = reply && reply.usage ? reply.usage : null
    return { status: 200, json: buildOpenAIResponse({ model: model.model_name, content, usage }) }
  } catch (e) {
    if (e instanceof HttpError || (e && e.status)) {
      return openAIError(e.status, e.message || String(e), e.type || 'invalid_request_error')
    }
    return openAIError(502, e && e.message ? e.message : String(e), 'upstream_error')
  }
}

module.exports = {
  HttpError,
  openAIError,
  parseChatCompletionsBody,
  resolveChatModel,
  buildOpenAIResponse,
  handleChatCompletions,
  DEFAULT_TIMEOUT_MS,
}