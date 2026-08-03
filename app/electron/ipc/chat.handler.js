const { createAllowRulesStore, buildToolLoopCallbacks } = require('./toolLoopCallbacks')
const { streamChat, completeChat, normalizeUsage } = require('../llm/providerAdapter')
const { runToolLoop, MAX_CONCURRENT_TOOLS } = require('../llm/toolLoop')
const { buildReasoningParams } = require('../llm/reasoning')
const { maybeCompact } = require('../llm/compaction')
const { classifyError } = require('../llm/errorClassify')
const autoMemory = require('../llm/autoMemory')
const habitLearner = require('../llm/habitLearner')
const skills = require('../llm/skills')
const { computeCost } = require('../utils/cost')
const { estimateMessagesTokens, estimateTextTokens } = require('../llm/compaction')
const auditLog = require('../llm/auditLog')
const modelAdvisor = require('../llm/modelAdvisor')
const modelRouter = require('../llm/modelRouter')
const moa = require('../llm/moa')
const log = require('../logger')
const providerHealth = require('../llm/providerHealth')
const checkpoints = require('../llm/checkpoints')

// dbHandle is set by registerChatHandlers — generateSummaryTitle lives at module
// scope (so it can be unit-tested) but needs DB access to persist the title.
let dbHandle = null

// Placeholder titles that indicate a session hasn't been named yet.
// Includes common phrases across all 15 locale files so auto-title
// doesn't churn for non-Chinese/English users.
const PLACEHOLDER_TITLES = new Set([
  // Chinese
  '新会话', '新对话', '新建会话', '新建对话',
  // English
  'New Chat', 'New Conversation', 'New Message',
  // Japanese
  '新しいチャット', '新しい会話',
  // Korean
  '새 채팅', '새 대화',
  // French
  'Nouveau chat', 'Nouvelle conversation',
  // German
  'Neuer Chat', 'Neues Gespräch',
  // Spanish
  'Nuevo chat', 'Nueva conversación',
  // Portuguese
  'Nova conversa', 'Novo chat',
  // Russian
  'Новый чат',
  // Italian
  'Nuova chat',
  // Dutch
  'Nieuwe chat',
  // Turkish
  'Yeni Sohbet',
  // Arabic
  'محادثة جديدة',
  // Polish
  'Nowy czat',
])

// Per-request abort controllers to avoid race conditions
const abortControllers = new Map()

// Feature B: track active tool loops and buffered injection messages.
const activeToolLoops = new Set() // sessionIds with a running tool loop
const pendingInjections = new Map() // sessionId -> string[] of pending injections

// Per-session message tracking for abortControllers cleanup on session delete.
let sessionMessagesMap = new Map() // sessionId -> Set<messageId>
function registerSessionMessages(sessionId, messageIds) {
  if (!sessionMessagesMap.has(sessionId)) sessionMessagesMap.set(sessionId, new Set())
  const set = sessionMessagesMap.get(sessionId)
  for (const mid of messageIds) set.add(mid)
}
function cleanupSessionControllers(sessionId) {
  const msgIds = sessionMessagesMap.get(sessionId)
  if (msgIds) {
    for (const mid of msgIds) {
      const ctrl = abortControllers.get(mid)
      if (ctrl) { ctrl.abort(); abortControllers.delete(mid) }
    }
    sessionMessagesMap.delete(sessionId)
  }
}

// ─── Session-scoped permission allow-rules ─────────────────────────────────
// Backed by createAllowRulesStore() from toolLoopCallbacks.js.
// Granularity preserved: run_command → binary token; write/edit → directory;
// others → '*'. Rules are per-session and cleared on session delete.
const allowRulesStore = createAllowRulesStore()
function clearAllowRules(sessionId) { allowRulesStore.clear(sessionId) }

