import type { StateCreator } from "zustand"
import type { AppState } from "./types"

export const createProviderSlice: StateCreator<AppState, [], [], Partial<AppState>> = (set, get) => ({
  providers: [],
  allModels: [],
  modelsByProvider: {},

  loadProviders: async () => {
    const providers = await window.electronAPI.provider.list()
    set({ providers })
  },

  addProvider: async (data) => {
    await window.electronAPI.provider.create(data)
    await get().loadProviders()
  },

  updateProvider: async (id, data) => {
    await window.electronAPI.provider.update(id, data)
    await get().loadProviders()
  },

  deleteProvider: async (id) => {
    await window.electronAPI.provider.delete(id)
    const { currentSessionId, sessionConfigs } = get()
    const nextConfigs = { ...sessionConfigs }
    for (const sid of Object.keys(nextConfigs)) {
      const numSid = Number(sid)
      const c = nextConfigs[numSid]
      if (c.providerId === id) {
        const cfg = { providerId: null as number | null, modelId: null as number | null, personaId: c.personaId }
        if (numSid === currentSessionId) await window.electronAPI.session.setConfig(numSid, cfg)
        nextConfigs[numSid] = cfg
      }
    }
    const nextModels = { ...get().modelsByProvider }
    delete nextModels[id]
    set((s) => ({
      providers: s.providers.filter(p => p.id !== id),
      allModels: s.allModels.filter(m => m.provider_id !== id),
      modelsByProvider: nextModels,
      sessionConfigs: nextConfigs,
    }))
    await get().loadAllModels()
  },

  loadModels: async (providerId) => {
    const models = await window.electronAPI.model.list(providerId)
    set((s) => ({ modelsByProvider: { ...s.modelsByProvider, [providerId]: models } }))
  },

  addModel: async (data) => {
    await window.electronAPI.model.create(data)
    await get().loadModels(data.provider_id)
    await get().loadAllModels()
  },

  updateModel: async (id, data) => {
    await window.electronAPI.model.update(id, data)
    await get().loadAllModels()
    const { allModels } = get()
    const updated = allModels.find(m => m.id === id)
    if (updated) await get().loadModels(updated.provider_id)
  },

  deleteModel: async (id) => {
    const { allModels, currentSessionId } = get()
    const target = allModels.find(m => m.id === id)
    await window.electronAPI.model.delete(id)
    const updatedAll = allModels.filter(m => m.id !== id)
    const nextConfigs = { ...get().sessionConfigs }
    for (const sid of Object.keys(nextConfigs)) {
      const numSid = Number(sid)
      const c = nextConfigs[numSid]
      if (c.modelId === id) {
        const fallback = updatedAll.find(m => m.provider_id === c.providerId)
        const cfg = { providerId: c.providerId, modelId: fallback?.id ?? null, personaId: c.personaId }
        if (numSid === currentSessionId) await window.electronAPI.session.setConfig(numSid, cfg)
        nextConfigs[numSid] = cfg
      }
    }
    set((s) => ({ allModels: updatedAll, sessionConfigs: nextConfigs }))
    if (target) {
      await get().loadModels(target.provider_id)
    }
  },

  loadAllModels: async () => {
    const allModels = await window.electronAPI.model.listAll()
    set({ allModels })
  },
})