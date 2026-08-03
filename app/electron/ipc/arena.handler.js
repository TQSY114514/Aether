const { completeChatMessage, normalizeUsage } = require('../llm/providerAdapter')
const { computeCost } = require('../utils/cost')
const log = require('../logger')
const abortControllers = new Map()

function registerArenaHandlers(ipcMain, db, getWebContents = () => null) {
  ipcMain.handle('arena:send', async (event, { sessionId, content, modelIds, personaId }) => {
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
    const controller = new AbortController()
    // Keyed by sessionId so arena:stop can abort one arena run without
    // killing a different session's arena.
    abortControllers.set(sessionId, controller)
    const wc = getWebContents()

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
        // Build messages array with persona system prompt
        const messages = [{ role: 'user', content }]
        if (personaId) {
          const p = db.getPersona(personaId)
          if (p) messages.unshift({ role: 'system', content: p.prompt })
        }
        const { content: answer, usage } = await completeChatMessage({
          provider: { id: m.provider_id, api_url: m.api_url, api_key: m.api_key, api_format: 'openai' },
          model: m,
          messages,
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
        const result = { model_id: m.id, model_name: m.model_name, provider_name: m.provider_name,
          content: answer, latency_ms: Date.now() - start }
        // Stream each model's result as it finishes so the UI can render
        // progress instead of waiting for the slowest model.
        try { wc?.send('arena:model-done', { sessionId, result }) } catch {}
        return result
      } catch (err) {
        const status = err.status || 0
        db.logUsage({ session_id: sessionId, provider_id: m.provider_id, provider_name: m.provider_name,
          model_name: m.model_name, latency_ms: Date.now() - start, status, source: 'arena' })
        const result = { model_id: m.id, model_name: m.model_name, provider_name: m.provider_name,
          content: `[Error: ${err.name === 'AbortError' ? 'aborted/timeout' : err.message}]`, latency_ms: Date.now() - start }
        try { wc?.send('arena:model-done', { sessionId, result }) } catch {}
        return result
      } finally {
        clearTimeout(timeout)
        controller.signal.removeEventListener('abort', onOuterAbort)
      }
    }

    const results = await Promise.all(selected.map(runOne))
    if (abortControllers.get(sessionId) === controller) abortControllers.delete(sessionId)
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

  ipcMain.handle('arena:stop', (_e, sessionId) => {
    if (sessionId) {
      const c = abortControllers.get(sessionId)
      if (c) { c.abort(); abortControllers.delete(sessionId) }
    } else {
      for (const [, c] of abortControllers) c.abort()
      abortControllers.clear()
    }
  })

  ipcMain.handle('arena:vote', async (_e, data) => {
    const { prompt, winnerModelId, winnerModelName, loserModelIds, loserModelNames, intent } = data
    const detectedIntent = intent || db.classifyIntent(prompt)
    db.recordArenaVote({ prompt, winnerModelId, winnerModelName, loserModelIds, loserModelNames, intent: detectedIntent })
    return { success: true }
  })

  ipcMain.handle('arena:scores', () => {
    try { return db.getModelScores() } catch (e) { log.warn('arena:scores error:', e); return [] }
  })
}

module.exports = { registerArenaHandlers }
