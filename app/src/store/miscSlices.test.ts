import { describe, expect, it, beforeEach, vi } from "vitest"
import { useStore } from "@/store"

const flush = () => new Promise((r) => setTimeout(r, 0))

const provider1 = { id: 1, name: "Anthropic", api_url: "https://api.example", api_key: "k", api_format: "openai", enabled: 1, created_at: "2026-01-01T00:00:00.000Z" }
const model1 = { id: 1, provider_id: 1, model_name: "claude", is_primary: 1, display_name: null, fallback_order: null, context_window: null, input_price_per_1k: null, output_price_per_1k: null, created_at: "2026-01-01T00:00:00.000Z" }
const persona1 = { id: 1, name: "Assistant", prompt: "You are helpful", avatar: null, created_at: "2026-01-01T00:00:00.000Z" }

function stubWindow(overrides: Record<string, unknown> = {}) {
  const base = {
    provider: { list: async () => [provider1], create: async () => {}, update: async () => {}, delete: async () => {} },
    model: { list: async () => [model1], listAll: async () => [model1], create: async () => {}, update: async () => {}, delete: async () => {} },
    persona: { list: async () => [persona1], create: async () => {}, update: async () => {}, delete: async () => {} },
    session: { list: async () => [], pin: async () => {}, setConfig: async () => {} },
    arena: { send: async () => ({ results: [] }), vote: async () => ({}), scores: async () => [], onModelDone: () => () => {} },
    message: { list: async () => [] },
    settings: { set: async () => {} },
    ...overrides,
  }
  ;(globalThis as any).window = { electronAPI: base }
}

describe("providerSlice", () => {
  beforeEach(() => {
    stubWindow()
    useStore.setState({ providers: [], allModels: [], modelsByProvider: {}, sessionConfigs: {} })
  })

  it("loadProviders writes the provider list into the store", async () => {
    await useStore.getState().loadProviders()
    expect(useStore.getState().providers).toEqual([provider1])
  })

  it("addProvider re-fetches and updates the store", async () => {
    const newProvider = { id: 2, name: "OpenAI", api_url: "https://o", api_key: "k", api_format: "openai", enabled: 1, created_at: "2026-01-01T00:00:00.000Z" }
    const list = vi.fn(async () => [provider1, newProvider])
    const create = vi.fn(async () => {})
    stubWindow({ provider: { list, create, update: async () => {}, delete: async () => {} } })

    await useStore.getState().addProvider({ name: "OpenAI", api_url: "https://o", api_key: "k", api_format: "openai", enabled: 1, created_at: "", id: 2 } as any)
    expect(create).toHaveBeenCalled()
    expect(useStore.getState().providers).toEqual([provider1, newProvider])
  })
})

