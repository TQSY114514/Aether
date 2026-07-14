const { completeChat } = require('../llm/providerAdapter')
const abortControllers = new Map()

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
        const answer = await completeChat({
          provider: { api_url: m.api_url, api_key: m.api_key, api_format: 'openai' },
          model: m,
          messages: [{ role: 'user', content }],
          signal: perModel.signal,
        })
        return { model_id: m.id, model_name: m.model_name, provider_name: m.provider_name,
          content: answer, latency_ms: Date.now() - start }
      } catch (err) {
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
