import type { StoreApi } from "zustand"
import type { AppState } from "./types"
import type { TaskInfo } from "./types"
import { taskProgressText, taskApi } from "./types"

// Lazy store reference - set by initStoreListeners() after store creation.
let _store: StoreApi<AppState> | null = null

export function initStoreListeners(store: StoreApi<AppState>) {
  _store = store
}

function getStore(): StoreApi<AppState> {
  if (!_store) throw new Error("Store listeners not initialized")
  return _store
}

// Set by stopGeneration so the chunk listener done:rAF callback knows NOT to
// reload/delete - stopGeneration handles cleanup itself.
let _stoppingSessionId: number | null = null

export function setStoppingSessionId(v: number | null) {
  _stoppingSessionId = v
}

// Module-level listener state

let chunkListenerInstalled = false
let _toolCallListenerInstalled = false
let _arenaListenerInstalled = false
let _streamRaf = 0
let _pendingDeltas: Record<number, string> = {}
let _statusListenerInstalled = false
let _habitSuggestionInstalled = false
let _todoListenerInstalled = false
let _planSnapshotListenerInstalled = false
let _subagentListenerInstalled = false
let _thinkingListenerInstalled = false
let _loopStateListenerInstalled = false
let _planStepListenerInstalled = false
let _usageListenerInstalled = false

// Chunk listener

function flushStreamUpdates() {
  const deltas = _pendingDeltas
  _pendingDeltas = {}
  if (Object.keys(deltas).length === 0) return
  getStore().setState((s) => {
    const next = { ...s.streamingBySession }
    for (const [sid, delta] of Object.entries(deltas)) {
      const n = Number(sid)
      const buf = next[n]
      if (buf) next[n] = { ...buf, content: buf.content + delta }
    }
    return { streamingBySession: next }
  })
}

export function ensureChunkListener() {
  if (chunkListenerInstalled) return
  chunkListenerInstalled = true
  window.electronAPI.chat.onChunk(({ messageId, delta, done, sessionId }) => {
    if (!sessionId) return
    const state = getStore().getState()
    const buf = state.streamingBySession[sessionId]
    if (!buf && !done) {
      getStore().setState((s) => ({
        streamingBySession: { ...s.streamingBySession, [sessionId]: { content: delta, messageId } },
      }))
      return
    }
    if (done) {
      flushStreamUpdates()
      if (_streamRaf) { cancelAnimationFrame(_streamRaf); _streamRaf = 0 }
      _pendingDeltas = {}
      const sid = sessionId
      requestAnimationFrame(() => {
        const st = getStore().getState()
        const isStopping = _stoppingSessionId === sid
        if (st.currentSessionId !== sid) {
          getStore().getState().pinSession(sid, 0).then(() => {
            const s = getStore().getState().sessions.find(x => x.id === sid)
            if (s) getStore().getState().notifyComplete(sid, s.title || "Chat")
          }).catch(() => {})
        }
        if (st.currentSessionId === sid && !isStopping) {
          window.electronAPI.message.list(sid).then(msgs => {
            if (getStore().getState().currentSessionId === sid) {
              getStore().setState((s) => {
                const next = { ...s.streamingBySession }
                delete next[sid]
                return { messages: msgs, streamingBySession: next, sending: Object.keys(next).length > 0 }
              })
            } else {
              getStore().setState((s) => {
                const next = { ...s.streamingBySession }
                delete next[sid]
                return { streamingBySession: next, sending: Object.keys(next).length > 0 }
              })
            }
          }).catch(() => {
            getStore().setState((s) => {
              const next = { ...s.streamingBySession }
              delete next[sid]
              return { streamingBySession: next, sending: Object.keys(next).length > 0 }
            })
          })
        } else if (!isStopping) {
          getStore().setState((s) => {
            const next = { ...s.streamingBySession }
            delete next[sid]
            return { streamingBySession: next, sending: Object.keys(next).length > 0 }
          })
        }
        getStore().getState().pinSession(sid, 0).catch(() => {})
        getStore().getState().loadSessions()
        const st2 = getStore().getState()
        if (st2.queuedMessages.length > 0 && Object.keys(st2.streamingBySession).length === 0) {
          const q = st2.queuedMessages[0]
          getStore().setState((s) => ({ queuedMessages: s.queuedMessages.slice(1) }))
          setTimeout(() => {
            const st3 = getStore().getState()
            if (st3.chatMode === "arena") st3.runArena(q.content)
            else st3.sendMessage(q.content)
          }, 50)
        }
      })
    } else {
      _pendingDeltas[sessionId] = (_pendingDeltas[sessionId] || "") + delta
      if (!_streamRaf) {
        _streamRaf = requestAnimationFrame(() => { _streamRaf = 0; flushStreamUpdates() })
      }
    }
  })
}

// Tool call listener