describe("personaSlice", () => {
  beforeEach(() => {
    stubWindow()
    useStore.setState({ personas: [], workspaceSoul: null, currentSessionId: null, sessions: [], sessionConfigs: {} })
  })

  it("loadPersonas writes the persona list into the store", async () => {
    await useStore.getState().loadPersonas()
    expect(useStore.getState().personas).toEqual([persona1])
  })

  it("loadWorkspaceSoul scopes request sequence per session and ignores stale workspace errors", async () => {
    let resolveS1!: (v: any) => void
    let rejectOldWs!: (e: Error) => void
    let resolveS2!: (v: any) => void
    const getWorkspaceSoul = vi.fn((ws: string | null) => {
      if (ws === "/ws/1") return new Promise((r) => { resolveS1 = r })
      if (ws === "/ws/2") return new Promise((r) => { resolveS2 = r })
      if (ws === "/ws/err") return new Promise((_, rej) => { rejectOldWs = rej })
      return Promise.resolve(null)
    })
    stubWindow({ persona: { list: async () => [], getWorkspaceSoul } })

    // Session 1 triggers load for /ws/1
    useStore.setState({
      currentSessionId: 1,
      sessions: [{ id: 1, title: "S1", persona_id: null, created_at: "", pinned: 0, updated_at: "", cwd: "/ws/1" }],
      sessionConfigs: { 1: { providerId: null, modelId: null, personaId: null, workspace: "/ws/1" } },
    })
    const p1 = useStore.getState().loadWorkspaceSoul("/ws/1")

    // Rapid switch to Session 2 triggers load for /ws/2 while Session 1 is still pending
    useStore.setState({
      currentSessionId: 2,
      sessions: [
        { id: 1, title: "S1", persona_id: null, created_at: "", pinned: 0, updated_at: "", cwd: "/ws/1" },
        { id: 2, title: "S2", persona_id: null, created_at: "", pinned: 0, updated_at: "", cwd: "/ws/2" },
      ],
      sessionConfigs: {
        1: { providerId: null, modelId: null, personaId: null, workspace: "/ws/1" },
        2: { providerId: null, modelId: null, personaId: null, workspace: "/ws/2" },
      },
    })
    const p2 = useStore.getState().loadWorkspaceSoul("/ws/2")

    // Session 2 resolves first, then stale Session 1 resolves: Session 2's soul must remain
    const soul2 = { name: "Soul2", prompt: "p2", isWorkspace: true }
    const soul1 = { name: "Soul1", prompt: "p1", isWorkspace: true }
    resolveS2(soul2)
    await p2
    expect(useStore.getState().workspaceSoul).toEqual(soul2)

    resolveS1(soul1)
    await p1
    expect(useStore.getState().workspaceSoul).toEqual(soul2)

    // Same session: /ws/err starts, then cwd changes to /ws/2 before /ws/err rejects -> must not clear /ws/2 soul
    const pErr = useStore.getState().loadWorkspaceSoul("/ws/err")
    useStore.setState({
      sessions: [
        { id: 1, title: "S1", persona_id: null, created_at: "", pinned: 0, updated_at: "", cwd: "/ws/1" },
        { id: 2, title: "S2", persona_id: null, created_at: "", pinned: 0, updated_at: "", cwd: "/ws/2" },
      ],
    })
    rejectOldWs(new Error("boom"))
    await pErr
    expect(useStore.getState().workspaceSoul).toEqual(soul2)
  })

  it("deletePersona deletes via IPC and removes from store without calling loadPersonas", async () => {
    const del = vi.fn(async () => {})
    const list = vi.fn(async () => [persona1])
    stubWindow({ persona: { list, create: async () => {}, update: async () => {}, delete: del } })
    useStore.setState({ personas: [persona1, { ...persona1, id: 2, name: "Second" }] })

    await useStore.getState().deletePersona(1)
    expect(del).toHaveBeenCalledWith(1)
    expect(list).not.toHaveBeenCalled()
    expect(useStore.getState().personas.map((p) => p.id)).toEqual([2])
  })
})

describe("uiSlice", () => {
  beforeEach(() => {
    stubWindow()
    useStore.setState({ currentView: "chat", sidebarOpen: true, completionToasts: [], activeHints: [], seenHints: [] })
  })

  it("setCurrentView switches the active view", () => {
    useStore.getState().setCurrentView("settings")
    expect(useStore.getState().currentView).toBe("settings")
  })

  it("toggleSidebar flips the sidebar open state", () => {
    useStore.getState().toggleSidebar()
    expect(useStore.getState().sidebarOpen).toBe(false)
    useStore.getState().toggleSidebar()
    expect(useStore.getState().sidebarOpen).toBe(true)
  })

  it("dismissToast removes a toast by id", () => {
    useStore.setState({ completionToasts: [{ id: 1, sessionId: 5, sessionTitle: "t" }, { id: 2, sessionId: 6, sessionTitle: "u" }] })
    useStore.getState().dismissToast(1)
    expect(useStore.getState().completionToasts.map((t) => t.id)).toEqual([2])
  })

  it("triggerHint adds a new hint but not repeats", () => {
    useStore.getState().triggerHint("flag1", "text1")
    expect(useStore.getState().activeHints).toEqual([{ flag: "flag1", text: "text1" }])
    useStore.getState().triggerHint("flag1", "text1")
    expect(useStore.getState().activeHints).toHaveLength(1)
  })
})

