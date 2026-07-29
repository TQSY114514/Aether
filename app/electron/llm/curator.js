// ───────────────────────────────────────────────────────────────────────────
// Curator — background skill lifecycle orchestrator.
//
// Runs at most once every 7 days (gated by the `curator_last_run` setting in
// the settings table) to apply automatic state transitions on `skill_usage`:
//   active → stale (30d unused) → archived (90d unused)
// Pinned skills skip transitions (handled inside db.applySkillTransitions).
//
// This module never throws — any error is logged and swallowed so the host
// app keeps running. Safe to call on startup or after each chat turn.
// ───────────────────────────────────────────────────────────────────────────

const log = require('../logger')

const RUN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000  // 7 days
const LAST_RUN_KEY = 'curator_last_run'

// Entry point. Idempotent — returns immediately if not due yet. Always
// resolves (never rejects) so callers can fire-and-forget without a guard.
async function maybeRunCurator(db) {
  if (!db) return
  try {
    const last = db.getSetting ? db.getSetting(LAST_RUN_KEY) : null
    const lastTs = last ? Date.parse(last) : NaN
    const elapsed = Number.isNaN(lastTs) ? Infinity : (Date.now() - lastTs)
    if (elapsed < RUN_INTERVAL_MS) return  // not due yet

    log.info('curator: running skill transitions')
    try {
      if (typeof db.applySkillTransitions === 'function') {
        db.applySkillTransitions()
      } else {
        log.warn('curator: db.applySkillTransitions is not available — skipping transitions')
      }
    } catch (e) {
      log.warn('curator: applySkillTransitions failed:', e && e.message)
    }

    try {
      if (typeof db.setSetting === 'function') {
        await db.setSetting(LAST_RUN_KEY, new Date().toISOString())
      }
    } catch (e) {
      log.warn('curator: failed to persist last-run timestamp:', e && e.message)
    }
  } catch (e) {
    // never let curator break the host app
    log.error('curator: aborted:', e && e.message)
  }
}

module.exports = { maybeRunCurator }
