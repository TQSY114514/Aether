import type { StateCreator } from "zustand"
import type { Message } from "@/types"
import type { AppState } from "./types"
import { decodeDataUrlText } from "./types"
import { t } from "@/utils/i18n"
import log from "@/utils/logger"
import { ensureChunkListener, ensureToolCallListener, ensureLoopStateListener, ensureUsageListener, setStoppingSessionId } from "./listeners"

const _injectedMsgIds = new Set<number>()
const _undoStack: { sessionId: number; messages: Message[] }[] = []

function clearStreaming(sid: number | null) {
  return (s: AppState): Partial<AppState> => {
    const next = { ...s.streamingBySession }
    if (sid != null) delete next[sid]
    return { streamingBySession: next, sending: Object.keys(next).length > 0 }
  }
}

export const createChatSlice: StateCreator<AppState, [], [], Partial<AppState>> = (set, get) => ({
  chatMode: "normal",
  sending: false,
  toolCallsByMessage: {},
  planStepsByMessage: {},
  todosByMessage: {},
  thinkingBlocksByMessage: {},
  statusLinesByMessage: {},
  contextBudgetText: null,
  pendingQuestions: [],
  permissionRequests: [],
  proposedHabits: [],
  queuedMessages: [],
  loopingSessions: new Set<number>(),
  thinkingEnabled: true,
  effortLevel: 'medium',
  agentMode: 'off',
  modelSuggestion: null as ModelSuggestion | null,
  messageSearchQuery: "",

  setChatMode: (mode) => {
    set({ chatMode: mode })
    if (mode !== "arena") {
      set({ arenaVoted: false, arenaVoteWinnerId: null, arenaResults: [], arenaResultsSessionId: null, arenaPending: 0, arenaError: null })
    }
    if (mode === "arena" && !get().currentSessionId) {
      get().createSession().catch(() => {})
    }
  },

  setMessageSearchQuery: (q) => set({ messageSearchQuery: q }),

  setAgentMode: (v) => set({ agentMode: v }),

  setEffortLevel: (v) => set({ effortLevel: v }),

  setThinkingEnabled: (v) => set({ thinkingEnabled: v }),

  refreshModelSuggestion: async () => {
    const { currentSessionId, messages } = get()
    if (currentSessionId == null) return
    const lastUserMsg = [...messages].reverse().find(m => m.role === "user")
    if (!lastUserMsg) return
    try {
      const result = await window.electronAPI.model.suggest({ sessionId: currentSessionId, userMessage: lastUserMsg.content })
      if (result && result.suggestedModelId != null) {
        set({ modelSuggestion: { suggestedModelId: result.suggestedModelId, reason: result.reason, reasonParts: result.reasonParts, confidence: result.confidence } })
      }
    } catch (err) {
      log.warn("refreshModelSuggestion failed:", err)
    }
  },

  sendMessage: async (content, attachments) => {
    const { currentSessionId, agentMode, effortLevel, thinkingEnabled, maxTokens, temperature, topP, systemPrefix, chatMode } = get()
    const cfg = currentSessionId ? get().sessionConfigs[currentSessionId] : null
    let modelId = cfg?.modelId
    if (!modelId) {
      const enabledProviders = (await window.electronAPI.provider.list()).filter(p => p.enabled)
      if (enabledProviders.length > 0 && currentSessionId) {
        const providerId = enabledProviders[0].id
        const models = await window.electronAPI.model.list(providerId)
        const primary = models.find(m => m.is_primary) || models[0]
        modelId = primary?.id
        if (modelId) {
          const newCfg = { providerId, modelId, personaId: cfg?.personaId || null }
          await window.electronAPI.session.setConfig(currentSessionId, newCfg)
          set((s) => ({ sessionConfigs: { ...s.sessionConfigs, [currentSessionId]: newCfg } }))
          get().loadModels(providerId)
        }
      }
    }
    if (!currentSessionId || !modelId) {
      log.warn("sendMessage: no session or model configured")
      return
    }

    let finalContent = content
    const imageAttachments: { name: string; mime: string; dataUrl: string }[] = []
    const firstAttachment = attachments && attachments.length > 0 ? attachments[0] : null
    if (attachments && attachments.length > 0) {
      const textBlocks: string[] = []
      for (const a of attachments) {
        if (a.kind === "image" && a.dataUrl) {
          imageAttachments.push({ name: a.name, mime: a.mime, dataUrl: a.dataUrl })
        } else if (a.kind === "text" && a.dataUrl) {
          const text = decodeDataUrlText(a.dataUrl)
          textBlocks.push("📎 " + a.name + ":\n```\n" + text + "\n```")
        }
      }
      if (textBlocks.length > 0) {
        finalContent = textBlocks.join("\n\n") + (content ? "\n\n" + content : "")
      }
    }

    const tempUserMsg: Message = {
      id: Date.now(), session_id: currentSessionId, role: "user",
      content: finalContent, model_used: null, provider_used: null,
      token_count: null, latency_ms: null,
      status: "success", error_message: null,
      created_at: new Date().toISOString(),
      attachment: firstAttachment ? { name: firstAttachment.name, mime: firstAttachment.mime, kind: firstAttachment.kind, preview: firstAttachment.kind === "image" ? firstAttachment.dataUrl : undefined } : null,
    }

    set((s) => ({
      sending: true,
      streamingBySession: { ...s.streamingBySession, [currentSessionId]: { content: "", messageId: null } },
      messages: [...s.messages, tempUserMsg],
    }))
    get().loadSessions()

    ensureChunkListener()
    ensureToolCallListener()
    ensureLoopStateListener()
    ensureUsageListener()
    get().resetTurnUsage(currentSessionId)

    try {
      const result = await window.electronAPI.chat.send({
        sessionId: currentSessionId,
        content: finalContent,
        modelId,
        mode: chatMode,
        personaId: cfg?.personaId ?? null,
        attachments: imageAttachments,
        useTools: agentMode !== "off",
        agentMode: agentMode === "off" ? "ask" : agentMode,
        effortLevel, thinkingEnabled,
        genParams: { maxTokens, temperature, topP },
        systemPrefix,
        })
      if (result?.modelSuggestion) set({ modelSuggestion: result.modelSuggestion })
      // Non-tool turns report usage in the chat.send result; fold it into the
      // same accumulator (tool turns arrive via chat:usage events instead).
      if (result?.usage && result.messageId) {
        get().recordReturnUsage(currentSessionId, result.messageId, result.usage)
      }
    } catch (err) {
      log.error("[Aether] chat.send FAILED:", err)
      set(clearStreaming(currentSessionId))
      log.error("chat error", err)
    }
  },

  stopGeneration: async () => {
    const st0 = get()
    const sid0 = st0.currentSessionId
    const preservedContent = (sid0 ? st0.streamingBySession[sid0]?.content : "") ?? ""
    const preservedMsgId = sid0 ? st0.streamingBySession[sid0]?.messageId : null
    setStoppingSessionId(sid0)
    try {
      if (sid0) await window.electronAPI.chat.stop(sid0)
      await window.electronAPI.arena.stop(sid0 || undefined).catch(() => {})

      const current = get().currentSessionId
      if (!current) return

      try {
        const messages = await window.electronAPI.message.list(current)
        if (get().currentSessionId === current) {
          const dbAssistant = preservedMsgId != null
            ? messages.find(m => m.id === preservedMsgId && m.role === "assistant")
            : [...messages].reverse().find(m => m.session_id === current && m.role === "assistant")
          if (dbAssistant && dbAssistant.content) {
            set({ messages })
          } else if (preservedContent) {
            const filtered = preservedMsgId != null
              ? messages.filter(m => m.id !== preservedMsgId)
              : messages
            const tempAssistant: Message = {
              id: preservedMsgId ?? Date.now(),
              session_id: current,
              role: "assistant",
              content: preservedContent,
              model_used: null, provider_used: null,
              token_count: null, latency_ms: null,
              status: "aborted", error_message: null,
              created_at: new Date().toISOString(),
            }
            set({ messages: [...filtered, tempAssistant] })
          } else {
            set({ messages })
          }
        }
      } catch {}
    } finally {
      setStoppingSessionId(null)
    }
    set(clearStreaming(sid0))
  },

  continueMessage: async () => {
    const { currentSessionId, messages } = get()
    if (!currentSessionId) return
    const lastAborted = [...messages].reverse().find(
      m => m.session_id === currentSessionId && m.role === "assistant" && m.status === "aborted"
    )
    if (!lastAborted) return
    get().sendMessage("继续")
  },

  regenerate: async () => {
    const { currentSessionId, messages, agentMode, effortLevel, thinkingEnabled, maxTokens, temperature, topP, systemPrefix } = get()
    const cfg = currentSessionId ? get().sessionConfigs[currentSessionId] : null
    const activeModelId = cfg?.modelId
    if (!currentSessionId || !activeModelId || messages.length < 2) return
    let userIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === "user") { userIdx = i; break } }
    if (userIdx < 0) return
    const regeneratedMsgId = messages.slice(userIdx + 1).find(m => m.role === "assistant")?.id
    set((s) => {
      const next: any = {
        messages: messages.slice(0, userIdx + 1),
        streamingBySession: { ...s.streamingBySession, [currentSessionId]: { content: "", messageId: null } },
      }
      if (regeneratedMsgId !== undefined) {
        const { [regeneratedMsgId]: _, ...restTC } = s.toolCallsByMessage
        const { [regeneratedMsgId]: __, ...restPS } = s.planStepsByMessage
        const { [regeneratedMsgId]: ___, ...restTB } = s.todosByMessage
        const { [regeneratedMsgId]: ____, ...restTIB } = s.thinkingBlocksByMessage
        const { [regeneratedMsgId]: _____, ...restSIB } = s.statusLinesByMessage
        next.toolCallsByMessage = restTC
        next.planStepsByMessage = restPS
        next.todosByMessage = restTB
        next.thinkingBlocksByMessage = restTIB
        next.statusLinesByMessage = restSIB
      }
      return next
    })
    ensureChunkListener()
    try {
      await window.electronAPI.chat.send({
        sessionId: currentSessionId, content: messages[userIdx].content, modelId: activeModelId, regenerate: true,
        personaId: cfg?.personaId ?? null,
        useTools: agentMode !== "off",
        agentMode: agentMode === "off" ? "ask" : agentMode,
        effortLevel, thinkingEnabled,
        genParams: { maxTokens, temperature, topP },
        systemPrefix,
      })
    } catch (err) {
      set(clearStreaming(currentSessionId))
      log.error("regenerate error:", err)
    }
  },

  editLastUserMessage: () => {
    const { currentSessionId, messages } = get()
    if (!currentSessionId) return
    const userMsgs = messages.filter(m => m.session_id === currentSessionId && m.role === 'user')
    if (userMsgs.length === 0) return
    const lastUser = userMsgs[userMsgs.length - 1]
    // Push current state to undo stack before editing
    _undoStack.push({ sessionId: currentSessionId, messages: [...messages] })
    // Dispatch a custom event that ChatInput listens for
    window.dispatchEvent(new CustomEvent('aether:edit-last-user', { detail: { content: lastUser.content } }))
  },

  undoLastEdit: () => {
    const { currentSessionId } = get()
    if (!currentSessionId) return
    // Find the last undo entry for this session
    for (let i = _undoStack.length - 1; i >= 0; i--) {
      if (_undoStack[i].sessionId === currentSessionId) {
        const entry = _undoStack.splice(i, 1)[0]
        set({ messages: entry.messages })
        return
      }
    }
  },

  editMessage: async (messageId, newContent) => {
    const { currentSessionId, messages, agentMode, effortLevel, thinkingEnabled, maxTokens, temperature, topP, systemPrefix } = get()
    const cfg = currentSessionId ? get().sessionConfigs[currentSessionId] : null
    const activeModelId = cfg?.modelId
    if (!currentSessionId || !activeModelId) return
    const target = messages.find(m => m.id === messageId)
    if (!target || target.role !== "user") return
    const content = newContent.trim()
    if (!content) return
    await window.electronAPI.message.update(messageId, { content })
    await window.electronAPI.message.deleteAfter(currentSessionId, messageId)
    const idx = messages.findIndex(m => m.id === messageId)
    const truncated = messages.slice(0, idx + 1).map(m => m.id === messageId ? { ...m, content } : m)
    set((s) => ({
      messages: truncated,
      streamingBySession: { ...s.streamingBySession, [currentSessionId]: { content: "", messageId: null } },
    }))
    ensureChunkListener()
    try {
      await window.electronAPI.chat.send({
        sessionId: currentSessionId, content, modelId: activeModelId, regenerate: true,
        personaId: cfg?.personaId ?? null,
        useTools: agentMode !== "off",
        agentMode: agentMode === "off" ? "ask" : agentMode,
        effortLevel, thinkingEnabled,
        genParams: { maxTokens, temperature, topP },
        systemPrefix,
      })
    } catch (err) {
      set(clearStreaming(currentSessionId))
      log.error("editMessage error:", err)
    }
  },

  loadMessages: async (sessionId) => {
    const _streamingBuf = get().streamingBySession[sessionId]
    const now = Date.now()
    const hasRecentOptimistic = get().messages.some(m =>
      m.session_id === sessionId && m.role === "user" &&
      (now - new Date(m.created_at).getTime()) < 3000 && m.status === "success"
    )
    if (hasRecentOptimistic) return
    try {
      const allMessages = await window.electronAPI.message.list(sessionId)
      if (get().chatMode === "arena") {
        const filtered = allMessages.filter(m => !m.arena_model || m.arena_model === "")
        set({ messages: filtered })
      } else {
        set({ messages: allMessages })
      }
    } catch (err) {
      log.error("[Aether] loadMessages error:", err)
    }
  },

  setLooping: (sessionId, looping) => {
    set((s) => {
      const next = new Set(s.loopingSessions)
      if (looping) next.add(sessionId)
      else next.delete(sessionId)
      return { loopingSessions: next }
    })
  },

  injectMessage: (content) => {
    const { currentSessionId } = get()
    if (!currentSessionId) return
    window.electronAPI.chat.inject({ sessionId: currentSessionId, content })
      .then((result) => {
        if (result?.queued) {
          const tempMsg: Message = {
            id: Date.now(),
            session_id: currentSessionId,
            role: "user",
            content,
            model_used: null,
            provider_used: null,
            token_count: null,
            latency_ms: null,
            status: "success",
            error_message: null,
            created_at: new Date().toISOString(),
            attachment: null,
          }
          _injectedMsgIds.add(tempMsg.id)
          set((s) => ({ messages: [...s.messages, tempMsg] }))
        }
      })
      .catch(() => {})
  },

  isInjectedMsg: (id) => _injectedMsgIds.has(id),

  resolvePermission: (reqId, allowed, remember: boolean | 'session' | 'remember' = false) => {
    // P0: 'session'（本会话内总是允许）与 'remember' 都进主进程的会话级
    // allow-rules 库（该库本就随会话消亡）；此前 'session' 被吞成 false，
    // 按钮形同仅本次。
    window.electronAPI.chat.replyPermission({ reqId, allowed, remember: remember === 'remember' || remember === true || remember === 'session' })
    set((s) => ({ permissionRequests: s.permissionRequests.filter((r) => r.reqId !== reqId) }))
  },

  resolveQuestion: (reqId, answers) => {
    window.electronAPI.chat.replyQuestion({ reqId, answers })
    set((s) => ({ pendingQuestions: s.pendingQuestions.filter((q) => q.reqId !== reqId) }))
  },

  resolveHabit: (key, accept) => {
    if (accept) window.electronAPI.chat.confirmHabit(key).catch(() => {})
    else window.electronAPI.chat.dismissHabit(key).catch(() => {})
    set((s) => ({ proposedHabits: s.proposedHabits.filter((h) => h.key !== key) }))
  },

  enqueueMessage: (content) => {
    set((s) => ({ queuedMessages: [...s.queuedMessages, { id: Date.now() + Math.random(), content }] }))
    get().triggerHint("first_queue", t("hint.first_queue"))
  },

  removeQueued: (id) => {
    set((s) => ({ queuedMessages: s.queuedMessages.filter((m) => m.id !== id) }))
  },

  appendArenaResult: (sessionId, result) => {
    set((s) => {
      if (s.arenaResultsSessionId !== sessionId) return {}
      const exists = s.arenaResults.some(r => r.model_id === result.model_id)
      return {
        arenaResults: exists ? s.arenaResults : [...s.arenaResults, result],
        arenaPending: Math.max(0, s.arenaPending - (exists ? 0 : 1)),
      }
    })
  },
})
