// ───────────────────────────────────────────────────────────────────────────
// Plan Step Control — per-session skip/retry state for execution plan steps.
//
// Follows the same pattern as steering.js: per-session state tracked in a
// module-level Map, with convenience functions for the IPC layer.
//
// skipStep(sessionId, stepId)  — mark a step as skipped (done, no execution)
// retryStep(sessionId, stepId) — mark a failed/skipped step for re-execution
// getPlanControlState(sessionId) — read pending skip/retry ops for a session
// clearPlanControlState(sessionId) — drain consumed ops
// ───────────────────────────────────────────────────────────────────────────

const log = require('../logger')

const _sessions = new Map()

class PlanControlSession {
  constructor(sessionId) {
    this.sessionId = sessionId
    this.skipSteps = new Set()   // step ids to skip
    this.retrySteps = new Set()  // step ids to retry
  }

  skipStep(stepId) {
    const id = String(stepId)
    this.skipSteps.add(id)
    // If it was previously a retry, clear the retry
    this.retrySteps.delete(id)
    return { stepId: id, action: 'skip' }
  }

  retryStep(stepId) {
    const id = String(stepId)
    this.retrySteps.add(id)
    // If it was previously a skip, clear the skip
    this.skipSteps.delete(id)
    return { stepId: id, action: 'retry' }
  }

  // Consume pending operations. Returns { skip: Set, retry: Set } and clears them.
  consumePending() {
    const result = {
      skip: Array.from(this.skipSteps),
      retry: Array.from(this.retrySteps),
    }
    this.skipSteps.clear()
    this.retrySteps.clear()
    return result
  }

  // Peek without consuming
  peekPending() {
    return {
      skip: Array.from(this.skipSteps),
      retry: Array.from(this.retrySteps),
    }
  }

  reset() {
    this.skipSteps.clear()
    this.retrySteps.clear()
  }
}

// ─── Session Management ────────────────────────────────────────────────────

function getSession(sessionId) {
  if (!_sessions.has(sessionId)) {
    _sessions.set(sessionId, new PlanControlSession(sessionId))
  }
  return _sessions.get(sessionId)
}

function removeSession(sessionId) {
  _sessions.delete(sessionId)
}

// ─── Convenience API ───────────────────────────────────────────────────────

function skipStep(sessionId, stepId) {
  return getSession(sessionId).skipStep(stepId)
}

function retryStep(sessionId, stepId) {
  return getSession(sessionId).retryStep(stepId)
}

function consumePending(sessionId) {
  return getSession(sessionId).consumePending()
}

function peekPending(sessionId) {
  return getSession(sessionId).peekPending()
}

function clearSession(sessionId) {
  getSession(sessionId).reset()
}

module.exports = {
  PlanControlSession,
  getSession,
  removeSession,
  skipStep,
  retryStep,
  consumePending,
  peekPending,
  clearSession,
}