'use strict'

// Shared request & stream idle/stall timeout helpers (Electron-free CJS).
// Long reasoning/streaming responses must not be killed at a flat 120s total
// duration while chunks are actively arriving; instead, reset the idle timer
// on headers and every received byte/chunk, bounded by a generous max cap.

const DEFAULT_REQUEST_TIMEOUT_MS = 120000
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 120000
const DEFAULT_STREAM_MAX_TIMEOUT_MS = 30 * 60 * 1000

/**
 * Create a resettable idle/stall timeout controller combined with an optional
 * parent AbortSignal and a generous absolute upper bound.
 */
function createIdleTimeout(parentSignal, opts = {}) {
  const idleMs = Number.isFinite(opts.idleMs) && opts.idleMs > 0
    ? opts.idleMs
    : DEFAULT_STREAM_IDLE_TIMEOUT_MS
  const maxMs = Number.isFinite(opts.maxMs) && opts.maxMs > 0
    ? Math.max(opts.maxMs, idleMs)
    : Math.max(DEFAULT_STREAM_MAX_TIMEOUT_MS, idleMs)

  const ctrl = new AbortController()
  let idleTimer = null
  let maxTimer = null
  let cleaned = false

  const abortWithTimeout = (message) => {
    if (cleaned || ctrl.signal.aborted) return
    const err = new Error(message)
    err.name = 'TimeoutError'
    ctrl.abort(err)
  }

  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
    if (maxTimer) { clearTimeout(maxTimer); maxTimer = null }
    if (parentSignal) {
      try { parentSignal.removeEventListener('abort', onParentAbort) } catch {}
    }
  }

  const onParentAbort = () => {
    if (!ctrl.signal.aborted) ctrl.abort(parentSignal.reason)
    cleanup()
  }

  const armIdle = () => {
    if (cleaned || ctrl.signal.aborted) return
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => abortWithTimeout(`Stream idle timeout after ${idleMs}ms`), idleMs)
    if (typeof idleTimer.unref === 'function') idleTimer.unref()
  }

  if (parentSignal) {
    if (parentSignal.aborted) {
      ctrl.abort(parentSignal.reason)
      cleaned = true
      return { signal: ctrl.signal, touch: () => {}, cleanup }
    }
    parentSignal.addEventListener('abort', onParentAbort, { once: true })
  }

  armIdle()
  maxTimer = setTimeout(() => abortWithTimeout(`Stream max duration exceeded (${maxMs}ms)`), maxMs)
  if (typeof maxTimer.unref === 'function') maxTimer.unref()

  return {
    signal: ctrl.signal,
    touch: armIdle,
    cleanup,
  }
}

function withRequestTimeout(signal, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  const t = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, t]) : t
}

module.exports = {
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  DEFAULT_STREAM_MAX_TIMEOUT_MS,
  createIdleTimeout,
  withRequestTimeout,
}
