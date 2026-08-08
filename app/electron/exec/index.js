// ─────────────────────────────────────────────────────────────────────────────
// exec/index.js  — ExecutionBackend assembly: registers all built-in backends.
//
// Import this once (main.js / task.handler.js) to make the registry live.
// Cloud sandbox backends are intentionally NOT registered here yet — the
// registry contract in backend.js is the extension point for them.
// ─────────────────────────────────────────────────────────────────────────────

const { registerBackend, getBackend, listBackends, executeOn } = require('./backend')
const { localBackend } = require('./localBackend')
const { dockerBackend } = require('./dockerBackend')
const { sshBackend } = require('./sshBackend')
const { cloudBackend } = require('./cloudBackend')

for (const backend of [localBackend, dockerBackend, sshBackend, cloudBackend]) {
  registerBackend(backend)
}

module.exports = {
  registerBackend,
  getBackend,
  listBackends,
  executeOn,
  localBackend,
  dockerBackend,
  sshBackend,
  cloudBackend,
}