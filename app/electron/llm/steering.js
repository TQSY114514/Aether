// ───────────────────────────────────────────────────────────────────────────
// Steering & Follow-up — runtime agent control mechanisms.
//
// Inspired by pi's Steering/Follow-up system: the user can steer the agent
// during execution (inject mid-run instructions) and queue follow-up work
// that runs after the current task completes.
//
// Steering:
//   agent.steer(text) — inject a message into the running agent loop.
//   The agent pauses (if possible), processes the steer instruction, then
//   decides whether to continue the original task or switch context.
//
// Follow-up:
//   agent.followUp(text) — queue a task to run after the current loop ends.
//   When the agent finishes, it checks the follow-up queue and processes
//   pending tasks before returning to idle.
//
// This builds on the existing inject mechanism (chat:inject) but adds
// structured control flow and priority levels.
// ───────────────────────────────────────────────────────────────────────────

const log = require('../logger')

// ─── Steering Queue ────────────────────────────────────────────────────────

// Per-session steering state.
// Keyed by sessionId.
const _sessions = new Map()

class SteeringSession {
  constructor(sessionId) {
    this.sessionId = sessionId
    this.pendingInjections = []    // messages to inject during execution
    this.followUpQueue = []        // tasks to run after completion
    this.isRunning = false
    this.abortController = null
  }

  // Steer: inject a message during execution.
  steer(text, priority = 'normal') {
    const injection = {
      text,
      priority,     // 'high' | 'normal' | 'low'
      timestamp: Date.now(),
      processed: false
    }
    this.pendingInjections.push(injection)
    // Sort: high priority first
    this.pendingInjections.sort((a, b) => {
      const order = { high: 0, normal: 1, low: 2 }
      return (order[a.priority] || 1) - (order[b.priority] || 1)
    })
    return injection
  }

  // Follow-up: queue a task for after completion.
  followUp(task) {
    const entry = {
      id: `followup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: typeof task === 'string' ? task : task.text,
      context: task.context || {},
      timestamp: Date.now(),
      status: 'pending'  // pending | running | done | failed
    }
    this.followUpQueue.push(entry)
    return entry
  }

  // Get pending injections (called by toolLoop before each turn).
  getPendingInjections() {
    // Return all unprocessed injections, drain them, and mark as processed.
    const pending = this.pendingInjections.filter(i => !i.processed)
    for (const i of pending) i.processed = true
    // Clean up processed injections
    this.pendingInjections = this.pendingInjections.filter(i => !i.processed)
    return pending.map(i => i.text)
  }

  // Get pending follow-ups (called after agent loop ends).
  getPendingFollowUps() {
    return this.followUpQueue.filter(f => f.status === 'pending')
  }

  // Mark a follow-up as done.
  completeFollowUp(id) {
    const entry = this.followUpQueue.find(f => f.id === id)
    if (entry) entry.status = 'done'
  }

  // Mark a follow-up as failed.
  failFollowUp(id, error) {
    const entry = this.followUpQueue.find(f => f.id === id)
    if (entry) {
      entry.status = 'failed'
      entry.error = error
    }
  }

  // Clear all state.
  reset() {
    this.pendingInjections = []
    this.followUpQueue = []
    this.isRunning = false
  }
}

// ─── Session Management ────────────────────────────────────────────────────

function getSession(sessionId) {
  if (!_sessions.has(sessionId)) {
    _sessions.set(sessionId, new SteeringSession(sessionId))
  }
  return _sessions.get(sessionId)
}

function removeSession(sessionId) {
  _sessions.delete(sessionId)
}

// ─── Convenience API ───────────────────────────────────────────────────────

// Steer the agent during execution.
function steer(sessionId, text, priority) {
  return getSession(sessionId).steer(text, priority)
}

// Queue a follow-up task.
function followUp(sessionId, task) {
  return getSession(sessionId).followUp(task)
}

// Get pending injections for a session.
function getPendingInjections(sessionId) {
  return getSession(sessionId).getPendingInjections()
}

// Get pending follow-ups for a session.
function getPendingFollowUps(sessionId) {
  return getSession(sessionId).getPendingFollowUps()
}

// Clear a session's steering state.
function clearSession(sessionId) {
  getSession(sessionId).reset()
}

// Set the running state of a session.
function setRunning(sessionId, running) {
  getSession(sessionId).isRunning = running
}

function isRunning(sessionId) {
  return _sessions.has(sessionId) && _sessions.get(sessionId).isRunning
}

// List all active sessions.
function listSessions() {
  return Array.from(_sessions.keys())
}

module.exports = {
  SteeringSession,
  getSession,
  removeSession,
  steer,
  followUp,
  getPendingInjections,
  getPendingFollowUps,
  clearSession,
  setRunning,
  isRunning,
  listSessions,
}