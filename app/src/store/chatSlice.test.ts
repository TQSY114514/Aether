import { describe, it, expect, beforeEach } from "vitest"
import { useStore } from "@/store"
import type { Message } from "@/types"

type AnyObj = Record<string, any>
type Stub = AnyObj

// Default (initial) store state snapshot, captured once at import time. Used in
// beforeEach to reset the singleton between tests and avoid cross-test pollution.
const defaultState = useStore.getState()

// Run in node: `window` is undefined. Actions call `window.electronAPI.<...>`,
// so we stub a minimal surface. Only the IPC channels actually reached by the
// actions under test need to behave; the rest are harmless no-ops.
function installWindowStub(): Stub {
  const stub: Stub = {
    session: { list: async () => [] },
    provider: { list: async () => [] },
    model: { list: async () => [], listAll: async () => [] },
    message: {
      list: async () => [],
      update: async () => ({}),
      deleteAfter: async () => ({}),
    },
    chat: {
      send: async () => ({}),
      stop: async () => ({}),
      inject: async () => ({}),
      onChunk: () => () => {},
      onToolCall: () => () => {},
      onToolLoopStart: () => () => {},
      onToolLoopEnd: () => () => {},
      onPlanStep: () => () => {},
      onStatus: () => () => {},
      onHabitSuggestion: () => () => {},
      onThinkingChunk: () => () => {},
      replyPermission: () => {},
      replyQuestion: () => {},
      confirmHabit: async () => ({}),
      dismissHabit: async () => ({}),
    },
    arena: {
      send: async () => ({ results: [] }),
      stop: async () => ({}),
      vote: async () => ({}),
      onModelDone: () => () => {},
    },
  }
  ;(globalThis as any).window = { electronAPI: stub }
  return stub
}

function makeMsg(partial: Partial<Message> & { id: number; role: Message["role"] }): Message {
  return {
    session_id: 1,
    content: "",
    created_at: new Date().toISOString(),
    model_used: null,
    provider_used: null,
    token_count: null,
    latency_ms: null,
    status: "success",
    error_message: null,
    ...partial,
  }
}

describe("chatSlice", () => {
  beforeEach(() => {
    useStore.setState(defaultState)
  })

  describe("sendMessage failure cleanup", () => {
    it("clears the current session's stream and sets sending=false when chat.send rejects", async () => {
      const api = installWindowStub()
      useStore.setState({
        currentSessionId: 1,
        sessionConfigs: { 1: { providerId: null, modelId: 100, personaId: null } },
        streamingBySession: { 1: { content: "", messageId: null } },
      })
      api.chat.send = async () => {
        throw new Error("send failed")
      }

      await useStore.getState().sendMessage("hello")

      const s = useStore.getState()
      expect(s.streamingBySession[1]).toBeUndefined()
      expect(s.sending).toBe(false)
    })

    it("only clears the failing session, keeping other concurrently streaming sessions", async () => {
      const api = installWindowStub()
      useStore.setState({
        currentSessionId: 1,
        sessionConfigs: { 1: { providerId: null, modelId: 100, personaId: null } },
        streamingBySession: {
          1: { content: "a", messageId: null },
          2: { content: "b", messageId: null },
        },
      })
      api.chat.send = async () => {
        throw new Error("boom")
      }

      await useStore.getState().sendMessage("hi")

      const s = useStore.getState()
      expect(s.streamingBySession[1]).toBeUndefined()
      expect(s.streamingBySession[2]).toEqual({ content: "b", messageId: null })
      expect(s.sending).toBe(true)
    })
  })

  describe("regenerate failure cleanup", () => {
    it("cleans up the stream and sending when regenerate's chat.send rejects", async () => {
      const api = installWindowStub()
      useStore.setState({
        currentSessionId: 1,
        sessionConfigs: { 1: { providerId: null, modelId: 100, personaId: null } },
        messages: [
          makeMsg({ id: 1, role: "user", content: "hi" }),
          makeMsg({ id: 2, role: "assistant", content: "yo", model_used: "m" }),
        ],
        streamingBySession: { 1: { content: "", messageId: null } },
      })
      api.chat.send = async () => {
        throw new Error("boom")
      }

      await useStore.getState().regenerate()

      const s = useStore.getState()
      expect(s.streamingBySession[1]).toBeUndefined()
      expect(s.sending).toBe(false)
    })
  })

  describe("editMessage failure cleanup", () => {
    it("cleans up the stream and sending when editMessage's chat.send rejects", async () => {
      const api = installWindowStub()
      useStore.setState({
        currentSessionId: 1,
        sessionConfigs: { 1: { providerId: null, modelId: 100, personaId: null } },
        messages: [makeMsg({ id: 1, role: "user", content: "old" })],
      })
      api.chat.send = async () => {
        throw new Error("boom")
      }

      await useStore.getState().editMessage(1, "new text")

      const s = useStore.getState()
      expect(s.streamingBySession[1]).toBeUndefined()
      expect(s.sending).toBe(false)
    })
  })

  describe("setChatMode", () => {
    it("resets arena state when leaving arena mode", () => {
      installWindowStub()
      useStore.setState({ currentSessionId: 1 })

      useStore.getState().setChatMode("arena")
      expect(useStore.getState().chatMode).toBe("arena")

      useStore.setState({
        arenaVoted: true,
        arenaVoteWinnerId: 7,
        arenaResults: [{ model_id: 7, model_name: "m", provider_name: "p", content: "x" }],
        arenaResultsSessionId: 1,
        arenaPending: 2,
        arenaError: "boom",
      })

      useStore.getState().setChatMode("normal")

      const s = useStore.getState()
      expect(s.chatMode).toBe("normal")
      expect(s.arenaVoted).toBe(false)
      expect(s.arenaVoteWinnerId).toBeNull()
      expect(s.arenaResults).toEqual([])
      expect(s.arenaResultsSessionId).toBeNull()
      expect(s.arenaPending).toBe(0)
      expect(s.arenaError).toBeNull()
    })
  })
})