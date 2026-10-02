// ───────────────────────────────────────────────────────────────────────────
// DEPRECATED: mcp:market:* handlers are officially registered in mcp.handler.js
// with full security validation, input sanitization, and confirmation dialogs
// (P0-C3 / P1-H3).
//
// This stub is retained for backward-compatibility and does not duplicate
// channel registration.
// ───────────────────────────────────────────────────────────────────────────

function registerMarketHandlers() {
  // No-op: handled in mcp.handler.js
}

module.exports = { registerMarketHandlers }

