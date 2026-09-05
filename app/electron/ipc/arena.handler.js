const { completeChatMessage, normalizeUsage } = require('../llm/providerAdapter')
const { computeCost } = require('../utils/cost')
const { shouldWriteQuickTitle, quickTitleOf } = require('./chat-send.handler')
const log = require('../logger')
const abortControllers = new Map()

function registerArenaHandlers(ipcMain, db, getWebContents = () => null) {
  ipcMain.handle('arena:send', async (event, { sessionId, content, modelIds, personaId, temperatures }) => {
    const allModels = db.getAllModels()
    const selected = allModels.filter(m => modelIds.includes(m.id))
    if (!selected.length) return { results: [] }

    // Arena 2.0 (review P0-3): same-model multi-temperature comparison.
    // temperatures = [0.2, 0.8] → each selected model runs once per temperature,
    // results carry a `variant` label ("temp 0.2") so the UI can show them side by side.
    const temps = Array.isArray(temperatures) && temperatures.length > 0
      ? temperatures.map(t => Number(t)).filter(Number.isFinite)
      : null
    const runs = []
    for (const m of selected) {
      if (temps) {
        for (const t of temps) runs.push({ m, temperature: t, variant: `temp ${t}` })
      } else {
        runs.push({ m, temperature: null, variant: null })
      }
    }

    // Persist the user's arena prompt as a message so it survives a reload
    db.addMessage({ session_id: sessionId, role: 'user', content })

    // Auto-title: an arena round is a real conversation too. When the session is
    // still placeholder-titled and this is its first message, fall back to the
    // same quick title the chat path uses (chat-send.handler), so arena sessions
    // don't sit at "新会话" forever. AI-summary upgrade happens on the chat side
    // if the user continues the conversation there.
    try {
      const s0 = db.getSession(sessionId)
      const autoTitleOn = (db.getSetting('autoTitle') ?? '1') === '1'
      if (s0 && shouldWriteQuickTitle({ autoTitleOn, sessionTitle: s0.title, msgsLen: db.getMessages(sessionId).length })) {
        const quick = quickTitleOf(content)
        if (quick) db.renameSession(sessionId, quick)
      }
    } catch (e) { log.warn('arena quick title failed:', e.message) }

    // Run all model×temperature variants CONCURRENTLY (Promise.all) so a slow
    // model doesn't block the others — each gets its own 60s timeout + abort.
    const controller = new AbortController()
    abortControllers.set(sessionId, controller)
    const wc = getWebContents()

    const runOne = async ({ m, temperature, variant }) => {
      const start = Date.now()
      const perModel = new AbortController()
      const timeout = setTimeout(() => perModel.abort(), 60000)
      const onOuterAbort = () => perModel.abort()
      controller.signal.addEventListener('abort', onOuterAbort, { once: true })
      try {
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
          options: temperature != null ? { temperature } : {},
        })
        const u = normalizeUsage(usage)
        const cost = u ? computeCost(m, u) : 0
        if (u) db.logUsage({
          session_id: sessionId, provider_id: m.provider_id, provider_name: m.provider_name,
          model_name: m.model_name, prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens,
          total_tokens: u.total_tokens, cache_read_tokens: u.cache_read_tokens,
          cache_creation_tokens: u.cache_creation_tokens,
          cost, latency_ms: Date.now() - start, status: 200, source: 'arena',
        })
        const result = {
          model_id: m.id, model_name: m.model_name, provider_name: m.provider_name,
          variant, temperature,
          content: answer, latency_ms: Date.now() - start,
          usage: u ? { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens, total_tokens: u.total_tokens, cost } : undefined,
        }
        try { wc?.send('arena:model-done', { sessionId, result }) } catch {}
        return result
      } catch (err) {
        const status = err.status || 0
        db.logUsage({ session_id: sessionId, provider_id: m.provider_id, provider_name: m.provider_name,
          model_name: m.model_name, latency_ms: Date.now() - start, status, source: 'arena' })
        const result = {
          model_id: m.id, model_name: m.model_name, provider_name: m.provider_name,
          variant, temperature,
          content: `[Error: ${err.name === 'AbortError' ? 'aborted/timeout' : err.message}]`, latency_ms: Date.now() - start,
        }
        try { wc?.send('arena:model-done', { sessionId, result }) } catch {}
        return result
      } finally {
        clearTimeout(timeout)
        controller.signal.removeEventListener('abort', onOuterAbort)
      }
    }

    const results = await Promise.all(runs.map(runOne))
    if (abortControllers.get(sessionId) === controller) abortControllers.delete(sessionId)
    for (const r of results) {
      db.addMessage({
        session_id: sessionId, role: 'assistant', content: r.content || '',
        model_used: r.model_name, provider_used: null, token_count: r.usage?.total_tokens || null,
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

  // Arena 2.0 leaderboard: real-traffic metrics per model (latency/cost/runs).
  ipcMain.handle('arena:metrics', () => {
    try { return db.getModelUsageMetrics() } catch (e) { log.warn('arena:metrics error:', e); return [] }
  })

  // Arena-driven dynamic workload auto-routing (review P0-4)
  ipcMain.handle('arena:auto-route', (_e, { prompt, intent } = {}) => {
    try {
      const targetIntent = intent || (prompt ? db.classifyIntent(prompt) : 'general')
      const route = db.autoRoute(targetIntent)
      return route || null
    } catch (e) {
      log.warn('arena:auto-route error:', e)
      return null
    }
  })

  // ── Arena 2.0: personal benchmark (review P0-3) ─────────────────────────
  // 用户自建任务集, 一键对选中模型重跑; 每任务每模型独立计分:
  //   - 结果非错误 → 记 1 胜(wins)
  //   - 聚合 总延迟/总成本/任务数
  // 汇总后写入 arena_benchmark.results, 前端渲染"你的工作负载的模型排行榜"。
  ipcMain.handle('arena:benchmark-list', () => {
    try { return db.listArenaBenchmarks() } catch (e) { log.warn('arena:benchmark-list error:', e); return [] }
  })

  ipcMain.handle('arena:benchmark-save', (_e, { id = null, name, tasks, modelIds }) => {
    try { return db.saveArenaBenchmark({ id, name: String(name || 'benchmark').slice(0, 60), tasks, modelIds }) } catch (e) { return { error: e.message } }
  })

  ipcMain.handle('arena:benchmark-delete', (_e, id) => {
    try { db.deleteArenaBenchmark(id); return { ok: true } } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('arena:benchmark-run', async (_e, { id, modelIds }) => {
    const bench = db.listArenaBenchmarks().find(b => b.id === id)
    if (!bench) return { error: 'benchmark not found' }
    const allModels = db.getAllModels()
    const selected = allModels.filter(m => modelIds.includes(m.id))
    if (!selected.length) return { error: 'no models selected' }

    const results = {}   // model_id -> { wins, runs, total_ms, total_cost }
    for (const m of selected) results[m.id] = { wins: 0, runs: 0, total_ms: 0, total_cost: 0 }

    const controller = new AbortController()
    abortControllers.set(`bench:${id}`, controller)

    try {
      for (const task of bench.tasks) {
        const content = String(task || '').trim()
        if (!content) continue
        // 并行跑该任务下所有模型(复用 arena 并发语义), 等待全部完成
        const round = await Promise.all(selected.map(async (m) => {
          const start = Date.now()
          const perModel = new AbortController()
          const timeout = setTimeout(() => perModel.abort(), 60000)
          const onOuterAbort = () => perModel.abort()
          controller.signal.addEventListener('abort', onOuterAbort, { once: true })
          try {
            const { content: answer, usage } = await completeChatMessage({
              provider: { id: m.provider_id, api_url: m.api_url, api_key: m.api_key, api_format: 'openai' },
              model: m,
              messages: [{ role: 'user', content }],
              signal: perModel.signal,
            })
            const u = normalizeUsage(usage)
            const cost = u ? computeCost(m, u) : 0
            return { modelId: m.id, ok: !!answer && !String(answer).startsWith('[Error'), latency: Date.now() - start, cost }
          } catch (err) {
            return { modelId: m.id, ok: false, latency: Date.now() - start, cost: 0 }
          } finally {
            clearTimeout(timeout)
            controller.signal.removeEventListener('abort', onOuterAbort)
          }
        }))
        for (const r of round) {
          const acc = results[r.modelId]
          if (!acc) continue
          acc.runs += 1
          acc.total_ms += r.latency
          acc.total_cost += r.cost
          if (r.ok) acc.wins += 1
        }
      }
    } finally {
      abortControllers.delete(`bench:${id}`)
    }

    const lastRun = new Date().toISOString()
    db.updateArenaBenchmarkResults(id, results, lastRun)
    // 附带模型名, 前端直接渲染
    const out = { lastRun, models: {}, results: {} }
    for (const m of selected) {
      out.models[m.id] = { model_name: m.model_name, provider_name: m.provider_name }
      out.results[m.id] = results[m.id]
    }
    return out
  })

  ipcMain.handle('arena:benchmark-stop', (_e, id) => {
    const c = abortControllers.get(`bench:${id}`)
    if (c) { c.abort(); abortControllers.delete(`bench:${id}`) }
  })
}

module.exports = { registerArenaHandlers }