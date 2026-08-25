// ─────────────────────────────────────────────────────────────────────────────
// resolveBackend.js — pick an execution backend id for an agent mode.
//
// Safety-first defaults:
//   - An explicit configured backend always wins (unknown ids fall back at the
//     dispatch layer, never crash).
//   - Yolo ALWAYS runs local: the user explicitly accepted raw-host risk.
//   - Plan/Ask run local: they are per-command gated anyway.
//   - Auto/Auto-confirm may use the Docker sandbox only when BOTH the
//     conservative flag (exec.docker.defaultForAuto, default OFF) and a live
//     Docker daemon are present. Anything else falls back to local.
// Never throws — any probing failure degrades to 'local'.
// ─────────────────────────────────────────────────────────────────────────────

const featureFlags = require('../featureFlags')

async function resolveBackendForMode(agentMode, opts = {}) {
  const configured = typeof opts.configured === 'string' ? opts.configured.trim() : ''
  if (configured) return configured

  const mode = String(agentMode || '')
  if (mode === 'yolo') return 'local'
  if (mode !== 'auto' && mode !== 'auto_confirm') return 'local'

  let flagOn = false
  try {
    flagOn = featureFlags.isEnabled(opts.db, 'exec.docker.defaultForAuto') === true
  } catch { flagOn = false }
  if (!flagOn) return 'local'

  let available = opts.dockerAvailable === undefined ? null : !!opts.dockerAvailable
  if (available === null) {
    try {
      available = await require('./dockerBackend').isDockerAvailable()
    } catch { available = false }
  }
  return available ? 'docker' : 'local'
}

module.exports = { resolveBackendForMode }
