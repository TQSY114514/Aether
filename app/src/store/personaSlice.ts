import type { StateCreator } from "zustand"
import type { AppState } from "./types"

const _soulReqSeqMap = new Map<string, number>()

export const createPersonaSlice: StateCreator<AppState, [], [], Partial<AppState>> = (set, get) => ({
  personas: [],
  workspaceSoul: null,

  loadPersonas: async () => {
    const personas = await window.electronAPI.persona.list()
    set({ personas })
    await get().loadWorkspaceSoul()
  },

  loadWorkspaceSoul: async (workspaceRoot?: string | null) => {
    const { sessionConfigs, currentSessionId, sessions } = get()
    const sessionKey = currentSessionId ? String(currentSessionId) : '__global__'
    const reqSeq = (_soulReqSeqMap.get(sessionKey) || 0) + 1
    _soulReqSeqMap.set(sessionKey, reqSeq)

    const sess = currentSessionId ? sessions.find(s => s.id === currentSessionId) : null
    const cfg = currentSessionId ? sessionConfigs[currentSessionId] : null
    const expectedWs = sess?.cwd || cfg?.workspace || null
    const ws = workspaceRoot !== undefined ? workspaceRoot : expectedWs
    try {
      const soul = await window.electronAPI.persona.getWorkspaceSoul(ws)
      const latest = get()
      const latestKey = latest.currentSessionId ? String(latest.currentSessionId) : '__global__'
      const latestSess = latest.currentSessionId ? latest.sessions.find(s => s.id === latest.currentSessionId) : null
      const latestCfg = latest.currentSessionId ? latest.sessionConfigs[latest.currentSessionId] : null
      const latestWs = latestSess?.cwd || latestCfg?.workspace || null
      if (
        _soulReqSeqMap.get(sessionKey) !== reqSeq ||
        latestKey !== sessionKey ||
        latestWs !== (workspaceRoot !== undefined ? workspaceRoot : expectedWs)
      ) {
        return
      }
      set({ workspaceSoul: soul })
    } catch {
      const latest = get()
      const latestKey = latest.currentSessionId ? String(latest.currentSessionId) : '__global__'
      if (_soulReqSeqMap.get(sessionKey) === reqSeq && latestKey === sessionKey) {
        set({ workspaceSoul: null })
      }
    }
  },

  addPersona: async (data) => {
    await window.electronAPI.persona.create(data)
    await get().loadPersonas()
  },

  updatePersona: async (id, data) => {
    await window.electronAPI.persona.update(id, data)
    await get().loadPersonas()
  },

  deletePersona: async (id) => {
    await window.electronAPI.persona.delete(id)
    await get().loadPersonas()
  },
})