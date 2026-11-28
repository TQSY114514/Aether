import { describe, it, expect, beforeEach, beforeAll } from "vitest"
import { useStore } from "@/store"
import { ensureChunkListener, ensureToolCallListener, ensureToolStreamListener } from "@/store/listeners"

// The listeners bridge to the main process via `window.electronAPI` and use
// `requestAnimationFrame` to batch stream flushes. In the node/vitest env both
// are undefined, so we stub them here and capture the callbacks so tests can
// fire events deterministically.

type ChunkPayload = { messageId: number; delta: string; done: boolean; sessionId: number }
type ToolPayload = {
  messageId: number
  sessionId: number
  tool: {
    name: string
    args: unknown
    result: string | null
    error: string | null
  }
}

let chunkCb: ((p: ChunkPayload) => void) | null = null
let toolCb: ((p: ToolPayload) => void) | null = null
let toolStreamCb: ((p: { messageId: number; sessionId: number; text: string; done: boolean }) => void) | null = null
let chunkRegisterCalls = 0
let toolRegisterCalls = 0
let rafCbs: Array<() => void> = []

const flushRaf = () => {
  const cbs = rafCbs
  rafCbs = []
  for (const cb of cbs) cb()
}

beforeAll(() => {
  const electronAPI = {
    chat: {
      onChunk: (cb: (p: ChunkPayload) => void) => {
        chunkCb = cb
        chunkRegisterCalls++
        return () => {}
      },
      onToolCall: (cb: (p: ToolPayload) => void) => {
        toolCb = cb
        toolRegisterCalls++
        return () => {}
      },
      onToolStream: (cb: (p: { messageId: number; sessionId: number; text: string; done: boolean }) => void) => {
        toolStreamCb = cb
        return () => {}
      },
    },
    message: { list: async () => [] },
    arena: {},
  }
  ;(globalThis as any).window = { electronAPI }
  ;(globalThis as any).requestAnimationFrame = (cb: () => void) => {
    rafCbs.push(cb)
    return rafCbs.length
  }
  ;(globalThis as any).cancelAnimationFrame = () => {}

  // Install once; the guards make them idempotent (asserted below).
  ensureChunkListener()
  ensureToolCallListener()
  ensureToolStreamListener()
})

beforeEach(() => {
  chunkRegisterCalls = 0
  toolRegisterCalls = 0
  rafCbs = []
  useStore.setState({
    streamingBySession: {},
    toolCallsByMessage: {},
    queuedMessages: [],
    messages: [],
    sending: false,
    currentSessionId: null,
  })
})

describe("chunk listener", () => {
  it("accumulates chunk deltas into the per-session streaming buffer", () => {
    const sid = 1
    const messageId = 101
    chunkCb!({ sessionId: sid, messageId, delta: "Hello", done: false })
    expect(useStore.getState().streamingBySession[sid].content).toBe("Hello")

    // Subsequent deltas are batched through rAF before being written.
    chunkCb!({ sessionId: sid, messageId, delta: " world", done: false })
    chunkCb!({ sessionId: sid, messageId, delta: "!", done: false })
    expect(useStore.getState().streamingBySession[sid].content).toBe("Hello")

    flushRaf()
    const buf = useStore.getState().streamingBySession[sid]
    expect(buf.content).toBe("Hello world!")
    expect(buf.messageId).toBe(messageId)
  })

  it("finalizes the stream when a done chunk arrives", async () => {
    const sid = 2
    const messageId = 202
    useStore.setState({
      currentSessionId: sid,
      pinSession: async () => {},
      loadSessions: async () => {},
      notifyComplete: () => {},
    })
    ;(globalThis as any).window.electronAPI.message.list = async () => [
      { id: 1, content: "Hello world!" },
    ]

    chunkCb!({ sessionId: sid, messageId, delta: "Hello", done: false })
    chunkCb!({ sessionId: sid, messageId, delta: " world", done: false })
    chunkCb!({ sessionId: sid, messageId, delta: "!", done: false })

    // done flushes pending deltas synchronously...
    chunkCb!({ sessionId: sid, messageId, delta: "", done: true })
    expect(useStore.getState().streamingBySession[sid].content).toBe("Hello world!")

    // ...then schedules the cleanup rAF, which reloads and clears the buffer.
    flushRaf()
    await new Promise((r) => setTimeout(r, 0))

    const st = useStore.getState()
    expect(st.streamingBySession[sid]).toBeUndefined()
    expect(st.messages[0].content).toBe("Hello world!")
  })
  it("drains queued messages preserving attachments and snippets after stream completes", async () => {
    const sid = 3
    const sent: Array<{ content: string; attachments?: any[] }> = []
    useStore.setState({
      currentSessionId: sid,
      sessions: [{ id: sid, title: "S3", created_at: "", updated_at: "", pinned: 0 } as any],
      pinSession: async () => {},
      loadSessions: async () => {},
      notifyComplete: () => {},
      sendMessage: (async (content: string, attachments?: any[]) => {
        sent.push({ content, attachments })
      }) as any,
      queuedMessages: [
        {
          id: 1,
          sessionId: sid,
          content: "Please check",
          attachments: [{ name: "a.png", mime: "image/png", kind: "image", dataUrl: "data:image/png;base64,123" }],
          snippets: [{ id: 1, content: "console.log(1)", preview: "console.log(1)" }],
        },
      ],
    })
    ;(globalThis as any).window.electronAPI.message.list = async () => [{ id: 1, content: "done" }]

    chunkCb!({ sessionId: sid, messageId: 301, delta: "ok", done: true })
    flushRaf()
    await new Promise((r) => setTimeout(r, 80))

    expect(sent).toHaveLength(1)
    expect(sent[0].content).toContain("Please check")
    expect(sent[0].content).toContain("console.log(1)")
    expect(sent[0].attachments).toHaveLength(1)
    expect(sent[0].attachments?.[0].name).toBe("a.png")
  })
})

