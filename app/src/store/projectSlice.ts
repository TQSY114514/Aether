import type { StateCreator } from "zustand"
import type { AppState } from "./types"

export interface Project {
  id: number
  name: string
  root_path: string
  icon?: string | null
  color?: string | null
  default_model_id?: number | null
  default_agent_mode?: string
  is_favorite?: number
  created_at: string
  last_opened_at?: string | null
}

declare module "./types" {
  interface AppState {
    projects: Project[]
    activeProject: Project | null
    projectScopeFilter: boolean
    loadProjects: () => Promise<void>
    openProject: (id: number) => Promise<Project | null>
    createProject: (data: {
      name: string
      root_path: string
      icon?: string | null
      color?: string | null
      default_model_id?: number | null
      default_agent_mode?: string
      is_favorite?: boolean | number
    }) => Promise<Project>
    updateProject: (id: number, data: Partial<Project>) => Promise<Project>
    deleteProject: (id: number) => Promise<void>
    toggleProjectScope: () => void
    setProjectScopeFilter: (enabled: boolean) => void
  }
}

export interface ProjectSlice {
  projects: Project[]
  activeProject: Project | null
  projectScopeFilter: boolean
  loadProjects: () => Promise<void>
  openProject: (id: number) => Promise<Project | null>
  createProject: (data: {
    name: string
    root_path: string
    icon?: string | null
    color?: string | null
    default_model_id?: number | null
    default_agent_mode?: string
    is_favorite?: boolean | number
  }) => Promise<Project>
  updateProject: (id: number, data: Partial<Project>) => Promise<Project>
  deleteProject: (id: number) => Promise<void>
  toggleProjectScope: () => void
  setProjectScopeFilter: (enabled: boolean) => void
}

export const createProjectSlice: StateCreator<AppState, [], [], ProjectSlice> = (set, get) => ({
  projects: [],
  activeProject: null,
  projectScopeFilter: true,

  loadProjects: async () => {
    try {
      const projects = (await window.electronAPI?.project?.list()) || []
      const current = (await window.electronAPI?.project?.current()) || null
      set({ projects, activeProject: current })
    } catch {}
  },

  openProject: async (id: number) => {
    try {
      const proj = await window.electronAPI?.project?.open(id)
      if (proj) {
        set({ activeProject: proj })
        const projects = (await window.electronAPI?.project?.list()) || []
        set({ projects })
        if (typeof get().loadSessions === "function") {
          await get().loadSessions()
        }
        return proj
      }
    } catch (e) {
      console.error("[projectSlice] openProject error:", e)
    }
    return null
  },

  createProject: async (data) => {
    const proj = await window.electronAPI.project.create(data)
    await get().loadProjects()
    return proj
  },

  updateProject: async (id, data) => {
    const updated = await window.electronAPI.project.update(id, data)
    await get().loadProjects()
    if (get().activeProject?.id === id) {
      set({ activeProject: updated })
    }
    return updated
  },

  deleteProject: async (id: number) => {
    await window.electronAPI.project.delete(id)
    await get().loadProjects()
    if (get().activeProject?.id === id) {
      set({ activeProject: null })
    }
    if (typeof get().loadSessions === "function") {
      await get().loadSessions()
    }
  },

  toggleProjectScope: () => {
    set((s) => ({ projectScopeFilter: !s.projectScopeFilter }))
  },

  setProjectScopeFilter: (enabled: boolean) => {
    set({ projectScopeFilter: enabled })
  },
})
