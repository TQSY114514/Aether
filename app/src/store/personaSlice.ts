import type { StateCreator } from "zustand"
import type { AppState } from "./types"

export const createPersonaSlice: StateCreator<AppState, [], [], Partial<AppState>> = (set, get) => ({
  personas: [],

  loadPersonas: async () => {
    const personas = await window.electronAPI.persona.list()
    set({ personas })
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