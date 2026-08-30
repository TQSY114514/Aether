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
const responsesAdapter = require('./responsesAdapter')

// Dispatch by provider.api_format. Unknown formats fall back to 'openai' since
// that is the de-facto common protocol most proxies speak.
const DISPATCH = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  responses: responsesAdapter,
}

function adapterFor(provider) {
  return DISPATCH[provider.api_format] || DISPATCH.openai
}

const featureFlags = require('../featureFlags')

function getAlternateProviders(db, modelName) {
  if (!db) return []
  try {
    return db.prepare(`
      SELECT p.*, m.id as model_id 
      FROM provider p 
      JOIN model m ON p.id = m.provider_id 
      WHERE m.model_name = ? AND p.enabled = 1
    `).all(modelName)
  } catch (e) {
    return []
  }
}

const smartPoolCursors = new Map()

async function executeWithResilience(methodName, { provider, model, messages, signal, options = {} }) {
  const db = options.db
  let targetProvider = provider
  let targetModel = model
  let triedProviders = new Set([provider.id])

  if (db && featureFlags.isEnabled(db, 'llm.smartPool')) {
    const alternates = getAlternateProviders(db, model.model_name)
    if (alternates.length > 0) {
      let cursor = smartPoolCursors.get(model.model_name) || 0
      targetProvider = alternates[cursor % alternates.length]
      targetModel = { ...model, id: targetProvider.model_id, provider_id: targetProvider.id }
      smartPoolCursors.set(model.model_name, cursor + 1)
      triedProviders.clear()
      triedProviders.add(targetProvider.id)
    }
  }

  const run = async (p, m) => {
    const adapter = adapterFor(p)
    const fn = adapter[`${methodName}WithRetry`] || adapter[methodName]
    return fn({ provider: p, model: m, messages, signal, options })
  }

  try {
    if (methodName === 'streamChat') {
      return await wrapStreamFallback(run, targetProvider, targetModel, messages, signal, options, triedProviders)
    } else {
      return await run(targetProvider, targetModel)
    }
  } catch (err) {
    if (db && featureFlags.isEnabled(db, 'llm.autoFallback')) {
      const status = err.status || err.statusCode
      if (status === 429 || status >= 500) {
        const alternates = getAlternateProviders(db, model.model_name).filter(p => !triedProviders.has(p.id))
        if (alternates.length > 0) {
          const fallbackProvider = alternates[0]
          const fallbackModel = { ...model, id: fallbackProvider.model_id, provider_id: fallbackProvider.id }
          return await run(fallbackProvider, fallbackModel)
        }
      }
    }
    throw err
  }
}

async function* wrapStreamFallback(run, p, m, messages, signal, options, triedProviders) {
  const db = options.db
  let iterator
  try {
    const iter = await run(p, m)
    // Support both async generator and normal generator
    iterator = iter[Symbol.asyncIterator] ? iter[Symbol.asyncIterator]() : iter[Symbol.iterator]()
    const first = await iterator.next()
    if (first.done) return
    yield first.value
  } catch (err) {
    if (db && featureFlags.isEnabled(db, 'llm.autoFallback')) {
      const status = err.status || err.statusCode
      if (status === 429 || status >= 500) {
        const alternates = getAlternateProviders(db, m.model_name).filter(alt => !triedProviders.has(alt.id))
        if (alternates.length > 0) {
          const fallbackProvider = alternates[0]
          const fallbackModel = { ...m, id: fallbackProvider.model_id, provider_id: fallbackProvider.id }
          const fallbackIter = await run(fallbackProvider, fallbackModel)
          yield* fallbackIter
          return
        }
      }
    }
    throw err
  }
  
  if (iterator) {
    while (true) {
      const next = await iterator.next()
      if (next.done) break
      yield next.value
    }
  }
}

async function* streamChat(args) {
  const iter = await executeWithResilience('streamChat', args)
  yield* iter
}

async function completeChat(args) {
  return executeWithResilience('completeChat', args)
}

async function completeChatMessage(args) {
  return executeWithResilience('completeChatMessage', args)
}

async function listModels({ provider, signal }) {
  return adapterFor(provider).listModels({ provider, signal })
}

async function testConnection({ provider }) {
  return adapterFor(provider).testConnection({ provider })
}

module.exports = { streamChat, completeChat, completeChatMessage, listModels, testConnection, normalizeUsage: openaiAdapter.normalizeUsage }
