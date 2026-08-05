import { describe, expect, it, beforeEach } from "vitest"
import { useStore } from "@/store"
import type { Message, Session } from "@/types"

// Drain the microtask/macrotask queues so fire-and-forget async actions settle.
const flush = () => new Promise((r) => setTimeout(r, 0))

const makeMsg = (over: Partial<Message> = {}): Message => ({
  id: 1,
  session_id: 5,
  role: "user",
  content: "hi",
  created_at: "2026-01-01T00:00:00.000Z",
  model_used: null,
  provider_used: null,
  token_count: null,
  latency_ms: null,
  status: "success",
  error_message: null,
  attachment: null,
  ...over,
})

const makeSession = (over: Partial<Session> = {}): Session => ({
  id: 5,
  title: "Test",
  persona_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
  pinned: 0,
  updated_at: "2026-01-01T00:00:00.000Z",
  ...over,
})

function stubWindow(overrides: Record<string, unknown> = {}) {
  const base = {
    provider: { list: async () => [] },
    model: { list: async () => [], listAll: async () => [] },
    session: {
      list: async () => [],
      getConfig: async () => ({ providerId: 1, modelId: 10, personaId: null }),
      setConfig: async () => {},
      createAndSelect: async () => ({ session: makeSession(), config: { providerId: 1, modelId: 1, personaId: null }, messages: [] }),
      delete: async () => {},
      pin: async () => {},
    },
    message: { list: async () => [] },
    agent: { setWorkspace: async () => {} },
    ...overrides,
  }
  ;(globalThis as any).window = { electronAPI: base }
}

describe("sessionSlice", () => {
  beforeEach(() => {
    stubWindow()
    useStore.setState({
      sessions: [],
      currentSessionId: null,
      messages: [],
      sessionConfigs: {},
      sessionHistory: [],
      sessionHistoryIdx: -1,
      arenaResults: [],
      streamingBySession: {},
      toolCallsByMessage: {},
      planStepsByMessage: {},
      todosByMessage: {},
      thinkingBlocksByMessage: {},
      statusLinesByMessage: {},
    })
  })

  it("getSessionConfig returns a default config for unknown sessions", () => {
    expect(useStore.getState().getSessionConfig(999)).toEqual({ providerId: null, modelId: null, personaId: null })
  })

  it("selectSession loads messages, sets the session and clears arena state", async () => {
    const msgs = [makeMsg()]
    stubWindow({
      message: { list: async () => msgs },
      model: { list: async () => [] },
    })
    useStore.setState({ arenaResults: [{ model_id: 1, model_name: "a", provider_name: "p", content: "x" }] })

    await useStore.getState().selectSession(5)

    const s = useStore.getState()
    expect(s.currentSessionId).toBe(5)
    expect(s.messages).toEqual(msgs)
    expect(s.arenaResults).toEqual([])
    expect(s.sessionConfigs[5]?.modelId).toBe(10)
    expect(s.sessionHistory).toContain(5)
  })

  it("newChat resets UI state and creates a session optimistically", async () => {
    const created = makeSession({ id: 100, title: "New" })
    stubWindow({
      provider: { list: async () => [{ id: 1, name: "p", api_url: "", api_key: "", api_format: "openai", enabled: 1, created_at: "" }] },
      model: { list: async () => [{ id: 1, provider_id: 1, model_name: "m", is_primary: 1, display_name: null, fallback_order: null, context_window: null, input_price_per_1k: null, output_price_per_1k: null, created_at: "" }] },
      session: {
        list: async () => [],
        createAndSelect: async () => ({ session: created, config: { providerId: 1, modelId: 1, personaId: null }, messages: [] }),
        setConfig: async () => {},
      },
    })
    useStore.setState({ currentSessionId: null, chatMode: "arena", arenaResults: [{ model_id: 1, model_name: "a", provider_name: "p", content: "x" }] })

    useStore.getState().newChat()
    // Synchronous part of newChat applies immediately.
    expect(useStore.getState().currentView).toBe("chat")
    expect(useStore.getState().chatMode).toBe("normal")
    expect(useStore.getState().arenaResults).toEqual([])

    await flush()

    const s = useStore.getState()
    expect(s.currentSessionId).toBe(100)
    expect(s.sessions.some((x) => x.id === 100)).toBe(true)
    expect(s.sessionConfigs[100]?.modelId).toBe(1)
  })

  it("deleteSession removes the session and clears current-session state", async () => {
    const remaining = makeSession({ id: 8 })
    stubWindow({
      session: {
        list: async () => [remaining],
        delete: async () => {},
        setConfig: async () => {},
      },
    })
    useStore.setState({
      sessions: [makeSession(), remaining],
      currentSessionId: 5,
      sessionConfigs: { 5: { providerId: 1, modelId: 1, personaId: null } },
      streamingBySession: { 5: { content: "x", messageId: null } },
      messages: [makeMsg()],
    })

    await useStore.getState().deleteSession(5)

    const s = useStore.getState()
    expect(s.currentSessionId).toBeNull()
    expect(s.messages).toEqual([])
    expect(s.sessionConfigs[5]).toBeUndefined()
    expect(s.streamingBySession[5]).toBeUndefined()
    expect(s.sessions.map((x) => x.id)).toEqual([8])
  })
})