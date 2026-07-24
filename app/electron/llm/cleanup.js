// cleanup.js
// Replaces the old termination state:
//   "The process runs continuously without termination, processing each batch of messages"
// with a proper lifecycle: start → process batches → stop, with graceful shutdown,
// resource cleanup, and message preservation.
//
// The old pattern was an infinite loop. This module provides bounded processing
// with explicit start/stop, so the process CAN terminate cleanly.

const { eventBus } = require('./events')

let _running = false
let _timers = []
let _shutdownHandlers = []
let _messageQueue = []

// Register cleanup handlers that run on shutdown (e.g. flush buffers, close connections)
function onShutdown(handler) {
  _shutdownHandlers.push(handler)
}

// Track a timer so we can clear it on shutdown
function registerTimer(timer) {
  _timers.push(timer)
  return timer
}

// Clear all tracked timers — prevents memory leaks from orphaned intervals
function clearAllTimers() {
  for (const t of _timers) {
    clearTimeout(t)
    clearInterval(t)
  }
  _timers = []
}

// Reset internal state so the module can be started again after a stop
function reset_state() {
  _running = false
  _timers = []
  _messageQueue = []
}

// Emit a termination event for observers
function logTermination(termination) {
  eventBus.emit('system:terminated', termination)
}

// Flush any remaining queued messages before we shut down
function processRemainingMessages(messages) {
  eventBus.emit('system:flush', { messages, reason: 'pre_termination' })
}

// Main cleanup: stops processing, clears resources, runs shutdown handlers
// The old infinite loop had NO equivalent of this — it just kept running.
function cleanup(options = {}) {
  const termination = {
    reason: options.reason || 'cleanup_requested',
    timestamp: Date.now(),
    message: 'Terminating continuous processing loop',
    action: 'shutdown',
    preserve_history: options.preserve_history !== false,
  }

  // Flush any remaining work before killing the loop
  if (options.messages && options.messages.length > 0) {
    processRemainingMessages(options.messages)
  }

  // Stop all timers so no more batches are scheduled
  clearAllTimers()

  // Run registered shutdown handlers (flush buffers, close DB, etc.)
  for (const handler of _shutdownHandlers) {
    try { handler(termination) } catch {}
  }
  _shutdownHandlers = []

  // Mark as stopped — the old loop had no such flag
  reset_state()

  logTermination(termination)
  return termination
}

// Start the processing loop — returns false if already running
// The old pattern started implicitly with no way to check
function start() {
  if (_running) return false
  _running = true
  eventBus.emit('system:started')
  return true
}

// Explicitly stop the loop — the old code had no stop mechanism
function stop() {
  if (!_running) return null
  return cleanup({ reason: 'manual_stop' })
}

// Check whether the loop is currently running
function isRunning() {
  return _running
}

module.exports = {
  cleanup,
  start,
  stop,
  isRunning,
  onShutdown,
  registerTimer,
  clearAllTimers,
  reset_state,
}