function registerChatHandlers(ipcMain, db, getWebContents) {
  dbHandle = db
  auditLog.setDb(db)
  checkpoints.setDb(db)
  // Cache rarely-changing settings at handler registration time. Invalidation
  // happens via the settings:changed event emitted by the settings handler.
  const _s = {}
  const SETTING_DEFAULTS = { autoTitle: '1', titleLanguage: 'auto', auto_memory_enabled: '1', fallback_timeout_ms: '30000', agent_max_iterations: '25' }
  ;['autoTitle', 'titleLanguage', 'auto_memory_enabled', 'fallback_timeout_ms', 'agent_max_iterations'].forEach(k => { _s[k] = db.getSetting(k) ?? SETTING_DEFAULTS[k] })

  ipcMain.on('settings:changed', (_e, key) => { if (key in SETTING_DEFAULTS) { _s[key] = db.getSetting(key) ?? SETTING_DEFAULTS[key] } })

  ipcMain.handle('chat:send', async (event, { sessionId, content, modelId, mode = 'normal', regenerate = false, personaId = null, attachments = [], useTools = false, agentMode = 'ask', effortLevel = 'off', genParams = {}, systemPrefix = '' }) => {
    // Backstop guard: if a tool loop is active for this session, buffer the message
    // as an injection instead of starting a new send turn. Prevents race conditions
    // when the renderer's loopingSessions state hasn't caught up with main-process reality.
    if (activeToolLoops.has(sessionId) && content && !regenerate) {
      if (!pendingInjections.has(sessionId)) pendingInjections.set(sessionId, [])
      pendingInjections.get(sessionId).push(content)
      try { getWebContents()?.send('chat:injection-queued', { sessionId, content }) } catch {}
      return { messageId: 0, queued: true }
    }
    // Save user message
    if (!regenerate) {
      db.addMessage({ session_id: sessionId, role: 'user', content })
    } else {
      // On regenerate, drop any assistant messages after the last user message
      // so the discarded reply doesn't resurface on reload.
      db.deleteAssistantAfterLastUser(sessionId)
    }
    db.touchSession(sessionId)

    // Get model & provider
    let model = db.getModel(modelId)
    if (!model) {
      db.addMessage({ session_id: sessionId, role: 'assistant', content: '错误: 模型未找到', status: 'error' })
      getWebContents()?.send('chat:stream-chunk', { messageId: 0, delta: '', done: true, sessionId })
      return { messageId: 0 }
    }
    const provider = db.getProvider(model.provider_id)
    if (!provider) {
      db.addMessage({ session_id: sessionId, role: 'assistant', content: '错误: 供应商未找到', status: 'error' })
      getWebContents()?.send('chat:stream-chunk', { messageId: 0, delta: '', done: true, sessionId })
      return { messageId: 0 }
    }

    // Model suggestion (auto-routing rationale for the renderer).
    let modelSuggestion = null
    try {
      const allModelsForSuggest = db.getAllModels().filter(m => { const p = db.getProvider(m.provider_id); return p && p.enabled })
      const intent = db.classifyIntent(content)
      const scores = db.getModelScores()
      const eloData = {}
      for (const s of scores) { if (s.model_id && !eloData[s.model_id]) eloData[s.model_id] = { score: s.score, win_count: s.win_count || 0, total_count: s.total_count || 0 } }
      const result = modelAdvisor.suggestModelExplained({ allModels: allModelsForSuggest, userMessage: content, useTools: true, intent, eloData })
      if (result) modelSuggestion = { suggestedModelId: result.suggestedModelId, reason: result.reason, confidence: result.confidence }
    } catch {}

    // Build fallback chain — skip providers that are in cooldown or have a
    // poor success rate (provider health tracking).
    const fallbackModels = [{ model, provider }]
    const chain = db.getFallbackChain(model.provider_id)
    for (const m of chain) {
      if (m.id !== modelId && providerHealth.isHealthy(m.provider_id)) {
        fallbackModels.push({ model: m, provider: m.provider || provider })
      }
    }

    // Get conversation history
    const msgs = db.getMessages(sessionId)
    // Fetch the current session once (a direct indexed lookup, far cheaper than
    // the getSessions() full-table-scan-with-subquery that ran here twice before).
    // Used for both the placeholder-title check and the persona_id fallback below.
    const session0 = db.getSession(sessionId)
    // Respect the autoTitle setting (default on) and only summarize the first exchange.
    const autoTitleOn = (_s['autoTitle'] ?? '1') === '1'
    const titleLanguage = _s['titleLanguage'] || 'auto'
    const needsTitle = autoTitleOn && session0 && PLACEHOLDER_TITLES.has((session0.title || '').trim()) && msgs.length === 1
    const apiMsgs = msgs.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }))
    // Attach images to the latest user message as OpenAI-compatible multimodal content.
    if (attachments.length > 0) {
      const lastUserIdx = apiMsgs.map(m => m.role).lastIndexOf('user')
      if (lastUserIdx >= 0) {
        const parts = []
        const text = String(apiMsgs[lastUserIdx].content || '')
        // Some providers reject an empty-string text part, so only include it when non-empty.
        if (text) parts.push({ type: 'text', text })
        for (const a of attachments) {
          if (a.mime && a.mime.startsWith('image/')) {
            parts.push({ type: 'image_url', image_url: { url: a.dataUrl } })
          }
        }
        if (parts.length > 0) apiMsgs[lastUserIdx].content = parts
      }
    }
    // If persona is set, prepend system message (read from session config stored in db)
    // Reuse the session0 fetched above (avoids a second getSessions() scan).
    const session = session0
    if (personaId) {
    const p2 = db.getPersona(personaId)
    if (p2) apiMsgs.unshift({ role: 'system', content: p2.prompt })
  } else if (session && session.persona_id) {
      const p = db.getPersona(session.persona_id)
      if (p) apiMsgs.unshift({ role: 'system', content: p.prompt })
    }

    // Context compaction: if the estimated token count of the conversation is
    // approaching the model's context window, summarize older history and keep a
    // recent window + active tool-call pairs intact. Prevents long chats from
    // 400-ing on context length. Falls back to hard-truncate if summarization
    // fails. `context_window` may be null if the user didn't set it; default 32k.
    const ctxBudget = (model.context_window && Number(model.context_window) > 0) ? Number(model.context_window) : 32000
    const beforeCompact = apiMsgs.length
    let compacted
    try {
      compacted = await maybeCompact({ provider, model, messages: apiMsgs, budget: ctxBudget, sessionId })
    } catch (e) {
      compacted = apiMsgs
    }
    // If compaction actually shrank the message list, surface a one-line status
    // so the user understands why older context is now summarized.
    if (compacted.length < beforeCompact) {
      try { getWebContents()?.send('chat:status', { messageId: 0, sessionId, text: `🗜️ 压缩 ${beforeCompact} → ${compacted.length} 条消息` }) } catch {}
    }

    // Auto-title: defer to a real AI summary after the first response (see below).
    // Previously this slice()d the raw user input into the title (a copy-paste,
    // not a summary). Leaving a neutral default until the summary is generated.

    // Merge reasoning params (effort) with advanced generation params from settings.
    const reasoningOpts = buildReasoningParams(model.model_name, effortLevel)
    const genOpts = {}
    if (genParams.maxTokens && genParams.maxTokens > 0) genOpts.max_tokens = genParams.maxTokens
    if (genParams.temperature && genParams.temperature > 0) genOpts.temperature = genParams.temperature
    if (genParams.topP && genParams.topP > 0) genOpts.top_p = genParams.topP
    const mergedOpts = { ...genOpts, ...reasoningOpts }
    // Prepend a custom system prefix if set (advanced users). Done after compaction
    // so the prefix is never summarized away.
    if (systemPrefix && systemPrefix.trim()) {
      compacted.unshift({ role: 'system', content: systemPrefix.trim() })
    }
    // Auto-memory prefetch (Hermes-style): inject relevant past memories as a
    // system message so the model can recall context from earlier sessions.
    // Done once here so BOTH the tool path and the plain streaming path inherit it.
    // Gateable via the auto_memory_enabled setting (default on).
    const autoMemoryOn = _s['auto_memory_enabled'] !== '0'
    const memBlock = autoMemoryOn ? autoMemory.prefetch(db, content) : ''
    if (memBlock) compacted.unshift({ role: 'system', content: memBlock })

    // Inject current date/time so the model knows "today". LLMs have a training
    // cutoff and without this cannot answer "what's the date" or reason about
    // relative time. Injected for ALL paths (tool + streaming) after compaction
    // so it's never summarized away.
    try {
      const _now = new Date()
      const _pad = (n) => String(n).padStart(2, '0')
      const _dateStr = `${_now.getFullYear()}-${_pad(_now.getMonth() + 1)}-${_pad(_now.getDate())} ${_pad(_now.getHours())}:${_pad(_now.getMinutes())}`
      const _tzOff = -_now.getTimezoneOffset() / 60
      const _tzStr = `UTC${_tzOff >= 0 ? '+' : ''}${_tzOff}`
      const _weekday = ['日','一','二','三','四','五','六'][_now.getDay()]
      compacted.unshift({ role: 'system', content: `当前时间：${_dateStr} (${_tzStr}, 星期${_weekday})` })
    } catch {}

    // MoA (Mixture of Agents): if the selected model is a moa:// virtual model,
    // run reference fan-out in parallel and inject guidance into the last user
    // message. The aggregator model replaces the original for the actual turn.
    try {
      const moaResult = await moa.maybeRunMoA({
        modelName: model.model_name, messages: compacted, signal: controller?.signal, db, sessionId,
      })
      if (moaResult) {
        if (moaResult.guidance) {
          const lastUserIdx = compacted.map(m => m.role).lastIndexOf('user')
          if (lastUserIdx >= 0) {
            const u = compacted[lastUserIdx]
            u.content = typeof u.content === 'string'
              ? u.content + moaResult.guidance
              : u.content // multimodal: skip (rare in MoA context)
          }
        }
        if (moaResult.aggregator) {
          provider = moaResult.aggregator.provider
          model = moaResult.aggregator.model
        }
        try { getWebContents()?.send('chat:status', { messageId: 0, sessionId, text: `🎭 MoA: ${moaResult.aggregator?.model?.model_name || 'aggregator'} (+ references)`, kind: 'moa' }) } catch {}
      }
    } catch (e) {
      log.debug('MoA check failed (non-fatal):', e?.message)
    }

    // Proactive habit suggestions (Hermes-style): fire-and-forget match.
    if (autoMemoryOn) {
      try { habitLearner.proactiveSuggest({ db, provider, model, userMessage: content, signal: controller?.signal, onSuggest: (h) => { try { getWebContents()?.send('chat:habit-suggestion', h) } catch {} } }) } catch {}
    }

    const timeoutMs = parseInt(_s['fallback_timeout_ms'] ?? '30000', 10)
    let lastError = null

    // Set workspace root for this session (from session config or global default).
    // This lets the sandbox resolve per-session workspaces.
    try { const { setWorkspaceRootForSession } = require('../tools/sandbox'); setWorkspaceRootForSession(sessionId, (session0?.config && JSON.parse(session0.config)?.workspace) || null) } catch {}

    // Context budget: compute usage before the request so we can report it.
    const budgetBefore = estimateMessagesTokens(compacted)
    const budgetPct = Math.min(100, Math.round((budgetBefore / ctxBudget) * 100))
    if (budgetPct >= 70) {
      try { getWebContents()?.send('chat:status', { messageId: 0, sessionId, text: `⚠️ 上下文使用 ${budgetPct}% (${budgetBefore} / ${ctxBudget} tokens)`, kind: 'context_budget' }) } catch {}
    }

    // Tool-calling path: when the session has tools enabled, run a non-streaming
    // tool loop (detect tool_calls → run built-in tools → re-request). Each tool
    // invocation is streamed to the UI as a tool-call block; the final text is
    // then delivered as the assistant message. Falls through to the normal
    // streaming path when useTools is false.
    if (useTools) {
      // Inject the available-skills list as a system message so the model can
      // call use_skill when a task matches. Only when tools are on (skills are
      // meaningless without the tool loop). Done after compaction so the list
      // is never summarized away.
      const skillsBlock = skills.formatSkillsForPrompt()
      // memBlock was already injected into `compacted` above (shared by both paths).
      const toolMessages = skillsBlock ? [{ role: 'system', content: skillsBlock }, ...compacted] : compacted
      const asstMsg = db.addMessage({ session_id: sessionId, role: 'assistant', content: '', model_used: model.model_name, provider_used: provider.id, status: 'success' })
      const msgId = asstMsg.lastInsertRowid
      // Track msgId → session mapping for abortControllers cleanup on session delete
      registerSessionMessages(sessionId, [msgId])
      const controller = new AbortController()
      abortControllers.set(msgId, controller)
      const wc = getWebContents()
      activeToolLoops.add(sessionId)
      try { wc?.send('chat:tool-loop-start', { sessionId }) } catch {}
      let finalContent = ''
      try {
        const modelName = (model?.model_name || '').toLowerCase()
      const thinkingSupported = /^(o[134]|gpt-5|claude|deepseek.*r|qwq)/.test(modelName)
      // Build shared callback bag (onToolCall, onAskUser, requestPermission, etc.)
      // using the extracted factory. Feature B's injection options stay inline below.
      const cb = buildToolLoopCallbacks({
          db,
          send: (c, p) => wc?.send(c, p),
          getWc: () => (wc && !wc.isDestroyed() ? wc : null),
          sessionId,
          msgId,
          controller,
          source: 'chat',
          allowRules: allowRulesStore,
          thinkingSupported,
        })
      finalContent = await runToolLoop({
          provider, model, messages: toolMessages, signal: controller.signal,
          options: mergedOpts,
          agentMode: agentMode || 'ask',
          maxIterations: parseInt(_s['agent_max_iterations'] ?? '25', 10),
          sessionId, messageId: msgId, db,
          autoCommit: true,
          ...cb,
          getPendingInjections: () => pendingInjections.get(sessionId) || [],
          clearPendingInjections: () => pendingInjections.delete(sessionId),
        })
        try { wc?.send('chat:tool-loop-end', { sessionId }) } catch {}
        // Report final context budget.
        const budgetAfter = estimateMessagesTokens(compacted) + estimateTextTokens(finalContent)
        const pctAfter = Math.min(100, Math.round((budgetAfter / ctxBudget) * 100))
        if (pctAfter >= 70) {
          try { wc?.send('chat:status', { messageId: msgId, sessionId, text: `⚠️ 上下文使用 ${pctAfter}% (≈${budgetAfter} / ${ctxBudget} tokens)`, kind: 'context_budget' }) } catch {}
        }
        const tokens = estimateTokens(finalContent)
        db.updateMessage(msgId, { content: finalContent, status: 'success', token_count: tokens })
        if (needsTitle) await generateSummaryTitle({ sessionId, content, fullContent: finalContent, model, provider, titleLanguage })
        // Auto-memory sync (Hermes-style): fire-and-forget extraction of facts
        // worth remembering. Not awaited — must never add latency to the reply.
        if (autoMemoryOn) autoMemory.sync({ db, provider, model, userMessage: content, assistantReply: finalContent, sessionId })
        // Habit learner: detect recurring preferences and promote them to a
        // user-habits skill once they repeat. Also fire-and-forget.
        if (autoMemoryOn) habitLearner.detectAndLearn({ db, provider, model, userMessage: content, assistantReply: finalContent, onPropose: (h) => { try { getWebContents()?.send('chat:habit-proposed', h) } catch {} } })
        wc?.send('chat:stream-chunk', { messageId: msgId, delta: finalContent, done: false, sessionId })
        wc?.send('chat:stream-chunk', { messageId: msgId, delta: '', done: true, sessionId })
        abortControllers.delete(msgId)
        // Persist agentMode to session config for next time.
        try { db.setSessionConfig(sessionId, { agentMode }) } catch {}
        return { messageId: msgId, modelSuggestion }
      } catch (err) {
        try { wc?.send('chat:tool-loop-end', { sessionId }) } catch {}
        abortControllers.delete(msgId)
        const errMsg = err.name === 'AbortError' ? '已中止' : (err.message || String(err))
        // Preserve accumulated content on abort (tool-loop path)
        db.updateMessage(msgId, { content: finalContent ?? '', status: 'aborted', error_message: errMsg })
        wc?.send('chat:stream-chunk', { messageId: msgId, delta: '', done: true, sessionId })
        return { messageId: msgId, modelSuggestion }
      } finally {
        activeToolLoops.delete(sessionId)
      }
    }

    for (let i = 0; i < fallbackModels.length; i++) {
      const { model: m, provider: p } = fallbackModels[i]
      const isFallback = i > 0

      const asstMsg = db.addMessage({
        session_id: sessionId, role: 'assistant', content: '',
        model_used: m.model_name, provider_used: p.id, status: isFallback ? 'fallback' : 'success',
      })
      const msgId = asstMsg.lastInsertRowid
      registerSessionMessages(sessionId, [msgId])

      const controller = new AbortController()
      abortControllers.set(msgId, controller)
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      try {
        let fullContent = ''
        const wc = getWebContents()
        const thinkingSupported = /^(o[134]|gpt-5|claude|deepseek.*r|qwq)/.test((m?.model_name || '').toLowerCase())
        let lastThinkingLen = 0
        const stream = streamChat({ provider: p, model: m, messages: compacted, signal: controller.signal, options: { ...mergedOpts, onThinkingDelta: thinkingSupported ? (text) => {
          if (text.length > lastThinkingLen) {
            const newLen = text.length - lastThinkingLen
            wc?.send('chat:thinking-chunk', { messageId: msgId, sessionId, delta: text.slice(lastThinkingLen, text.length), done: false })
            lastThinkingLen = text.length
          }
        } : undefined } })
        const streamStart = Date.now()
        for await (const delta of stream) {
          if (delta) {
            fullContent += delta
            wc?.send('chat:stream-chunk', { messageId: msgId, delta, done: false, sessionId })
          }
          // Surface completed thinking block to the UI.
          if (thinkingSupported && stream.thinkingBlocks && stream.thinkingBlocks.length > 0 && lastThinkingLen > 0 && stream.thinkingBlocks[0].text.length === lastThinkingLen) {
            wc?.send('chat:thinking-end', { messageId: msgId, sessionId })
            lastThinkingLen = -1 // don't re-send
          }
        }
        clearTimeout(timeout)
        abortControllers.delete(msgId)

        // Log usage. Prefer server-reported (stream.usage, when the provider
        // returns it); fall back to a client estimate so the usage page isn't
        // stuck at 0 for providers that don't report usage on the stream.
        const serverU = stream.usage ? normalizeUsage(stream.usage) : null
        const u = serverU || {
          prompt_tokens: estimateTokens(compacted.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')).join('')),
          completion_tokens: estimateTokens(fullContent),
          total_tokens: 0,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
        }
        u.total_tokens = u.total_tokens || (u.prompt_tokens + u.completion_tokens)
        db.logUsage({
          session_id: sessionId, provider_id: p.id, provider_name: p.name,
          model_name: m.model_name, prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens,
          total_tokens: u.total_tokens, cache_read_tokens: u.cache_read_tokens || 0,
          cache_creation_tokens: u.cache_creation_tokens || 0,
          cost: computeCost(m, u), latency_ms: Date.now() - streamStart, status: 200, source: 'chat',
        })

        // Save to DB FIRST, then send done signal
        const tokens = u.total_tokens
      db.updateMessage(msgId, {
        content: fullContent,
        status: isFallback ? 'fallback' : 'success',
        token_count: tokens,
      })
      // Auto-title: summarize the first exchange instead of copy-pasting raw input.
      if (needsTitle) {
        await generateSummaryTitle({ sessionId, content, fullContent, model: m, provider: p, titleLanguage })
      }
      // Auto-memory sync (Hermes-style): fire-and-forget fact extraction.
      if (autoMemoryOn) autoMemory.sync({ db, provider: p, model: m, userMessage: content, assistantReply: fullContent, sessionId })
      if (autoMemoryOn) habitLearner.detectAndLearn({ db, provider: p, model: m, userMessage: content, assistantReply: fullContent, onPropose: (h) => { try { getWebContents()?.send('chat:habit-proposed', h) } catch {} } })
      log.info('DB write', msgId, 'len=', fullContent.length, 'tokens=', tokens)
      providerHealth.recordResult(p.id, true)
      providerHealth.recordError(p.id, null)
      wc?.send('chat:stream-chunk', { messageId: msgId, delta: '', done: true, sessionId })

      return { messageId: msgId }

      } catch (err) {
        clearTimeout(timeout)
        abortControllers.delete(msgId)
        providerHealth.recordResult(p.id, false)
        if (err.status === 429) providerHealth.setCooldown(p.id)
        providerHealth.recordError(p.id, err.message)
        if (err.name === 'AbortError') {
          // Preserve accumulated content so the user sees what was produced before stop.
          // Update the message with whatever fullContent was accumulated.
          db.updateMessage(msgId, { content: fullContent, status: 'aborted', error_message: '已中止' })
          getWebContents()?.send('chat:stream-chunk', { messageId: msgId, delta: '', done: true, sessionId })
          return { messageId: msgId }
        }
        lastError = err.message
        db.updateMessage(msgId, { content: '', status: 'error', error_message: lastError })
        // Centralized error classification (auth/rate-limit/network/content-filter etc.)
        const eclass = classifyError(err)
        if (eclass.recover && eclass.recover.hint) {
          try { wc?.send('chat:status', { messageId: msgId, sessionId, text: eclass.recover.hint, kind: eclass.kind }) } catch {}
        }
        const isRetryable = eclass.retryable || err.message.includes('ECONNREFUSED') || err.message.includes('ECONNRESET') ||
          err.message.includes('ENOTFOUND') || err.message.includes('ETIMEDOUT')
        if (isRetryable && i < fallbackModels.length - 1) continue
        break
      }
    }

    if (lastError) getWebContents()?.send('chat:stream-chunk', { messageId: 0, delta: '', done: true, sessionId })
    return { messageId: 0, modelSuggestion }
  })

  ipcMain.handle('chat:stop', (_e, sessionId) => {
    // Abort only controllers for the given session. Each request has a catch
    // block that preserves accumulated content in the DB and sends the 'done'
    // signal to the renderer. DO NOT clear the map here — the abort handlers in
    // chat:send will delete their own entry after saving content.
    if (sessionId) {
      const msgIds = sessionMessagesMap.get(sessionId)
      if (msgIds) {
        for (const mid of msgIds) {
          const ctrl = abortControllers.get(mid)
          if (ctrl) { ctrl.abort(); abortControllers.delete(mid) }
        }
      }
    }
  })

  // Feature B: mid-turn message injection. The renderer calls this when a tool loop
  // is running for the session. The message is buffered and consumed at the next loop
  // iteration instead of starting a new send turn.
  ipcMain.handle('chat:inject', (event, { sessionId, content }) => {
    try {
      if (!sessionId || !content) return { queued: false }
      if (!pendingInjections.has(sessionId)) pendingInjections.set(sessionId, [])
      pendingInjections.get(sessionId).push(content)
      try { getWebContents()?.send('chat:injection-queued', { sessionId, content }) } catch {}
      return { queued: true }
    } catch {
      return { queued: false }
    }
  })

  // Habit-confirmation flow: the renderer asks us to confirm (promote now) or
  // dismiss (delete) a proposed habit. We don't need to reply with data — the
  // skill is rewritten synchronously inside habitLearner.
  ipcMain.handle('chat:habit-confirm', (_e, key) => { try { habitLearner.confirmHabit(db, key) } catch (e) { log.warn('habit confirm failed:', e) } return { ok: true } })
  ipcMain.handle('chat:habit-dismiss', (_e, key) => { try { habitLearner.dismissHabit(db, key) } catch (e) { log.warn('habit dismiss failed:', e) } return { ok: true } })

  // Model suggestion (Claude Code-style): given a user message and the full model
  // list, return the best model id for the task. Falls back to the user's current
  // model if no better match is found. Includes explainable rationale combining
  // heuristic family fit with Arena ELO data when available.
  ipcMain.handle('model:suggest', (_e, { sessionId, userMessage }) => {
    try {
      const session = db.getSession(sessionId)
      const currentModelId = session?.config ? JSON.parse(session.config)?.modelId : null
      const allModels = db.getAllModels().filter(m => {
        const p = db.getProvider(m.provider_id)
        return p && p.enabled
      })
      const intent = db.classifyIntent(userMessage)
      // Fetch ELO data for all models — keyed by model_id for the explainable router
      const scores = db.getModelScores()
      const eloData = {}
      for (const s of scores) {
        if (s.model_id && !eloData[s.model_id]) eloData[s.model_id] = { score: s.score, win_count: s.win_count || 0, total_count: s.total_count || 0 }
      }
      const result = modelAdvisor.suggestModelExplained({ allModels, userMessage, useTools: true, intent, eloData })
      if (result) {
        return { suggestedModelId: result.suggestedModelId, reason: result.reason,
          heuristicScores: result.heuristicScores, confidence: result.confidence }
      }
      return { suggestedModelId: currentModelId, reason: 'current', confidence: 0 }
    } catch {
      return { suggestedModelId: null, reason: 'error', confidence: 0 }
    }
  })

  // Model router (Claude Code-style): pick a model tier for a task type.
  // Returns { tier, suggestedModelName, rationale } for cost-optimized routing.
  ipcMain.handle('model:route-tier', (_e, { taskType, userMessage }) => {
    try {
      const allModels = db.getAllModels().filter(m => {
        const p = db.getProvider(m.provider_id)
        return p && p.enabled
      })
      const tier = modelRouter.routeTask(taskType, userMessage || '', 0)
      const suggestion = modelRouter.suggestModelForTier(tier, allModels)
      return { tier, modelName: suggestion?.modelName || null, modelId: suggestion?.modelId || null, rationale: suggestion?.rationale || '' }
    } catch {
      return { tier: 'standard', modelName: null, rationale: 'error' }
    }
  })

  // Renderer replies to a permission-request via this invoke. We just forward
  // the reply as an event so the waiting requestPermission closure (which uses
  // wc.on('chat:permission-reply')) picks it up.
  ipcMain.handle('chat:permission-reply', (event, payload) => {
    event.sender.send('chat:permission-reply', payload)
    return true
  })
  // Same forwarding pattern for AskUserQuestion replies.
  ipcMain.handle('chat:question-reply', (event, payload) => {
    event.sender.send('chat:question-reply', payload)
    return true
  })

  // ─── Audit log ───────────────────────────────────────────────────────────
  ipcMain.handle('audit:log', (_e, { sessionId, limit = 50 }) => {
    return db.getAuditLog(sessionId, limit)
  })
  ipcMain.handle('agent-checkpoint:list', (_e, { sessionId, messageId = null } = {}) => {
    return db.listAgentCheckpoints(sessionId, messageId)
  })
  ipcMain.handle('agent-checkpoint:rollback', (_e, { id }) => checkpoints.rollbackCheckpoint(id))

  // Trust badge: renderer queries trust score for current session
  ipcMain.handle('trust:badge', (_e, { sessionId }) => {
    try {
      if (!sessionId) return null
      const trustEngine = require('../llm/trustEngine')
      return trustEngine.getTrustBadge(db, sessionId)
    } catch {
      return null
    }
  })
}