export function ensureToolCallListener() {
  if (_toolCallListenerInstalled) return
  _toolCallListenerInstalled = true
  window.electronAPI.chat.onToolCall(({ messageId, sessionId, tool }) => {
    const entry = { name: tool.name, args: tool.args, result: tool.result, error: tool.error, failureKind: tool.failure_kind ?? null, recoveryHint: tool.recovery_hint ?? null, risk: tool.risk, latencyMs: tool.latencyMs ?? null, checkpointId: tool.checkpointId ?? null, diff: tool.diff ?? null, afterSnapshot: tool.after_snapshot ?? null, startedAt: tool.startedAt ?? null }
    getStore().setState((s) => {
      const sid = sessionId || s.currentSessionId
      const nextStreaming = { ...s.streamingBySession }
      if (sid && !nextStreaming[sid]) {
        nextStreaming[sid] = { content: "", messageId }
      }
      const existing = s.toolCallsByMessage[messageId] || []
      const last = existing[existing.length - 1]
      let nextCalls = [...existing, entry]
      if (existing.length > 0 && last.name === entry.name && last.result == null && last.error == null) {
        nextCalls = [...existing.slice(0, -1), entry]
      }
      return {
        streamingBySession: nextStreaming,
        toolCallsByMessage: { ...s.toolCallsByMessage, [messageId]: nextCalls },
      }
    })
  })
}

// Arena listener

export function ensureArenaListener() {
  if (_arenaListenerInstalled) return
  _arenaListenerInstalled = true
  window.electronAPI.arena.onModelDone(({ sessionId, result }) => {
    getStore().getState().appendArenaResult(sessionId, result)
  })
}

// Plan step listener

export function ensurePlanStepListener() {
  if (_planStepListenerInstalled) return
  _planStepListenerInstalled = true
  window.electronAPI.chat.onPlanStep?.(({ messageId, sessionId, step }) => {
    if (!messageId) return
    getStore().setState((s) => {
      const sid = sessionId || s.currentSessionId
      const nextStreaming = { ...s.streamingBySession }
      if (sid && !nextStreaming[sid]) {
        nextStreaming[sid] = { content: "", messageId }
      }
      const existing = s.planStepsByMessage[messageId] || []
      const idx = existing.findIndex(e => e.step === step.step && e.depth === step.depth)
      const entry = { step: step.step, depth: step.depth, assistantText: step.assistantText, kind: step.kind }
      let nextSteps = [...existing, entry]
      if (idx >= 0) {
        nextSteps = [...existing]
        nextSteps[idx] = entry
      }
      return {
        streamingBySession: nextStreaming,
        planStepsByMessage: { ...s.planStepsByMessage, [messageId]: nextSteps },
      }
    })
  })
}

// Status listener

export function ensureStatusListener() {
  if (_statusListenerInstalled) return
  _statusListenerInstalled = true
  window.electronAPI.chat.onStatus(({ messageId, text, kind }) => {
    if (!messageId || !text) return
    getStore().setState((s) => {
      const existing = s.statusLinesByMessage[messageId] || []
      if (existing.some(l => l === text || (l.includes(text.slice(0, 30)) && kind === "context_budget"))) return s
      const next = [...existing.slice(-4), text]
      return { statusLinesByMessage: { ...s.statusLinesByMessage, [messageId]: next } }
    })
    if (kind === "context_budget") {
      getStore().setState({ contextBudgetText: text })
    }
  })
}

// Habit listener

export function ensureHabitSuggestionListener() {
  if (_habitSuggestionInstalled) return
  _habitSuggestionInstalled = true
  window.electronAPI.chat.onHabitSuggestion?.((habits) => {
    getStore().setState((s) => ({
      proposedHabits: [...s.proposedHabits, ...habits.filter(h => !s.proposedHabits.some(ph => ph.key === h.key))],
    }))
  })
}


// Todo update listener
export function ensureTodoListener() {
  if (_todoListenerInstalled) return
  _todoListenerInstalled = true
  window.electronAPI.chat.onTodoUpdate?.(({ messageId, sessionId, todos }) => {
    if (!messageId || !todos) return
    getStore().setState((s) => ({
      todosByMessage: {
        ...s.todosByMessage,
        [messageId]: todos,
      },
    }))
  })
}

// Plan snapshot listener (hierarchical planner)
export function ensurePlanSnapshotListener() {
  if (_planSnapshotListenerInstalled) return
  _planSnapshotListenerInstalled = true
  window.electronAPI.chat.onPlanSnapshot?.(({ messageId, sessionId, plan }) => {
    if (!messageId || !plan) return
    const mappedTodos = (plan.tasks || []).map((t: any) => ({
      content: t.description,
      status: (t.status === 'completed' ? 'completed' : t.status === 'in_progress' ? 'in_progress' : 'pending') as 'pending' | 'in_progress' | 'completed',
      activeForm: t.status === 'in_progress' ? `正在执行: ${t.description}` : undefined,
    }))
    getStore().setState((s) => ({
      planSnapshotsByMessage: {
        ...s.planSnapshotsByMessage,
        [messageId]: plan,
      },
      todosByMessage: {
        ...s.todosByMessage,
        [messageId]: mappedTodos,
      },
    }))
  })
}

