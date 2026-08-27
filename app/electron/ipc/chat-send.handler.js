// chat-send.handler.js — the chat:send processor, extracted from chat.handler.js
// so the main chat handler stays focused on session lifecycle and auxiliary IPC.
//
// A factory function receives the shared module state (abort controllers, tool
// loop bookkeeping, pending injections, allow-rules) from chat.handler.js so the
// same live objects are used everywhere. `db` is passed in so title generation can
// persist the new title without a module-level dbHandle.

const { streamChat, completeChat, normalizeUsage } = require('../llm/providerAdapter')
const { runToolLoop } = require('../llm/toolLoop')
const { buildReasoningParams } = require('../llm/reasoning')
const { maybeCompact, estimateMessagesTokens, estimateTextTokens } = require('../llm/compaction')
const { classifyError } = require('../llm/errorClassify')
const autoMemory = require('../llm/autoMemory')
const habitLearner = require('../llm/habitLearner')
const path = require('path')
const skills = require('../llm/skills')
const { computeCost } = require('../utils/cost')
const modelAdvisor = require('../llm/modelAdvisor')
const log = require('../logger')
const providerHealth = require('../llm/providerHealth')
const { buildToolLoopCallbacks } = require('./toolLoopCallbacks')
const codeUnderstanding = require('../context/codeUnderstanding')
const { orchestrate } = require('../llm/orchestrator')
const { isComplexRequest } = require('../llm/planning')
const featureFlags = require('../featureFlags')

// ── Overflow self-heal (P0): bounded compact → retry ───────────────────────
const OVERFLOW_MAX_RETRIES = 2            // OpenClaw 同款有界重试
const OVERFLOW_RETRY_COOLDOWN_MS = 10000  // 冷却：压缩无效时不无限打转
const _lastOverflowCompactAt = new Map()  // sessionId -> ts，进程级即可

const DEFAULT_CTX_BUDGET = 32000
const DEFAULT_FALLBACK_TIMEOUT_MS = 30000

// Shared with the token estimator used elsewhere (same 6-range CJK coverage).
const estimateTokens = estimateTextTokens

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

// Quick fallback title: the full first user message, whitespace-collapsed,
// capped at 200 chars to stop pathological pastes (code dumps, logs) from
// bloating the title column. The renderer truncates for display (ellipsis);
// the DB keeps the complete first line so search/rename see everything.
function quickTitleOf(content) {
  return String(content || '').replace(/\s+/g, ' ').trim().slice(0, 200)
}

// Pure decision helpers (exported for unit tests):
//   shouldWriteQuickTitle(...) — first message of a placeholder-titled session
//   shouldTryAiSummary(...)    — placeholder OR still the quick-cut shape, so
//                                an aborted/failed first turn can upgrade later
function shouldWriteQuickTitle({ autoTitleOn, sessionTitle, msgsLen }) {
  return !!autoTitleOn && PLACEHOLDER_TITLES.has(String(sessionTitle || '').trim()) && msgsLen === 1
}
function shouldTryAiSummary({ autoTitleOn, sessionTitle, content }) {
  if (!autoTitleOn) return false
  const t = String(sessionTitle || '').trim()
  if (!t) return false // 空标题不视为待摘要（无占位符/quick 形态）
  return PLACEHOLDER_TITLES.has(t) || t === quickTitleOf(content)
}

/**
 * Register the chat:send handler. `ctx` carries the shared live state owned by
 * chat.handler.js (abortControllers, activeToolLoops, pendingInjections,
 * sessionMessagesMap, registerSessionMessages, allowRulesStore).
 */
