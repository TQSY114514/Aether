const { streamChat, completeChat } = require('../llm/providerAdapter')
const { runToolLoop } = require('../llm/toolLoop')
const { buildReasoningParams } = require('../llm/reasoning')
const fs = require('fs')
const path = require('path')

// dbHandle is set by registerChatHandlers — generateSummaryTitle lives at module
// scope (so it can be unit-tested) but needs DB access to persist the title.
let dbHandle = null

// Append-only diagnostic log for the title-summary path, so we can see why a
// session keeps the placeholder title without needing the dev console.
function logTitle(...args) {
  try {
    const { app } = require('electron')
    fs.appendFileSync(path.join(app.getPath('userData'), 'title-debug.log'),
      args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n')
  } catch {}
}

// Per-request abort controllers to avoid race conditions
const abortControllers = new Map()

function registerChatHandlers(ipcMain, db, getWebContents) {
  dbHandle = db
  ipcMain.handle('chat:send', async (event, { sessionId, content, modelId, mode = 'normal', regenerate = false, personaId = null, attachments = [], useTools = false, agentMode = 'ask', effortLevel = 'off', genParams = {}, systemPrefix = '' }) => {
    // Save user message
    if (!regenerate) { db.addMessage({ session_id: sessionId, role: 'user', content }) }
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
    // Generate a summary title when the session still has its placeholder title.
    // More robust than `msgs.length === 1`: also back-fills older sessions whose
    // title was never set (e.g. created before this feature shipped).
    const session0 = db.getSessions().find(s => s.id === sessionId)
    const placeholderTitles = ['新会话', '新对话', 'New Chat']
    // Respect the autoTitle setting (default on) and only summarize the first exchange.
    const autoTitleOn = (db.getSetting('autoTitle') ?? '1') === '1'
    const titleLanguage = db.getSetting('titleLanguage') || 'auto'
    const needsTitle = autoTitleOn && session0 && placeholderTitles.includes((session0.title || '').trim()) && msgs.length === 1
    logTitle('session', sessionId, 'needsTitle=', needsTitle, 'autoTitle=', autoTitleOn, 'title=', session0?.title, 'msgs=', msgs.length)
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
    const session = db.getSessions().find(s => s.id === sessionId)
    if (personaId) {
    const p2 = db.getPersona(personaId)
    if (p2) apiMsgs.unshift({ role: 'system', content: p2.prompt })
  } else if (session && session.persona_id) {
      const p = db.getPersona(session.persona_id)
      if (p) apiMsgs.unshift({ role: 'system', content: p.prompt })
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
    // Prepend a custom system prefix if set (advanced users).
    if (systemPrefix && systemPrefix.trim()) {
      apiMsgs.unshift({ role: 'system', content: systemPrefix.trim() })
    }

    const timeoutMs = parseInt(db.getSetting('fallback_timeout_ms') || '30000', 10)
    let lastError = null

    // Tool-calling path: when the session has tools enabled, run a non-streaming
    // tool loop (detect tool_calls → run built-in tools → re-request). Each tool
    // invocation is streamed to the UI as a tool-call block; the final text is
    // then delivered as the assistant message. Falls through to the normal
    // streaming path when useTools is false.
    if (useTools) {
      const asstMsg = db.addMessage({ session_id: sessionId, role: 'assistant', content: '', model_used: model.model_name, provider_used: provider.id, status: 'success' })
      const msgId = asstMsg.lastInsertRowid
      const controller = new AbortController()
      abortControllers.set(msgId, controller)
      const wc = getWebContents()
      try {
        const finalContent = await runToolLoop({
          provider, model, messages: apiMsgs, signal: controller.signal,
          options: mergedOpts,
          agentMode: agentMode || 'ask',
          onToolCall: (entry) => wc?.send('chat:tool-call', { messageId: msgId, sessionId, tool: entry }),
          onPlanStep: (step) => wc?.send('chat:plan-step', { messageId: msgId, sessionId, step }),
          // Ask the renderer to approve a dangerous tool. Resolves true/false.
          // Uses a one-shot ipc event round-trip keyed by a request id.
          requestPermission: ({ name, args, risk }) => new Promise((resolve) => {
            const reqId = `${msgId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
            const onReply = (_e, r) => {
              if (!r || r.reqId !== reqId) return
              wc?.removeListener('chat:permission-reply', onReply)
              resolve(!!r.allowed)
            }
            wc?.on('chat:permission-reply', onReply)
            wc?.send('chat:permission-request', { reqId, messageId: msgId, sessionId, name, args, risk })
            // Auto-deny after 60s of silence so the loop can't hang forever.
            setTimeout(() => { wc?.removeListener('chat:permission-reply', onReply); resolve(false) }, 60000)
          }),
        })
        const tokens = estimateTokens(finalContent)
        db.updateMessage(msgId, { content: finalContent, status: 'success', token_count: tokens })
        if (needsTitle) await generateSummaryTitle({ sessionId, content, fullContent: finalContent, model, provider, titleLanguage })
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
        for await (const delta of streamChat({ provider: p, model: m, messages: apiMsgs, signal: controller.signal, options: mergedOpts })) {
          if (delta) {
            fullContent += delta
            wc?.send('chat:stream-chunk', { messageId: msgId, delta, done: false, sessionId })
          }
        }
        clearTimeout(timeout)
        abortControllers.delete(msgId)

        // Save to DB FIRST, then send done signal
        const tokens = estimateTokens(fullContent)
      db.updateMessage(msgId, {
        content: fullContent,
        status: isFallback ? 'fallback' : 'success',
        token_count: tokens,
      })
      // Auto-title: summarize the first exchange instead of copy-pasting raw input.
      if (needsTitle) {
        await generateSummaryTitle({ sessionId, content, fullContent, model: m, provider: p, titleLanguage })
      }
      console.log('[AetherAI] DB write', msgId, 'len=', fullContent.length, 'tokens=', tokens)
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
        // Retry on rate-limit / server errors or transient network errors.
        const retryStatus = [429, 500, 502, 503, 504].includes(err.status)
        const isRetryable = retryStatus || err.message.includes('ECONNREFUSED') || err.message.includes('ECONNRESET') ||
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

  // Renderer replies to a permission-request via this invoke. We just forward
  // the reply as an event so the waiting requestPermission closure (which uses
  // wc.on('chat:permission-reply')) picks it up.
  ipcMain.handle('chat:permission-reply', (event, payload) => {
    event.sender.send('chat:permission-reply', payload)
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
  logTitle('generateSummaryTitle start sid=', sessionId, 'model=', model?.model_name, 'provider=', provider?.api_url, 'lang=', lang)
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
    logTitle('summary raw=', JSON.stringify(text).slice(0, 80), '→ title=', title)
  } catch (e) {
    logTitle('summary FAILED:', e.message)
    console.warn('[AetherAI] title summary failed:', e.message)
  }
  try { dbHandle.renameSession(sessionId, title); logTitle('renamed sid=', sessionId, 'to=', title) } catch (e) { logTitle('rename FAILED:', e.message) }
}

function estimateTokens(text) {
  if (!text) return 0
  let tokens = 0
  for (const c of text) {
    if (c >= '一' && c <= '鿿') tokens += 1.5
    else tokens += 0.25
  }
  return Math.max(1, Math.ceil(tokens))
}

module.exports = { registerChatHandlers }
