import type { StateCreator } from "zustand"
import type { Message } from "@/types"
import type { AppState } from "./types"
import { ensureArenaListener } from "./listeners"

export const createArenaSlice: StateCreator<AppState, [], [], Partial<AppState>> = (set, get) => ({
  arenaResults: [],
  arenaResultsSessionId: null,
  arenaPending: 0,
  arenaModelIds: [],
  arenaError: null,
  arenaVoted: false,
  arenaVoteWinnerId: null as number | null,
  // Arena 2.0 (review P0-3): same-model multi-temperature comparison.
  // null = single run per model; [0.2, 0.8] = two variants per model.
  arenaTemperatures: null as number[] | null,
  setArenaTemperatures: (temps) => set({ arenaTemperatures: temps }),

  setArenaModelIds: (ids) => set({ arenaModelIds: ids }),

  runArena: async (content) => {
    const { currentSessionId, arenaModelIds, sessionConfigs, defaultPersonaId, streamingBySession } = get()
    if (!currentSessionId || arenaModelIds.length < 2) {
      set({ arenaError: "请先选择至少 2 个模型" }); return
    }
    const cfg = sessionConfigs[currentSessionId]
    const personaId = cfg?.personaId ?? defaultPersonaId
    const tempUserMsg: Message = {
      id: Date.now(), session_id: currentSessionId, role: "user",
      content, model_used: null, provider_used: null,
      token_count: null, latency_ms: null, status: "success", error_message: null,
      created_at: new Date().toISOString(), attachment: null,
    }
    set({ sending: true, arenaResults: [], arenaError: null, arenaVoted: false, arenaVoteWinnerId: null, arenaResultsSessionId: currentSessionId, arenaPending: arenaModelIds.length, messages: [...get().messages, tempUserMsg] })
    set((s) => ({ streamingBySession: { ...s.streamingBySession, [currentSessionId]: { content: "", messageId: null } } }))
    get().loadSessions()
    ensureArenaListener()
    try {
      const { results } = await window.electronAPI.arena.send({ sessionId: currentSessionId, content, modelIds: arenaModelIds, personaId, temperatures: get().arenaTemperatures || undefined })
      if (!results || results.length === 0) {
        set({ arenaError: "没有返回结果，请检查模型/网络" })
        set((s) => { const n = { ...s.streamingBySession }; delete n[currentSessionId]; return { streamingBySession: n, sending: Object.keys(n).length > 0, arenaPending: 0 } })
        return
      }
      set({ arenaResults: results, arenaError: null, arenaPending: 0 })
      set((s) => { const n = { ...s.streamingBySession }; delete n[currentSessionId]; return { streamingBySession: n, sending: Object.keys(n).length > 0 } })
      get().loadMessages(currentSessionId)
      get().loadSessions()
    } catch (err: unknown) {
      set({ arenaError: "竞技场请求失败: " + (err instanceof Error ? err.message : String(err)) })
      set((s) => { const n = { ...s.streamingBySession }; delete n[currentSessionId]; return { streamingBySession: n, sending: Object.keys(n).length > 0, arenaPending: 0 } })
    }
  },

  arenaVote: async (winner, losers) => {
    const { messages, arenaResults, arenaVoteWinnerId } = get()
    if (arenaVoteWinnerId) return
    const userMsg = messages.find(m => m.role === "user") || arenaResults[0]
    const prompt = typeof userMsg?.content === "string" ? userMsg.content : ""
    try {
      const result = await window.electronAPI.arena.vote({
        prompt,
        winnerModelId: winner.model_id,
        winnerModelName: winner.model_name,
        loserModelIds: losers.map(l => l.model_id),
        loserModelNames: losers.map(l => l.model_name),
      })
      if (result?.success) {
        const current = get().currentSessionId
        if (current) {
          await window.electronAPI.message.deleteArena(current)
          const winnerResult = arenaResults.find(r => r.model_id === winner.model_id)
          if (winnerResult) {
            await window.electronAPI.message.addNormal({
              session_id: current,
              role: "assistant" as const,
              content: winnerResult.content,
              model_used: winnerResult.model_name,
            })
          }
          get().loadMessages(current)
        }
        await get().loadScores()
        set({
          arenaResults: [],
          arenaVoted: true,
          arenaVoteWinnerId: winner.model_id,
        })
      } else {
        set({ arenaError: "投票失败，请重试" })
      }
    } catch (err: unknown) {
      set({ arenaError: "投票失败: " + (err instanceof Error ? err.message : String(err)) })
    }
  },
})