function registerChatSendHandler({ ipcMain, db, getWebContents, ctx }) {
  const {
    abortControllers,
    activeToolLoops,
    pendingInjections,
    sessionMessagesMap,
    registerSessionMessages,
    allowRulesStore,
  } = ctx

  // Cache rarely-changing settings at handler registration time. Invalidation
  // happens via the settings:changed event emitted by the settings handler.
  const _s = {}
  const SETTING_DEFAULTS = { autoTitle: '1', titleLanguage: 'auto', auto_memory_enabled: '1', fallback_timeout_ms: String(DEFAULT_FALLBACK_TIMEOUT_MS), agent_max_iterations: '25' }
  ;['autoTitle', 'titleLanguage', 'auto_memory_enabled', 'fallback_timeout_ms', 'agent_max_iterations'].forEach(k => { _s[k] = db.getSetting(k) ?? SETTING_DEFAULTS[k] })

  ipcMain.on('settings:changed', (_e, key) => { if (key in SETTING_DEFAULTS) { _s[key] = db.getSetting(key) ?? SETTING_DEFAULTS[key] } })

// ── Synchronous completion for external clients ──────────────────────────
  // Used by the local gateway (VS Code extension, browser/scripts). Unlike
  // chat:send (which streams to the Electron window), this returns the full
  // text as the invoke result. Reuses an existing session when one is given,
  // otherwise creates a short-lived session so the exchange shows up in Aether.
  // Exported as a named function so the local gateway can proxy it directly
  // (ipcMain.handle channels are invisible to ipcMain.listeners).
  async function handleChatComplete(_event, { content, modelId = null, sessionId = null, context = '', systemPrefix = '' }) {
    const text = String(content || '').trim()
    if (!text) return { error: 'content is required' }
    try {
      // Resolve model: explicit id, else primary, else first enabled model.
      let model = (modelId && db.getModel(modelId)) || null
      if (!model) {
        const all = db.getAllModels()
        model = all.find(m => m.is_primary === 1) || all[0] || null
      }
      if (!model) return { error: 'no model configured' }
      const provider = db.getProvider(model.provider_id)
      if (!provider) return { error: 'provider not found' }

      // Persist to a session (create a short-lived one when none is provided).
      let sid = sessionId
      if (!sid) {
        sid = db.createSession({ title: quickTitleOf(text) }).lastInsertRowid
      } else {
        db.touchSession(sid)
      }

      const messages = []
      if (systemPrefix && systemPrefix.trim()) messages.push({ role: 'system', content: systemPrefix.trim() })
      if (context && context.trim()) messages.push({ role: 'system', content: context.trim() })
      messages.push({ role: 'user', content: text })
      db.addMessage({ session_id: sid, role: 'user', content: text })

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120000)
      let replyText = ''
      try {
        const reply = await completeChat({ provider, model, messages, signal: controller.signal, options: { temperature: 0.3 } })
        replyText = String(reply || '')
      } finally {
        clearTimeout(timeout)
      }
      const msg = db.addMessage({
        session_id: sid, role: 'assistant', content: replyText,
        model_used: model.model_name, provider_used: String(provider.id),
        status: replyText ? 'success' : 'error',
      })
      return { content: replyText, sessionId: sid, messageId: msg.lastInsertRowid }
    } catch (e) {
      return { error: e && e.message ? e.message : String(e) }
    }
  }
