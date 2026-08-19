import type { StateCreator } from "zustand"
import type { AppState } from "./types"
import { mergeTask, newTask } from "./types"
import log from "@/utils/logger"

export const createUiSlice: StateCreator<AppState, [], [], Partial<AppState>> = (set, get) => ({
  currentView: "chat",
  sidebarOpen: true,
  completionToasts: [],
  activeHints: [],
  seenHints: [],
  tasks: [],
  tasksOpen: false,
  scores: [],
  toasts: [],

  setCurrentView: (view) => set({ currentView: view }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  dismissToast: (id: number) => set((s) => ({ completionToasts: s.completionToasts.filter((t) => t.id !== id) })),
  triggerToast: (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const id = Date.now() + Math.random()
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3000)
  },

  pinSession: async (id: number, pinned: number = 1) => {
    try { await window.electronAPI.session.pin(id, pinned) } catch {}
    await get().loadSessions()
  },

  notifyComplete: (sessionId: number, sessionTitle: string) => {
    const id = Date.now() + Math.random()
    set((s) => ({ completionToasts: [...s.completionToasts, { id, sessionId, sessionTitle }] }))
    setTimeout(() => set((s) => ({ completionToasts: s.completionToasts.filter((t) => t.id !== id) })), 3000)
  },

  dismissHint: (flag: string) => {
    const seen = [...new Set([...get().seenHints, flag])]
    set((s) => ({ activeHints: s.activeHints.filter((h) => h.flag !== flag), seenHints: seen }))
    try { window.electronAPI.settings.set("seen_hints", JSON.stringify(seen)) } catch (e) { log.warn("dismissHint persist failed:", e) }
  },

  triggerHint: (flag, text) => {
    const { seenHints, activeHints } = get()
    if (seenHints.includes(flag) || activeHints.some((h) => h.flag === flag)) return
    set((s) => ({ activeHints: [...s.activeHints, { flag, text }] }))
  },

  upsertTask: (patch) => {
    set((s) => {
      const idx = s.tasks.findIndex((x) => x.id === patch.id)
      if (idx < 0) return { tasks: [...s.tasks, newTask(patch)] }
      const next = [...s.tasks]
      next[idx] = mergeTask(next[idx], patch)
      return { tasks: next }
    })
  },

  removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((x) => x.id !== id) })),

  setTasksOpen: (v) => set({ tasksOpen: v }),

  loadScores: async () => {
    const scores = await window.electronAPI.arena.scores()
    set({ scores })
  },
})
