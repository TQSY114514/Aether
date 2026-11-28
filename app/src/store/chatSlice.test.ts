import { describe, it, expect, beforeEach } from "vitest"
import { useStore } from "@/store"
import type { Message } from "@/types"
import { estimateMessageTokens } from "@/utils/tokenEstimate"

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

  describe("sendMessage perf optimizations", () => {
    it("updates sessions optimistically without calling session.list and avoids duplicating image preview", async () => {
      const api = installWindowStub()
      let sessionListCalls = 0
      api.session.list = async () => {
        sessionListCalls++
        return []
      }
      useStore.setState({
        currentSessionId: 1,
        sessions: [{ id: 1, title: "New Chat", created_at: "", updated_at: "", pinned: 0, last_message: "" } as any],
        sessionConfigs: { 1: { providerId: null, modelId: 100, personaId: null } },
      })

      await useStore.getState().sendMessage("hello", [
        { name: "pic.png", mime: "image/png", kind: "image", dataUrl: "data:image/png;base64,ABC" },
      ])
      await new Promise((r) => setTimeout(r, 180))

      const s = useStore.getState()
      expect(sessionListCalls).toBe(0)
      expect(s.sessions[0].last_message).toBe("hello")
      const lastMsg = s.messages[s.messages.length - 1] as any
      expect(lastMsg.attachment.all).toEqual([{ name: "pic.png", preview: "data:image/png;base64,ABC" }])
      expect(lastMsg.attachment.preview).toBeUndefined()
    })

    it("memoizes per-message token estimation in estimateMessageTokens", () => {
      const msg = makeMsg({ id: 9, role: "user", content: "hello world" })
      const t1 = estimateMessageTokens(msg, { system: 100, tool: 30, default: 20 })
      const t2 = estimateMessageTokens(msg, { system: 100, tool: 30, default: 20 })
      expect(t1).toBe(t2)
      expect(t1).toBeGreaterThan(20)
    })
  })

  describe("P0 UX non-silent send error feedback", () => {
    it("surfaces a warning toast when sending without a configured model", async () => {
      installWindowStub()
      useStore.setState({ currentSessionId: 1, sessionConfigs: {}, toasts: [] })

      await useStore.getState().sendMessage("hello")

      const toasts = useStore.getState().toasts
      expect(toasts.length).toBeGreaterThan(0)
      expect(toasts[0].type).toBe("warning")
    })

    it("clears streaming and surfaces an error toast when chat.send returns an error", async () => {
      const api = installWindowStub()
      api.chat.send = async () => ({ messageId: 0, error: "Model not found" })
      useStore.setState({
        currentSessionId: 1,
        sessionConfigs: { 1: { providerId: 1, modelId: 100, personaId: null } },
        toasts: [],
      })

      await useStore.getState().sendMessage("hello")

      const s = useStore.getState()
      expect(s.streamingBySession[1]).toBeUndefined()
      expect(s.sending).toBe(false)
      expect(s.toasts.some((t) => t.type === "error" && t.message.includes("Model not found"))).toBe(true)
    })

    it("surfaces an error toast when chat.send rejects", async () => {
      const api = installWindowStub()
      api.chat.send = async () => { throw new Error("Network down") }
      useStore.setState({
        currentSessionId: 1,
        sessionConfigs: { 1: { providerId: 1, modelId: 100, personaId: null } },
        toasts: [],
      })

      await useStore.getState().sendMessage("hello")

      const s = useStore.getState()
      expect(s.streamingBySession[1]).toBeUndefined()
      expect(s.toasts.some((t) => t.type === "error" && t.message.includes("Network down"))).toBe(true)
    })
  })

  describe("P1 UX targeted regenerate, editAndFork, and queue attachments", () => {
    it("regenerate(messageId) targets the specified earlier turn and truncates subsequent turns in DB", async () => {
      const api = installWindowStub()
      let deletedAfterId: number | null = null
      let sentContent = ""
      api.message.deleteAfter = async (_sid: number, mid: number) => {
        deletedAfterId = mid
        return {}
      }
      api.chat.send = async (payload: any) => {
        sentContent = payload.content
        return { messageId: 99 }
      }
      useStore.setState({
        currentSessionId: 1,
        sessionConfigs: { 1: { providerId: 1, modelId: 100, personaId: null } },
        messages: [
          makeMsg({ id: 10, role: "user", content: "first question" }),
          makeMsg({ id: 11, role: "assistant", content: "first answer" }),
          makeMsg({ id: 12, role: "user", content: "second question" }),
          makeMsg({ id: 13, role: "assistant", content: "second answer" }),
        ],
      })

      await useStore.getState().regenerate(11)

      expect(deletedAfterId).toBe(10)
      expect(sentContent).toBe("first question")
      expect(useStore.getState().messages.map((m) => m.id)).toEqual([10])
    })

    it("editAndForkMessage forks to a new session and reruns the edited copied user message", async () => {
      const api = installWindowStub()
      let forkedFromMsgId: number | null = null
      let updatedMsg: { id: number; content: string } | null = null
      let sentSessionId: number | null = null
      api.chat.fork = async ({ messageId }: any) => {
        forkedFromMsgId = messageId
        return { id: 2, title: "Fork" }
      }
      api.session.getConfig = async () => ({ providerId: 1, modelId: 100, personaId: null })
      api.message.list = async (sid: number) =>
        sid === 2
          ? [
              makeMsg({ id: 100, session_id: 2, role: "user", content: "original prompt" }),
            ]
          : []
      api.message.update = async (id: number, patch: any) => {
        updatedMsg = { id, content: patch.content }
        return {}
      }
      api.chat.send = async (payload: any) => {
        sentSessionId = payload.sessionId
        return { messageId: 101 }
      }
      useStore.setState({
        currentSessionId: 1,
        sessionConfigs: { 1: { providerId: 1, modelId: 100, personaId: null } },
        messages: [
          makeMsg({ id: 10, role: "user", content: "original prompt" }),
          makeMsg({ id: 11, role: "assistant", content: "reply" }),
        ],
      })

      await useStore.getState().editAndForkMessage(10, "updated prompt")

      expect(forkedFromMsgId).toBe(10)
      expect(updatedMsg).toEqual({ id: 100, content: "updated prompt" })
      expect(sentSessionId).toBe(2)
      expect(useStore.getState().currentSessionId).toBe(2)
    })

    it("enqueueMessage preserves attachments and snippets", () => {
      installWindowStub()
      useStore.setState({ currentSessionId: 1, queuedMessages: [] })

      useStore.getState().enqueueMessage("follow up", 1, {
        attachments: [{ name: "shot.png", mime: "image/png", kind: "image", dataUrl: "data:image/png;base64,AAA" }],
        snippets: [{ id: 1, content: "const x = 1", preview: "const x = 1" }],
      })

      const q = useStore.getState().queuedMessages
      expect(q).toHaveLength(1)
      expect(q[0].attachments).toHaveLength(1)
      expect(q[0].snippets).toHaveLength(1)
    })
  })
})