const { streamChat, completeChat, normalizeUsage } = require('../llm/providerAdapter')
const { runToolLoop } = require('../llm/toolLoop')
const { buildReasoningParams } = require('../llm/reasoning')
const { maybeCompact } = require('../llm/compaction')
const { classifyError } = require('../llm/errorClassify')
const autoMemory = require('../llm/autoMemory')
const habitLearner = require('../llm/habitLearner')
const skills = require('../llm/skills')
const { computeCost } = require('../utils/cost')
const log = require('../logger')

// dbHandle is set by registerChatHandlers — generateSummaryTitle lives at module
// scope (so it can be unit-tested) but needs DB access to persist the title.
let dbHandle = null

// Placeholder titles (in any language) that indicate a session hasn't been
// named yet. When auto-title is on and the session has one of these, we
// generate a summary title after the first response.
const PLACEHOLDER_TITLES = new Set(['新会话', '新对话', 'New Chat'])

// Per-request abort controllers to avoid race conditions
const abortControllers = new Map()

// ─── Session-scoped permission allow-rules ─────────────────────────────────
// When the user picks "allow + remember" in the permission dialog, we store a
// rule so subsequent similar calls skip the dialog. Rules are per-session and
// cleared on session delete. Granularity:
//   run_command  → key = first whitespace token (the binary, e.g. "git", "npm")
//   write/edit   → key = the directory of the path (so all writes under a
//                  project dir match after one approval)
//   others       → exact name match (remember "yes to this tool")
const allowRules = new Map() // sessionId -> Set<string> of `${name}:${key}`

function ruleKey(name, args) {
  if (name === 'run_command') {
    const cmd = String(args?.command || '').trim()
    const firstTok = cmd.split(/\s+/)[0] || cmd
    return firstTok
  }
  if (name === 'write_file' || name === 'edit_file') {
    const p = String(args?.path || '')
    const dir = p.includes('/') || p.includes('\\') ? p.replace(/[\\/][^\\/]*$/, '') : p
    return dir || p
  }
  return '*' // any args for this tool name
}
function matchAllowRule(sessionId, name, args) {
  const set = allowRules.get(sessionId)
  if (!set) return false
  return set.has(`${name}:${ruleKey(name, args)}`) || set.has(`${name}:*`)
}
function addAllowRule(sessionId, name, args) {
  if (!allowRules.has(sessionId)) allowRules.set(sessionId, new Set())
  allowRules.get(sessionId).add(`${name}:${ruleKey(name, args)}`)
}
function clearAllowRules(sessionId) { allowRules.delete(sessionId) }