// Subagent event listener (delegate_task / parallel subagents)
export function ensureSubagentListener() {
  if (_subagentListenerInstalled) return
  _subagentListenerInstalled = true
  window.electronAPI.chat.onSubagentEvent?.(({ messageId, sessionId, event }) => {
    if (!messageId || !event) return
    getStore().setState((s) => {
      const existing = s.subagentsByMessage[messageId] || []
      const idx = existing.findIndex((sa) => sa.id === event.id)
      const entry = {
        id: event.id,
        name: `子代理 ${event.index + 1}`,
        task: event.task,
        status: event.status,
        latencyMs: event.latencyMs,
        startedAt: event.startedAt,
        output: event.output,
        error: event.error,
      }
      let nextList = [...existing]
      if (idx >= 0) {
        nextList[idx] = { ...nextList[idx], ...entry }
      } else {
        nextList.push(entry)
      }
      return {
        subagentsByMessage: {
          ...s.subagentsByMessage,
          [messageId]: nextList,
        },
      }
    })
  })
}

// Thinking listener

export function ensureThinkingListener() {
  if (_thinkingListenerInstalled) return
  _thinkingListenerInstalled = true
  window.electronAPI.chat.onThinkingChunk?.(({ messageId, sessionId, delta }) => {
    if (!messageId || !delta) return
    getStore().setState((s) => {
      const sid = sessionId || s.currentSessionId
      const nextStreaming = { ...s.streamingBySession }
      if (sid && !nextStreaming[sid]) {
        nextStreaming[sid] = { content: "", messageId }
      }
      return {
        streamingBySession: nextStreaming,
        thinkingBlocksByMessage: {
          ...s.thinkingBlocksByMessage,
          [messageId]: (s.thinkingBlocksByMessage[messageId] || "") + delta,
        },
      }
    })
  })
}

// Loop state listener

export function ensureLoopStateListener() {
  if (_loopStateListenerInstalled) return
  _loopStateListenerInstalled = true
  window.electronAPI.chat.onToolLoopStart?.(({ sessionId }) => {
    getStore().setState((s) => {
      const next = new Set(s.loopingSessions)
      next.add(sessionId)
      return { loopingSessions: next }
    })
  })
  window.electronAPI.chat.onToolLoopEnd?.(({ sessionId }) => {
    getStore().setState((s) => {
      const next = new Set(s.loopingSessions)
      next.delete(sessionId)
      return { loopingSessions: next }
    })
  })
}

// Live usage listener (chat:usage — tool turns). The payload carries the
// loop-accumulated totals; recordUsageEvent computes the per-round delta so
// multiple rounds within one turn sum correctly.
export function ensureUsageListener() {
  if (_usageListenerInstalled) return
  _usageListenerInstalled = true
  window.electronAPI.chat.onUsage?.(({ sessionId, messageId, inputTokens, outputTokens, costUsd }) => {
    getStore().getState().recordUsageEvent(sessionId, messageId, inputTokens, outputTokens, costUsd)
  })
}

// Task listeners

let _taskListenerInstalled = false

export function ensureTaskListeners() {
  if (_taskListenerInstalled) return
  const api = taskApi()
  if (!api) return
  _taskListenerInstalled = true
  const upsert = (patch: Partial<TaskInfo> & { id: number }) => getStore().getState().upsertTask(patch)
  api.onStarted((task) => {
    if (!task || typeof task.id !== "number") return
    upsert({ ...task, lastProgress: null })
  })
  api.onProgress(({ taskId, type, payload }) => {
    // Pause/resume carry a dedicated event type so the task row's status
    // stays in sync across every mount (TaskPanel's optimistic flip is a
    // fallback, not the source of truth).
    if (type === "paused") {
      upsert({ id: taskId, status: "paused", lastProgress: taskProgressText(type, payload) })
      return
    }
    if (type === "resumed") {
      upsert({ id: taskId, status: "running", lastProgress: taskProgressText(type, payload) })
      return
    }
    const text = taskProgressText(type, payload)
    if (!text) return
    upsert({ id: taskId, lastProgress: text })
  })
  api.onDone(({ taskId, sessionId, finalContent }) => {
    upsert({ id: taskId, sessionId, status: "done", finalContent })
  })
  api.onCancelled(({ taskId }) => {
    upsert({ id: taskId, status: "cancelled" })
  })
  api.onError(({ taskId, error }) => {
    upsert({ id: taskId, status: "error", error })
  })
}

// All listeners

export function ensureAllListeners() {
  ensureChunkListener()
  ensureToolCallListener()
  ensurePlanStepListener()
  ensurePlanSnapshotListener()
  ensureStatusListener()
  ensureHabitSuggestionListener()
  ensureTodoListener()
  ensureSubagentListener()
  ensureThinkingListener()
  ensureLoopStateListener()
  ensureUsageListener()
  ensureTaskListeners()
}