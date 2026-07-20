// ───────────────────────────────────────────────────────────────────────────
// Provider adapter layer
//
// Single entry point for talking to LLM providers. chat.handler / arena.handler /
// provider.handler all call these functions instead of hand-rolling fetch + SSE
// parsing. Adding a new provider format means adding one adapter file here and
// registering it in DISPATCH below — no handler changes needed.
//
// Public API:
//   streamChat({ provider, model, messages, signal }) -> AsyncIterable<string>
//   completeChat({ provider, model, messages, signal }) -> string
//   listModels({ provider, signal }) -> string[]
//   testConnection({ provider }) -> { success, latencyMs?, errorMessage? }
//
// `provider` is a row from the provider table (has api_url, api_key, api_format).
// `model` is a row from the model table (has model_name). `messages` is the
// OpenAI-style array of { role, content } — content may be a string or a
// multimodal parts array; adapters normalize as needed.
// ───────────────────────────────────────────────────────────────────────────

const openaiAdapter = require('./openaiAdapter')
const anthropicAdapter = require('./anthropicAdapter')

// Dispatch by provider.api_format. Unknown formats fall back to 'openai' since
// that is the de-facto common protocol most proxies speak.
const DISPATCH = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
}

function adapterFor(provider) {
  return DISPATCH[provider.api_format] || DISPATCH.openai
}

// Stream a chat completion. Yields content deltas (strings) as they arrive.
// The caller is responsible for AbortController lifecycle; pass its signal.
async function* streamChat({ provider, model, messages, signal, options = {} }) {
  yield* (adapterFor(provider).streamChatWithRetry || adapterFor(provider).streamChat)({ provider, model, messages, signal, options })
}

// Non-streaming completion. Returns the full content string.
async function completeChat({ provider, model, messages, signal, options = {} }) {
  return adapterFor(provider).completeChatWithRetry
    ? adapterFor(provider).completeChatWithRetry({ provider, model, messages, signal, options })
    : adapterFor(provider).completeChat({ provider, model, messages, signal, options })
}

// Non-streaming completion returning the full assistant message object.
async function completeChatMessage({ provider, model, messages, signal, options = {} }) {
  return adapterFor(provider).completeChatMessageWithRetry
    ? adapterFor(provider).completeChatMessageWithRetry({ provider, model, messages, signal, options })
    : adapterFor(provider).completeChatMessage({ provider, model, messages, signal, options })
}

async function listModels({ provider, signal }) {
  return adapterFor(provider).listModels({ provider, signal })
}

async function testConnection({ provider }) {
  return adapterFor(provider).testConnection({ provider })
}

module.exports = { streamChat, completeChat, completeChatMessage, listModels, testConnection, normalizeUsage: openaiAdapter.normalizeUsage }
