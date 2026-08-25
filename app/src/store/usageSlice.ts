import type { StateCreator } from "zustand"
import type { AppState } from "./types"
import { t } from "@/utils/i18n"

// Per-turn last cumulative usage seen via chat:usage events, keyed by messageId.
// toolLoop reports the loop-accumulated total each round, so we must add only the
// delta between consecutive events — otherwise earlier rounds get re-added and the
// session total over-counts.
const _lastUsageByTurn = new Map<number, { input: number; output: number; cost: number }>()
// messageIds whose usage was already counted via chat:usage events (tool turns).
// Guards against double-counting if a turn also returns usage via chat.send.
const _usageCountedByEvent = new Set<number>()

export const createUsageSlice: StateCreator<AppState, [], [], Partial<AppState>> = (set, get) => ({
  usageBySession: {},
  turnUsageBySession: {},
  budgetWarnedSessions: new Set<number>(),
  sessionBudgetUsd: 0,

  setSessionBudgetUsd: (v) => set({ sessionBudgetUsd: v }),

  // Reset the current turn's running total at the start of each sendMessage.
  resetTurnUsage: (sessionId) => {
    if (!sessionId) return
    set((s) => ({ turnUsageBySession: { ...s.turnUsageBySession, [sessionId]: { inputTokens: 0, outputTokens: 0, costUsd: 0 } } }))
  },

  // chat:usage event (tool turns). Computes the per-round delta and folds it in.
  recordUsageEvent: (sessionId, messageId, inputTokens, outputTokens, costUsd) => {
    if (!sessionId || !messageId) return
    _usageCountedByEvent.add(messageId)
    const prev = _lastUsageByTurn.get(messageId) || { input: 0, output: 0, cost: 0 }
    const dInput = Math.max(0, (inputTokens || 0) - prev.input)
    const dOutput = Math.max(0, (outputTokens || 0) - prev.output)
    const dCost = Math.max(0, (costUsd || 0) - prev.cost)
    _lastUsageByTurn.set(messageId, { input: inputTokens || 0, output: outputTokens || 0, cost: costUsd || 0 })
    if (dInput === 0 && dOutput === 0 && dCost === 0) return
    get().recordUsage(sessionId, { inputTokens: dInput, outputTokens: dOutput, costUsd: dCost }, messageId)
  },

  // chat.send return usage (non-tool turns). Skips turns already counted via
  // chat:usage events (defensive double-count guard).
  recordReturnUsage: (sessionId, messageId, usage) => {
    if (!sessionId || !messageId || !usage) return
    if (_usageCountedByEvent.has(messageId)) return
    get().recordUsage(sessionId, {
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      costUsd: usage.cost || 0,
    }, messageId)
  },

  // Shared accumulator: adds to both the session cumulative and the current
  // turn, then fires the one-time budget-cap warning.
  recordUsage: (sessionId, usage, messageId) => {
    if (!sessionId) return
    const { inputTokens = 0, outputTokens = 0, costUsd = 0 } = usage
    set((s) => {
      const prev = s.usageBySession[sessionId] || { turns: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }
      const turnPrev = s.turnUsageBySession[sessionId] || { inputTokens: 0, outputTokens: 0, costUsd: 0 }
      return {
        usageBySession: {
          ...s.usageBySession,
          [sessionId]: {
            turns: prev.turns + 1,
            inputTokens: prev.inputTokens + inputTokens,
            outputTokens: prev.outputTokens + outputTokens,
            costUsd: prev.costUsd + costUsd,
          },
        },
        turnUsageBySession: {
          ...s.turnUsageBySession,
          [sessionId]: {
            inputTokens: turnPrev.inputTokens + inputTokens,
            outputTokens: turnPrev.outputTokens + outputTokens,
            costUsd: turnPrev.costUsd + costUsd,
          },
        },
      }
    })
    // Budget warning: once per session when cumulative cost crosses the cap.
    const budget = get().sessionBudgetUsd
    if (budget > 0 && !get().budgetWarnedSessions.has(sessionId)) {
      const total = get().usageBySession[sessionId]?.costUsd || 0
      if (total >= budget) {
        set((s) => ({ budgetWarnedSessions: new Set(s.budgetWarnedSessions).add(sessionId) }))
        const line = t('usage.budget_warning', `$${total.toFixed(3)}`, `$${budget}`)
        // Status line → AgentStatusBar greps 预算/budget and surfaces it.
        if (messageId) {
          set((s) => {
            const existing = s.statusLinesByMessage[messageId] || []
            if (existing.includes(line)) return {}
            return { statusLinesByMessage: { ...s.statusLinesByMessage, [messageId]: [...existing.slice(-4), line] } }
          })
        }
        // Store-level toast (supports 'warning'; useUI().toast does not).
        get().triggerToast(line, 'warning')
      }
    }
  },
})
