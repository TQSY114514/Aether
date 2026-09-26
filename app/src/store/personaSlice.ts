import type { StateCreator } from "zustand"
import type { AppState } from "./types"

export const createPersonaSlice: StateCreator<AppState, [], [], Partial<AppState>> = (set, get) => ({
  personas: [],
  workspaceSoul: null,

  loadPersonas: async () => {
    const personas = await window.electronAPI.persona.list()
    set({ personas })
    await get().loadWorkspaceSoul()
  },

  loadWorkspaceSoul: async (workspaceRoot?: string | null) => {
    try {
      let ws = workspaceRoot
      if (ws === undefined) {
        const { sessionConfigs, currentSessionId } = get()
        const cfg = currentSessionId ? sessionConfigs[currentSessionId] : null
        ws = cfg?.workspace ?? null
      }
      const soul = await window.electronAPI.persona.getWorkspaceSoul(ws)
      set({ workspaceSoul: soul })
    } catch {
      set({ workspaceSoul: null })
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