describe("arenaSlice", () => {
  beforeEach(() => {
    stubWindow()
    useStore.setState({
      currentSessionId: null,
      arenaModelIds: [],
      arenaResults: [],
      arenaResultsSessionId: null,
      arenaPending: 0,
      arenaError: null,
      arenaVoted: false,
      arenaVoteWinnerId: null,
      sessionConfigs: {},
      defaultPersonaId: null,
      streamingBySession: {},
      messages: [],
      sending: false,
    })
  })

  it("setArenaModelIds records the selected model ids", () => {
    useStore.getState().setArenaModelIds([1, 2])
    expect(useStore.getState().arenaModelIds).toEqual([1, 2])
  })

  it("runArena guards against missing prerequisites", async () => {
    // No current session -> error, no IPC side effects.
    useStore.setState({ currentSessionId: null, arenaModelIds: [1, 2] })
    await useStore.getState().runArena("hi")
    expect(useStore.getState().arenaError).toBe("请先选择至少 2 个模型")

    // Session present but fewer than 2 models -> same guard.
    useStore.setState({ currentSessionId: 5, arenaModelIds: [1] })
    await useStore.getState().runArena("hi")
    expect(useStore.getState().arenaError).toBe("请先选择至少 2 个模型")
  })

  it("runArena writes results into the store on success", async () => {
    const result = { model_id: 1, model_name: "claude", provider_name: "Anthropic", content: "answer" }
    stubWindow({
      arena: {
        send: async () => ({ results: [result] }),
        onModelDone: () => () => {},
        scores: async () => [],
      },
      session: { list: async () => [], pin: async () => {}, setConfig: async () => {} },
      message: { list: async () => [] },
    })
    useStore.setState({
      currentSessionId: 5,
      arenaModelIds: [1, 2],
      sessionConfigs: { 5: { providerId: 1, modelId: 1, personaId: null } },
    })

    await useStore.getState().runArena("hi")

    const s = useStore.getState()
    expect(s.arenaResults).toEqual([result])
    expect(s.arenaPending).toBe(0)
    expect(s.sending).toBe(false)
    expect(s.arenaError).toBeNull()
  })

  it("runArena initializes arenaPending with models count times temperature count", async () => {
    let capturedPendingDuringRun = -1
    stubWindow({
      arena: {
        send: async () => {
          capturedPendingDuringRun = useStore.getState().arenaPending
          return { results: [] }
        },
        onModelDone: () => () => {},
        scores: async () => [],
      },
      session: { list: async () => [], pin: async () => {}, setConfig: async () => {} },
      message: { list: async () => [] },
    })
    useStore.setState({
      currentSessionId: 5,
      arenaModelIds: [1, 2],
      arenaTemperatures: [0.2, 0.7, 1.0],
      sessionConfigs: { 5: { providerId: 1, modelId: 1, personaId: null } },
    })

    await useStore.getState().runArena("hi")
    expect(capturedPendingDuringRun).toBe(6)
  })

  describe("appendArenaResult (chatSlice arena helper)", () => {
    it("appends a result for the active arena session and de-dupes by model_id", () => {
      const r1 = { model_id: 1, model_name: "a", provider_name: "p", content: "x" }
      const r2 = { model_id: 2, model_name: "b", provider_name: "p", content: "y" }
      useStore.setState({ arenaResultsSessionId: 5, arenaResults: [] })

      useStore.getState().appendArenaResult(5, r1)
      useStore.getState().appendArenaResult(5, r1) // duplicate
      useStore.getState().appendArenaResult(5, r2)
      expect(useStore.getState().arenaResults.map((r) => r.model_id)).toEqual([1, 2])

      // A different session id is ignored.
      useStore.getState().appendArenaResult(9, { model_id: 3, model_name: "c", provider_name: "p", content: "z" })
      expect(useStore.getState().arenaResults.map((r) => r.model_id)).toEqual([1, 2])
    })
  })
})