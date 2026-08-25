// ─────────────────────────────────────────────────────────────────────────────
// resolveBackend.js — pick an execution backend id for an agent mode.
//
// Safety-first defaults:
//   - Yolo ALWAYS runs local, even when a global exec.backend is configured:
//     a hermetic no-network container would silently break its full-access
//     contract (host network/filesystem). Configured backends apply to the
//     other modes only.
//   - An explicit configured backend wins for every non-yolo mode (unknown
//     ids fall back at the dispatch layer, never crash).
//   - Plan/Ask run local: they are per-command gated anyway.
//   - Auto/Auto-confirm may use the Docker sandbox only when BOTH the
//     conservative flag (exec.docker.defaultForAuto, default OFF) and a live
//     Docker daemon are present. Anything else falls back to local.
// Never throws — any probing failure degrades to 'local'.
// ─────────────────────────────────────────────────────────────────────────────

const featureFlags = require('../featureFlags')

async function resolveBackendForMode(agentMode, opts = {}) {
  const mode = String(agentMode || '')
  // Checked before `configured`: YOLO must stay on the host even if
  // exec.backend is set to docker globally (CodeRabbit R2 finding).
  if (mode === 'yolo') return 'local'

  const configured = typeof opts.configured === 'string' ? opts.configured.trim() : ''
  if (configured) return configured

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