ipcMain.handle('chat:complete', handleChatComplete)

  ipcMain.handle('chat:send', async (event, { sessionId, content, modelId, mode = 'normal', regenerate = false, personaId = null, attachments = [], useTools = false, agentMode = 'ask', effortLevel = 'medium', thinkingEnabled = true, genParams = {}, systemPrefix = '' }) => {
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
    let provider = db.getProvider(model.provider_id)
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
      if (result) modelSuggestion = { suggestedModelId: result.suggestedModelId, reason: result.reason, reasonParts: result.reasonParts, confidence: result.confidence }
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
    const needsTitle = shouldWriteQuickTitle({ autoTitleOn, sessionTitle: session0 && session0.title, msgsLen: msgs.length })
    // 立即兜底标题（不等 AI 摘要）: 首条消息发送时就同步截取输入前 30 字写入,
    // 保证"标题永远可见"——此前只有 AI 摘要成功后才有标题, 若首轮被中止
    // (aborted) 或上游拒绝摘要请求 (429), 会话标题就永久停留在占位符,
    // 且之后 msgs>=2 导致 needsTitle 永远不再成立（"不自动生成标题"根因）。
    // AI 摘要成功后会异步覆盖为精炼标题（generateSummaryTitle, 见下）。
    if (needsTitle) {
      const quick = quickTitleOf(content)
      if (quick) {
        try { db.renameSession(sessionId, quick) } catch (e) { log.warn('quick title failed:', e.message) }
      }
    }
    // AI 摘要的触发条件: 标题仍是 quick 兜底形态（= 首条输入截断, 特征:
    // 非占位符但可被下面的 quickTitleOf 重新识别）时, 后续成功回复也尝试
    // 用 AI 精炼覆盖。这样首轮中止/失败后, 只要标题还是截断形态,
    // 下一次成功回合仍有机会升级为 AI 摘要——不再受 msgs.length===1 单窗口限制。
    const needsAiSummary = shouldTryAiSummary({ autoTitleOn, sessionTitle: session0 && session0.title, content })
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
    const ctxBudget = (model.context_window && Number(model.context_window) > 0) ? Number(model.context_window) : DEFAULT_CTX_BUDGET
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
      try { getWebContents()?.send('chat:status', { messageId: 0, sessionId, text: `🗜 压缩 ${beforeCompact} → ${compacted.length} 条消息` }) } catch {}
    }

    // Auto-title: defer to a real AI summary after the first response (see below).
    // Previously this slice()d the raw user input into the title (a copy-paste,
    // not a summary). Leaving a neutral default until the summary is generated.

    // Merge reasoning params (effort) with advanced generation params from settings.
    const reasoningOpts = buildReasoningParams(model.model_name, effortLevel, thinkingEnabled)
    const genOpts = {}
    if (genParams.maxTokens && genParams.maxTokens > 0) genOpts.max_tokens = genParams.maxTokens
    if (genParams.temperature && genParams.temperature > 0) genOpts.temperature = genParams.temperature
    if (genParams.topP && genParams.topP > 0) genOpts.top_p = genParams.topP
    const mergedOpts = { ...genOpts, ...reasoningOpts }
    // Prepend a custom system prefix if set (advanced users). Done after compaction
    // so the prefix is never summarized away.
    if (systemPrefix && systemPrefix.trim()) {
      compacted.unshift({ role: 'system', content: '<user_system_prefix>\n' + systemPrefix.trim() + '\n</user_system_prefix>' })
    }
    // Auto-memory prefetch (Hermes-style): inject relevant past memories as a
    // system message so the model can recall context from earlier sessions.
    // Done once here so BOTH the tool path and the plain streaming path inherit it.
    // Gateable via the auto_memory_enabled setting (default on).
    const autoMemoryOn = _s['auto_memory_enabled'] !== '0'
    let memBlock = autoMemoryOn ? autoMemory.prefetch(db, content) : ''
    if (!memBlock && autoMemoryOn && provider && model) {
      // LLM second-pass recall (P1-5): keyword+graph recall found nothing —
      // ask the model to pick relevant memories from the recent pool. Gated
      // by the auto-memory setting; one cheap completion, never throws.
      try {
        memBlock = (await autoMemory.recall({ db, provider, model, userMessage: content, signal: controller?.signal })) || ''
      } catch {}
    }
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

    // Proactive habit suggestions (Hermes-style): fire-and-forget match.
    if (autoMemoryOn) {
      try { habitLearner.proactiveSuggest({ db, provider, model, userMessage: content, signal: controller?.signal, onSuggest: (h) => { try { getWebContents()?.send('chat:habit-suggestion', h) } catch {} } }) } catch {}
    }

    const timeoutMs = parseInt(_s['fallback_timeout_ms'] ?? String(DEFAULT_FALLBACK_TIMEOUT_MS), 10)
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
      // Code understanding(本地、无 LLM):把 workspace 结构持久化进知识图谱,
      // 让跨会话「X 如何连到 Y」的查询可用。延迟 + fire-and-forget,不阻塞回复路径。
      try {
        const ff = require('../featureFlags')
        if (ff.isEnabled(db, 'memory.codeUnderstanding')) {
          let wsRoot = null
          try { wsRoot = (session0 && session0.config && JSON.parse(session0.config).workspace) || null } catch {}
          if (wsRoot) setImmediate(() => { try { codeUnderstanding.indexWorkspace(db, wsRoot, { maxFiles: 2000 }) } catch {} })
        }
      } catch {}
      // Inject the available-skills list as a system message so the model can
      // call use_skill when a task matches. Only when tools are on (skills are
      // meaningless without the tool loop). Done after compaction so the list
      // is never summarized away.
      const skillsBlock = skills.formatSkillsForPrompt()
      // memBlock was already injected into `compacted` above (shared by both paths).
      // toolMessages 可被溢出自愈重试重建（force 压缩后），故用 let。
      let toolMessages = skillsBlock ? [{ role: 'system', content: skillsBlock }, ...compacted] : compacted
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
      let streamedContent = ''
      try {
        // Build shared callback bag (onToolCall, onAskUser, requestPermission, etc.)
        // using the extracted factory. Feature B's injection options stay inline below.
        const baseCb = buildToolLoopCallbacks({
          db,
          send: (c, p) => wc?.send(c, p),
          getWc: () => (wc && !wc.isDestroyed() ? wc : null),
          sessionId,
          msgId,
          controller,
          source: 'chat',
          allowRules: allowRulesStore,
          model,
        })
        const cb = {
          ...baseCb,
          onStreamDelta: (delta) => {
            if (delta) streamedContent += delta
            baseCb.onStreamDelta?.(delta)
          },
        }
        // Orchestration:复杂请求走编排器(并行子代理),简单请求走单循环。
        // 任何失败一律回落单循环,聊天主线永不因编排出错而崩溃。
        const runSingleLoop = () => runToolLoop({
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
        // ── Overflow self-heal（P0）：compact → retry，三重防误触 ──────────
        // ①分类器只认 context_length；②每会话 10s 冷却；③force 压缩无效即放弃；
        // 外加 OVERFLOW_MAX_RETRIES 有界。
        const runWithOverflowHeal = async () => {
          let overflowRetries = 0
          for (;;) {
            try {
              return await runSingleLoop()
            } catch (err) {
              const cls = classifyError(err)
              const lastAt = _lastOverflowCompactAt.get(sessionId) || 0
              const cooled = Date.now() - lastAt >= OVERFLOW_RETRY_COOLDOWN_MS
              if (cls?.recover?.action !== 'compact_retry' || overflowRetries >= OVERFLOW_MAX_RETRIES || !cooled) throw err
              overflowRetries++
              _lastOverflowCompactAt.set(sessionId, Date.now())
              // 失败循环内已执行的工具调用/结果必须并入压缩输入，否则重试时
              // 这段历史丢失、非幂等工具会被重复执行。runToolLoop 在上下文
              // 超长抛错时会携带 err.convo（完整对话快照，含 skillsBlock 种子
              // 与全部工具历史）——优先用它。无快照时回退 toolMessages 尾部
              //（旧路径：尾部可能不成对，maybeCompact/safeSplitIndex 有配对回退）。
              const failedConvo = Array.isArray(err && err.convo) ? err.convo : null
              let mergeBase
              if (failedConvo) {
                mergeBase = failedConvo
              } else {
                const seedLen = skillsBlock ? 1 : 0
                const loopTail = (Array.isArray(toolMessages) && toolMessages.length > seedLen) ? toolMessages.slice(seedLen) : []
                mergeBase = loopTail.length ? [...compacted, ...loopTail] : [...compacted]
              }
              const forced = await maybeCompact({ provider, model, messages: mergeBase, budget: ctxBudget, sessionId, force: true })
              if (!forced) throw err // 压缩无可压 → 原样抛给上层既有处理
              compacted.length = 0
              compacted.push(...forced)
              // failedConvo 已含种子 system 消息——重建时不再 prepend。
              toolMessages = failedConvo
                ? compacted
                : (skillsBlock ? [{ role: 'system', content: skillsBlock }, ...compacted] : compacted)
              try { wc?.send('chat:status', { messageId: msgId, sessionId, text: cls.recover.hint, kind: cls.kind }) } catch {}
            }
          }
        }
        if (featureFlags.isEnabled(db, 'agent.orchestrator') && isComplexRequest(content, 0)) {
          try {
            const orc = await orchestrate({ db, request: content, provider, model, signal: controller.signal, agentMode: agentMode || 'ask', callbacks: cb })
            const returned = (orc && orc.ok && orc.summary) ? orc.summary : await runWithOverflowHeal()
            finalContent = streamedContent || returned || ''
          } catch {
            const returned = await runWithOverflowHeal()
            finalContent = streamedContent || returned || ''
          }
        } else {
          const returned = await runWithOverflowHeal()
          finalContent = streamedContent || returned || ''
        }
        try { wc?.send('chat:tool-loop-end', { sessionId }) } catch {}
        // Report final context budget.
        const budgetAfter = estimateMessagesTokens(compacted) + estimateTextTokens(finalContent)
        const pctAfter = Math.min(100, Math.round((budgetAfter / ctxBudget) * 100))
        if (pctAfter >= 70) {
          try { wc?.send('chat:status', { messageId: msgId, sessionId, text: `⚠️ 上下文使用 ${pctAfter}% (≈${budgetAfter} / ${ctxBudget} tokens)`, kind: 'context_budget' }) } catch {}
        }
        const tokens = estimateTokens(finalContent)
        db.updateMessage(msgId, { content: finalContent, status: 'success', token_count: tokens })
        if (needsAiSummary) await generateSummaryTitle({ sessionId, content, fullContent: finalContent, model, provider, titleLanguage, db })
        // Auto-memory sync (Hermes-style): fire-and-forget extraction of facts
        // worth remembering. Not awaited — must never add latency to the reply.
        if (autoMemoryOn) autoMemory.sync({ db, provider, model, userMessage: content, assistantReply: finalContent, sessionId })
        // 回写本次使用的 provider/model：定时反思（strategy-reflect）等
        // 后台 LLM 任务的数据源。fire-and-forget，失败不影响回复。
        try { db.setSetting('llm.lastProvider', String(provider?.id || provider || '')); db.setSetting('llm.lastModel', String(model?.model_name || model?.id || model || '')) } catch {}
        // Habit learner: detect recurring preferences and promote them to a
        // user-habits skill once they repeat. Also fire-and-forget.
        if (autoMemoryOn) habitLearner.detectAndLearn({ db, provider, model, userMessage: content, assistantReply: finalContent, onPropose: (h) => { try { getWebContents()?.send('chat:habit-proposed', h) } catch {} } })
        // Memory → Skill bridge: every 20 messages, run a memory audit to
        // detect patterns and draft new skills from accumulated memories.
        // Fire-and-forget, never blocks the reply.
        if (autoMemoryOn && sessionId && db) {
          try {
            const msgCount = (db.allRows('SELECT COUNT(*) as c FROM messages WHERE session_id = ?', [sessionId]) || [])[0]?.c || 0
            if (msgCount > 0 && msgCount % 20 === 0) {
              const bridge = require('../llm/memorySkillBridge')
              const electron = require('electron')
              const app = electron?.app || (typeof electron === 'object' ? electron : null)
              const skillsDir = app?.getPath
                ? path.join(app.getPath('userData'), 'skills')
                : path.join(process.cwd(), '.aetherai', 'skills')
              bridge.runMemoryAudit({ db, provider, model, signal: controller?.signal, skillsDir })
                .then(r => { if (r.drafts > 0) log.info(`memorySkillBridge: ${r.drafts} draft skills created`) })
                .catch(() => {})
            }
          } catch {}
        }
        // End of tool loop streaming: all live deltas were already forwarded via onStreamDelta.
        // Send the terminal done event to close the streaming buffer in the renderer.
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
        const preserved = streamedContent || finalContent || ''
        db.updateMessage(msgId, { content: preserved, status: 'aborted', error_message: errMsg })
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

      // Declared outside the try so the abort/error catch can preserve whatever
      // content accumulated before the stream stopped (scoping bug: referencing
      // a try-local variable in catch threw ReferenceError, breaking chat:stop).
      let fullContent = ''
      try {
        const wc = getWebContents()
        let hasThinking = false
        let thinkingEnded = false
        const stream = streamChat({
          provider: p,
          model: m,
          messages: compacted,
          signal: controller.signal,
          options: {
            ...mergedOpts,
            onThinkingDelta: (delta) => {
              if (delta) {
                if (!hasThinking) {
                  hasThinking = true
                  try { wc?.send('chat:thinking-start', { messageId: msgId, sessionId }) } catch {}
                }
                try { wc?.send('chat:thinking-chunk', { messageId: msgId, sessionId, delta, done: false }) } catch {}
              }
            },
          },
        })
        const streamStart = Date.now()
        for await (const delta of stream) {
          if (delta) {
            fullContent += delta
            // Signal thinking is complete as soon as main content tokens start flowing
            if (hasThinking && !thinkingEnded) {
              thinkingEnded = true
              try { wc?.send('chat:thinking-end', { messageId: msgId, sessionId }) } catch {}
            }
            try { wc?.send('chat:stream-chunk', { messageId: msgId, delta, done: false, sessionId }) } catch {}
          }
        }
        if (hasThinking && !thinkingEnded) {
          thinkingEnded = true
          try { wc?.send('chat:thinking-end', { messageId: msgId, sessionId }) } catch {}
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
        // 条件用 needsAiSummary（首条占位符 或 仍是 quick 截断形态）——
        // 首轮中止/失败后, 后续成功回合仍有机会升级为 AI 精炼标题。
        if (needsAiSummary) {
          await generateSummaryTitle({ sessionId, content, fullContent, model: m, provider: p, titleLanguage, db })
        }
        // Auto-memory sync (Hermes-style): fire-and-forget fact extraction.
        if (autoMemoryOn) autoMemory.sync({ db, provider: p, model: m, userMessage: content, assistantReply: fullContent, sessionId })
        try { db.setSetting('llm.lastProvider', String(p?.id || p || '')); db.setSetting('llm.lastModel', String(m || '')) } catch {}
        if (autoMemoryOn) habitLearner.detectAndLearn({ db, provider: p, model: m, userMessage: content, assistantReply: fullContent, onPropose: (h) => { try { getWebContents()?.send('chat:habit-proposed', h) } catch {} } })
        log.info('DB write', msgId, 'len=', fullContent.length, 'tokens=', tokens)
        providerHealth.recordResult(p.id, true)
        providerHealth.recordError(p.id, null)
        wc?.send('chat:stream-chunk', { messageId: msgId, delta: '', done: true, sessionId })

        // 实时用量回传（桌面版打磨 #1）: tokens + 成本, 供 UI 显示本轮开销。
        return {
          messageId: msgId,
          usage: {
            prompt_tokens: u.prompt_tokens,
            completion_tokens: u.completion_tokens,
            total_tokens: u.total_tokens,
            cost: computeCost(m, u),
            model_name: m.model_name,
            provider_name: p.name,
          },
        }

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

  // Generate a concise, summarized title for a session's first exchange.
  // Asks the model for a short topic phrase (e.g. asking "新约能天使值不值得抽"
  // → "新约能天使抽取建议"). Falls back to a truncated version of the user's input
  // if the summary call fails or returns nothing useful. Never throws.
  async function generateSummaryTitle({ sessionId, content, fullContent, model, provider, titleLanguage = 'auto', db }) {
    // 摘要失败时的降级标题与发送时的 quick 标题一致（首条输入截断）。
    const fallback = quickTitleOf(content) || '新对话'
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
      // max_tokens 必须给足: 中转站/中继可能把模型路由到推理模型(如 agnes-2.5-flash),
      // 推理模型的 reasoning_content 会先消耗 token——30 上限时思考过程把额度全吃掉,
      // content 返回空串 → 标题退化为输入截断（"不生成摘要标题"实测根因）。
      // 200 给思考+输出留出余量; reasoning_effort=low 压低思考长度、加快返回。
      const text = await completeChat({
        provider, model,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: `用户：${content}\n\n助手：${(fullContent || '').slice(0, 800)}` },
        ],
        signal: controller.signal,
        options: { max_tokens: 200, temperature: 0.2, reasoning_effort: 'low' },
      })
      clearTimeout(timeout)
      // 推理模型的 content 可能带前导换行/空白, 清理后取首行有效短语
      const cleaned = (text || '').trim().replace(/^[“”『]|[“”』]$/g, '').replace(/[。.!！？?]/g, '').trim()
      if (cleaned) title = cleaned.slice(0, 20)
      else log.warn('title summary returned empty content (reasoning model consumed tokens?)')
    } catch (e) {
      log.warn('title summary failed:', e.message)
    }
    try { db.renameSession(sessionId, title) } catch (e) { log.warn('renameSession failed:', e.message) }
  }

  // Expose the synchronous-completion handler so the local gateway can proxy it
  // directly (ipcMain.handle channels are invisible to ipcMain.listeners).
  return { handleChatComplete }
}

module.exports = { registerChatSendHandler, shouldWriteQuickTitle, shouldTryAiSummary, quickTitleOf }