function registerChatHandlers(ipcMain, db, getWebContents) {
  dbHandle = db
  // Cache rarely-changing settings at handler registration time. Invalidation
  // happens on the `settings-changed` IPC (broadcast from settings.handler).
  const _s: Record<string, string> = {}
  const getCached = (k: string, fallback: string) => {
    if (!(k in _s)) _s[k] = db.getSetting(k) ?? fallback
    return _s[k]
  }
  // Re-populate cache from DB (covers app restart where the handler is re-registered).
  ;['autoTitle', 'titleLanguage', 'auto_memory_enabled', 'fallback_timeout_ms', 'agent_max_iterations'].forEach(k => { _s[k] = db.getSetting(k) ?? '' })

  ipcMain.handle('chat:send', async (event, { sessionId, content, modelId, mode = 'normal', regenerate = false, personaId = null, attachments = [], useTools = false, agentMode = 'ask', effortLevel = 'off', genParams = {}, systemPrefix = '' }) => {
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
    const model = db.getModel(modelId)
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

    // Build fallback chain
    const fallbackModels = [{ model, provider }]
    const chain = db.getFallbackChain(model.provider_id)
    for (const m of chain) {
      if (m.id !== modelId) fallbackModels.push({ model: m, provider })
    }

    // Get conversation history
    const msgs = db.getMessages(sessionId)
    // Fetch the current session once (a direct indexed lookup, far cheaper than
    // the getSessions() full-table-scan-with-subquery that ran here twice before).
    // Used for both the placeholder-title check and the persona_id fallback below.
    const session0 = db.getSession(sessionId)
    // Respect the autoTitle setting (default on) and only summarize the first exchange.
    const autoTitleOn = (getCached('autoTitle', '1') ?? '1') === '1'
    const titleLanguage = getCached('titleLanguage') || 'auto'
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
      compacted = await maybeCompact({ provider, model, messages: apiMsgs, budget: ctxBudget })
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
    const autoMemoryOn = getCached('auto_memory_enabled', '1') !== '0'
    const memBlock = autoMemoryOn ? autoMemory.prefetch(db, content) : ''
    if (memBlock) compacted.unshift({ role: 'system', content: memBlock })

    const timeoutMs = parseInt(getCached('fallback_timeout_ms', '30000'), 10)
    let lastError = null

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
      const controller = new AbortController()
      abortControllers.set(msgId, controller)
      const wc = getWebContents()
      try {
        const finalContent = await runToolLoop({
          provider, model, messages: toolMessages, signal: controller.signal,
          options: mergedOpts,
          agentMode: agentMode || 'ask',
          maxIterations: parseInt(getCached('agent_max_iterations', '25'), 10),
          onToolCall: (entry) => wc?.send('chat:tool-call', { messageId: msgId, sessionId, tool: entry }),
          onPlanStep: (step) => wc?.send('chat:plan-step', { messageId: msgId, sessionId, step }),
          onStatus: (s) => wc?.send('chat:status', { messageId: msgId, sessionId, text: s.text, kind: s.kind }),
          onTodoUpdate: (todos) => wc?.send('chat:todo-update', { messageId: msgId, sessionId, todos }),
          // AskUserQuestion: surface a structured question dialog and await the
          // user's choice. Returns a JSON string of answers so the model can read
          // them as a tool result.
          onAskUser: (questions) => new Promise((resolve) => {
            const reqId = `${msgId}:q:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
            const safeWc = wc && !wc.isDestroyed() ? wc : null
            let settled = false
            const finish = (val) => {
              if (settled) return
              settled = true
              clearTimeout(timer)
              controller.signal.removeEventListener('abort', onAbort)
              safeWc?.removeListener('chat:question-reply', onReply)
              resolve(val)
            }
            const onReply = (_e, r) => { if (r && r.reqId === reqId) finish(JSON.stringify(r.answers || [])) }
            const onAbort = () => finish(JSON.stringify([{ question: questions[0]?.question, answer: '(aborted)' }]))
            const onTimeout = () => { safeWc?.send('chat:question-expired', { reqId }); finish(JSON.stringify([{ answer: '(no response)' }])) }
            const timer = setTimeout(onTimeout, 300000) // 5 min — questions can wait longer
            controller.signal.addEventListener('abort', onAbort)
            if (!safeWc) { finish(JSON.stringify([{ answer: '(no window)' }])); return }
            safeWc.on('chat:question-reply', onReply)
            safeWc.send('chat:question', { reqId, messageId: msgId, sessionId, questions })
          }),
          // Session-scoped permission allow-rules: when the user picks "allow +
          // remember" in the dialog, we store a prefix rule and skip the dialog
          // for matching subsequent calls. Cleared when the session is deleted.
          //   run_command  → prefix = first 2 space-tokens of the command
          //                  (e.g. "git status" matches "git diff" via prefix "git")
          //                  Actually we key on the first token (the binary) to be
          //                  useful but not over-broad. Edit below.
          //   write/edit   → prefix = the directory of the path
          // For run_command we match by the first whitespace token (the binary),
          // so "npm test" and "npm run build" both match a remembered "npm" rule.
          // That's the useful granularity Claude Code uses.
          requestPermission: ({ name, args, risk }) => {
            // Check session allow-rules first.
            const rule = matchAllowRule(sessionId, name, args)
            if (rule) return Promise.resolve(true)
            return new Promise((resolve) => {
            const reqId = `${msgId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
            const safeWc = wc && !wc.isDestroyed() ? wc : null
            let settled = false
            const finish = (val) => {
              if (settled) return
              settled = true
              clearTimeout(timer)
              controller.signal.removeEventListener('abort', onAbort)
              safeWc?.removeListener('chat:permission-reply', onReply)
              resolve(val)
            }
            const onReply = (_e, r) => {
              if (!r || r.reqId !== reqId) return
              // If the user chose "allow + remember", persist the rule for the session.
              if (r.allowed && r.remember) addAllowRule(sessionId, name, args)
              finish(!!r.allowed)
            }
            const onAbort = () => finish(false)
            const onTimeout = () => {
              // Notify the renderer so its dialog dismisses instead of hanging.
              safeWc?.send('chat:permission-expired', { reqId })
              finish(false)
            }
            const timer = setTimeout(onTimeout, 60000)
            controller.signal.addEventListener('abort', onAbort)
            if (!safeWc) { finish(false); return }
            safeWc.on('chat:permission-reply', onReply)
            safeWc.send('chat:permission-request', { reqId, messageId: msgId, sessionId, name, args, risk })
            })
          },
        })
        const tokens = estimateTokens(finalContent)
        db.updateMessage(msgId, { content: finalContent, status: 'success', token_count: tokens })
        if (needsTitle) await generateSummaryTitle({ sessionId, content, fullContent: finalContent, model, provider, titleLanguage })
        // Auto-memory sync (Hermes-style): fire-and-forget extraction of facts
        // worth remembering. Not awaited — must never add latency to the reply.
        if (autoMemoryOn) autoMemory.sync({ db, provider, model, userMessage: content, assistantReply: finalContent })
        // Habit learner: detect recurring preferences and promote them to a
        // user-habits skill once they repeat. Also fire-and-forget.
        if (autoMemoryOn) habitLearner.detectAndLearn({ db, provider, model, userMessage: content, assistantReply: finalContent, onPropose: (h) => { try { getWebContents()?.send('chat:habit-proposed', h) } catch {} } })
        wc?.send('chat:stream-chunk', { messageId: msgId, delta: finalContent, done: false, sessionId })
        wc?.send('chat:stream-chunk', { messageId: msgId, delta: '', done: true, sessionId })
        abortControllers.delete(msgId)
        return { messageId: msgId }
      } catch (err) {
        abortControllers.delete(msgId)
        const errMsg = err.name === 'AbortError' ? '已中止' : (err.message || String(err))
        db.updateMessage(msgId, { content: '', status: 'aborted', error_message: errMsg })
        wc?.send('chat:stream-chunk', { messageId: msgId, delta: '', done: true, sessionId })
        return { messageId: msgId }
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

      const controller = new AbortController()
      abortControllers.set(msgId, controller)
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      try {
        let fullContent = ''
        const wc = getWebContents()
        // mergedOpts carries reasoning params + advanced generation params (max_tokens/
        // temperature/top_p) set in Settings, spread into the request body by the adapter.
        // streamChat returns a generator that exposes .usage (server-reported tokens)
        // once the stream ends — captured here for the usage log.
        const stream = streamChat({ provider: p, model: m, messages: compacted, signal: controller.signal, options: mergedOpts })
        const streamStart = Date.now()
        for await (const delta of stream) {
          if (delta) {
            fullContent += delta
            wc?.send('chat:stream-chunk', { messageId: msgId, delta, done: false, sessionId })
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
      if (autoMemoryOn) autoMemory.sync({ db, provider: p, model: m, userMessage: content, assistantReply: fullContent })
      if (autoMemoryOn) habitLearner.detectAndLearn({ db, provider: p, model: m, userMessage: content, assistantReply: fullContent, onPropose: (h) => { try { getWebContents()?.send('chat:habit-proposed', h) } catch {} } })
      log.info('DB write', msgId, 'len=', fullContent.length, 'tokens=', tokens)
      wc?.send('chat:stream-chunk', { messageId: msgId, delta: '', done: true, sessionId })

      return { messageId: msgId }

      } catch (err) {
        clearTimeout(timeout)
        abortControllers.delete(msgId)
        if (err.name === 'AbortError') {
          db.updateMessage(msgId, { content: '', status: 'aborted', error_message: '已中止' })
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
    return { messageId: 0 }
  })

  ipcMain.handle('chat:stop', () => {
    for (const [id, controller] of abortControllers) {
      controller.abort()
    }
    abortControllers.clear()
  })

  // Habit-confirmation flow: the renderer asks us to confirm (promote now) or
  // dismiss (delete) a proposed habit. We don't need to reply with data — the
  // skill is rewritten synchronously inside habitLearner.
  ipcMain.handle('chat:habit-confirm', (_e, key) => { try { habitLearner.confirmHabit(db) } catch (e) { log.warn('habit confirm failed:', e) } return { ok: true } })
  ipcMain.handle('chat:habit-dismiss', (_e, key) => { try { habitLearner.dismissHabit(db, key) } catch (e) { log.warn('habit dismiss failed:', e) } return { ok: true } })

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
    const cleaned = (text || '').trim().replace(/^["“『]|["”』]$/g, '').replace(/[。.!！？?]/g, '').trim()
    if (cleaned) title = cleaned.slice(0, 20)
  } catch (e) {
    log.warn('title summary failed:', e.message)
  }
  try { dbHandle.renameSession(sessionId, title) } catch {}
}

// estimateTextTokens is imported from compaction.js (shared with the same
// function there, so both use the same 6-range CJK coverage — no divergence).
// The old local estimateTokens had only 1 range and under-counted CJK tokens.
const { estimateTextTokens: estimateTokens } = require('../llm/compaction')

// Per-call cost uses the shared computeCost from utils/cost.js


module.exports = { registerChatHandlers, clearAllowRules }
