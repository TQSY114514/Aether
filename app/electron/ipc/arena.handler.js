const { completeChatMessage, normalizeUsage } = require('../llm/providerAdapter')
const abortControllers = new Map()

// Per-call cost from the model's price columns (USD per 1K tokens).
// Returns 0 if pricing is unset (unpriced models show as $0, like cc-switch's
// "未定价"). Cost = (prompt/1000)*in + (completion/1000)*out, minus cached-read
// tokens which providers don't bill at the full input rate (best-effort).
function computeCost(model, u) {
  const inPrice = Number(model.input_price_per_1k) || 0
  const outPrice = Number(model.output_price_per_1k) || 0
  if (!inPrice && !outPrice) return 0
  const billableInput = Math.max(0, u.prompt_tokens - u.cache_read_tokens)
  return (billableInput / 1000) * inPrice + (u.completion_tokens / 1000) * outPrice
}

function registerArenaHandlers(ipcMain, db) {
  ipcMain.handle('arena:send', async (event, { sessionId, content, modelIds }) => {
    const allModels = db.getAllModels()
    const selected = allModels.filter(m => modelIds.includes(m.id))
    if (!selected.length) return { results: [] }

    // Persist the user's arena prompt as a message so it survives a reload
    // (arena results used to be in-memory only — gone on session switch).
    db.addMessage({ session_id: sessionId, role: 'user', content })

    // Run all selected models CONCURRENTLY (Promise.all) so a slow model no
    // longer blocks the others — each gets its own 60s timeout + abort
    // controller. Results preserve input order. This is the #1-differentiating
    // arena feature, so latency matters: parallel turns a 5-model arena from
    // ~5×latency into ~1×latency.
    const requestId = Date.now()
    const controller = new AbortController()
    abortControllers.set(requestId, controller)

    const runOne = async (m) => {
      const start = Date.now()
      // Per-model controller so stopping generation (or one model timing out)
      // doesn't abort the others. The outer controller is for user Stop.
      const perModel = new AbortController()
      const timeout = setTimeout(() => perModel.abort(), 60000)
      // If the user stops generation, abort this model too.
      const onOuterAbort = () => perModel.abort()
      controller.signal.addEventListener('abort', onOuterAbort, { once: true })
      try {
        // Use completeChatMessage to also get the server-reported usage, so the
        // usage log records real tokens/cost (not a client estimate).
        const { content: answer, usage } = await completeChatMessage({
          provider: { api_url: m.api_url, api_key: m.api_key, api_format: 'openai' },
          model: m,
          messages: [{ role: 'user', content }],
          signal: perModel.signal,
        })
        const u = normalizeUsage(usage)
        if (u) db.logUsage({
          session_id: sessionId, provider_id: m.provider_id, provider_name: m.provider_name,
          model_name: m.model_name, prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens,
          total_tokens: u.total_tokens, cache_read_tokens: u.cache_read_tokens,
          cache_creation_tokens: u.cache_creation_tokens,
          cost: computeCost(m, u), latency_ms: Date.now() - start, status: 200, source: 'arena',
        })
        return { model_id: m.id, model_name: m.model_name, provider_name: m.provider_name,
          content: answer, latency_ms: Date.now() - start }
      } catch (err) {
        const status = err.status || (err.name === 'AbortError' ? 0 : 0)
        db.logUsage({ session_id: sessionId, provider_id: m.provider_id, provider_name: m.provider_name,
          model_name: m.model_name, latency_ms: Date.now() - start, status, source: 'arena' })
        return { model_id: m.id, model_name: m.model_name, provider_name: m.provider_name,
          content: `[Error: ${err.name === 'AbortError' ? 'aborted/timeout' : err.message}]`, latency_ms: Date.now() - start }
      } finally {
        clearTimeout(timeout)
        controller.signal.removeEventListener('abort', onOuterAbort)
      }
    }

    const results = await Promise.all(selected.map(runOne))
    abortControllers.delete(requestId)
    // Persist each model's answer as an assistant message tagged with
    // arena_model, so the arena exchange survives a reload (it used to be
    // in-memory only and vanished on session switch).
    for (const r of results) {
      db.addMessage({
        session_id: sessionId, role: 'assistant', content: r.content || '',
        model_used: r.model_name, provider_used: null, token_count: null,
        latency_ms: r.latency_ms || null, status: 'success',
        arena_model: r.model_name,
      })
    }
    db.touchSession(sessionId)
    return { results }
  })

  ipcMain.handle('arena:stop', () => {
    for (const [, c] of abortControllers) c.abort()
    abortControllers.clear()
  })

  ipcMain.handle('arena:vote', async (_e, data) => {
    const { prompt, winnerModelId, winnerModelName, loserModelIds, loserModelNames, intent } = data
    const detectedIntent = intent || db.classifyIntent(prompt)
    db.recordArenaVote({ prompt, winnerModelId, winnerModelName, loserModelIds, loserModelNames, intent: detectedIntent })
    return { success: true }
  })

  ipcMain.handle('arena:scores', () => db.getModelScores())
  ipcMain.handle('arena:auto-route', (_e, query) => {
    const intent = db.classifyIntent(query)
    return { intent, route: db.autoRoute(intent) }
  })
}

module.exports = { registerArenaHandlers }
