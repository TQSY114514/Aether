import type { StateCreator } from "zustand"
import type { AppState } from "./types"

let _soulReqSeq = 0

export const createPersonaSlice: StateCreator<AppState, [], [], Partial<AppState>> = (set, get) => ({
  personas: [],
  workspaceSoul: null,

  loadPersonas: async () => {
    const personas = await window.electronAPI.persona.list()
    set({ personas })
    await get().loadWorkspaceSoul()
  },

  loadWorkspaceSoul: async (workspaceRoot?: string | null) => {
    const reqSeq = ++_soulReqSeq
    const { sessionConfigs, currentSessionId, sessions } = get()
    const sess = currentSessionId ? sessions.find(s => s.id === currentSessionId) : null
    const cfg = currentSessionId ? sessionConfigs[currentSessionId] : null
    const ws = workspaceRoot !== undefined ? workspaceRoot : (sess?.cwd || cfg?.workspace || null)
    try {
      const soul = await window.electronAPI.persona.getWorkspaceSoul(ws)
      const latest = get()
      const latestSess = latest.currentSessionId ? latest.sessions.find(s => s.id === latest.currentSessionId) : null
      const latestCfg = latest.currentSessionId ? latest.sessionConfigs[latest.currentSessionId] : null
      const latestWs = latestSess?.cwd || latestCfg?.workspace || null
      if (
        reqSeq !== _soulReqSeq ||
        latest.currentSessionId !== currentSessionId ||
        (workspaceRoot === undefined && latestWs !== ws)
      ) {
        return
      }
      set({ workspaceSoul: soul })
    } catch {
      if (reqSeq === _soulReqSeq && get().currentSessionId === currentSessionId) {
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