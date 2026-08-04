import type { StateCreator } from "zustand"
import type { Message } from "@/types"
import type { AppState } from "./types"
import log from "@/utils/logger"

let _navigating = false

export const createSessionSlice: StateCreator<AppState, [], [], Partial<AppState>> = (set, get) => ({
  sessions: [],
  currentSessionId: null,
  messages: [],
  streamingBySession: {},
  sessionConfigs: {},
  sessionHistory: [],
  sessionHistoryIdx: -1,

  loadSessions: async () => {
    const sessions = await window.electronAPI.session.list()
    set({ sessions })
    const { currentSessionId } = get()
    if (currentSessionId && !sessions.some(s => s.id === currentSessionId)) {
      set({ currentSessionId: null, messages: [], arenaResults: [] } as any)
    }
  },

  createSession: async () => {
    const s = get()
    const allProviders = await window.electronAPI.provider.list()
    const enabledProviders = allProviders.filter(p => p.enabled)
    let cfg = { providerId: null as number | null, modelId: null as number | null, personaId: null as number | null }
    if (s.defaultModelId) {
      const defModel = (s.allModels.find(m => m.id === s.defaultModelId) ||
        (await window.electronAPI.model.listAll()).find(m => m.id === s.defaultModelId))
      if (defModel) {
        cfg.providerId = defModel.provider_id
        cfg.modelId = defModel.id
      }
    }
    if (s.defaultPersonaId) {
      cfg.personaId = s.defaultPersonaId
    }
    if (!cfg.providerId && enabledProviders.length > 0) {
      cfg.providerId = enabledProviders[0].id as number
      const models = await window.electronAPI.model.list(cfg.providerId)
      const primary = models.find(m => m.is_primary) || models[0]
      if (primary) cfg.modelId = primary.id
    }
    if (cfg.providerId && !cfg.modelId) {
      const models = await window.electronAPI.model.list(cfg.providerId)
      const primary = models.find(m => m.is_primary) || models[0]
      if (primary) cfg.modelId = primary.id
    }
    const result = await window.electronAPI.session.createAndSelect(cfg)
    const sid = result.session.id
    const sessionCfg = result.config
    set((s) => ({
      currentView: "chat",
      currentSessionId: sid,
      sessions: [...s.sessions, result.session],
      sessionConfigs: { ...s.sessionConfigs, [sid]: sessionCfg },
      messages: result.messages || [],
    }))
    if (sessionCfg.providerId) get().loadModels(sessionCfg.providerId)
    return sid
  },

  newChat: () => {
    set({ currentView: "chat", arenaResults: [], arenaResultsSessionId: null, arenaPending: 0, chatMode: "normal" } as any)
    get().createSession().catch(() => {
      set({ currentSessionId: null, messages: [] })
    })
  },

  selectSession: async (id) => {
    if (!_navigating) {
      const { sessionHistory, sessionHistoryIdx } = get()
      const truncated = sessionHistory.slice(0, sessionHistoryIdx + 1)
      if (truncated[truncated.length - 1] !== id) {
        truncated.push(id)
        set({ sessionHistory: truncated, sessionHistoryIdx: truncated.length - 1 })
      }
    }
    let msgs: Message[] = []
    try { msgs = await window.electronAPI.message.list(id) } catch (e) { log.error("preload", e) }
    set({ currentSessionId: id, messages: msgs, arenaResults: [] } as any)
    try {
      let cfg = await window.electronAPI.session.getConfig(id)
      if (!cfg || !cfg.modelId) {
        const enabledProviders = (await window.electronAPI.provider.list()).filter(p => p.enabled)
        const providerId = enabledProviders.length > 0 ? enabledProviders[0].id : null
        cfg = { providerId, modelId: null, personaId: null }
        window.electronAPI.session.setConfig(id, cfg).catch(() => {})
      }
      set((s) => ({
        currentSessionId: id,
        sessionConfigs: { ...s.sessionConfigs, [id]: cfg },
      }))
      const savedCfg = get().sessionConfigs[id]
      if (savedCfg?.workspace) {
        try { await window.electronAPI.agent.setWorkspace({ dir: savedCfg.workspace, sessionId: id }) } catch {}
      }
      if (cfg.providerId) get().loadModels(cfg.providerId)
    } catch {
      set({ currentSessionId: id })
    }
  },

  getSessionConfig: (id) => {
    return get().sessionConfigs[id] || { providerId: null, modelId: null, personaId: null }
  },

  saveSessionConfig: async (id, partial) => {
    const existing = get().sessionConfigs[id] || { providerId: null, modelId: null, personaId: null, workspace: null }
    const updated = { ...existing, ...partial }
    await window.electronAPI.session.setConfig(id, updated)
    if (partial.workspace !== undefined) {
      try { await window.electronAPI.agent.setWorkspace({ dir: partial.workspace, sessionId: id }) } catch {}
    }
    set((s) => ({ sessionConfigs: { ...s.sessionConfigs, [id]: updated } }))
  },

  deleteSession: async (id) => {
    await window.electronAPI.session.delete(id)
    const { currentSessionId } = get()
    set((s) => {
      const nextStream = { ...s.streamingBySession }
      delete nextStream[id]
      const nextConfigs = { ...s.sessionConfigs }
      delete nextConfigs[id]
      const msgIds = new Set(s.messages.filter(m => m.session_id === id).map(m => m.id))
      const cleanMap = <T>(obj: Record<number, T>) => {
        const n = { ...obj }
        msgIds.forEach(mid => delete n[mid])
        return n
      }
      return {
        streamingBySession: nextStream,
        sessionConfigs: nextConfigs,
        toolCallsByMessage: cleanMap(s.toolCallsByMessage),
        planStepsByMessage: cleanMap(s.planStepsByMessage),
        todosByMessage: cleanMap(s.todosByMessage),
        thinkingBlocksByMessage: cleanMap(s.thinkingBlocksByMessage),
        statusLinesByMessage: cleanMap(s.statusLinesByMessage),
        ...(currentSessionId === id ? { currentSessionId: null, messages: [] } : {}),
      }
    })
    await get().loadSessions()
  },

  goBack: () => {
    const { sessionHistory, sessionHistoryIdx } = get()
    if (sessionHistoryIdx <= 0) return
    const newIdx = sessionHistoryIdx - 1
    set({ sessionHistoryIdx: newIdx })
    _navigating = true
    get().selectSession(sessionHistory[newIdx]).finally(() => { _navigating = false })
  },

  goForward: () => {
    const { sessionHistory, sessionHistoryIdx } = get()
    if (sessionHistoryIdx >= sessionHistory.length - 1) return
    const newIdx = sessionHistoryIdx + 1
    set({ sessionHistoryIdx: newIdx })
    _navigating = true
    get().selectSession(sessionHistory[newIdx]).finally(() => { _navigating = false })
  },
})