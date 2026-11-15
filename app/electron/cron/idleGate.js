'use strict'

// ─────────────────────────────────────────────────────────────────────────────
// IdleGate — Cooperative idle-window gating & yield controller for background
// maintenance tasks (inspired by PersonaCLI/Herta DreamTrigger).
//
// Electron-Free Boundary: Plain CommonJS module. Zero 'electron' imports.
//
// Gate order (cheapest-first):
//   1. enabled && !running
//   2. user idle window (now - lastActivityAt >= idleMs)
//   3. !isBusy() (never fire during active chat streams/tool loops/approvals)
//   4. backoff (now - lastAttemptAt >= minRetryMs)
//      ^ lastAttemptAt is stamped BEFORE gates 5 & 6 so cooldown/material skips
//        never hot-spin disk/DB scans on every poll tick.
//   5. cooldownMs since lastFullPassAt()
//   6. hasMaterial()
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_IDLE_MS = 5 * 60 * 1000
const DEFAULT_MIN_RETRY_MS = 60 * 1000

class IdleGate {
  /**
   * @param {object} opts
   * @param {number} [opts.idleMs=300000]
   * @param {number} [opts.cooldownMs=0]
   * @param {number} [opts.minRetryMs=60000]
   * @param {boolean|(() => boolean)} [opts.enabled=true]
   * @param {() => number} [opts.now]
   * @param {() => boolean} [opts.isBusy]
   * @param {() => number|null} [opts.lastFullPassAt]
   * @param {() => boolean} [opts.hasMaterial]
   * @param {(ctx: { shouldYield: () => boolean }) => Promise<any>} opts.runPass
   */
  constructor(opts = {}) {
    if (typeof opts.runPass !== 'function') {
      throw new Error('IdleGate: runPass function is required')
    }
    this.opts = opts
    this.now = typeof opts.now === 'function' ? opts.now : () => Date.now()
    this.idleMs = Number.isFinite(opts.idleMs) ? Math.max(0, opts.idleMs) : DEFAULT_IDLE_MS
    this.cooldownMs = Number.isFinite(opts.cooldownMs) ? Math.max(0, opts.cooldownMs) : 0
    this.minRetryMs = Number.isFinite(opts.minRetryMs) ? Math.max(0, opts.minRetryMs) : DEFAULT_MIN_RETRY_MS

    this.lastActivityAt = this.now()
    this.activitySeq = 0
    this.lastAttemptAt = -Infinity
    this.running = false
  }

  noteActivity() {
    this.lastActivityAt = this.now()
    this.activitySeq += 1
  }

  getActivitySeq() {
    return this.activitySeq
  }

  isEnabled() {
    if (typeof this.opts.enabled === 'function') return Boolean(this.opts.enabled())
    return this.opts.enabled !== false
  }

  makeYieldChecker(startSeq = this.activitySeq) {
    return () => {
      if (this.activitySeq > startSeq) return true
      if (typeof this.opts.isBusy === 'function' && this.opts.isBusy() === true) return true
      return false
    }
  }

  /**
   * Attempt one gated pass.
   * @param {{ force?: boolean }} [triggerOpts]
   * @returns {Promise<{ ran: boolean, reason?: string, yielded?: boolean, result?: any }>}
   */
  async tick(triggerOpts = {}) {
    const force = Boolean(triggerOpts && triggerOpts.force)
    if (!force && !this.isEnabled()) return { ran: false, reason: 'disabled' }
    if (this.running) return { ran: false, reason: 'already-running' }

    const t = this.now()

    // (1) User still active — never run right after input
    if (!force && t - this.lastActivityAt < this.idleMs) {
      return { ran: false, reason: 'active-user' }
    }

    // (1b) Active turn / tool loop / pending approval counts as busy regardless
    // of when the user's last keystroke happened
    if (!force && typeof this.opts.isBusy === 'function' && this.opts.isBusy() === true) {
      return { ran: false, reason: 'busy' }
    }

    // (2) Backoff guard
    if (!force && t - this.lastAttemptAt < this.minRetryMs) {
      return { ran: false, reason: 'backoff' }
    }

    // Stamp attempt BEFORE expensive cooldown/material checks to prevent
    // hot-spinning scans on rejected ticks.
    this.lastAttemptAt = t

    // (3) Persisted cooldown floor
    if (!force && this.cooldownMs > 0 && typeof this.opts.lastFullPassAt === 'function') {
      const last = this.opts.lastFullPassAt()
      if (last !== null && last !== undefined && Number.isFinite(last) && t - last < this.cooldownMs) {
        return { ran: false, reason: 'cooldown' }
      }
    }

    // (4) Material gate
    if (!force && typeof this.opts.hasMaterial === 'function' && !this.opts.hasMaterial()) {
      return { ran: false, reason: 'no-material' }
    }

    this.running = true
    const startSeq = this.activitySeq
    const shouldYield = this.makeYieldChecker(startSeq)
    try {
      const result = await this.opts.runPass({ shouldYield })
      return { ran: true, yielded: Boolean(result && result.yielded), result }
    } finally {
      this.running = false
    }
  }
}

module.exports = {
  IdleGate,
  DEFAULT_IDLE_MS,
  DEFAULT_MIN_RETRY_MS,
}
