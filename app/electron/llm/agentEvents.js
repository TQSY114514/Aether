// ───────────────────────────────────────────────────────────────────────────
// Agent Event Stream — unified lifecycle event system for the agent loop.
//
// Inspired by pi's event-stream architecture: every significant agent action
// is emitted as a typed event, creating a single source of truth for UI
// updates, logging, hooks, and evolution tracking.
//
// Event types:
//   agent:start     — agent loop begins (sessionId, model, provider)
//   turn:start      — a new turn/iteration starts (depth, remaining)
//   message:delta   — streaming text chunk from the model
//   thinking:start  — reasoning/thinking phase begins
//   thinking:end    — reasoning/thinking phase ends
//   tool:start      — a tool execution begins (name, args, depth)
//   tool:end        — a tool execution ends (name, result, error, latencyMs)
//   plan:step       — planning progress update (step, kind, text)
//   turn:end        — a turn/iteration ends
//   agent:end       — agent loop ends (finalStatus, totalIterations)
//   agent:error     — agent loop encountered an error
//   compact:start   — context compaction begins
//   compact:end     — context compaction ends
//   inject          — a mid-run injection was processed
// ───────────────────────────────────────────────────────────────────────────

const EventEmitter = require('events')

class AgentEventStream extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(50) // allow many listeners (UI, hooks, log, evolution)
    this._history = []       // circular buffer of recent events
    this._historyLimit = 200
  }

  // Record event in history buffer for replay/debugging.
  _record(type, payload) {
    const event = { type, payload, ts: Date.now() }
    this._history.push(event)
    if (this._history.length > this._historyLimit) {
      this._history.shift()
    }
  }

  emit(type, payload) {
    this._record(type, payload)
    return super.emit(type, payload)
  }

  // Convenience methods for each lifecycle event.
  agentStart(ctx)      { this.emit('agent:start', ctx) }
  turnStart(ctx)       { this.emit('turn:start', ctx) }
  messageDelta(ctx)    { this.emit('message:delta', ctx) }
  thinkingStart(ctx)   { this.emit('thinking:start', ctx) }
  thinkingEnd(ctx)     { this.emit('thinking:end', ctx) }
  toolStart(ctx)       { this.emit('tool:start', ctx) }
  toolEnd(ctx)         { this.emit('tool:end', ctx) }
  planStep(ctx)        { this.emit('plan:step', ctx) }
  turnEnd(ctx)         { this.emit('turn:end', ctx) }
  agentEnd(ctx)        { this.emit('agent:end', ctx) }
  agentError(ctx)      { this.emit('agent:error', ctx) }
  compactStart(ctx)    { this.emit('compact:start', ctx) }
  compactEnd(ctx)      { this.emit('compact:end', ctx) }
  injection(ctx)       { this.emit('inject', ctx) }

  // Get recent event history.
  getHistory(since) {
    if (!since) return [...this._history]
    return this._history.filter(e => e.ts >= since)
  }

  // Clear history (for testing / memory management).
  clearHistory() {
    this._history = []
  }
}

// Singleton instance shared across the app.
const stream = new AgentEventStream()

module.exports = { AgentEventStream, stream }