// Generate a concise, summarized title for a session's first exchange.
// Asks the model for a short topic phrase (e.g. asking "新约能天使值不值得抽"
// → "新约能天使抽取建议"). Falls back to a truncated version of the user's input
// if the summary call fails or returns nothing useful. Never throws.
async function generateSummaryTitle({ sessionId, content, fullContent, model, provider, titleLanguage = 'auto' }) {
  const fallback = (content || '新对话').replace(/\s+/g, ' ').trim().slice(0, 30)
  let title = fallback
  // Resolve the language the title should be written in. 'auto' defers to a
  // setting; we just pick a prompt variant per language family.
  const lang = titleLanguage === 'auto' ? 'zh' : titleLanguage
  const prompts = {
    zh: '你是会话主题提炼器。用一个简短的主题短语概括用户的核心诉求，4-12个字，像一个小标题。不要句号、引号、前缀或解释。示例：用户问"新约能天使值不值得抽"→"新约能天使抽取建议"；用户问"这段Python代码为什么报错"→"Python代码排错"。',
    en: 'You are a session topic distiller. Summarize the user\'s core request as a short title (3-7 words), like a heading. No periods, quotes, prefixes, or explanation. Example: user asks "should I pull New Eiyuu Angel" -> "New Eiyuu Angel pull advice".',
    ja: 'セッションの主題を短いフレーズ（4-12字）で要約し、小見出しのように出力せよ。句読点・引用符・接頭辞・説明は不要。',
  }
  const sysPrompt = prompts[lang] || prompts.zh
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const text = await completeChat({
      provider, model,
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: `用户：${content}\n\n助手：${(fullContent || '').slice(0, 800)}` },
      ],
      signal: controller.signal,
      options: { max_tokens: 30, temperature: 0.2 },
    })
    clearTimeout(timeout)
    const cleaned = (text || '').trim().replace(/^[“”『]|[“”』]$/g, '').replace(/[。.!！？?]/g, '').trim()
    if (cleaned) title = cleaned.slice(0, 20)
  } catch (e) {
    log.warn('title summary failed:', e.message)
  }
  try { dbHandle.renameSession(sessionId, title) } catch (e) { log.warn('renameSession failed:', e.message) }
}

// estimateTextTokens is imported from compaction.js (shared with the same
// function there, so both use the same 6-range CJK coverage — no divergence).
// The old local estimateTokens had only 1 range and under-counted CJK tokens.
const { estimateTextTokens: estimateTokens } = require('../llm/compaction')

// Per-call cost uses the shared computeCost from utils/cost.js


module.exports = { registerChatHandlers, clearAllowRules, registerSessionMessages, cleanupSessionControllers }