describe("tool call listener", () => {
  it("dedups consecutive same-name tool calls with no result by replacing", () => {
    const msgId = 5
    toolCb!({ messageId: msgId, sessionId: 1, tool: { name: "read_file", args: { a: 1 }, result: null, error: null } })
    expect(useStore.getState().toolCallsByMessage[msgId]).toHaveLength(1)

    // Same name, no result/error -> replace the last entry, not append.
    toolCb!({ messageId: msgId, sessionId: 1, tool: { name: "read_file", args: { a: 2 }, result: null, error: null } })
    const calls = useStore.getState().toolCallsByMessage[msgId]
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toEqual({ a: 2 })
  })

  it("appends when the name differs, and replaces only the matching running placeholder", () => {
    const msgId = 6
    toolCb!({ messageId: msgId, sessionId: 1, tool: { name: "read_file", args: {}, result: null, error: null } })
    // Different name -> append.
    toolCb!({ messageId: msgId, sessionId: 1, tool: { name: "grep", args: {}, result: null, error: null } })
    expect(useStore.getState().toolCallsByMessage[msgId]).toHaveLength(2)

    // Same name as the current running placeholder (a started placeholder) ->
    // replace it with the completion entry, not append a duplicate.
    toolCb!({ messageId: msgId, sessionId: 1, tool: { name: "grep", args: {}, result: "found", error: null } })
    const calls = useStore.getState().toolCallsByMessage[msgId]
    expect(calls).toHaveLength(2)
    expect(calls[1].result).toBe("found")
  })
})

describe("tool stream listener", () => {
  it("batches rapid tool-stream stdout chunks via rAF and flushes on done", () => {
    const msgId = 7
    toolCb!({ messageId: msgId, sessionId: 1, tool: { name: "run_command", args: { command: "ls" }, result: null, error: null } })

    toolStreamCb!({ messageId: msgId, sessionId: 1, text: "line1\n", done: false })
    toolStreamCb!({ messageId: msgId, sessionId: 1, text: "line2\n", done: false })
    // Not flushed before rAF fires.
    expect(useStore.getState().toolCallsByMessage[msgId][0].liveOutput).toBeUndefined()

    flushRaf()
    expect(useStore.getState().toolCallsByMessage[msgId][0].liveOutput).toBe("line1\nline2\n")
    expect(useStore.getState().toolCallsByMessage[msgId][0].liveOutputDone).toBeUndefined()

    toolStreamCb!({ messageId: msgId, sessionId: 1, text: "eof", done: true })
    expect(useStore.getState().toolCallsByMessage[msgId][0].liveOutput).toBe("line1\nline2\neof")
    expect(useStore.getState().toolCallsByMessage[msgId][0].liveOutputDone).toBe(true)
  })
})

describe("listener idempotency", () => {
  it("does not re-register the chunk listener when called again", () => {
    ensureChunkListener()
    ensureChunkListener()
    expect(chunkRegisterCalls).toBe(0)
  })
})