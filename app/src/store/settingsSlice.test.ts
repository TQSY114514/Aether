import { describe, expect, it, beforeEach, vi } from "vitest"
import { useStore } from "@/store"

// loadSettings / setTheme / setFontScale touch `document` (theme.ts, store/types)
// and loadSettings may call detectLang() which reads `navigator`. Both are
// undefined in node, so stub them manually (no jsdom dependency).
;(globalThis as any).document = {
  documentElement: { style: { setProperty: () => {} }, dir: "ltr" },
}
Object.defineProperty(globalThis, "navigator", { value: { language: "en" }, configurable: true })

function stubWindow(overrides: Record<string, unknown> = {}) {
  const base = {
    settings: { getAll: async () => ({}), set: async () => {} },
    git: { getAutoCommit: async () => ({ enabled: true }), setAutoCommit: async () => {} },
    agent: { setWorkspace: async () => {} },
    background: { set: async () => {} },
    ...overrides,
  }
  ;(globalThis as any).window = { electronAPI: base }
}

describe("settingsSlice", () => {
  beforeEach(() => {
    stubWindow()
    useStore.setState({
      language: "en",
      theme: "light",
      fallbackTimeout: 30000,
      fontScale: 1,
      bubbleWidth: 85,
      defaultThinkingEnabled: true,
      defaultEffort: "medium",
      defaultModelId: null,
      defaultPersonaId: null,
      maxTokens: 0,
      temperature: 0,
      topP: 0,
      systemPrefix: "",
      autoTitle: true,
      titleLanguage: "auto",
      titleModelId: null,
      modelRoutingPriority: "quality",
      modelAutoRoute: false,
      autoCommitOnTestPass: false,
      autoCommitAfterFileChange: true,
      agentWorkspace: "",
      memories: [],
    })
  })

  it("loadSettings reads settings.getAll and populates the store", async () => {
    stubWindow({
      settings: {
        getAll: async () => ({
          language: "zh-CN",
          theme: "dark",
          fallback_timeout_ms: "60000",
          fontScale: "1.1",
          bubbleWidth: "70",
          defaultEffort: "medium",
          defaultThinkingEnabled: "1",
          defaultModelId: "42",
          maxTokens: "4096",
          temperature: "0.7",
          topP: "0.9",
          systemPrefix: "system",
          autoTitle: "1",
          titleLanguage: "zh",
          titleModelId: "7",
          modelRoutingPriority: "speed",
          modelAutoRoute: "1",
          autoCommitOnTestPass: "1",
          seen_hints: '["a","b"]',
        }),
      },
      git: { getAutoCommit: async () => ({ enabled: false }) },
    })

    await useStore.getState().loadSettings()

    const s = useStore.getState()
    expect(s.language).toBe("zh-CN")
    expect(s.theme).toBe("dark")
    expect(s.fallbackTimeout).toBe(60000)
    expect(s.fontScale).toBe(1.1)
    expect(s.bubbleWidth).toBe(70)
    expect(s.defaultEffort).toBe("medium")
    expect(s.effortLevel).toBe("medium")
    expect(s.defaultModelId).toBe(42)
    expect(s.maxTokens).toBe(4096)
    expect(s.temperature).toBe(0.7)
    expect(s.topP).toBe(0.9)
    expect(s.systemPrefix).toBe("system")
    expect(s.autoTitle).toBe(true)
    expect(s.titleModelId).toBe(7)
    expect(s.modelRoutingPriority).toBe("speed")
    expect(s.modelAutoRoute).toBe(true)
    expect(s.autoCommitOnTestPass).toBe(true)
    expect(s.autoCommitAfterFileChange).toBe(false)
    expect(s.seenHints).toEqual(["a", "b"])
  })

  it("setAgentWorkspace persists via IPC and updates the store", async () => {
    const setWorkspace = vi.fn(async () => {})
    stubWindow({ agent: { setWorkspace } })

    await useStore.getState().setAgentWorkspace("C:/work")
    expect(useStore.getState().agentWorkspace).toBe("C:/work")
    expect(setWorkspace).toHaveBeenCalledWith({ dir: "C:/work" })

    // Clearing (empty string) also reflects in the store.
    await useStore.getState().setAgentWorkspace("")
    expect(useStore.getState().agentWorkspace).toBe("")
  })

  it("setDefaultModel writes through IPC and updates defaultModelId locally", async () => {
    const set = vi.fn(async () => {})
    stubWindow({ settings: { getAll: async () => ({}), set } })

    await useStore.getState().setDefaultModel(9)
    expect(useStore.getState().defaultModelId).toBe(9)
    expect(set).toHaveBeenCalledWith("defaultModelId", "9")

    // null clears the value.
    await useStore.getState().setDefaultModel(null)
    expect(useStore.getState().defaultModelId).toBeNull()
  })

  it("setTheme persists through IPC and updates the store", async () => {
    const set = vi.fn(async () => {})
    stubWindow({ settings: { getAll: async () => ({}), set } })

    await useStore.getState().setTheme("dark")
    expect(useStore.getState().theme).toBe("dark")
    expect(set).toHaveBeenCalledWith("theme", "dark")
  })
})